/**
 * Speaker Diarization Clustering & Post-Processing Engine
 * Implements Agglomerative Hierarchical Clustering (AHC) with average linkage
 * on speaker embedding vectors (e.g. 192-d ECAPA-TDNN).
 */

/**
 * Normalizes a vector in-place to unit L2 norm.
 * @param {Float32Array|Array<number>} vec
 * @returns {Float32Array}
 */
export function l2Normalize(vec) {
  let sumSq = 0.0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1e-12;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / norm;
  }
  return out;
}

/**
 * Computes cosine distance between two L2-normalized vectors.
 * Returns value in [0, 2] where 0 is identical, 1 is orthogonal, 2 is opposite.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
export function cosineDistance(a, b) {
  let dot = 0.0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  // Clamp dot product to [-1, 1] for numerical stability
  dot = Math.max(-1.0, Math.min(1.0, dot));
  return 1.0 - dot;
}

/**
 * Above this many points, the affinity-space representation is skipped: it needs two
 * NxN Float32 matrices and O(N^3) work to build, so a 30-minute file at a 0.5 s hop
 * would cost ~100 MB and tens of seconds. Past the cap we cluster raw cosine instead.
 */
const MAX_AFFINITY_POINTS = 3000;

/**
 * Builds the pairwise base-distance matrix used by the merge loop.
 *
 * With `distanceSpace: 'affinity'` this reproduces what the Python pipeline actually
 * does. That code reads:
 *
 *   S = pairwise_distances(embeds, metric="cosine")
 *   AgglomerativeClustering(n_clusters=k, linkage="average").fit_predict(S)
 *
 * `S` is handed to sklearn as a *feature matrix*, not as `metric="precomputed"`, so
 * each point is represented by its vector of cosine distances to every other point and
 * linkage runs on Euclidean distances between those rows. Clustering in that affinity
 * space is markedly more robust to outlier windows than raw pairwise cosine, which is
 * a large part of why the Python results look cleaner. We keep the behaviour on purpose.
 *
 * @param {Array<Float32Array>} normEmbeddings L2-normalized embeddings
 * @param {'affinity'|'cosine'} distanceSpace
 * @returns {Float32Array} Flat NxN symmetric distance matrix
 */
function buildBaseDistances(normEmbeddings, distanceSpace) {
  const n = normEmbeddings.length;
  const cosine = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const d = cosineDistance(normEmbeddings[i], normEmbeddings[j]);
      cosine[i * n + j] = d;
      cosine[j * n + i] = d;
    }
  }

  if (distanceSpace !== 'affinity') return cosine;

  // Euclidean distance between rows of the cosine-distance matrix
  const affinity = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const rowI = i * n;
    for (let j = 0; j < i; j++) {
      const rowJ = j * n;
      let sumSq = 0.0;
      for (let k = 0; k < n; k++) {
        const diff = cosine[rowI + k] - cosine[rowJ + k];
        sumSq += diff * diff;
      }
      const d = Math.sqrt(sumSq);
      affinity[rowI + j] = d;
      affinity[rowJ + i] = d;
    }
  }
  return affinity;
}

/**
 * Performs Agglomerative Hierarchical Clustering (AHC) using average linkage (UPGMA).
 *
 * Cluster distances are updated with the Lance-Williams recurrence and each cluster
 * caches its nearest neighbour, so a merge costs O(N) instead of rescanning every
 * member pair. That takes the whole run from O(N^3) to roughly O(N^2), which is what
 * makes long recordings tractable in a Web Worker.
 *
 * @param {Array<Float32Array>} embeddings List of embedding vectors
 * @param {Object} [options]
 * @param {number|null} [options.targetClusters=null] Target number of clusters (e.g. 2, 3, 4, 5). If null, uses threshold.
 * @param {number} [options.threshold=0.70] Distance threshold to stop merging when targetClusters is null.
 * @param {'affinity'|'cosine'} [options.distanceSpace='affinity'] Distance space to cluster in; see buildBaseDistances.
 * @returns {Array<number>} Cluster assignment for each embedding (0-indexed)
 */
export function agglomerativeClustering(embeddings, options = {}) {
  const { targetClusters = null, threshold = 0.70 } = options;
  let { distanceSpace = 'affinity' } = options;
  const n = embeddings.length;

  if (n === 0) return [];
  if (n === 1) return [0];

  // If user requested 1 cluster, assign all to cluster 0
  if (targetClusters !== null && targetClusters <= 1) {
    return new Array(n).fill(0);
  }

  if (distanceSpace === 'affinity' && targetClusters === null) {
    // `threshold` is expressed in cosine distance. Affinity-space distances are Euclidean
    // norms over N-dimensional rows, so their scale grows with the number of points and no
    // fixed threshold is meaningful there. Threshold-mode therefore always uses cosine.
    distanceSpace = 'cosine';
  }

  if (distanceSpace === 'affinity' && n > MAX_AFFINITY_POINTS) {
    console.warn(
      `[Diarization] ${n} windows exceeds the affinity-space cap of ${MAX_AFFINITY_POINTS}; ` +
      'clustering on raw cosine distance instead. Increase the diarization period to stay under the cap.',
    );
    distanceSpace = 'cosine';
  }

  // Pre-normalize all embeddings
  const normEmbeddings = embeddings.map((e) => l2Normalize(e));
  const dist = buildBaseDistances(normEmbeddings, distanceSpace);

  // Cluster state: `active` marks live clusters, `size` holds member counts,
  // `firstIdx` the earliest original index (used to order speakers by first appearance).
  const active = new Uint8Array(n).fill(1);
  const size = new Int32Array(n).fill(1);
  const firstIdx = new Int32Array(n);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    firstIdx[i] = i;
    parent[i] = i;
  }

  // Cached nearest neighbour per active cluster
  const nn = new Int32Array(n).fill(-1);
  const nnDist = new Float64Array(n).fill(Infinity);

  const refreshNearest = (i) => {
    let best = -1;
    let bestD = Infinity;
    const row = i * n;
    for (let j = 0; j < n; j++) {
      if (j === i || !active[j]) continue;
      const d = dist[row + j];
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    nn[i] = best;
    nnDist[i] = bestD;
  };

  for (let i = 0; i < n; i++) refreshNearest(i);

  let numClusters = n;
  while (numClusters > 1) {
    if (targetClusters !== null && numClusters <= targetClusters) break;

    // Cheapest live merge
    let a = -1;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (active[i] && nn[i] >= 0 && nnDist[i] < minDist) {
        minDist = nnDist[i];
        a = i;
      }
    }
    if (a < 0) break;
    const b = nn[a];

    // If auto-clustering by threshold, stop when the best distance exceeds it
    if (targetClusters === null && minDist > threshold) break;

    // Lance-Williams average-linkage update: d(a+b, k) = (|a|*d(a,k) + |b|*d(b,k)) / (|a|+|b|)
    const sizeA = size[a];
    const sizeB = size[b];
    const total = sizeA + sizeB;
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a || k === b) continue;
      const d = (sizeA * dist[a * n + k] + sizeB * dist[b * n + k]) / total;
      dist[a * n + k] = d;
      dist[k * n + a] = d;
    }

    active[b] = 0;
    parent[b] = a;
    size[a] = total;
    firstIdx[a] = Math.min(firstIdx[a], firstIdx[b]);
    numClusters--;

    // `a` changed and anything that pointed at `a` or the retired `b` is now stale
    refreshNearest(a);
    for (let k = 0; k < n; k++) {
      if (active[k] && k !== a && (nn[k] === a || nn[k] === b)) {
        refreshNearest(k);
      }
    }
  }

  // Resolve each point to its surviving cluster root
  const rootOf = (i) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    // Path compression keeps this linear across all n lookups
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur];
      parent[cur] = r;
      cur = next;
    }
    return r;
  };

  // Order clusters by first appearance in time so Speaker 1 is the first to talk
  const roots = [];
  for (let i = 0; i < n; i++) {
    if (active[i]) roots.push(i);
  }
  roots.sort((x, y) => firstIdx[x] - firstIdx[y]);

  const clusterIdOf = new Map();
  roots.forEach((root, idx) => clusterIdOf.set(root, idx));

  const labels = new Array(n);
  for (let i = 0; i < n; i++) {
    labels[i] = clusterIdOf.get(rootOf(i)) ?? 0;
  }

  return labels;
}

/**
 * Post-processes diarization labels with temporal smoothing heuristics.
 * If a very short segment (< minDurationS) is flanked by the same speaker before and after
 * with a small pause, it reassigns the short segment to that dominant speaker.
 * 
 * @param {Array<Object>} segments Segments with { id, start, end, duration }
 * @param {Array<number>} labels Cluster labels per segment
 * @param {number} [minDurationS=0.8] Minimum duration to trust short segment speaker label
 * @param {number} [maxSilenceS=0.6] Maximum silence pause between segments to allow bridge smoothing
 * @returns {Array<number>} Smoothed cluster labels
 */
export function smoothSpeakerLabels(segments, labels, minDurationS = 0.8, maxSilenceS = 0.6) {
  if (!segments || segments.length <= 2 || labels.length !== segments.length) {
    return [...labels];
  }

  const smoothed = [...labels];

  for (let i = 1; i < segments.length - 1; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    const next = segments[i + 1];

    const prevLabel = smoothed[i - 1];
    const currLabel = smoothed[i];
    const nextLabel = smoothed[i + 1];

    // Check if previous and next share the same speaker
    if (prevLabel === nextLabel && currLabel !== prevLabel) {
      const currDur = curr.duration ?? (curr.end - curr.start);
      const gapBefore = curr.start - prev.end;
      const gapAfter = next.start - curr.end;

      // If current segment is short and gaps are small, smooth to flanked speaker
      if (currDur < minDurationS && gapBefore <= maxSilenceS && gapAfter <= maxSilenceS) {
        smoothed[i] = prevLabel;
      }
    }
  }

  return smoothed;
}

/**
 * Slices an utterance interval into overlapping sub-windows (SpeechBrain / PyAnnote standard).
 * window = 1.0s, period = 0.5s (50% overlap).
 * 
 * @param {number} startSec Utterance start in seconds
 * @param {number} endSec Utterance end in seconds
 * @param {number} [windowSec=1.0] Duration of each window in seconds
 * @param {number} [periodSec=0.5] Hop / period between consecutive windows in seconds
 * @returns {Array<{ start: number, end: number }>}
 */
export function sliceUtteranceIntoWindows(startSec, endSec, windowSec = 1.0, periodSec = 0.5) {
  const duration = endSec - startSec;
  if (duration <= 0) return [];
  if (duration <= windowSec) {
    return [{ start: Number(startSec.toFixed(3)), end: Number(endSec.toFixed(3)) }];
  }

  const windows = [];
  let currStart = startSec;
  while (currStart + windowSec <= endSec) {
    windows.push({
      start: Number(currStart.toFixed(3)),
      end: Number((currStart + windowSec).toFixed(3)),
    });
    currStart += periodSec;
  }

  // Remainder chunk if speech persists past the last step
  if (currStart < endSec) {
    const finalStart = Math.max(startSec, endSec - windowSec);
    const lastWindow = windows[windows.length - 1];
    if (!lastWindow || Math.abs(lastWindow.start - finalStart) > 0.05) {
      windows.push({
        start: Number(finalStart.toFixed(3)),
        end: Number(endSec.toFixed(3)),
      });
    }
  }

  return windows;
}

/**
 * Converts classified sub-windows into continuous dialogue segments.
 * Merges contiguous overlapping or adjacent windows sharing the same speaker,
 * and splits at midpoint when speaker changes across overlapping windows.
 * 
 * @param {Array<{ start: number, end: number, utteranceIdx?: number }>} windows 
 * @param {Array<number>} labels Cluster labels per window
 * @param {Object} [options]
 * @param {number} [options.maxSilenceGap=0.5] Maximum silence gap allowed to bridge same speaker
 * @param {number} [options.minDuration=0.3] Minimum segment duration
 * @returns {Array<{ start: number, end: number, cluster: number }>}
 */
export function reconstructSegmentsFromWindows(windows, labels, options = {}) {
  const {
    maxSilenceGap = 0.5,
    minSilence = null,
    minDuration = 0.3,
    minSegment = null,
  } = options;
  const effectiveMaxSilence = minSilence ?? maxSilenceGap;
  const effectiveMinDuration = minSegment ?? minDuration;

  if (!windows || windows.length === 0) return [];
  if (windows.length !== labels.length) {
    throw new Error('Windows count must match labels count');
  }

  // 1. Resolve overlap boundaries when speaker turns occur
  const resolved = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const lbl = labels[i];
    let start = w.start;
    let end = w.end;

    if (i > 0) {
      const prev = windows[i - 1];
      const prevLbl = labels[i - 1];
      const sameUtterance = w.utteranceIdx === undefined || w.utteranceIdx === prev.utteranceIdx;
      if (sameUtterance && prevLbl !== lbl && prev.end > w.start) {
        const mid = Number(((prev.end + w.start) / 2).toFixed(3));
        start = mid;
        if (resolved.length > 0) {
          resolved[resolved.length - 1].end = mid;
        }
      }
    }

    resolved.push({
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      cluster: lbl,
      utteranceIdx: w.utteranceIdx,
    });
  }

  // 2. Merge consecutive slices with the same speaker
  const merged = [];
  let curr = null;

  for (const item of resolved) {
    if (!curr) {
      curr = { ...item };
      continue;
    }

    const sameCluster = curr.cluster === item.cluster;
    const sameUtt = item.utteranceIdx === undefined || item.utteranceIdx === curr.utteranceIdx;
    const gap = item.start - curr.end;
    const canBridge = sameCluster && sameUtt && gap <= effectiveMaxSilence;

    if (canBridge) {
      curr.end = Math.max(curr.end, item.end);
    } else {
      if (curr.end - curr.start >= effectiveMinDuration) {
        merged.push(curr);
      } else if (merged.length > 0) {
        const prev = merged[merged.length - 1];
        if (curr.start - prev.end <= effectiveMaxSilence) {
          prev.end = Math.max(prev.end, curr.end);
        } else {
          merged.push(curr);
        }
      } else {
        merged.push(curr);
      }
      curr = { ...item };
    }
  }

  if (curr) {
    if (curr.end - curr.start >= effectiveMinDuration || merged.length === 0) {
      merged.push(curr);
    } else if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (curr.start - prev.end <= effectiveMaxSilence) {
        prev.end = Math.max(prev.end, curr.end);
      }
    }
  }

  return merged.map((m) => ({
    start: Number(m.start.toFixed(2)),
    end: Number(m.end.toFixed(2)),
    cluster: m.cluster,
  }));
}

/**
 * Returns the dominant speaker cluster label from an array of window labels via majority voting.
 * 
 * @param {Array<number>} windowLabels
 * @returns {number}
 */
export function majorityVoteSpeaker(windowLabels) {
  if (!windowLabels || windowLabels.length === 0) return 0;
  const counts = new Map();
  for (const lbl of windowLabels) {
    counts.set(lbl, (counts.get(lbl) || 0) + 1);
  }
  let bestLabel = windowLabels[0];
  let maxCount = -1;
  for (const [lbl, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestLabel = lbl;
    }
  }
  return bestLabel;
}

/**
 * Assigns speaker IDs and names to segments based on diarization clustering.
 * Enforces explicit user-specified speaker count (2 to 5) and constrains speaker IDs to 1..5.
 * 
 * @param {Array<Object>} segments Array of segment objects
 * @param {Array<Float32Array>} embeddings Array of embedding vectors
 * @param {Object} [options]
 * @param {number} [options.speakerCount=2] User-specified speaker count (2, 3, 4, 5)
 * @param {Array<Object>} [options.projectSpeakers=[]] Existing project speakers [{ id, name, initials }]
 * @returns {Array<Object>} Updated segments with speakerId and speaker
 */
export function diarizeAndAssignSpeakers(segments, embeddings, options = {}) {
  const {
    speakerCount = 2,
    projectSpeakers = [],
  } = options;

  if (!segments || segments.length === 0) return [];
  if (!embeddings || embeddings.length !== segments.length) {
    console.warn('[Diarization] Embeddings count does not match segments count. Keeping original speaker IDs.');
    return segments;
  }

  // Enforce explicit speaker count in range [1..5]; 1 means "no clustering at all",
  // which agglomerativeClustering short-circuits into a single label.
  const numParsed = Number(speakerCount);
  const targetK = !isNaN(numParsed) && numParsed >= 1 ? Math.min(5, Math.floor(numParsed)) : 2;
  const targetClusters = Math.min(segments.length, targetK);

  // 1. Run AHC clustering with explicit cluster count
  const rawLabels = agglomerativeClustering(embeddings, {
    targetClusters,
  });

  // 2. Temporal smoothing for short utterances
  const finalLabels = smoothSpeakerLabels(segments, rawLabels);

  // 3. Map cluster index (0..4) to speakerId (1..5)
  const spkMap = new Map();
  if (Array.isArray(projectSpeakers)) {
    for (const spk of projectSpeakers) {
      if (spk && spk.id != null) {
        spkMap.set(Number(spk.id), spk);
      }
    }
  }

  return segments.map((seg, idx) => {
    const clusterIdx = finalLabels[idx] ?? 0;
    // Map cluster 0 -> Speaker 1, 1 -> Speaker 2, up to Speaker 5
    const speakerId = Math.min(5, clusterIdx + 1);
    const matchedSpeaker = spkMap.get(speakerId);
    const speakerName = matchedSpeaker?.name || `Speaker ${speakerId}`;

    return {
      ...seg,
      speakerId,
      speaker: speakerName,
    };
  });
}

