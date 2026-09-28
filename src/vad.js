/**
 * Silero VAD v5 Voice Activity Detection Engine for Browser (CPU / WASM)
 * Model: silero-vad v5 ONNX (~2.2 MB)
 */

import * as ort from 'onnxruntime-web';

export const SILERO_VAD_URL = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx';

let cachedSession = null;

/**
 * Fetch Silero VAD model bytes with local /silero_vad.onnx priority & CacheStorage
 * @param {string} [customUrl]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchSileroVadModel(customUrl = null) {
  const isWeb = typeof location !== 'undefined' && location.origin;
  const localUrl = isWeb 
    ? `${location.origin}/silero_vad.onnx` 
    : null;
  const remoteUrl = customUrl || SILERO_VAD_URL;
  const cacheName = 'silero-vad-cache-v1';

  // 1. Try browser CacheStorage
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(cacheName);
      const cachedResponse = (localUrl && await cache.match(localUrl)) || (await cache.match(remoteUrl));
      if (cachedResponse) {
        console.log('[VAD] Loaded Silero VAD model from browser CacheStorage');
        return await cachedResponse.arrayBuffer();
      }
    }
  } catch (err) {
    console.warn('[VAD] CacheStorage access error:', err);
  }

  // 2. Try same-origin /silero_vad.onnx in browser/worker (immune to COEP / CORS restrictions)
  if (localUrl) {
    try {
      console.log(`[VAD] Loading local same-origin Silero VAD model from ${localUrl}...`);
      const localResp = await fetch(localUrl);
      if (localResp.ok) {
        const buf = await localResp.arrayBuffer();
        try {
          if (typeof caches !== 'undefined') {
            const cache = await caches.open(cacheName);
            await cache.put(localUrl, new Response(buf));
          }
        } catch {}
        console.log('[VAD] Successfully loaded local Silero VAD model');
        return buf;
      }
    } catch (err) {
      console.warn('[VAD] Local model fetch error, falling back to remote:', err);
    }
  }

  // 3. Fallback to remote URL
  console.log(`[VAD] Downloading Silero VAD model from ${remoteUrl}...`);
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Silero VAD model: ${resp.status} ${resp.statusText}`);
  }
  const buf = await resp.arrayBuffer();
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(cacheName);
      await cache.put(remoteUrl, new Response(buf));
    }
  } catch {}
  return buf;
}

// The ONNX Runtime version whose WASM binaries live in public/. Must match the
// `onnxruntime-web` version pinned in package.json: the JS glue and the .wasm binary are a
// matched pair, and a mismatched pair either fails to load or — worse — computes silently
// wrong results (see the AveragePool note in src/diarizer.js).
const ORT_WEB_VERSION = '1.30.0';

let ortWasmEnvPromise = null;

/**
 * Configure ONNX Runtime Web WASM flags and binary search paths.
 *
 * `package.json` dedupes `onnxruntime-web` to a single copy, so Transformers.js (Whisper)
 * and the VAD / diarizer all share one runtime and one `ort.env`. Transformers.js sets
 * `wasmPaths` to its own CDN at import time, and those binaries are the 1.22 build it pins
 * — which miscomputes this speaker model. Because ORT loads its WASM once per process,
 * whoever sets the path first decides it for everything.
 *
 * So this deliberately OVERWRITES any `wasmPaths` already present rather than deferring to
 * it, and every session factory awaits it before creating a session.
 */
export async function setupOrtWasmEnvironment() {
  if (!ortWasmEnvPromise) ortWasmEnvPromise = configureOrtWasmEnvironment();
  return ortWasmEnvPromise;
}

async function configureOrtWasmEnvironment() {
  if (typeof self === 'undefined' || !ort?.env?.wasm) return;
  // If running in Node.js / Bun (test runner), keep default bindings
  if (typeof process !== 'undefined' && process.versions && (process.versions.node || process.versions.bun)) {
    return;
  }
  // Always use 1 thread for Silero VAD in Web Worker to execute purely in worker thread without nested workers
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.proxy = false;

  if (typeof location !== 'undefined' && location.origin) {
    const localOrigin = `${location.origin}/`;
    const problem = await inspectLocalOrtRuntime(localOrigin);
    if (!problem) {
      console.log('[VAD] Using local WASM runtime from:', localOrigin);
      ort.env.wasm.wasmPaths = localOrigin;
      return;
    }
    console.warn(`[VAD] Local ONNX Runtime files are not usable: ${problem}`);
  }

  console.log(`[VAD] Falling back to official onnxruntime-web@${ORT_WEB_VERSION} CDN runtime`);
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WEB_VERSION}/dist/`;
}

/** Content types a browser will accept for an ES module. */
const JS_MIME = /^(text|application)\/(javascript|ecmascript)|^text\/jsmodule/i;

/**
 * Checks whether the runtime files served from this origin can actually be loaded,
 * returning a description of the first problem or null when everything is fine.
 *
 * The .mjs loaders matter as much as the .wasm binaries: ONNX Runtime pulls them in
 * with a dynamic `import()`, and browsers apply strict MIME checking to module
 * scripts. A server that has no mapping for the `.mjs` extension falls back to
 * `application/octet-stream`, which the browser refuses, and the only symptom is
 * "Failed to fetch dynamically imported module" at session-creation time. nginx is
 * the common case: its stock mime.types has no `mjs` entry. Detecting it here means
 * a misconfigured host quietly falls back to the CDN instead of failing outright.
 */
async function inspectLocalOrtRuntime(origin) {
  const modules = [
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.mjs',
  ];
  const binaries = ['ort-wasm-simd-threaded.wasm'];

  try {
    for (const file of modules) {
      const resp = await fetch(`${origin}${file}`, { method: 'HEAD' });
      if (!resp.ok) return `${file} returned HTTP ${resp.status}`;
      const ct = (resp.headers.get('content-type') || '').trim();
      if (!JS_MIME.test(ct)) {
        return (
          `${file} is served as "${ct || 'no content-type'}" but a browser only ` +
          'executes an ES module served as JavaScript. Map the .mjs extension to ' +
          'text/javascript on the server.'
        );
      }
    }

    for (const file of binaries) {
      const resp = await fetch(`${origin}${file}`, { method: 'HEAD' });
      if (!resp.ok) return `${file} returned HTTP ${resp.status}`;
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('wasm') && !ct.includes('octet-stream')) {
        return `${file} is served as "${ct || 'no content-type'}"`;
      }
    }
  } catch (err) {
    return `could not be reached (${err?.message || err})`;
  }

  return null;
}

/**
 * Initialize or get cached Silero VAD ONNX InferenceSession
 * @param {ArrayBuffer|Uint8Array|string|null} [modelData]
 * @returns {Promise<ort.InferenceSession>}
 */
export async function getVadSession(modelData = null) {
  if (cachedSession) {
    return cachedSession;
  }

  await setupOrtWasmEnvironment();

  let bufferOrUrl = modelData;
  if (!bufferOrUrl) {
    bufferOrUrl = await fetchSileroVadModel();
  }

  const modelBytes = (bufferOrUrl instanceof ArrayBuffer) 
    ? new Uint8Array(bufferOrUrl) 
    : bufferOrUrl;

  // Configure session options for WASM CPU execution
  const sessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  };

  cachedSession = await ort.InferenceSession.create(modelBytes, sessionOptions);
  console.log('[VAD] Silero VAD v5 ONNX session compiled successfully!');
  return cachedSession;
}

/**
 * Detect active speech timestamps from 16 kHz mono Float32Array audio
 * 
 * @param {Float32Array} audioFloat32 16 kHz mono audio samples normalized to [-1, 1]
 * @param {ort.InferenceSession} vadSession Active Silero VAD session
 * @param {Object} [options]
 * @param {number} [options.threshold=0.5] Speech probability threshold to begin speech
 * @param {number} [options.negThreshold=0.35] Probability threshold below which speech ends
 * @param {number} [options.samplingRate=16000] Sampling rate (must be 16000)
 * @param {number} [options.minSpeechDurationMs=250] Minimum speech length to keep (filters out clicks)
 * @param {number} [options.minSilenceDurationMs=300] Silence duration to split separate speech segments
 * @param {number} [options.speechPadMs=60] Padding added to start and end of segments (in ms)
 * @param {number} [options.maxSpeechDurationS=28] Maximum duration of a single segment before splitting for Whisper
 * @param {Function} [options.onProgress] Optional callback for progress reporting (0 to 1)
 * @returns {Promise<Array<{ id: number, start: number, end: number, duration: number, startSample: number, endSample: number, speaker: string }>>}
 */
export async function getSpeechTimestamps(audioFloat32, vadSession, options = {}) {
  const {
    threshold = 0.5,
    negThreshold = 0.35,
    samplingRate = 16000,
    minSpeechDurationMs = 250,
    minSilenceDurationMs = 300,
    speechPadMs = 60,
    maxSpeechDurationS = 30,
    maxSegmentDuration = null,
    minSegment = null,
    minSilence = null,
    onProgress = null,
  } = options;

  if (samplingRate !== 16000) {
    throw new Error(`Silero VAD expects 16000 Hz audio, received ${samplingRate} Hz.`);
  }

  // Reconcile unified parameter names across VAD, cleanup, and diarization
  const effectiveMinSpeechMs = minSegment != null ? Math.round(minSegment * 1000) : minSpeechDurationMs;
  const effectiveMinSilenceMs = minSilence != null && options.minSilenceDurationMs == null
    ? Math.round(minSilence * 1000)
    : minSilenceDurationMs;
  const effectiveMaxSpeechS = maxSegmentDuration != null ? maxSegmentDuration : maxSpeechDurationS;

  const frameSize = 512;        // 32 ms at 16 kHz
  const contextSize = 64;       // 4 ms rolling context
  const minSpeechSamples = Math.round((samplingRate * effectiveMinSpeechMs) / 1000);
  const minSilenceSamples = Math.round((samplingRate * effectiveMinSilenceMs) / 1000);
  const speechPadSamples = Math.round((samplingRate * speechPadMs) / 1000);
  const maxSpeechSamples = Math.round(samplingRate * effectiveMaxSpeechS);

  // Initialize rolling context and recurrent state
  const context = new Float32Array(contextSize);
  let state = new ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
  const srTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(samplingRate)]), []);

  // Pre-allocate input chunk to avoid 18,000+ Float32Array allocations
  const inputChunk = new Float32Array(contextSize + frameSize);

  const speeches = [];
  let currentSpeech = null;
  let tempEnd = 0;

  const totalFrames = Math.floor(audioFloat32.length / frameSize);
  const progressInterval = Math.max(1, Math.floor(totalFrames / 50));

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const startSample = frameIdx * frameSize;
      const frame = audioFloat32.subarray(startSample, startSample + frameSize);

      // Build [1, 576] input buffer: 64 context + 512 frame
      inputChunk.set(context, 0);
      inputChunk.set(frame, contextSize);
      // Update rolling context for next frame
      context.set(frame.subarray(frameSize - contextSize, frameSize));

      const inputTensor = new ort.Tensor('float32', inputChunk, [1, contextSize + frameSize]);
      const results = await vadSession.run({
        input: inputTensor,
        state,
        sr: srTensor,
      });

      const prob = results.output.data[0];

      // Critical fix for >10min audio files:
      // In ONNX Runtime Web, tensors allocate internal memory in the WebAssembly linear heap.
      // Calling .dispose() immediately reclaims WASM memory, preventing heap exhaustion (OOM).
      const oldState = state;
      state = results.stateN;

      if (oldState && typeof oldState.dispose === 'function') {
        try { oldState.dispose(); } catch {}
      }
      if (results.output && typeof results.output.dispose === 'function') {
        try { results.output.dispose(); } catch {}
      }
      if (inputTensor && typeof inputTensor.dispose === 'function') {
        try { inputTensor.dispose(); } catch {}
      }

      const currentSample = startSample;

      // Hysteresis thresholding
      // Boundaries are collected unpadded; padding is applied once at the end so that
      // it can never be mistaken for speech when gaps are measured (see below).
      if (prob >= threshold) {
        if (tempEnd !== 0) {
          tempEnd = 0; // Speech resumed before silence threshold expired
        }
        if (!currentSpeech) {
          currentSpeech = { startSample: currentSample };
        } else if (currentSample - currentSpeech.startSample >= maxSpeechSamples) {
          // Enforce maximum speech duration so segment fits comfortably in Whisper's receptive field
          speeches.push({
            startSample: currentSpeech.startSample,
            endSample: currentSample,
          });
          currentSpeech = { startSample: currentSample };
          tempEnd = 0;
        }
      } else if (prob < negThreshold && currentSpeech) {
        if (tempEnd === 0) {
          tempEnd = currentSample;
        }
        if (currentSample - tempEnd >= minSilenceSamples) {
          if (tempEnd - currentSpeech.startSample >= minSpeechSamples) {
            speeches.push({
              startSample: currentSpeech.startSample,
              endSample: tempEnd,
            });
          }
          currentSpeech = null;
          tempEnd = 0;
        }
      }

      if (onProgress && (frameIdx % progressInterval === 0 || frameIdx === totalFrames - 1)) {
        onProgress((frameIdx + 1) / totalFrames);
      }

      // Cooperatively yield every 400 frames (~12.8s audio) to keep worker thread responsive
      if (frameIdx > 0 && frameIdx % 400 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    // Dispose final persistent tensors when scanning completes or if aborted
    if (state && typeof state.dispose === 'function') {
      try { state.dispose(); } catch {}
    }
    if (srTensor && typeof srTensor.dispose === 'function') {
      try { srTensor.dispose(); } catch {}
    }
  }

  // Handle trailing speech at the very end of audio
  if (currentSpeech) {
    const segEnd = tempEnd || audioFloat32.length;
    if (segEnd - currentSpeech.startSample >= minSpeechSamples) {
      speeches.push({
        startSample: currentSpeech.startSample,
        endSample: segEnd,
      });
    }
  }

  // Apply speech padding exactly as Silero's reference implementation does: when two
  // segments are closer together than 2x the padding, split the gap between them rather
  // than letting the padded regions overlap.
  //
  // The previous code padded each segment first and then re-merged any pair whose
  // *padded* gap fell under minSilenceSamples. Since padding had already eaten
  // 2 x speechPad of every gap, that silently fused every pause shorter than
  // minSilence + 2 x speechPad (420 ms at the defaults), which is most turn boundaries
  // in conversational speech. Diarization then received pre-merged cross-speaker audio.
  const merged = speeches.map((seg) => ({ ...seg }));
  for (let i = 0; i < merged.length; i++) {
    const seg = merged[i];
    if (i === 0) {
      seg.startSample = Math.max(0, seg.startSample - speechPadSamples);
    }
    if (i !== merged.length - 1) {
      const next = merged[i + 1];
      const silenceDuration = next.startSample - seg.endSample;
      if (silenceDuration < 2 * speechPadSamples) {
        const half = Math.floor(silenceDuration / 2);
        seg.endSample += half;
        next.startSample = Math.max(0, next.startSample - half);
      } else {
        seg.endSample = Math.min(audioFloat32.length, seg.endSample + speechPadSamples);
        next.startSample = Math.max(0, next.startSample - speechPadSamples);
      }
    } else {
      seg.endSample = Math.min(audioFloat32.length, seg.endSample + speechPadSamples);
    }
  }

  // Format into final objects with seconds and speaker tags
  return merged.map((seg, idx) => {
    const startSec = Number((seg.startSample / samplingRate).toFixed(2));
    const endSec = Number((seg.endSample / samplingRate).toFixed(2));
    return {
      id: idx + 1,
      start: startSec,
      end: endSec,
      duration: Number((endSec - startSec).toFixed(2)),
      startSample: seg.startSample,
      endSample: seg.endSample,
      speakerId: 1,
      speaker: 'Speaker 1',
    };
  });
}

/**
 * Cleans up segments by:
 * 1. Splitting segments longer than 30 seconds into max 30.0s segments.
 * 2. Segregating by speaker and merging close/overlapping segments (< minSilence, max 30s).
 * 3. Removing segments shorter than minSegment.
 * 4. Removing completely enclosed/nested segments.
 * 5. Resolving partial overlaps at the midpoint.
 * 
 * @param {Array<Object|Array>} initSegments List of {start, end, speaker} or [start, end, speaker] tuples
 * @param {Object} [options]
 * @param {number} [options.minSegment=0.5] Minimum segment duration in seconds
 * @param {number} [options.minSilence=0.5] Minimum silence duration between segments in seconds
 * @param {number} [options.samplingRate=16000] Sampling rate for sample index calculation
 * @returns {Array<{ id: number, start: number, end: number, duration: number, startSample: number, endSample: number, speaker: string }>}
 */
export function segmentsCleanup(initSegments, options = {}) {
  const {
    minSegment = 0.5,
    minSilence = 0.5,
    maxSegmentDuration = 30.0,
    samplingRate = 16000,
  } = options;

  if (!initSegments || initSegments.length === 0) return [];

  // Normalize input: supports both tuples [start, end, speaker] and objects {start, end, speaker}
  const normalized = initSegments.map((item) => {
    if (Array.isArray(item)) {
      const spkName = item[2] || 'Speaker 1';
      const parsedId = spkName.startsWith('Speaker ') ? parseInt(spkName.split(' ')[1], 10) || 1 : 1;
      return {
        start: Number(item[0]),
        end: Number(item[1]),
        speaker: spkName,
        speakerId: parsedId,
      };
    }
    const spkName = item.speaker || 'Speaker 1';
    const parsedId = item.speakerId != null
      ? Number(item.speakerId)
      : (spkName.startsWith('Speaker ') ? parseInt(spkName.split(' ')[1], 10) || 1 : 1);
    return {
      ...item,
      start: Number(item.start),
      end: Number(item.end),
      speaker: spkName,
      speakerId: parsedId,
    };
  });

  // 1. Split segments longer than maxSegmentDuration into maxSegmentDuration segments
  const splitSegments = [];
  for (const seg of normalized) {
    let curStart = seg.start;
    const end = seg.end;

    if (end - curStart > maxSegmentDuration) {
      while (end - curStart > maxSegmentDuration) {
        splitSegments.push({ ...seg, start: curStart, end: curStart + maxSegmentDuration });
        curStart += maxSegmentDuration;
      }
      if (end - curStart > 0) {
        splitSegments.push({ ...seg, start: curStart, end });
      }
    } else {
      splitSegments.push({ ...seg, start: curStart, end });
    }
  }

  // 2. Segregate by speaker
  const segregated = new Map();
  for (const seg of splitSegments) {
    if (!segregated.has(seg.speaker)) {
      segregated.set(seg.speaker, []);
    }
    segregated.get(seg.speaker).push(seg);
  }

  const clean1 = [];
  for (const [sp, spSegments] of segregated.entries()) {
    spSegments.sort((a, b) => a.start - b.start);
    if (spSegments.length === 0) continue;

    const cleaned = [{ ...spSegments[0] }];
    for (let i = 1; i < spSegments.length; i++) {
      const current = spSegments[i];
      const prev = cleaned[cleaned.length - 1];

      if (current.start - prev.end < minSilence) {
        if (current.end - prev.start < maxSegmentDuration) {
          // Merge close and overlapping segments
          prev.end = Math.max(prev.end, current.end);
          if (Array.isArray(prev.words) && Array.isArray(current.words)) {
            prev.words = [...prev.words, ...current.words];
          }
          if (prev.text != null && current.text != null) {
            prev.text = (prev.text + ' ' + current.text).trim();
          }
        } else {
          cleaned.push({ ...current });
        }
      } else {
        // If the previous segment is too short, replace it
        if (prev.end - prev.start < minSegment) {
          cleaned[cleaned.length - 1] = { ...current };
        } else {
          cleaned.push({ ...current });
        }
      }
    }
    clean1.push(...cleaned);
  }

  // 3. Delete segments shorter than minSegment
  const cleanFiltered = clean1.filter((seg) => (seg.end - seg.start) >= minSegment);
  if (cleanFiltered.length === 0) return [];

  // 4. Check for complete overlap (remove segments strictly enclosed by another)
  const clean2 = cleanFiltered.filter((item) => {
    const isEnclosed = cleanFiltered.some((other) =>
      other !== item &&
      item.start >= other.start &&
      item.end <= other.end &&
      (item.start > other.start || item.end < other.end)
    );
    return !isEnclosed;
  });

  if (clean2.length === 0) return [];

  // 5. Handle partial overlaps across all speakers
  clean2.sort((a, b) => a.start - b.start);
  const clean3 = [{ ...clean2[0] }];

  for (let i = 1; i < clean2.length; i++) {
    const current = clean2[i];
    const prev = clean3[clean3.length - 1];

    if (current.start <= prev.end) {
      // Resolve overlap by setting midpoint
      const overlap = prev.end - current.start;
      const midpoint = Number((current.start + overlap / 2.0).toFixed(3));

      if (midpoint - prev.start < minSegment) {
        // Replace previous segment if midpoint made it too short
        clean3[clean3.length - 1] = { ...current };
      } else {
        prev.end = midpoint;
        if (current.end - midpoint >= minSegment) {
          clean3.push({ ...current, start: midpoint });
        }
      }
    } else {
      clean3.push({ ...current });
    }
  }

  // Final mapping with 2-decimal rounded seconds, sample bounds, and indices
  return clean3.map((seg, idx) => {
    const s = Number(seg.start.toFixed(2));
    const e = Number(seg.end.toFixed(2));
    const spkId = seg.speakerId != null
      ? Number(seg.speakerId)
      : (seg.speaker && seg.speaker.startsWith('Speaker ') ? parseInt(seg.speaker.split(' ')[1], 10) || 1 : 1);
    return {
      ...seg,
      id: idx + 1,
      start: s,
      end: e,
      duration: Number((e - s).toFixed(2)),
      startSample: Math.round(s * samplingRate),
      endSample: Math.round(e * samplingRate),
      speakerId: spkId,
      speaker: seg.speaker || `Speaker ${spkId}`,
    };
  });
}

