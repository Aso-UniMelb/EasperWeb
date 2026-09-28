/**
 * Fast RIFF/WAVE header parser. Reads only the first 4096 bytes of a File/Blob
 * to instantaneously extract duration, sample rate, channels, and bit depth
 * without decoding audio or allocating large buffers into memory.
 *
 * @param {Blob|File} fileOrBlob
 * @returns {Promise<{ duration: number, sampleRate: number, channels: number, bitsPerSample: number } | null>}
 */
export async function parseWavInfo(fileOrBlob) {
  if (!fileOrBlob || typeof fileOrBlob.slice !== 'function') return null;

  try {
    // Read only the first 4KB to parse RIFF chunks
    const headerChunk = await fileOrBlob.slice(0, 4096).arrayBuffer();
    if (headerChunk.byteLength < 44) return null;

    const view = new DataView(headerChunk);

    // Verify "RIFF"
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF') return null;

    // Verify "WAVE"
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (wave !== 'WAVE') return null;

    let offset = 12;
    let audioFormat = 1;
    let sampleRate = 0;
    let channels = 1;
    let byteRate = 0;
    let bitsPerSample = 16;
    let dataSize = 0;
    let dataOffset = 0;

    while (offset + 8 <= headerChunk.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'fmt ' && offset + 8 + 16 <= headerChunk.byteLength) {
        audioFormat = view.getUint16(offset + 8, true);
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        byteRate = view.getUint32(offset + 16, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
        dataOffset = offset + 8;
        break;
      }

      offset += 8 + chunkSize;
      // RIFF chunks are padded to even boundaries
      if (chunkSize % 2 !== 0) offset += 1;
    }

    if (byteRate > 0) {
      if (dataSize <= 0 && fileOrBlob.size > dataOffset) {
        dataSize = fileOrBlob.size - dataOffset;
      }
      if (dataSize > 0) {
        const duration = Number((dataSize / byteRate).toFixed(2));
        return { duration, audioFormat, sampleRate, channels, bitsPerSample, dataOffset, dataSize };
      }
    }
  } catch (err) {
    console.warn('[Audio] Fast WAV header parsing failed:', err);
  }
  return null;
}

/**
 * High-performance pure JavaScript linear audio resampler.
 * Resamples a mono Float32Array from sourceRate to targetRate (default: 16000 Hz)
 * in milliseconds with zero Web Audio / OfflineAudioContext overhead.
 *
 * @param {Float32Array} sourceData
 * @param {number} sourceRate
 * @param {number} [targetRate=16000]
 * @returns {Float32Array}
 */
export function resampleFloat32Array(sourceData, sourceRate, targetRate = 16000) {
  if (sourceRate === targetRate) {
    return new Float32Array(sourceData);
  }
  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.round(sourceData.length / ratio));
  const output = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const s0 = sourceData[srcIdx] || 0;
    const s1 = srcIdx + 1 < sourceData.length ? sourceData[srcIdx + 1] : s0;
    output[i] = s0 + frac * (s1 - s0);
  }
  return output;
}

/**
 * Decodes an audio file or Blob, extracts mono audio, and resamples to 16000 Hz.
 * Uses instant direct PCM reading for standard 16-bit WAV files (any sample rate/channels),
 * completely bypassing Web Audio decodeAudioData and OfflineAudioContext memory allocation.
 *
 * @param {Blob|File} fileOrBlob - The audio file or Blob to process
 * @returns {Promise<{ audioData: Float32Array, duration: number }>}
 */
export async function processAudioFile(fileOrBlob) {
  if (!fileOrBlob) {
    throw new Error('No audio file or blob provided');
  }

  // 1. Direct PCM Fast-Path for standard 16-bit PCM WAV (any sample rate, mono or stereo)
  const wavInfo = await parseWavInfo(fileOrBlob);
  if (
    wavInfo &&
    wavInfo.audioFormat === 1 &&
    wavInfo.bitsPerSample === 16 &&
    wavInfo.dataOffset > 0 &&
    wavInfo.dataSize > 0 &&
    wavInfo.sampleRate > 0 &&
    (wavInfo.channels === 1 || wavInfo.channels === 2)
  ) {
    try {
      console.log(`[Audio] Fast direct PCM processing for ${wavInfo.sampleRate}Hz ${wavInfo.channels}ch WAV (${wavInfo.duration}s)...`);
      const pcmBytes = await fileOrBlob.slice(wavInfo.dataOffset, wavInfo.dataOffset + wavInfo.dataSize).arrayBuffer();
      const int16View = new Int16Array(pcmBytes);
      const channels = wavInfo.channels;
      const numFrames = Math.floor(int16View.length / channels);

      const targetSampleRate = 16000;
      if (wavInfo.sampleRate === targetSampleRate) {
        const audioData = new Float32Array(numFrames);
        for (let i = 0; i < numFrames; i++) {
          audioData[i] = int16View[i * channels] / 32768.0;
        }
        return { audioData, duration: wavInfo.duration };
      }

      // Resample directly from int16 PCM to 16kHz Float32Array
      const ratio = wavInfo.sampleRate / targetSampleRate;
      const targetLength = Math.max(1, Math.round(numFrames / ratio));
      const audioData = new Float32Array(targetLength);

      for (let i = 0; i < targetLength; i++) {
        const srcPos = i * ratio;
        const srcIdx = Math.floor(srcPos);
        const frac = srcPos - srcIdx;
        const s0 = int16View[srcIdx * channels] / 32768.0;
        const s1 = (srcIdx + 1 < numFrames) ? (int16View[(srcIdx + 1) * channels] / 32768.0) : s0;
        audioData[i] = s0 + frac * (s1 - s0);
      }

      return {
        audioData,
        duration: wavInfo.duration,
      };
    } catch (pcmErr) {
      console.warn('[Audio] Direct PCM fast-path failed, falling back to Web Audio:', pcmErr);
    }
  }

  // 2. Fallback for non-standard / compressed audio formats
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API (AudioContext) is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();
  let decodedBuffer;
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // Cleanup
    }
  }

  const originalDuration = decodedBuffer.duration;
  const channel0Data = decodedBuffer.getChannelData(0);
  const audioData = resampleFloat32Array(channel0Data, decodedBuffer.sampleRate, 16000);

  return {
    audioData,
    duration: originalDuration,
  };
}

/**
 * Encodes a Float32Array (16kHz mono) into a standard 16-bit PCM RIFF/WAVE Blob.
 *
 * @param {Float32Array} samples - Audio samples in range [-1.0, 1.0]
 * @param {number} sampleRate - Sample rate in Hz (default: 16000)
 * @returns {Blob} Standard audio/wav Blob
 */
export function encodeWavBlob(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (convert float [-1, 1] to 16-bit signed integer)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Downsamples audio samples into peak amplitude buckets for waveform visualization.
 *
 * @param {Float32Array} samples - Audio samples in range [-1.0, 1.0]
 * @param {number|null} numBuckets - Number of vertical slices (if null/omitted, adaptively calculated at 50 peaks/s, min 800, max 200,000)
 * @returns {{ peaks: Float32Array, minVals: Float32Array, maxVals: Float32Array }}
 */
export function extractWaveformPeaks(samples, numBuckets = null) {
  if (!samples || samples.length === 0) {
    return {
      peaks: new Float32Array(0),
      minVals: new Float32Array(0),
      maxVals: new Float32Array(0),
    };
  }

  const durationSec = samples.length / 16000;
  const targetBuckets =
    numBuckets !== null && Number.isFinite(numBuckets)
      ? Math.max(100, Math.min(200000, Math.round(numBuckets)))
      : Math.max(800, Math.min(200000, Math.round(durationSec * 50)));

  const buckets = Math.min(targetBuckets, samples.length);
  const peaks = new Float32Array(buckets);
  const minVals = new Float32Array(buckets);
  const maxVals = new Float32Array(buckets);
  const bucketSize = samples.length / buckets;

  let globalMax = 0.001;

  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(samples.length, Math.floor((i + 1) * bucketSize));
    let min = 1.0;
    let max = -1.0;
    let sumSq = 0;
    let count = 0;

    for (let j = start; j < end; j++) {
      const val = samples[j];
      if (val < min) min = val;
      if (val > max) max = val;
      sumSq += val * val;
      count++;
    }

    if (count === 0) {
      min = 0;
      max = 0;
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    const peak = Math.max(Math.abs(min), Math.abs(max), rms * 1.4);
    peaks[i] = peak;
    minVals[i] = min;
    maxVals[i] = max;

    if (peak > globalMax) {
      globalMax = peak;
    }
  }

  // Normalize so highest peak approaches ~0.95
  const normScale = 0.95 / globalMax;
  for (let i = 0; i < buckets; i++) {
    peaks[i] = Math.min(1.0, peaks[i] * normScale);
  }

  return { peaks, minVals, maxVals };
}
