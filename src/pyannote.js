/**
 * PyAnnote Speaker Segmentation & Diarization Engine for Browser (Transformers.js v3)
 *
 * Implements the hybrid PyAnnote architecture:
 * 1. PyAnnote Segmentation 3.0 (SincNet + BiLSTM, ~5.8 MB):
 *    Provides frame-level turn-taking detection (17ms resolution), cross-talk / overlap
 *    detection, and intra-segment turn splitting.
 * 2. CAM++ 512-d Embedding Extractor (Duration-Normalized):
 *    Provides persistent global speaker identity across arbitrary recording lengths
 *    without channel-drift across window boundaries.
 * 3. Agglomerative Hierarchical Clustering (AHC):
 *    Clusters all speech turns into globally consistent speaker identities.
 */

import { AutoProcessor, AutoModelForAudioFrameClassification } from '@huggingface/transformers';
import { getDiarizerSession, extractSpeakerEmbedding } from './diarizer.js';
import { diarizeUtterances, calculateAudioRms } from './utils/diarization.js';

export const PYANNOTE_MODEL_ID = 'onnx-community/pyannote-segmentation-3.0';

let cachedPyannoteModel = null;
let cachedPyannoteProcessor = null;

/**
 * Loads and caches the PyAnnote model and processor.
 * @param {Function} [onProgress] Progress reporting callback
 * @returns {Promise<{ model: Object, processor: Object }>}
 */
export async function getPyannoteEngine(onProgress = null) {
  if (cachedPyannoteModel && cachedPyannoteProcessor) {
    return { model: cachedPyannoteModel, processor: cachedPyannoteProcessor };
  }

  const model = await AutoModelForAudioFrameClassification.from_pretrained(PYANNOTE_MODEL_ID, {
    progress_callback: (progressInfo) => {
      if (typeof onProgress === 'function' && progressInfo) {
        onProgress(progressInfo);
      }
    },
  });

  const processor = await AutoProcessor.from_pretrained(PYANNOTE_MODEL_ID);

  cachedPyannoteModel = model;
  cachedPyannoteProcessor = processor;

  return { model, processor };
}

/**
 * Inspects an audio slice with PyAnnote to detect whether it contains an intra-segment speaker switch.
 * Returns { hasTurn: boolean, splitSec: number, overlapRatio: number, domA: number, domB: number }
 *
 * @param {Float32Array} chunkAudio 16kHz audio samples
 * @param {Object} engine PyAnnote model and processor
 * @param {Object} [options]
 * @param {number} [options.speechThreshold=0.50]
 * @param {number} [options.minTurnDuration=1.0]
 * @returns {Promise<Object>}
 */
export async function detectSpeakerTurnInAudio(chunkAudio, engine, options = {}) {
  const {
    speechThreshold = 0.50,
    overlapThreshold = 0.35,
    minTurnDuration = 1.0,
    minOverlapDuration = 0.35,
  } = options;

  if (!chunkAudio || chunkAudio.length < 16000 * 0.4) {
    return { hasTurn: false, splitSec: -1, overlapRatio: 0, overlaps: [] };
  }

  const { model, processor } = engine;
  const inputs = await processor(chunkAudio);
  const { logits } = await model(inputs);
  const numFrames = logits.dims[1];
  const durSec = chunkAudio.length / 16000;
  const frameDur = durSec / numFrames;

  // PyAnnote 3.0 outputs 7 power-set log-probabilities per frame:
  // 0: NONE, 1: S1, 2: S2, 3: S3, 4: S1+S2, 5: S1+S3, 6: S2+S3
  const t0 = new Float32Array(numFrames);
  const t1 = new Float32Array(numFrames);
  const t2 = new Float32Array(numFrames);
  const pOv = new Float32Array(numFrames);
  let overlapFrames = 0;
  let speechFrames = 0;

  let sum0 = 0, sum1 = 0, sum2 = 0;
  for (let f = 0; f < numFrames; f++) {
    const off = f * 7;
    const p1 = Math.exp(logits.data[off + 1]);
    const p2 = Math.exp(logits.data[off + 2]);
    const p3 = Math.exp(logits.data[off + 3]);
    const p12 = Math.exp(logits.data[off + 4]);
    const p13 = Math.exp(logits.data[off + 5]);
    const p23 = Math.exp(logits.data[off + 6]);

    t0[f] = p1 + p12 + p13;
    t1[f] = p2 + p12 + p23;
    t2[f] = p3 + p13 + p23;
    pOv[f] = p12 + p13 + p23;

    sum0 += t0[f];
    sum1 += t1[f];
    sum2 += t2[f];

    if (pOv[f] > overlapThreshold) overlapFrames++;
    if (t0[f] > speechThreshold || t1[f] > speechThreshold || t2[f] > speechThreshold) {
      speechFrames++;
    }
  }

  const primaryChannel = (sum0 >= sum1 && sum0 >= sum2) ? 0 : (sum1 >= sum2 ? 1 : 2);

  // Detect overlapping speech intervals (where overlap prob is elevated or secondary channel is active)
  const isOverlapFrame = new Uint8Array(numFrames);
  const secChanPerFrame = new Int8Array(numFrames).fill(-1);

  for (let f = 0; f < numFrames; f++) {
    let maxSecVal = 0;
    let secChan = -1;
    for (let c = 0; c < 3; c++) {
      if (c === primaryChannel) continue;
      const val = c === 0 ? t0[f] : c === 1 ? t1[f] : t2[f];
      if (val > maxSecVal) {
        maxSecVal = val;
        secChan = c;
      }
    }
    const primVal = primaryChannel === 0 ? t0[f] : primaryChannel === 1 ? t1[f] : t2[f];

    if (pOv[f] >= overlapThreshold || (maxSecVal >= speechThreshold && primVal >= speechThreshold * 0.6)) {
      isOverlapFrame[f] = 1;
      secChanPerFrame[f] = secChan;
    }
  }

  const overlaps = [];
  let inOverlap = false;
  let ovStart = 0;
  let ovChan = -1;
  const minOvFrames = Math.max(6, Math.floor(minOverlapDuration / frameDur));

  for (let f = 0; f < numFrames; f++) {
    if (isOverlapFrame[f]) {
      if (!inOverlap) {
        inOverlap = true;
        ovStart = f;
        ovChan = secChanPerFrame[f];
      }
    } else {
      if (inOverlap) {
        if (f - ovStart >= minOvFrames) {
          overlaps.push({
            startSec: Number((ovStart * frameDur).toFixed(2)),
            endSec: Number((f * frameDur).toFixed(2)),
            secondaryChannel: ovChan,
          });
        }
        inOverlap = false;
      }
    }
  }
  if (inOverlap && numFrames - ovStart >= minOvFrames) {
    overlaps.push({
      startSec: Number((ovStart * frameDur).toFixed(2)),
      endSec: Number((numFrames * frameDur).toFixed(2)),
      secondaryChannel: ovChan,
    });
  }

  // Next, detect intra-segment sequential turns
  const minFrames = Math.floor(minTurnDuration / frameDur);
  if (numFrames < minFrames * 2) {
    return { hasTurn: false, splitSec: -1, overlapRatio: overlapFrames / numFrames, overlaps };
  }

  let bestSplitFrame = -1;
  let maxScoreDiff = 0.0;
  let domA = -1;
  let domB = -1;

  for (let s = minFrames; s < numFrames - minFrames; s += 4) {
    let s0A = 0, s1A = 0, s2A = 0;
    for (let f = 0; f < s; f++) { s0A += t0[f]; s1A += t1[f]; s2A += t2[f]; }
    let s0B = 0, s1B = 0, s2B = 0;
    for (let f = s; f < numFrames; f++) { s0B += t0[f]; s1B += t1[f]; s2B += t2[f]; }

    const avg0A = s0A / s, avg1A = s1A / s, avg2A = s2A / s;
    const lenB = numFrames - s;
    const avg0B = s0B / lenB, avg1B = s1B / lenB, avg2B = s2B / lenB;

    const maxA = Math.max(avg0A, avg1A, avg2A);
    const chA = maxA === avg0A ? 0 : maxA === avg1A ? 1 : 2;

    const maxB = Math.max(avg0B, avg1B, avg2B);
    const chB = maxB === avg0B ? 0 : maxB === avg1B ? 1 : 2;

    if (chA !== chB && maxA > speechThreshold && maxB > speechThreshold) {
      const diff = maxA + maxB;
      if (diff > maxScoreDiff) {
        maxScoreDiff = diff;
        bestSplitFrame = s;
        domA = chA;
        domB = chB;
      }
    }
  }

  const hasTurn = bestSplitFrame > 0 && maxScoreDiff > 0.8;
  return {
    hasTurn,
    splitSec: hasTurn ? Number((bestSplitFrame * frameDur).toFixed(2)) : -1,
    overlapRatio: overlapFrames / numFrames,
    domA,
    domB,
    overlaps,
  };
}

/**
 * Diarizes segments using the hybrid PyAnnote + CAM++ architecture.
 *
 * 1. PyAnnote detects acoustic turn boundaries inside existing segments and flags overlaps.
 * 2. Overlapping speech produces concurrent segments assigned to separate speaker pillars.
 * 3. CAM++ extracts duration-normalized (>= 2.5s) 512-d embeddings for each speech turn.
 * 4. Global AHC clustering groups turns into consistent speaker identities across the whole file.
 *
 * @param {Array<Object>} segments Input speech segments
 * @param {Float32Array} float32Audio 16kHz mono audio
 * @param {Object} [options]
 * @param {number|'auto'} [options.speakerCount=2] Target speaker count (1..5 or 'auto')
 * @param {number} [options.threshold=0.10] Clustering distance threshold
 * @param {number} [options.speechThreshold=0.50] PyAnnote frame speech threshold
 * @param {number} [options.overlapThreshold=0.35] PyAnnote overlap detection threshold
 * @param {Array<Object>} [options.projectSpeakers=[]] Configured project speakers
 * @param {Object} [options.diarizerSession=null] Optional active CAM++ ONNX session
 * @param {Function} [onProgress] Progress reporting callback
 * @returns {Promise<Array<Object>>} Diarized segments with speakerId and speaker name
 */
export async function diarizeSegmentsWithPyannote(
  segments,
  float32Audio,
  options = {},
  onProgress = null,
) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  if (!float32Audio || float32Audio.length === 0) return segments;

  const {
    speakerCount = 2,
    threshold = 0.10,
    speechThreshold = 0.50,
    overlapThreshold = 0.35,
    projectSpeakers = [],
    diarizerSession = null,
  } = options;

  const sampleRate = 16000;
  const totalSamples = float32Audio.length;

  const engine = await getPyannoteEngine((prog) => {
    if (typeof onProgress === 'function' && prog.status === 'progress') {
      onProgress({
        progress: Math.round(prog.progress || 0),
        message: `Loading PyAnnote (${Math.round(prog.progress || 0)}%)...`,
      });
    }
  });

  // Step 1: Acoustic turn and overlap refinement with PyAnnote
  const refinedSegments = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segStart = Math.max(0, seg.start ?? 0);
    const segEnd = Math.max(segStart + 0.1, seg.end ?? (segStart + 1));
    const duration = segEnd - segStart;

    let splitResult = null;
    if (duration >= 0.8) {
      const startSamp = Math.max(0, Math.min(totalSamples - 1, Math.floor(segStart * sampleRate)));
      const endSamp = Math.min(totalSamples, Math.ceil(segEnd * sampleRate));
      const segAudio = float32Audio.slice(startSamp, endSamp);
      if (segAudio.length >= 16000 * 0.4) {
        splitResult = await detectSpeakerTurnInAudio(segAudio, engine, {
          speechThreshold,
          overlapThreshold,
        });
      }
    }

    if (splitResult && splitResult.hasTurn && splitResult.splitSec > 0.5 && splitResult.splitSec < duration - 0.5) {
      const splitTime = Number((segStart + splitResult.splitSec).toFixed(2));
      const origText = String(seg.text || '').trim();
      const words = origText ? origText.split(/\s+/) : [];
      const midWord = Math.max(1, Math.round((splitResult.splitSec / duration) * words.length));

      refinedSegments.push({
        ...seg,
        id: seg.id,
        start: segStart,
        end: splitTime,
        duration: Number((splitTime - segStart).toFixed(2)),
        text: words.slice(0, midWord).join(' '),
      });

      refinedSegments.push({
        ...seg,
        id: `${seg.id}-2`,
        start: splitTime,
        end: segEnd,
        duration: Number((segEnd - splitTime).toFixed(2)),
        text: words.slice(midWord).join(' '),
      });
    } else {
      refinedSegments.push({
        ...seg,
        id: seg.id,
        start: segStart,
        end: segEnd,
        duration: Number(duration.toFixed(2)),
      });
    }

    // Emit concurrent overlapping segments detected by PyAnnote
    if (splitResult && splitResult.overlaps && splitResult.overlaps.length > 0) {
      for (let oIdx = 0; oIdx < splitResult.overlaps.length; oIdx++) {
        const ov = splitResult.overlaps[oIdx];
        const ovStart = Number((segStart + ov.startSec).toFixed(2));
        const ovEnd = Number((segStart + ov.endSec).toFixed(2));
        const ovDur = Number((ovEnd - ovStart).toFixed(2));
        if (ovDur >= 0.35 && ovEnd <= segEnd + 0.1) {
          refinedSegments.push({
            ...seg,
            id: `${seg.id}-ov${oIdx + 1}`,
            start: ovStart,
            end: ovEnd,
            duration: ovDur,
            text: '',
            isOverlap: true,
            primarySegId: seg.id,
          });
        }
      }
    }

    if (typeof onProgress === 'function' && (i % 5 === 0 || i === segments.length - 1)) {
      const pct = Math.round(((i + 1) / segments.length) * 40);
      onProgress({
        progress: pct,
        message: `Detecting acoustic turns & overlaps with PyAnnote (${pct}%)...`,
      });
    }
  }

  // Step 2: Extract global embeddings using CAM++ session
  let session = diarizerSession;
  if (!session) {
    try {
      session = await getDiarizerSession();
    } catch (e) {
      console.warn('[PyAnnote] CAM++ session unavailable, falling back to local track assignment:', e);
    }
  }

  const spkMap = new Map();
  if (Array.isArray(projectSpeakers)) {
    for (const spk of projectSpeakers) {
      if (spk && spk.id != null) spkMap.set(Number(spk.id), spk);
    }
  }

  const spkCountNum = Math.max(2, Math.min(5, Number(speakerCount) || 2));

  if (session) {
    const embeddings = [];
    const validChunks = [];

    for (let i = 0; i < refinedSegments.length; i++) {
      const seg = refinedSegments[i];
      const startSamp = Math.max(0, Math.min(totalSamples - 1, Math.floor(seg.start * sampleRate)));
      const endSamp = Math.min(totalSamples, Math.ceil(seg.end * sampleRate));
      const chunkAudio = float32Audio.slice(startSamp, Math.max(startSamp + 1600, endSamp));

      const rms = calculateAudioRms(chunkAudio);
      let emb = null;
      if (rms >= 0.0005 && chunkAudio.length >= 800) {
        emb = await extractSpeakerEmbedding(chunkAudio, session);
      }
      if (!emb && chunkAudio.length >= 1600) {
        emb = await extractSpeakerEmbedding(chunkAudio, session);
      }

      if (emb) {
        embeddings.push(emb);
        validChunks.push({
          start: seg.start,
          end: seg.end,
          duration: seg.end - seg.start,
          segIdx: i,
          isSubChunk: false,
        });
      }

      if (typeof onProgress === 'function' && (i % 4 === 0 || i === refinedSegments.length - 1)) {
        const pct = 40 + Math.round(((i + 1) / refinedSegments.length) * 55);
        onProgress({
          progress: pct,
          message: `Clustering global speaker embeddings (${pct}%)...`,
        });
      }
    }

    if (embeddings.length > 0) {
      const diarized = diarizeUtterances({
        chunks: validChunks,
        chunkEmbeddings: embeddings,
        originalSegments: refinedSegments,
        speakerCount,
        threshold,
        projectSpeakers,
        distanceSpace: 'cosine',
      });

      // Ensure overlapping segments never share the same speaker as the segment they overlap with
      const segMap = new Map();
      for (const s of diarized) {
        segMap.set(s.id, s);
      }

      for (const s of diarized) {
        if (s.isOverlap && s.primarySegId) {
          const primary = segMap.get(s.primarySegId);
          if (primary && primary.speakerId === s.speakerId) {
            const altId = (primary.speakerId % spkCountNum) + 1;
            s.speakerId = altId;
            const matched = spkMap.get(altId);
            s.speaker = matched?.name || `Speaker ${altId}`;
          }
        }
      }

      return diarized;
    }
  }

  // Fallback if no embedding session available
  return refinedSegments.map((seg, idx) => {
    let speakerId = (idx % spkCountNum) + 1;
    if (seg.isOverlap && seg.primarySegId) {
      // Offset overlap speaker
      speakerId = ((idx + 1) % spkCountNum) + 1;
    }
    const matched = spkMap.get(speakerId);
    return {
      ...seg,
      speakerId,
      speaker: matched?.name || `Speaker ${speakerId}`,
    };
  });
}
