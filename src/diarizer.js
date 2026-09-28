/**
 * Speaker Embedding & Diarization Inference Engine for Browser (CPU / WASM)
 *
 * Model: the bundled `public/spkrec_ecapa.onnx` is, despite the filename, 3D-Speaker
 * CAM++ (`speech_campplus_sv_en_voxceleb_16k`, 512-d output), not SpeechBrain
 * ECAPA-TDNN (192-d). Its front-end is Kaldi fbank — see src/utils/fbank.js, which is
 * matched to it exactly. Swapping in a real ECAPA export means switching that
 * front-end too (Hamming window, no pre-emphasis, no int16 scaling).
 *
 * REQUIRES onnxruntime-web >= 1.30. The 52 CAM layers in this graph each contain an
 * `AveragePool` with kernel_shape=[100], strides=[100], ceil_mode=1. When the time
 * dimension is shorter than 100 frames — which it always is for diarization windows —
 * onnxruntime-web 1.22 divided by the full kernel (100) instead of by the number of real
 * frames, scaling every CAM mask by 100/T. Because T varies with segment length, each
 * segment was distorted by a different factor and the embeddings became worthless:
 * same-speaker turns of different lengths landed further apart than different speakers of
 * similar length. Features and clustering were fine; only the runtime was wrong. The
 * version in package.json is pinned exactly for this reason — see tests/diarization.test.js.
 */

import * as ort from 'onnxruntime-web';
import { setupOrtWasmEnvironment } from './vad.js';
import { extractFbank } from './utils/fbank.js';
import { l2Normalize } from './utils/diarization.js';

export const DEFAULT_SPEAKER_MODEL_URL =
  'https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';

let cachedDiarizerSession = null;

/**
 * Validates that an ArrayBuffer or Uint8Array is a valid ONNX binary file,
 * not an HTML 404/fallback page or truncated text.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {boolean}
 */
export function isValidOnnxBuffer(buffer) {
  if (!buffer) return false;
  const len = buffer.byteLength || buffer.length || 0;
  if (len < 1000) return false;

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Check for '<' (0x3C) which indicates HTML (<!DOCTYPE html>, <html>, etc.)
  if (bytes[0] === 0x3c) return false;
  // Check for '{' (0x7B) which indicates JSON
  if (bytes[0] === 0x7b) return false;
  // Check for git-lfs pointer (starts with "version https://git-lfs")
  if (bytes[0] === 0x76 && bytes[1] === 0x65 && bytes[2] === 0x72 && bytes[3] === 0x73) return false;

  return true;
}

/**
 * Fetch speaker embedding model bytes with browser CacheStorage support.
 * 
 * @param {string} [customUrl]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchSpeakerModel(customUrl = null) {
  const isWeb = typeof location !== 'undefined' && location.origin;
  const localUrl = isWeb ? `${location.origin}/spkrec_ecapa.onnx` : null;
  const remoteUrl = customUrl || DEFAULT_SPEAKER_MODEL_URL;
  const oldCacheName = 'speaker-diarizer-cache-v1';
  const cacheName = 'speaker-diarizer-cache-v2';

  // 0. Purge any corrupted cache from earlier version
  try {
    if (typeof caches !== 'undefined') {
      await caches.delete(oldCacheName);
    }
  } catch {}

  // 1. Try browser CacheStorage (v2)
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(cacheName);
      const cachedResponse =
        (localUrl && (await cache.match(localUrl))) ||
        (await cache.match(remoteUrl));
      if (cachedResponse) {
        const buf = await cachedResponse.arrayBuffer();
        if (isValidOnnxBuffer(buf)) {
          console.log('[Diarizer] Loaded valid speaker embedding model from browser CacheStorage');
          return buf;
        } else {
          console.warn('[Diarizer] Purging invalid cached model entry...');
          if (localUrl) await cache.delete(localUrl);
          await cache.delete(remoteUrl);
        }
      }
    }
  } catch (err) {
    console.warn('[Diarizer] CacheStorage access error:', err);
  }

  // 2. Try same-origin /spkrec_ecapa.onnx in browser/worker (e.g. from public/ folder)
  if (localUrl) {
    try {
      console.log(`[Diarizer] Checking for local same-origin model from ${localUrl}...`);
      const localResp = await fetch(localUrl);
      const ct = (localResp.headers.get('content-type') || '').toLowerCase();
      // Only accept if not an HTML fallback from Vite SPA!
      if (localResp.ok && !ct.includes('html')) {
        const buf = await localResp.arrayBuffer();
        if (isValidOnnxBuffer(buf)) {
          try {
            if (typeof caches !== 'undefined') {
              const cache = await caches.open(cacheName);
              await cache.put(localUrl, new Response(buf));
            }
          } catch {}
          console.log('[Diarizer] Successfully loaded local speaker model from public/spkrec_ecapa.onnx');
          return buf;
        }
      }
      console.log('[Diarizer] Local file is not a valid ONNX binary (likely SPA HTML fallback), falling back to remote URL...');
    } catch (err) {
      console.warn('[Diarizer] Local model fetch error, falling back to remote:', err);
    }
  }

  // 3. Fallback to remote URL
  console.log(`[Diarizer] Downloading speaker embedding model from ${remoteUrl}...`);
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch speaker embedding model: ${resp.status} ${resp.statusText}`);
  }
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('html')) {
    throw new Error('Remote model URL returned HTML instead of an ONNX binary.');
  }

  const buf = await resp.arrayBuffer();
  if (!isValidOnnxBuffer(buf)) {
    throw new Error(`Downloaded model buffer is not a valid ONNX binary (received ${buf.byteLength} bytes).`);
  }

  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(cacheName);
      await cache.put(remoteUrl, new Response(buf));
    }
  } catch {}

  console.log('[Diarizer] Successfully downloaded and cached speaker model');
  return buf;
}

/**
 * Initialize or get cached Speaker Diarizer ONNX InferenceSession.
 * 
 * @param {ArrayBuffer|Uint8Array|string|null} [modelData]
 * @returns {Promise<ort.InferenceSession>}
 */
export async function getDiarizerSession(modelData = null) {
  if (cachedDiarizerSession) {
    return cachedDiarizerSession;
  }

  await setupOrtWasmEnvironment();

  let bufferOrUrl = modelData;
  if (!bufferOrUrl) {
    bufferOrUrl = await fetchSpeakerModel();
  }

  const modelBytes =
    bufferOrUrl instanceof ArrayBuffer ? new Uint8Array(bufferOrUrl) : bufferOrUrl;

  if (!isValidOnnxBuffer(modelBytes)) {
    throw new Error(
      `Invalid ONNX model bytes provided to getDiarizerSession (length: ${modelBytes?.byteLength || 0}).`,
    );
  }

  const sessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  };

  cachedDiarizerSession = await ort.InferenceSession.create(modelBytes, sessionOptions);
  console.log(
    '[Diarizer] Speaker embedding ONNX session created successfully! Inputs:',
    cachedDiarizerSession.inputNames,
    'Outputs:',
    cachedDiarizerSession.outputNames,
  );
  return cachedDiarizerSession;
}

/**
 * Extracts a speaker embedding vector for an audio segment.
 * Automatically adapts between FBank-input models (e.g. CAM++ / ECAPA-TDNN) and raw waveform models.
 *
 * Returns `null` for empty input rather than a zero vector: embedding dimensionality is
 * model-dependent (CAM++ emits 512, ECAPA 192) and `cosineDistance` compares over the
 * shorter of two vectors, so a wrong-length placeholder would silently enter clustering
 * as a spurious point instead of failing. Callers must drop the corresponding window.
 *
 * @param {Float32Array} audioFloat32 16kHz mono audio samples
 * @param {ort.InferenceSession} session Active speaker ONNX session
 * @returns {Promise<Float32Array|null>} Unit L2-normalized speaker embedding vector, or null
 */
export async function extractSpeakerEmbedding(audioFloat32, session) {
  if (!audioFloat32 || audioFloat32.length === 0) {
    return null;
  }

  const inputNames = session.inputNames || ['x'];
  const firstInput = inputNames[0] || 'x';
  const feeds = {};
  let inputTensor = null;
  let wavLensTensor = null;

  try {
    // Check whether the model expects 80-channel FBank [1, frames, 80] or raw waveform [1, samples]
    const isWaveformInput =
      firstInput.toLowerCase().includes('wave') ||
      firstInput.toLowerCase().includes('audio') ||
      firstInput.toLowerCase().includes('speech');

    if (isWaveformInput) {
      inputTensor = new ort.Tensor('float32', audioFloat32, [1, audioFloat32.length]);
      feeds[firstInput] = inputTensor;
    } else {
      // Standard 80-dim log-mel FBANK features
      const fbank = extractFbank(audioFloat32, {
        sampleRate: 16000,
        frameLengthMs: 25,
        frameShiftMs: 10,
        numFilters: 80,
      });

      // Ensure at least 5 frames
      let frames = fbank.numFrames;
      let featsData = fbank.features;
      if (frames < 5) {
        const padded = new Float32Array(5 * 80);
        padded.set(featsData);
        featsData = padded;
        frames = 5;
      }

      inputTensor = new ort.Tensor('float32', featsData, [1, frames, 80]);
      feeds[firstInput] = inputTensor;

      if (inputNames.includes('wav_lens')) {
        wavLensTensor = new ort.Tensor('float32', new Float32Array([1.0]), [1]);
        feeds['wav_lens'] = wavLensTensor;
      }
    }

    const results = await session.run(feeds);
    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];

    if (!outputTensor || !outputTensor.data) {
      throw new Error(`Model did not produce valid output for tensor "${outputName}".`);
    }

    const rawEmbedding = new Float32Array(outputTensor.data);

    // Dispose WASM tensors immediately to reclaim memory
    if (outputTensor && typeof outputTensor.dispose === 'function') {
      try {
        outputTensor.dispose();
      } catch {}
    }

    return l2Normalize(rawEmbedding);
  } finally {
    if (inputTensor && typeof inputTensor.dispose === 'function') {
      try {
        inputTensor.dispose();
      } catch {}
    }
    if (wavLensTensor && typeof wavLensTensor.dispose === 'function') {
      try {
        wavLensTensor.dispose();
      } catch {}
    }
  }
}
