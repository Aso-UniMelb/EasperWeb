import { pipeline, env } from '@huggingface/transformers';
import { getVadSession, getSpeechTimestamps, segmentsCleanup, setupOrtWasmEnvironment } from './vad.js';
import { getDiarizerSession, extractSpeakerEmbedding } from './diarizer.js';
import {
  diarizeAndAssignSpeakers,
  agglomerativeClustering,
  sliceUtteranceIntoWindows,
  reconstructSegmentsFromWindows,
  majorityVoteSpeaker,
  smoothSpeakerLabels,
} from './utils/diarization.js';

// CPU / threading requirements:
// Use as many threads as available when cross-origin isolated.
// If crossOriginIsolated is false, only 1 thread is supported by WASM SharedArrayBuffer.
const isIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;
env.backends.onnx.wasm.numThreads = isIsolated ? (navigator.hardwareConcurrency || 4) : 1;
env.backends.onnx.wasm.simd = true;

/**
 * Strips [BLANK_AUDIO] tokens and trims whitespace.
 * Returns empty string if the text consists only of [BLANK_AUDIO] or whitespace.
 */
function cleanSpeechText(text) {
  if (!text) return '';
  return String(text).replace(/\[BLANK_AUDIO\]/g, '').trim();
}

/**
 * Custom cache implementation that serves model files directly from
 * files chosen by the user via the browser directory picker.
 */
class LocalFolderCache {
  constructor(files) {
    // files is an Array of { path: string, file: Blob|File }
    this.fileMap = new Map();
    for (const item of files) {
      if (!item || !item.path || !item.file) continue;
      // Normalize slashes to forward slashes
      const cleanPath = item.path.replace(/\\/g, '/');
      this.fileMap.set(cleanPath, item.file);

      // Also store by base filename for convenient fallback
      const baseName = cleanPath.split('/').pop();
      if (!this.fileMap.has(baseName)) {
        this.fileMap.set(baseName, item.file);
      }
    }
    console.log('[LocalFolderCache] Initialized with files:', Array.from(this.fileMap.keys()));
  }

  findFile(requestKey) {
    const key = (typeof requestKey === 'string' ? requestKey : (requestKey?.url || '')).replace(/\\/g, '/');

    // 1. Direct match
    if (this.fileMap.has(key)) {
      return this.fileMap.get(key);
    }

    // 2. Exact suffix match on relative path or basename
    for (const [relPath, file] of this.fileMap.entries()) {
      if (key.endsWith('/' + relPath) || key === relPath) {
        return file;
      }
      const baseName = relPath.split('/').pop();
      if (key.endsWith('/' + baseName) || key === baseName) {
        return file;
      }
    }

    // 3. Smart fallback for decoder model:
    // Whisper seq2seq pipeline requests "decoder_model_merged.onnx" (or "decoder_model_merged_quantized.onnx").
    // If user's export is named "decoder_model.onnx" or "decoder_model_quantized.onnx", match it.
    if (/decoder.*\.onnx$/i.test(key)) {
      const wantsQuantized = /quantized|_q8|_q4/i.test(key);
      let fallbackMatch = null;
      for (const [relPath, file] of this.fileMap.entries()) {
        if (/decoder.*\.onnx$/i.test(relPath)) {
          const isQuantized = /quantized|_q8|_q4/i.test(relPath);
          if (wantsQuantized === isQuantized) {
            console.log(`[LocalFolderCache] Matched precision-aligned decoder request "${key}" -> local file "${relPath}"`);
            return file;
          }
          if (!fallbackMatch) fallbackMatch = file;
        }
      }
      if (fallbackMatch) {
        console.log(`[LocalFolderCache] Matched fallback decoder request "${key}" -> local file "${fallbackMatch.name || ''}"`);
        return fallbackMatch;
      }
    }

    // 4. Smart fallback for encoder model:
    // If request asks for "encoder_model.onnx" or "encoder_model_quantized.onnx", match any encoder onnx file.
    if (/encoder.*\.onnx$/i.test(key)) {
      const wantsQuantized = /quantized|_q8|_q4/i.test(key);
      let fallbackMatch = null;
      for (const [relPath, file] of this.fileMap.entries()) {
        if (/encoder.*\.onnx$/i.test(relPath)) {
          const isQuantized = /quantized|_q8|_q4/i.test(relPath);
          if (wantsQuantized === isQuantized) {
            console.log(`[LocalFolderCache] Matched precision-aligned encoder request "${key}" -> local file "${relPath}"`);
            return file;
          }
          if (!fallbackMatch) fallbackMatch = file;
        }
      }
      if (fallbackMatch) {
        console.log(`[LocalFolderCache] Matched fallback encoder request "${key}" -> local file "${fallbackMatch.name || ''}"`);
        return fallbackMatch;
      }
    }

    return null;
  }

  async match(request) {
    const key = (typeof request === 'string' ? request : (request?.url || '')).replace(/\\/g, '/');
    const matchedFile = this.findFile(key);

    if (matchedFile) {
      console.log(`[LocalFolderCache] Serving "${key}" from local file "${matchedFile.name}" (${matchedFile.size} bytes)`);
      const ext = matchedFile.name.split('.').pop().toLowerCase();
      const contentType = (ext === 'json') ? 'application/json'
        : (ext === 'txt') ? 'text/plain'
        : 'application/octet-stream';

      return new Response(matchedFile, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(matchedFile.size),
        },
      });
    }

    // If Transformers.js asks for optional configs that are missing in the local folder,
    // return an empty JSON object {} so it doesn't fail or fall back to remote HTTP fetches.
    if (
      key.endsWith('generation_config.json') ||
      key.endsWith('tokenizer_config.json') ||
      key.endsWith('special_tokens_map.json')
    ) {
      console.log(`[LocalFolderCache] Providing empty JSON for optional config: "${key}"`);
      return new Response('{}', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
      });
    }

    console.warn(`[LocalFolderCache] No local match found for: "${key}"`);
    return undefined;
  }

  async put(request, response) {
    // No-op
  }
}

let transcriber = null;
let currentModelKey = null;
let cachedLoadTime = null;
let cachedActiveDevice = 'wasm';

async function getTranscriber({ modelSource, modelId, folderName, files, dtype, device = 'auto' }) {
  // Check if WebGPU is available in the current environment
  const isWebGpuAvailable = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  let targetDevice = 'wasm';
  if (device === 'webgpu') {
    targetDevice = 'webgpu';
  } else if (device === 'wasm') {
    targetDevice = 'wasm';
  } else {
    // 'auto'
    targetDevice = isWebGpuAvailable ? 'webgpu' : 'wasm';
  }

  // Detect local folder model properties if applicable
  const hasLocalQ4 = modelSource === 'folder' && Array.isArray(files) && files.some((f) => {
    const p = (f.path || f.file?.name || '').toLowerCase();
    return p.includes('_q4') || p.includes('q4.onnx');
  });
  const isLocalQ8 = modelSource === 'folder' && (dtype === 'q8' || (Array.isArray(files) && files.some((f) => {
    const p = (f.path || f.file?.name || '').toLowerCase();
    return p.includes('quantized') || p.includes('_q8');
  })));

  // Resolve dtype and targetDevice:
  // - For WebGPU:
  //   1. Hugging Face Hub Whisper models use { encoder_model: 'fp32', decoder_model_merged: 'q4' }
  //      because INT8/q8 decoders on WebGPU cause corrupted attention logits and endless gibberish repetition loops
  //      (Transformers.js issue #1317: "WebGPU does not work with q8 decoders").
  //   2. Local folder models with FP32/FP16 weights run stably on WebGPU with full GPU acceleration (no INT8 bug).
  //   3. Local folder models with Q8 (INT8) weights and NO Q4 model CANNOT run on WebGPU without hitting issue #1317.
  //      They are automatically routed to multi-threaded WASM CPU, which executes INT8 via CPU SIMD instructions flawlessly.
  // - On CPU (WASM), 8-bit quantization ('q8') is rock-solid and fast via CPU SIMD instructions.
  let resolvedDtype;
  if (modelSource === 'folder') {
    if (isLocalQ8 && !hasLocalQ4) {
      if (targetDevice === 'webgpu') {
        console.warn('[Worker] Local 8-bit quantized model detected without Q4: routing to WASM CPU to avoid WebGPU INT8 decoder shader issues.');
        self.postMessage({
          type: 'status',
          payload: { message: 'Local 8-bit model routed to multi-threaded CPU WebAssembly (WebGPU INT8 decoders have known shader defects; CPU Q8 is fast and stable)...' }
        });
        targetDevice = 'wasm';
      }
      resolvedDtype = 'q8';
    } else if (hasLocalQ4 && targetDevice === 'webgpu') {
      resolvedDtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
    } else {
      resolvedDtype = dtype || 'fp32';
    }
  } else {
    // Hub model
    if (targetDevice === 'webgpu') {
      resolvedDtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
    } else {
      resolvedDtype = (dtype && dtype !== 'q4') ? dtype : 'q8';
    }
  }

  const dtypeKey = typeof resolvedDtype === 'string'
    ? resolvedDtype
    : `${resolvedDtype.encoder_model}+${resolvedDtype.decoder_model_merged}`;

  const modelKey = modelSource === 'folder'
    ? `folder:${folderName}:${dtypeKey}:${targetDevice}`
    : `hub:${modelId}:${dtypeKey}:${targetDevice}`;

  if (transcriber && currentModelKey === modelKey) {
    return { transcriber, loadTime: cachedLoadTime ?? 0, activeDevice: cachedActiveDevice };
  }

  // Dispose previous pipeline instance if model or device changed to prevent VRAM/WASM memory leaks
  if (transcriber && typeof transcriber.dispose === 'function') {
    try {
      await transcriber.dispose();
    } catch (e) {
      console.warn('[Worker] Error disposing previous transcriber:', e);
    }
    transcriber = null;
  }

  // onnxruntime-web is deduped to a single copy, so Whisper, the VAD and the diarizer all
  // share one runtime that loads its WASM exactly once. Transformers.js would otherwise
  // point that shared runtime at the 1.22 binaries it pins, which silently miscompute the
  // speaker model. Claim the path here too, so it no longer depends on which loads first.
  await setupOrtWasmEnvironment();

  const loadStartTime = performance.now();
  let activeDevice = targetDevice;

  if (modelSource === 'folder') {
    self.postMessage({
      type: 'status',
      payload: { message: 'Loading model...' }
    });

    // Configure Transformers.js to use our custom in-memory folder cache
    env.useCustomCache = true;
    env.customCache = new LocalFolderCache(files);
    // Disable local file paths fetch so it doesn't hit Vite SPA HTML fallback
    env.allowLocalModels = false;

    try {
      transcriber = await pipeline('automatic-speech-recognition', 'local-model', {
        device: targetDevice,
        dtype: resolvedDtype,
        progress_callback: (progressInfo) => {
          self.postMessage({
            type: 'progress',
            payload: progressInfo,
          });
        },
      });
      activeDevice = targetDevice;
    } catch (gpuErr) {
      if (targetDevice === 'webgpu') {
        console.warn('[Worker] WebGPU failed for local model, falling back to WASM CPU:', gpuErr);
        self.postMessage({
          type: 'status',
          payload: { message: `WebGPU unavailable for local model (${gpuErr?.message || 'adapter error'}). Falling back to WASM CPU...` }
        });
        const fallbackDtype = (typeof resolvedDtype === 'object' || resolvedDtype === 'q4') ? 'q8' : resolvedDtype;
        transcriber = await pipeline('automatic-speech-recognition', 'local-model', {
          device: 'wasm',
          dtype: fallbackDtype,
          progress_callback: (progressInfo) => {
            self.postMessage({
              type: 'progress',
              payload: progressInfo,
            });
          },
        });
        activeDevice = 'wasm';
      } else {
        throw gpuErr;
      }
    }
  } else {
    // Hub model
    env.useCustomCache = false;
    env.customCache = null;
    env.allowLocalModels = false;

    const deviceLabel = targetDevice === 'webgpu' ? 'WebGPU' : 'WASM CPU';
    const dtypeLabel = typeof resolvedDtype === 'string'
      ? resolvedDtype
      : `${resolvedDtype.encoder_model}+${resolvedDtype.decoder_model_merged}`;

    self.postMessage({
      type: 'status',
      payload: { message: 'Loading model...' }
    });

    try {
      transcriber = await pipeline('automatic-speech-recognition', modelId, {
        device: targetDevice,
        dtype: resolvedDtype,
        progress_callback: (progressInfo) => {
          self.postMessage({
            type: 'progress',
            payload: progressInfo,
          });
        },
      });
      activeDevice = targetDevice;
    } catch (gpuErr) {
      if (targetDevice === 'webgpu') {
        console.warn('[Worker] WebGPU initialization failed, falling back to multi-threaded WASM CPU:', gpuErr);
        self.postMessage({
          type: 'status',
          payload: { message: `WebGPU unavailable (${gpuErr?.message || 'adapter error'}). Falling back to multi-threaded CPU WebAssembly...` }
        });
        const wasmDtype = modelSource === 'folder' ? (dtype || 'fp32') : 'q8';
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          device: 'wasm',
          dtype: wasmDtype,
          progress_callback: (progressInfo) => {
            self.postMessage({
              type: 'progress',
              payload: progressInfo,
            });
          },
        });
        activeDevice = 'wasm';
        resolvedDtype = wasmDtype;
      } else {
        throw gpuErr;
      }
    }
  }

  const loadEndTime = performance.now();
  cachedLoadTime = (loadEndTime - loadStartTime) / 1000;
  cachedActiveDevice = activeDevice;
  const activeDtypeKey = typeof resolvedDtype === 'string'
    ? resolvedDtype
    : `${resolvedDtype.encoder_model}+${resolvedDtype.decoder_model_merged}`;

  currentModelKey = modelSource === 'folder'
    ? `folder:${folderName}:${activeDtypeKey}:${activeDevice}`
    : `hub:${modelId}:${activeDtypeKey}:${activeDevice}`;

  return { transcriber, loadTime: cachedLoadTime, activeDevice };
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;
  if (type === 'download_model') {
    const { modelId, dtype = 'q8', device = 'auto' } = payload;
    const downloadStartTime = performance.now();
    try {
      self.postMessage({
        type: 'status',
        payload: { message: `Downloading model "${modelId}" for offline use...` },
      });

      await setupOrtWasmEnvironment();

      // Whisper models require both:
      // 1. WASM CPU: 8-bit quantized weights ('q8': encoder_model_quantized.onnx + decoder_model_merged_quantized.onnx)
      // 2. WebGPU: 4-bit decoder ('q4': decoder_model_merged_q4.onnx) and full-precision encoder (encoder_model.onnx)
      // We download and cache both so offline transcription works seamlessly on both CPU and WebGPU!
      const isWhisperHubModel = modelId.includes('whisper');
      const expectedTotalBytes = modelId.includes('whisper-small')
        ? 838726557 // ~799 MB total (241MB WASM Q8 + 558MB WebGPU Q4)
        : modelId.includes('whisper-base')
          ? 286648670 // ~274 MB total (77MB WASM Q8 + 197MB WebGPU Q4)
          : 0;

      const fileBytesMap = new Map();
      const onProgress = (info) => {
        if (!info) return;
        if (info.file && typeof info.loaded === 'number') {
          fileBytesMap.set(info.file, info.loaded);
        }
        let totalLoaded = 0;
        for (const bytes of fileBytesMap.values()) {
          totalLoaded += bytes;
        }
        let pct = 0;
        if (expectedTotalBytes > 0) {
          pct = Math.min(99, Math.round((totalLoaded / expectedTotalBytes) * 100));
        } else if (info.total && typeof info.progress === 'number') {
          pct = Math.min(99, Math.round(info.progress));
        }
        self.postMessage({
          type: 'model_download_progress',
          payload: {
            modelId,
            progress: pct,
            loaded: totalLoaded,
            total: expectedTotalBytes || info.total || 0,
          },
        });
      };

      if (isWhisperHubModel) {
        // 1. Download & cache WASM Q8 weights (and shared tokenizer/configs)
        const pipeWasm = await pipeline('automatic-speech-recognition', modelId, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: onProgress,
        });

        // 2. Download & cache WebGPU Q4 weights (decoder_model_merged_q4.onnx + encoder_model.onnx)
        const isGpu = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
        let pipeGpu = null;
        try {
          pipeGpu = await pipeline('automatic-speech-recognition', modelId, {
            dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
            device: isGpu ? 'webgpu' : 'wasm',
            progress_callback: onProgress,
          });
        } catch (gpuErr) {
          console.warn('[Worker] WebGPU Q4 download fallback to WASM fetch:', gpuErr);
          pipeGpu = await pipeline('automatic-speech-recognition', modelId, {
            dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
            device: 'wasm',
            progress_callback: onProgress,
          });
        }

        // Keep active device transcriber ready and dispose the other to save memory
        if ((device === 'webgpu' || device === 'auto') && isGpu) {
          if (pipeWasm && typeof pipeWasm.dispose === 'function') await pipeWasm.dispose();
          transcriber = pipeGpu;
          cachedActiveDevice = 'webgpu';
          currentModelKey = `hub:${modelId}:fp32+q4:webgpu`;
        } else {
          if (pipeGpu && typeof pipeGpu.dispose === 'function') await pipeGpu.dispose();
          transcriber = pipeWasm;
          cachedActiveDevice = 'wasm';
          currentModelKey = `hub:${modelId}:q8:wasm`;
        }
      } else {
        const { transcriber: pipe, activeDevice } = await getTranscriber({
          modelSource: 'hub',
          modelId,
          dtype: dtype || 'q8',
          device,
        });
        transcriber = pipe;
        cachedActiveDevice = activeDevice;
      }

      cachedLoadTime = (performance.now() - downloadStartTime) / 1000;

      // Emit 100% progress once on completion
      self.postMessage({
        type: 'model_download_progress',
        payload: {
          modelId,
          progress: 100,
          loaded: expectedTotalBytes,
          total: expectedTotalBytes,
        },
      });

      self.postMessage({
        type: 'model_download_complete',
        payload: {
          modelId,
          loadTime: cachedLoadTime,
        },
      });
    } catch (err) {
      console.error('[Worker] Model download error:', err);
      self.postMessage({
        type: 'model_download_error',
        payload: {
          modelId,
          message: err?.message || String(err),
        },
      });
    }
  } else if (type === 'load') {
    try {
      const { modelSource, modelId, folderName, files, dtype, device = 'auto' } = payload;
      const { loadTime, activeDevice } = await getTranscriber({ modelSource, modelId, folderName, files, dtype, device });
      self.postMessage({
        type: 'loaded',
        payload: {
          modelKey: currentModelKey,
          modelLoadTime: loadTime,
          activeDevice,
          hardwareConcurrency: navigator.hardwareConcurrency || 4,
          crossOriginIsolated: Boolean(self.crossOriginIsolated),
        }
      });
    } catch (err) {
      console.error('[Worker] Model load error:', err);
      self.postMessage({
        type: 'error',
        payload: { message: err?.message || String(err) }
      });
    }
  } else if (type === 'unload') {
    transcriber = null;
    currentModelKey = null;
    cachedLoadTime = null;
    console.log('[Worker] Model unloaded and memory cleared.');
    self.postMessage({
      type: 'unloaded',
    });
  } else if (type === 'transcribe') {
    try {
      const {
        audioData,
        duration,
        timeOffset = 0,
        fullAudioDuration = duration,
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device = 'auto',
        language = 'en',
        task = 'transcribe',
        timestampMode = 'segment',
        enableVad = true,
        vadOptions = {},
      } = payload;

      const float32Audio = audioData instanceof Float32Array 
        ? audioData 
        : new Float32Array(audioData);

      const { transcriber: pipe, loadTime } = await getTranscriber({
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device,
      });

      const transcribeStartTime = performance.now();

      // Configure timestamp mode: 'word' | 'segment' (boolean true) | false
      let return_timestamps = true;
      if (timestampMode === 'word') {
        return_timestamps = 'word';
      } else if (timestampMode === 'none') {
        return_timestamps = false;
      } else {
        return_timestamps = true;
      }

      let usedTimestampMode = timestampMode;
      let fallbackWarning = null;

      const activeTask = (task && task.trim()) ? task.trim() : 'transcribe';

      // Helper function to transcribe/translate an audio slice with cross-attentions fallback
      const transcribeSlice = async (sliceData) => {
        const langParam = (language && language.trim() && language.trim() !== 'auto')
          ? language.trim()
          : null;

        const baseOpts = {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps,
          force_full_sequences: false,
          do_sample: false,
          top_k: 0,
          task: activeTask,
          ...(langParam ? { language: langParam } : {}),
        };

        try {
          return await pipe(sliceData, baseOpts);
        } catch (sliceErr) {
          if (return_timestamps === 'word' && sliceErr?.message?.includes('cross attentions')) {
            console.warn('[Worker] Model lacks cross-attentions for word-level timestamps. Falling back to segment-level timestamps...');
            return_timestamps = true;
            usedTimestampMode = 'segment';
            fallbackWarning = 'Model outputs do not contain cross-attentions (model was not exported with output_attentions=True). Automatically fell back to segment-level timestamps.';

            return await pipe(sliceData, {
              ...baseOpts,
              return_timestamps: true,
            });
          }
          throw sliceErr;
        }
      };

      if (enableVad) {
        self.postMessage({
          type: 'status',
          payload: { message: 'Initializing Silero Voice Activity Detector (VAD)...' }
        });

        // Check if user selected a local folder containing a Silero VAD model
        let customVadBuffer = null;
        if (Array.isArray(files)) {
          const vadEntry = files.find(f => {
            const p = (f.path || '').toLowerCase();
            return p.includes('silero_vad') || p.includes('vad.onnx');
          });
          if (vadEntry && vadEntry.file) {
            console.log('[Worker] Using local folder Silero VAD model:', vadEntry.path);
            customVadBuffer = await vadEntry.file.arrayBuffer();
          }
        }

        const vadSession = await getVadSession(customVadBuffer);

        self.postMessage({
          type: 'status',
          payload: { message: 'Scanning audio with Silero VAD for active speech...' }
        });

        const vadStartTime = performance.now();
        const rawSegments = await getSpeechTimestamps(float32Audio, vadSession, {
          threshold: vadOptions.threshold ?? 0.5,
          minSilenceDurationMs: vadOptions.minSilenceDurationMs ?? 300,
          speechPadMs: vadOptions.speechPadMs ?? 60,
          minSegment: vadOptions.minSegment ?? 0.5,
          maxSegmentDuration: vadOptions.maxSegmentDuration ?? 30.0,
          samplingRate: 16000,
          onProgress: (pct) => {
            self.postMessage({
              type: 'status',
              payload: { message: `VAD scanning audio: ${Math.round(pct * 100)}%...` }
            });
          }
        });
        const vadScanTime = (performance.now() - vadStartTime) / 1000;
        console.log(`[Worker] Silero VAD found ${rawSegments.length} raw speech segments in ${vadScanTime.toFixed(2)}s`);

        // Clean up segments: merge close, resolve overlaps, remove short/nested, and split > maxSegmentDuration
        const detectedSegments = segmentsCleanup(rawSegments, {
          minSegment: vadOptions.minSegment ?? 0.5,
          minSilence: vadOptions.minSilence ?? 0.5,
          maxSegmentDuration: vadOptions.maxSegmentDuration ?? 30.0,
          samplingRate: 16000,
        });
        console.log(`[Worker] After segments_cleanup: ${detectedSegments.length} segments ready for Whisper`);

        if (detectedSegments.length === 0) {
          self.postMessage({
            type: 'result',
            payload: {
              text: '',
              chunks: [],
              segments: [],
              output: { text: '', chunks: [], segments: [] },
              task: activeTask,
              timestampMode: usedTimestampMode,
              fallbackWarning: 'Silero VAD detected no active voice in the selected audio interval (audio appears silent or below speech threshold).',
              modelLoadTime: loadTime,
              transcriptionTime: vadScanTime,
              audioDuration: duration,
              fullAudioDuration,
              timeOffset,
              speechDuration: 0,
              silenceSkipped: duration,
              hardwareConcurrency: navigator.hardwareConcurrency || 4,
              crossOriginIsolated: Boolean(self.crossOriginIsolated),
            }
          });
          return;
        }

        const totalSpeechSec = detectedSegments.reduce((acc, s) => acc + s.duration, 0);
        const silenceSkippedSec = Math.max(0, duration - totalSpeechSec);

        const actionNoun = activeTask === 'translate' ? 'translation' : 'transcription';
        const actionVerbGerund = activeTask === 'translate' ? 'Translating' : 'Transcribing';
        const deviceDisplay = activeDevice === 'webgpu' ? '⚡ WebGPU' : '💻 CPU';

        const offsetInfo = timeOffset > 0 ? ` (time interval [${timeOffset.toFixed(1)}s - ${(timeOffset + duration).toFixed(1)}s])` : '';
        self.postMessage({
          type: 'status',
          payload: {
            message: `VAD identified ${detectedSegments.length} speech segments (${totalSpeechSec.toFixed(1)}s speech, ${silenceSkippedSec.toFixed(1)}s silence skipped). Running ${actionNoun} on ${deviceDisplay}${offsetInfo}...`
          }
        });

        // Post detected speech regions to main UI for vertical waveform rendering
        self.postMessage({
          type: 'vad_regions',
          payload: {
            regions: detectedSegments.map((s, idx) => ({
              index: idx,
              start: Number((s.start + timeOffset).toFixed(2)),
              end: Number((s.end + timeOffset).toFixed(2)),
              duration: s.duration,
            })),
            totalSpeechSec,
            silenceSkippedSec,
          }
        });

        const allChunks = [];
        const processedSegments = [];
        let fullTranscript = '';

        for (let i = 0; i < detectedSegments.length; i++) {
          const seg = detectedSegments[i];
          const segAudio = float32Audio.subarray(seg.startSample, seg.endSample);

          const globalStart = Number((seg.start + timeOffset).toFixed(2));
          const globalEnd = Number((seg.end + timeOffset).toFixed(2));

          self.postMessage({
            type: 'transcribing_segment',
            payload: {
              index: i,
              total: detectedSegments.length,
              start: globalStart,
              end: globalEnd,
            }
          });

          self.postMessage({
            type: 'status',
            payload: {
              message: `${actionVerbGerund} segment ${i + 1} of ${detectedSegments.length} [${globalStart.toFixed(1)}s - ${globalEnd.toFixed(1)}s]...`
            }
          });

          const segOutput = await transcribeSlice(segAudio);
          const rawText = segOutput.text || '';
          const segText = cleanSpeechText(rawText);

          // If transcription returns nothing or [BLANK_AUDIO], delete it (no need to show or export)
          if (!segText) {
            console.log(`[Worker] Segment ${i + 1} of ${detectedSegments.length} [${globalStart.toFixed(1)}s - ${globalEnd.toFixed(1)}s] produced no valid speech (output: "${rawText.trim()}"). Deleting segment.`);
            self.postMessage({
              type: 'segment_result',
              payload: {
                segmentIndex: i,
                totalSegments: detectedSegments.length,
                progress: (i + 1) / detectedSegments.length,
                segment: null,
                discarded: true,
                accumulatedText: fullTranscript,
              }
            });
            continue;
          }

          seg.text = segText;

          // Adjust relative chunk timestamps to global audio timeline (filtering out empty/[BLANK_AUDIO] chunks)
          const adjustedChunks = (segOutput.chunks || [])
            .map(c => ({
              ...c,
              text: cleanSpeechText(c.text),
            }))
            .filter(c => c.text.length > 0)
            .map(c => {
              const origStart = Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) : 0;
              const origEnd = Array.isArray(c.timestamp) ? (c.timestamp[1] ?? seg.duration) : seg.duration;
              return {
                text: c.text,
                timestamp: [
                  Number((origStart + globalStart).toFixed(2)),
                  Number((origEnd + globalStart).toFixed(2)),
                ]
              };
            });

          // Set global timestamps on segment
          seg.start = globalStart;
          seg.end = globalEnd;
          seg.chunks = adjustedChunks;
          allChunks.push(...adjustedChunks);
          processedSegments.push(seg);

          fullTranscript = fullTranscript ? `${fullTranscript} ${segText}` : segText;

          // Emit progressive segment stream so UI updates live
          self.postMessage({
            type: 'segment_result',
            payload: {
              segmentIndex: i,
              totalSegments: detectedSegments.length,
              progress: (i + 1) / detectedSegments.length,
              segment: seg,
              discarded: false,
              accumulatedText: fullTranscript,
            }
          });
        }

        const transcribeEndTime = performance.now();
        const transcriptionTime = (transcribeEndTime - transcribeStartTime) / 1000;

        const retainedSpeechSec = processedSegments.reduce((acc, s) => acc + (s.duration || 0), 0);
        const actualSilenceSkippedSec = Math.max(0, duration - retainedSpeechSec);

        let finalFallbackWarning = fallbackWarning;
        if (processedSegments.length === 0 && detectedSegments.length > 0 && !finalFallbackWarning) {
          finalFallbackWarning = 'Transcription returned no text for the detected speech segments (empty segments deleted).';
        }

        self.postMessage({
          type: 'result',
          payload: {
            text: fullTranscript,
            chunks: allChunks,
            segments: processedSegments,
            output: { text: fullTranscript, chunks: allChunks, segments: processedSegments },
            task: activeTask,
            timestampMode: usedTimestampMode,
            fallbackWarning: finalFallbackWarning,
            modelLoadTime: loadTime,
            transcriptionTime,
            audioDuration: duration,
            fullAudioDuration,
            timeOffset,
            speechDuration: Number(retainedSpeechSec.toFixed(2)),
            silenceSkipped: Number(actualSilenceSkippedSec.toFixed(2)),
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            crossOriginIsolated: Boolean(self.crossOriginIsolated),
          }
        });
      } else {
        const actionNoun = activeTask === 'translate' ? 'translation' : 'transcription';
        const offsetInfo = timeOffset > 0 ? ` [${timeOffset.toFixed(1)}s - ${(timeOffset + duration).toFixed(1)}s]` : '';
        const deviceDisplay = activeDevice === 'webgpu' ? '⚡ WebGPU' : '💻 CPU';
        // Continuous transcription without VAD
        self.postMessage({
          type: 'status',
          payload: { message: `Running continuous ${actionNoun} on ${deviceDisplay}${offsetInfo}...` }
        });

        const output = await transcribeSlice(float32Audio);
        const transcribeEndTime = performance.now();
        const transcriptionTime = (transcribeEndTime - transcribeStartTime) / 1000;

        const adjustedChunks = (output.chunks || [])
          .map(c => ({
            ...c,
            text: cleanSpeechText(c.text),
          }))
          .filter(c => c.text.length > 0)
          .map(c => {
            const origStart = Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) : 0;
            const origEnd = Array.isArray(c.timestamp) ? (c.timestamp[1] ?? duration) : duration;
            return {
              text: c.text,
              timestamp: [
                Number((origStart + timeOffset).toFixed(2)),
                Number((origEnd + timeOffset).toFixed(2)),
              ]
            };
          });

        const fullContinuousText = cleanSpeechText(output.text);

        self.postMessage({
          type: 'result',
          payload: {
            text: fullContinuousText,
            chunks: adjustedChunks,
            segments: [],
            output: { ...output, text: fullContinuousText, chunks: adjustedChunks },
            task: activeTask,
            timestampMode: usedTimestampMode,
            fallbackWarning,
            modelLoadTime: loadTime,
            transcriptionTime,
            audioDuration: duration,
            fullAudioDuration,
            timeOffset,
            speechDuration: duration,
            silenceSkipped: 0,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            crossOriginIsolated: Boolean(self.crossOriginIsolated),
          }
        });
      }
    } catch (err) {
      console.error('[Worker] Transcription error:', err);
      self.postMessage({
        type: 'error',
        payload: { message: err?.message || String(err) }
      });
    }
  } else if (type === 'segment') {
    try {
      const {
        audioData,
        duration,
        timeOffset = 0,
        fullAudioDuration = duration,
        files,
        vadOptions = {},
        enableDiarization = false,
        speakerCount = 2,
        diarizationOptions = {},
        projectSpeakers = [],
      } = payload;

      const float32Audio = audioData instanceof Float32Array
        ? audioData
        : new Float32Array(audioData);

      // A single-speaker recording needs no clustering at all, so treat it the way the
      // Python pipeline does and fall straight through to plain VAD segmentation.
      const targetK = Math.max(1, Math.min(5, Number(speakerCount) || 1));
      const runDiarization = enableDiarization && targetK >= 2;

      self.postMessage({
        type: 'status',
        payload: { message: 'Loading Silero Voice Activity Detector (VAD)...' }
      });

      // Check if user selected a local folder containing a Silero VAD model
      let customVadBuffer = null;
      if (Array.isArray(files)) {
        const vadEntry = files.find(f => {
          const p = (f.path || '').toLowerCase();
          return p.includes('silero_vad') || p.includes('vad.onnx');
        });
        if (vadEntry && vadEntry.file) {
          console.log('[Worker] Using local folder Silero VAD model:', vadEntry.path);
          customVadBuffer = await vadEntry.file.arrayBuffer();
        }
      }

      const vadStartTime = performance.now();
      let vadSession;
      try {
        vadSession = await getVadSession(customVadBuffer);
      } catch (vadInitErr) {
        console.error('[Worker] Silero VAD initialization failed:', vadInitErr);
        throw new Error(`Failed to initialize Silero VAD: ${vadInitErr?.message || String(vadInitErr)}`);
      }
      console.log(`[Worker] Silero VAD session ready in ${((performance.now() - vadStartTime) / 1000).toFixed(2)}s`);

      self.postMessage({
        type: 'status',
        payload: { message: 'Scanning audio with Silero VAD for active speech...' }
      });

      const scanStartTime = performance.now();
      let rawSegments;
      try {
        // When diarization follows, run the VAD at Silero's own defaults (100 ms silence,
        // 30 ms padding, no minimum-length filter, no max-duration splitting) the way the
        // Python pipeline does. The coarser UI defaults exist to produce tidy Whisper
        // chunks, but applied here they fuse short turn boundaries before the diarizer
        // ever sees them, and no amount of clustering recovers a merged turn afterwards.
        // Segments are tidied up after diarization instead.
        rawSegments = await getSpeechTimestamps(float32Audio, vadSession, {
          threshold: vadOptions.threshold ?? 0.5,
          minSilenceDurationMs: runDiarization ? 100 : (vadOptions.minSilenceDurationMs ?? 300),
          speechPadMs: runDiarization ? 30 : (vadOptions.speechPadMs ?? 60),
          minSpeechDurationMs: runDiarization ? 250 : undefined,
          minSegment: runDiarization ? null : (vadOptions.minSegment ?? 0.5),
          maxSegmentDuration: runDiarization ? Infinity : (vadOptions.maxSegmentDuration ?? 30.0),
          samplingRate: 16000,
          onProgress: (pct) => {
            const pct100 = Math.round(pct * 100);
            self.postMessage({
              type: 'progress',
              payload: {
                file: `Silero VAD scanning (${pct100}%)...`,
                progress: pct100,
                loaded: pct100,
                total: 100,
              }
            });
            self.postMessage({
              type: 'status',
              payload: { message: `Scanning audio with Silero VAD: ${pct100}%...` }
            });
          }
        });
      } catch (scanErr) {
        console.error('[Worker] VAD audio scanning failed:', scanErr);
        throw new Error(`Silero VAD speech detection failed: ${scanErr?.message || String(scanErr)}`);
      }
      const vadScanTime = (performance.now() - scanStartTime) / 1000;
      console.log(`[Worker] Silero VAD found ${rawSegments.length} raw speech segments in ${vadScanTime.toFixed(2)}s`);

      // Clean up segments: merge close, resolve overlaps, remove short/nested, and split > maxSegmentDuration.
      // Skipped ahead of diarization: this pass merges anything under minSilence and drops
      // anything under minSegment, which would destroy exactly the short turns and tight
      // turn boundaries the diarizer needs. It runs on the diarized output instead.
      const detectedSegments = runDiarization
        ? rawSegments
        : segmentsCleanup(rawSegments, {
          minSegment: vadOptions.minSegment ?? 0.5,
          minSilence: vadOptions.minSilence ?? 0.5,
          maxSegmentDuration: vadOptions.maxSegmentDuration ?? 30.0,
          samplingRate: 16000,
        });
      console.log(`[Worker] ${runDiarization ? `Raw VAD segments kept for diarization` : 'After segments_cleanup'}: ${detectedSegments.length} segments identified`);

      if (detectedSegments.length === 0) {
        self.postMessage({
          type: 'result',
          payload: {
            text: '',
            chunks: [],
            segments: [],
            output: { text: '', chunks: [], segments: [] },
            task: 'segment',
            isVadOnly: true,
            timestampMode: 'segment',
            fallbackWarning: 'Silero VAD detected no active speech in the audio (audio appears silent or below speech threshold).',
            modelLoadTime: 0,
            transcriptionTime: vadScanTime,
            audioDuration: duration,
            fullAudioDuration,
            timeOffset,
            speechDuration: 0,
            silenceSkipped: duration,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            crossOriginIsolated: Boolean(self.crossOriginIsolated),
          }
        });
        return;
      }

      const totalSpeechSec = detectedSegments.reduce((acc, s) => acc + s.duration, 0);
      const silenceSkippedSec = Math.max(0, duration - totalSpeechSec);

      // Post detected speech regions to main UI for vertical waveform rendering
      self.postMessage({
        type: 'vad_regions',
        payload: {
          regions: detectedSegments.map((s, idx) => ({
            index: idx,
            start: Number((s.start + timeOffset).toFixed(2)),
            end: Number((s.end + timeOffset).toFixed(2)),
            duration: s.duration,
          })),
          totalSpeechSec,
          silenceSkippedSec,
        }
      });

      // Format segments for UI display and editing
      const formattedSegments = detectedSegments.map((s, idx) => {
        const segStart = Number((s.start + timeOffset).toFixed(2));
        const segEnd = Number((s.end + timeOffset).toFixed(2));
        const segDuration = Number(s.duration.toFixed(2));
        return {
          id: idx + 1,
          start: segStart,
          end: segEnd,
          duration: segDuration,
          speakerId: s.speakerId ? Number(s.speakerId) : 1,
          speaker: s.speaker || 'Speaker 1',
          text: '',
          words: [],
        };
      });

      let finalSegments = formattedSegments;
      if (runDiarization && formattedSegments.length > 0) {
        try {
          self.postMessage({
            type: 'status',
            payload: { message: `Preparing windowed speaker diarization on ${formattedSegments.length} speech segments...` }
          });

          let customDiarizerBuffer = null;
          if (Array.isArray(files)) {
            const diarizerEntry = files.find(f => {
              const p = (f.path || '').toLowerCase();
              return p.includes('ecapa') || p.includes('diariz') || p.includes('speaker') || p.includes('spkrec');
            });
            if (diarizerEntry && diarizerEntry.file) {
              customDiarizerBuffer = await diarizerEntry.file.arrayBuffer();
            }
          }

          const diarizerSession = await getDiarizerSession(customDiarizerBuffer);
          const totalSamples = float32Audio.length;

          // 1. Slice speech segments into sliding windows (configurable windowSec and periodSec)
          const windowSec = Number(diarizationOptions.windowSec) || 1.0;
          const periodSec = Number(diarizationOptions.periodSec) || 0.5;

          const allWindows = [];
          for (let i = 0; i < formattedSegments.length; i++) {
            const seg = formattedSegments[i];
            const startRelSec = Math.max(0, seg.start - timeOffset);
            const endRelSec = Math.max(startRelSec + 0.1, seg.end - timeOffset);
            const subWindows = sliceUtteranceIntoWindows(startRelSec, endRelSec, windowSec, periodSec);
            for (const sw of subWindows) {
              allWindows.push({
                start: sw.start,
                end: sw.end,
                utteranceIdx: i,
              });
            }
          }

          self.postMessage({
            type: 'status',
            payload: { message: `Extracting speaker embeddings for ${allWindows.length} sliding windows...` }
          });

          const embeddings = [];
          const embeddedWindows = [];
          for (let i = 0; i < allWindows.length; i++) {
            const w = allWindows[i];
            const startSample = Math.max(0, Math.min(totalSamples - 1, Math.floor(w.start * 16000)));
            const endSample = Math.min(totalSamples, Math.ceil(w.end * 16000));
            const winAudio = float32Audio.slice(startSample, Math.max(startSample + 1600, endSample));

            const emb = await extractSpeakerEmbedding(winAudio, diarizerSession);
            // Drop the window outright when no embedding could be produced, so windows
            // and labels stay index-aligned through clustering.
            if (emb) {
              embeddings.push(emb);
              embeddedWindows.push(w);
            }

            if (i % 8 === 0 || i === allWindows.length - 1) {
              const pct = Math.round(((i + 1) / allWindows.length) * 100);
              self.postMessage({
                type: 'progress',
                payload: {
                  file: `Extracting speaker embeddings (${pct}%)...`,
                  progress: pct,
                  loaded: i + 1,
                  total: allWindows.length,
                }
              });
            }
          }

          self.postMessage({
            type: 'status',
            payload: { message: 'Clustering speaker embeddings (AHC average linkage)...' }
          });

          // 2. Global AHC clustering on window embeddings
          const numClusters = Math.min(embeddings.length, targetK);
          const rawLabels = agglomerativeClustering(embeddings, {
            targetClusters: numClusters,
          });

          // 3. Reconstruct continuous dialogue segments from classified windows
          const reconstructed = reconstructSegmentsFromWindows(embeddedWindows, rawLabels, {
            minSilence: vadOptions.minSilence ?? 0.5,
            minSegment: vadOptions.minSegment ?? 0.5,
          });

          // 4. Map cluster IDs (0..4) to speakerId (1..5) and project speaker metadata
          const spkMap = new Map();
          if (Array.isArray(projectSpeakers)) {
            for (const spk of projectSpeakers) {
              if (spk && spk.id != null) spkMap.set(Number(spk.id), spk);
            }
          }

          if (reconstructed.length > 0) {
            const mappedDiarized = reconstructed.map((rec, idx) => {
              const speakerId = Math.min(5, (rec.cluster ?? 0) + 1);
              const matched = spkMap.get(speakerId);
              const speakerName = matched?.name || `Speaker ${speakerId}`;
              const absStart = Number((rec.start + timeOffset).toFixed(2));
              const absEnd = Number((rec.end + timeOffset).toFixed(2));
              return {
                id: idx + 1,
                start: absStart,
                end: absEnd,
                duration: Number((absEnd - absStart).toFixed(2)),
                text: '',
                words: [],
                speakerId,
                speaker: speakerName,
              };
            });

            // Post-diarization cleanup: merge adjacent same-speaker segments, resolve overlaps, enforce min/max bounds
            finalSegments = segmentsCleanup(mappedDiarized, {
              minSegment: vadOptions.minSegment ?? 0.5,
              minSilence: vadOptions.minSilence ?? 0.5,
              maxSegmentDuration: vadOptions.maxSegmentDuration ?? 30.0,
              samplingRate: 16000,
            });
            console.log(`[Worker] Windowed diarization produced ${finalSegments.length} clean segments with ${numClusters} speakers`);
          }
        } catch (diarizeErr) {
          console.warn('[Worker] Speaker diarization failed, keeping default segments:', diarizeErr);
        }
      }

      self.postMessage({
        type: 'result',
        payload: {
          text: '',
          chunks: [],
          segments: finalSegments,
          output: { text: '', chunks: [], segments: finalSegments },
          task: 'segment',
          isVadOnly: true,
          timestampMode: 'segment',
          fallbackWarning: null,
          modelLoadTime: 0,
          transcriptionTime: vadScanTime,
          audioDuration: duration,
          fullAudioDuration,
          timeOffset,
          speechDuration: Number(totalSpeechSec.toFixed(2)),
          silenceSkipped: Number(silenceSkippedSec.toFixed(2)),
          hardwareConcurrency: navigator.hardwareConcurrency || 4,
          crossOriginIsolated: Boolean(self.crossOriginIsolated),
        }
      });
    } catch (err) {
      console.error('[Worker] Segmentation error:', err);
      self.postMessage({
        type: 'error',
        payload: { message: err?.message || String(err) }
      });
    }
  } else if (type === 'transcribe_segment') {
    try {
      const {
        audioData,
        segmentId,
        start,
        end,
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device = 'auto',
        language = 'en',
        task = 'transcribe',
      } = payload;

      const float32Audio = audioData instanceof Float32Array 
        ? audioData 
        : new Float32Array(audioData);

      self.postMessage({
        type: 'status',
        payload: { message: `Initializing Whisper model for segment [${Number(start).toFixed(1)}s - ${Number(end).toFixed(1)}s]...` }
      });

      const { transcriber: pipe } = await getTranscriber({
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device,
      });

      self.postMessage({
        type: 'transcribing_single_segment',
        payload: {
          id: segmentId,
          start: Number(start),
          end: Number(end),
        }
      });

      self.postMessage({
        type: 'status',
        payload: { message: `Transcribing segment [${Number(start).toFixed(1)}s - ${Number(end).toFixed(1)}s]...` }
      });

      const activeTask = (task && task.trim()) ? task.trim() : 'transcribe';
      const langParam = (language && language.trim() && language.trim() !== 'auto')
        ? language.trim()
        : null;

      const output = await pipe(float32Audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
        force_full_sequences: false,
        do_sample: false,
        top_k: 0,
        task: activeTask,
        ...(langParam ? { language: langParam } : {}),
      });

      const rawText = output?.text || '';
      const segText = cleanSpeechText(rawText);

      self.postMessage({
        type: 'segment_transcribed',
        payload: {
          segmentId,
          start: Number(start),
          end: Number(end),
          text: segText,
          rawText,
        }
      });
    } catch (err) {
      console.error('[Worker] Transcribe segment error:', err);
      self.postMessage({
        type: 'segment_transcribe_error',
        payload: {
          segmentId: payload?.segmentId,
          message: err?.message || String(err),
        }
      });
    }
  } else if (type === 'transcribe_empty_segments') {
    try {
      const {
        segments = [],
        audioData,
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device = 'auto',
        language = 'en',
        task = 'transcribe',
      } = payload;

      if (!segments || segments.length === 0) {
        self.postMessage({
          type: 'batch_transcription_complete',
          payload: {
            transcribedCount: 0,
            message: 'No empty segments to transcribe.',
          }
        });
        return;
      }

      const float32Audio = audioData instanceof Float32Array 
        ? audioData 
        : new Float32Array(audioData);
      const totalLen = float32Audio.length;

      self.postMessage({
        type: 'status',
        payload: { message: `Initializing Whisper model for ${segments.length} empty segments...` }
      });

      const { transcriber: pipe } = await getTranscriber({
        modelSource,
        modelId,
        folderName,
        files,
        dtype,
        device,
      });

      const activeTask = (task && task.trim()) ? task.trim() : 'transcribe';
      const activeLang = (language && language.trim()) ? language.trim() : 'en';

      let successCount = 0;
      const startTime = performance.now();

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segStartSec = Math.max(0, seg.start ?? 0);
        const segEndSec = Math.max(segStartSec + 0.1, seg.end ?? (segStartSec + 1));

        const startSample = Math.max(0, Math.min(totalLen - 1, Math.floor(segStartSec * 16000)));
        let endSample = Math.min(totalLen, Math.ceil(segEndSec * 16000));

        if (endSample <= startSample) {
          endSample = Math.min(totalLen, startSample + 3200);
        }

        if (endSample <= startSample) {
          continue;
        }

        const segAudio = float32Audio.slice(startSample, endSample);

        self.postMessage({
          type: 'transcribing_single_segment',
          payload: {
            id: seg.id,
            start: Number(seg.start),
            end: Number(seg.end),
            index: i,
            total: segments.length,
          }
        });

        const pct = Math.round(((i + 1) / segments.length) * 100);
        self.postMessage({
          type: 'progress',
          payload: {
            file: `Transcribing empty segment ${i + 1} of ${segments.length} [${segStartSec.toFixed(1)}s - ${segEndSec.toFixed(1)}s]`,
            progress: pct,
            loaded: i + 1,
            total: segments.length,
          }
        });

        try {
          const langParam = (activeLang && activeLang !== 'auto') ? activeLang : null;
          const output = await pipe(segAudio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            force_full_sequences: false,
            do_sample: false,
            top_k: 0,
            task: activeTask,
            ...(langParam ? { language: langParam } : {}),
          });

          const rawText = output?.text || '';
          const segText = cleanSpeechText(rawText);

          self.postMessage({
            type: 'segment_transcribed',
            payload: {
              segmentId: seg.id,
              start: Number(seg.start),
              end: Number(seg.end),
              text: segText,
              rawText,
              index: i,
              total: segments.length,
            }
          });
          successCount++;
        } catch (segErr) {
          console.warn(`[Worker] Error transcribing segment ${seg.id}:`, segErr);
          self.postMessage({
            type: 'segment_transcribe_error',
            payload: {
              segmentId: seg.id,
              message: segErr?.message || String(segErr),
            }
          });
        }
      }

      const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
      self.postMessage({
        type: 'batch_transcription_complete',
        payload: {
          transcribedCount: successCount,
          totalSegments: segments.length,
          timeSec: totalTime,
        }
      });
    } catch (err) {
      console.error('[Worker] Batch transcription error:', err);
      self.postMessage({
        type: 'error',
        payload: { message: err?.message || String(err) }
      });
    }
  } else if (type === 'diarize') {
    try {
      const {
        audioData,
        segments = [],
        files,
        speakerCount = 2,
        projectSpeakers = [],
        diarizationOptions = {},
        cleanupOptions = payload.vadOptions || {},
      } = payload;

      if (!segments || segments.length === 0) {
        self.postMessage({
          type: 'diarize_result',
          payload: {
            segments: [],
            speakerCount: 0,
            timeSec: 0,
            message: 'No segments provided for diarization.',
          }
        });
        return;
      }

      const float32Audio = audioData instanceof Float32Array 
        ? audioData 
        : new Float32Array(audioData);
      const totalSamples = float32Audio.length;

      self.postMessage({
        type: 'status',
        payload: { message: "Loading speaker embedding model (CAM++)..." }
      });

      let customDiarizerBuffer = null;
      if (Array.isArray(files)) {
        const diarizerEntry = files.find(f => {
          const p = (f.path || '').toLowerCase();
          return p.includes('ecapa') || p.includes('diariz') || p.includes('speaker') || p.includes('spkrec');
        });
        if (diarizerEntry && diarizerEntry.file) {
          customDiarizerBuffer = await diarizerEntry.file.arrayBuffer();
        }
      }

      const diarizerSession = await getDiarizerSession(customDiarizerBuffer);

      const startTime = performance.now();

      // 1. Slice existing segments into sliding windows (configurable windowSec and periodSec)
      const windowSec = Number(diarizationOptions.windowSec) || 1.0;
      const periodSec = Number(diarizationOptions.periodSec) || 0.5;

      const allWindows = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const startSec = Math.max(0, seg.start ?? 0);
        const endSec = Math.max(startSec + 0.1, seg.end ?? (startSec + 1));
        const subWindows = sliceUtteranceIntoWindows(startSec, endSec, windowSec, periodSec);
        for (const sw of subWindows) {
          allWindows.push({
            start: sw.start,
            end: sw.end,
            segIdx: i,
          });
        }
      }

      self.postMessage({
        type: 'status',
        payload: { message: `Extracting speaker embeddings for ${allWindows.length} sliding windows across ${segments.length} segments...` }
      });

      const embeddings = [];
      const embeddedWindows = [];
      for (let i = 0; i < allWindows.length; i++) {
        const w = allWindows[i];
        const startSample = Math.max(0, Math.min(totalSamples - 1, Math.floor(w.start * 16000)));
        const endSample = Math.min(totalSamples, Math.ceil(w.end * 16000));
        const winAudio = float32Audio.slice(startSample, Math.max(startSample + 1600, endSample));

        const emb = await extractSpeakerEmbedding(winAudio, diarizerSession);
        // Drop the window outright when no embedding could be produced, so windows
        // and labels stay index-aligned through clustering.
        if (emb) {
          embeddings.push(emb);
          embeddedWindows.push(w);
        }

        if (i % 8 === 0 || i === allWindows.length - 1) {
          const pct = Math.round(((i + 1) / allWindows.length) * 100);
          self.postMessage({
            type: 'progress',
            payload: {
              file: `Extracting speaker embeddings (${pct}%)...`,
              progress: pct,
              loaded: i + 1,
              total: allWindows.length,
            }
          });
        }
      }

      self.postMessage({
        type: 'status',
        payload: { message: 'Clustering speaker embeddings (AHC average linkage)...' }
      });

      // 2. Global AHC clustering
      const targetK = Math.max(2, Math.min(5, Number(speakerCount) || 2));
      const numClusters = Math.min(embeddings.length, targetK);
      const rawLabels = agglomerativeClustering(embeddings, {
        targetClusters: numClusters,
      });

      // 3. Multi-window majority voting per existing segment
      const segLabels = new Array(segments.length);
      for (let i = 0; i < segments.length; i++) {
        const windowLabelsForSeg = [];
        for (let j = 0; j < embeddedWindows.length; j++) {
          if (embeddedWindows[j].segIdx === i) {
            windowLabelsForSeg.push(rawLabels[j]);
          }
        }
        segLabels[i] = majorityVoteSpeaker(windowLabelsForSeg);
      }

      // 4. Temporal smoothing for short segments
      const smoothedLabels = smoothSpeakerLabels(segments, segLabels);

      // 5. Map cluster IDs (0..4) to speakerId (1..5) and project speaker metadata
      const spkMap = new Map();
      if (Array.isArray(projectSpeakers)) {
        for (const spk of projectSpeakers) {
          if (spk && spk.id != null) spkMap.set(Number(spk.id), spk);
        }
      }

      const mappedSegments = segments.map((seg, idx) => {
        const clusterId = smoothedLabels[idx] ?? 0;
        const speakerId = Math.min(5, clusterId + 1);
        const matched = spkMap.get(speakerId);
        const speakerName = matched?.name || `Speaker ${speakerId}`;
        return {
          ...seg,
          speakerId,
          speaker: speakerName,
        };
      });

      // Post-diarization cleanup: merge close same-speaker segments, resolve overlaps, enforce min/max bounds
      const updatedSegments = segmentsCleanup(mappedSegments, {
        minSegment: cleanupOptions.minSegment ?? 0.5,
        minSilence: cleanupOptions.minSilence ?? 0.5,
        maxSegmentDuration: cleanupOptions.maxSegmentDuration ?? 30.0,
        samplingRate: 16000,
      });

      const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
      const distinctSpeakers = new Set(updatedSegments.map(s => s.speakerId)).size;

      self.postMessage({
        type: 'diarize_result',
        payload: {
          segments: updatedSegments,
          speakerCount: distinctSpeakers,
          timeSec: totalTime,
        }
      });
    } catch (err) {
      console.error('[Worker] Diarization error:', err);
      self.postMessage({
        type: 'error',
        payload: { message: `Speaker diarization failed: ${err?.message || String(err)}` }
      });
    }
  }
};

self.addEventListener('unhandledrejection', (event) => {
  console.error('[Worker] Unhandled promise rejection in worker:', event.reason);
  self.postMessage({
    type: 'error',
    payload: { message: event?.reason?.message || String(event?.reason) }
  });
});
