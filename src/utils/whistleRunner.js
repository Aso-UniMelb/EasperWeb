import { createWhistle } from 'cactus-needle/browser';

let activeWhistleInstance = null;
let activeWhistleKey = null;
let cachedLoadTime = null;

export function getWhistleAssetUrls() {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;

  let origin = 'http://localhost';
  if (typeof self !== 'undefined' && self.location?.origin) {
    origin = self.location.origin;
  } else if (typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  }

  const baseHref = new URL(cleanBase, origin).href;
  const workerUrl = new URL('cactus-needle/worker.js', baseHref).href;
  const wasmUrl = new URL('cactus-needle/needle.wasm', baseHref).href;

  return { workerUrl, wasmUrl };
}

export function isWhistleModel({ architecture, modelId, files } = {}) {
  if (architecture === 'whistle') return true;
  if (typeof modelId === 'string') {
    const lower = modelId.toLowerCase();
    if (lower.includes('whistle') || lower.endsWith('.cact')) return true;
  }
  if (Array.isArray(files)) {
    if (
      files.some((f) =>
        (f.path || f.file?.name || '').toLowerCase().endsWith('.cact'),
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function getWhistleInstance({
  modelSource,
  modelId,
  folderName,
  files,
  onProgress,
  signal,
}) {
  const isFolder = modelSource === 'folder';
  let modelParam;
  let cacheKey;

  if (isFolder) {
    const cactEntry = (files || []).find((f) =>
      (f.path || f.file?.name || '').toLowerCase().endsWith('.cact'),
    );
    if (!cactEntry || !cactEntry.file) {
      throw new Error('No .cact model file found in the selected folder.');
    }
    const buffer = await cactEntry.file.arrayBuffer();
    modelParam = buffer;
    cacheKey = `folder:${folderName || cactEntry.path}:${buffer.byteLength}`;
  } else {
    const id = modelId?.trim() || 'Cactus-Compute/whistle';
    cacheKey = `hub:${id}`;
    if (id === 'Cactus-Compute/whistle') {
      // Pinned default speech model URL handled internally by cactus-needle
      modelParam = undefined;
    } else if (id.startsWith('http://') || id.startsWith('https://')) {
      modelParam = id;
    } else {
      modelParam = `https://huggingface.co/${id}/resolve/main/whistle.cact`;
    }
  }

  if (activeWhistleInstance && activeWhistleKey === cacheKey) {
    return {
      whistle: activeWhistleInstance,
      loadTime: cachedLoadTime || 0,
      activeDevice: 'wasm',
    };
  }

  if (activeWhistleInstance) {
    try {
      await activeWhistleInstance.close();
    } catch (e) {
      console.warn('[WhistleRunner] Error closing previous instance:', e);
    }
    activeWhistleInstance = null;
    activeWhistleKey = null;
  }

  const loadStartTime = performance.now();
  const { workerUrl, wasmUrl } = getWhistleAssetUrls();

  console.log('[WhistleRunner] Initializing Whistle with assets:', {
    workerUrl,
    wasmUrl,
  });

  const whistle = await createWhistle({
    model: modelParam,
    workerUrl,
    wasmUrl,
    cache: true,
    abortSignal: signal,
    onDownloadProgress: (prog) => {
      if (typeof onProgress === 'function') {
        const pct =
          prog.percentage ??
          (prog.total ? Math.round((prog.loaded / prog.total) * 100) : 0);
        onProgress({
          status: 'progress',
          progress: pct,
          loaded: prog.loaded,
          total: prog.total || 16919407,
        });
      }
    },
  });

  cachedLoadTime = (performance.now() - loadStartTime) / 1000;
  activeWhistleInstance = whistle;
  activeWhistleKey = cacheKey;

  return {
    whistle,
    loadTime: cachedLoadTime,
    activeDevice: 'wasm',
  };
}

/**
 * Transcribes audio via Whistle.
 * Audio is clamped/chunked to <= 30s per pass as required by Whistle WASM.
 * Returns { text, language, words: [{ word, start, end, probability }], chunks: [{ text, timestamp: [start, end] }] }
 */
export async function transcribeWhistleSlice(whistle, audioData, options = {}) {
  const { language, wordTimestamps = true, signal } = options;
  const lang =
    language && language !== 'auto' && language.trim()
      ? language.trim().toLowerCase()
      : undefined;

  const float32Audio =
    audioData instanceof Float32Array ? audioData : new Float32Array(audioData);

  // Whistle supports at most 30s audio (480,000 samples @ 16kHz)
  const MAX_SAMPLES = 16000 * 30;
  if (float32Audio.length <= MAX_SAMPLES) {
    const result = await whistle.transcribe(float32Audio, {
      language: lang,
      wordTimestamps,
      abortSignal: signal,
    });

    const rawWords = result.words || [];
    const chunks =
      rawWords.length > 0
        ? rawWords.map((w) => ({
            text: w.word,
            timestamp: [Number(w.start.toFixed(2)), Number(w.end.toFixed(2))],
          }))
        : [
            {
              text: result.text || '',
              timestamp: [0, Number((float32Audio.length / 16000).toFixed(2))],
            },
          ];

    return {
      text: result.text || '',
      language: result.language || '',
      words: rawWords,
      chunks,
    };
  }

  // Audio longer than 30s: chunk in 25-second slices (400,000 samples)
  const CHUNK_SAMPLES = 16000 * 25;
  let fullText = '';
  const allWords = [];
  const allChunks = [];
  let detectedLang = lang || '';

  for (let offset = 0; offset < float32Audio.length; offset += CHUNK_SAMPLES) {
    if (signal?.aborted) throw signal.reason;

    const slice = float32Audio.subarray(
      offset,
      Math.min(float32Audio.length, offset + CHUNK_SAMPLES),
    );
    const offsetSec = offset / 16000;

    const res = await whistle.transcribe(slice, {
      language: lang,
      wordTimestamps,
      abortSignal: signal,
    });

    if (res.text) {
      fullText = fullText ? `${fullText} ${res.text.trim()}` : res.text.trim();
    }
    if (res.language) detectedLang = res.language;

    if (Array.isArray(res.words) && res.words.length > 0) {
      for (const w of res.words) {
        const globalStart = Number((w.start + offsetSec).toFixed(2));
        const globalEnd = Number((w.end + offsetSec).toFixed(2));
        allWords.push({
          word: w.word,
          start: globalStart,
          end: globalEnd,
          probability: w.probability,
        });
        allChunks.push({
          text: w.word,
          timestamp: [globalStart, globalEnd],
        });
      }
    } else if (res.text) {
      const sliceDuration = slice.length / 16000;
      allChunks.push({
        text: res.text,
        timestamp: [
          Number(offsetSec.toFixed(2)),
          Number((offsetSec + sliceDuration).toFixed(2)),
        ],
      });
    }
  }

  return {
    text: fullText,
    language: detectedLang,
    words: allWords,
    chunks: allChunks,
  };
}

export async function disposeWhistle() {
  if (activeWhistleInstance) {
    try {
      await activeWhistleInstance.close();
    } catch (e) {
      console.warn('[WhistleRunner] Error disposing instance:', e);
    }
    activeWhistleInstance = null;
    activeWhistleKey = null;
    cachedLoadTime = null;
  }
}
