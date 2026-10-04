/**
 * Speaker configuration, color palette, and helper functions.
 * Supports up to 5 speakers per project with unique IDs (1 to 5).
 */

export const SPEAKER_COLORS = {
  1: {
    id: 1,
    primary: '#0284c7', // Sky Blue
    bg: '#e0f2fe',
    waveformBg: 'rgba(2, 132, 199, 0.22)',
    border: '#38bdf8',
    text: '#0369a1',
    darkBg: 'rgba(2, 132, 199, 0.22)',
    darkBorder: 'rgba(56, 189, 248, 0.5)',
    darkText: '#7dd3fc',
  },
  2: {
    id: 2,
    primary: '#7c3aed', // Purple
    bg: '#ede9fe',
    waveformBg: 'rgba(124, 58, 237, 0.22)',
    border: '#c084fc',
    text: '#6d28d9',
    darkBg: 'rgba(124, 58, 237, 0.22)',
    darkBorder: 'rgba(192, 132, 252, 0.5)',
    darkText: '#d8b4fe',
  },
  3: {
    id: 3,
    primary: '#059669', // Emerald Green
    bg: '#d1fae5',
    waveformBg: 'rgba(5, 150, 105, 0.22)',
    border: '#34d399',
    text: '#047857',
    darkBg: 'rgba(5, 150, 105, 0.22)',
    darkBorder: 'rgba(52, 211, 153, 0.5)',
    darkText: '#6ee7b7',
  },
  4: {
    id: 4,
    primary: '#d97706', // Amber / Orange
    bg: '#fef3c7',
    waveformBg: 'rgba(217, 119, 6, 0.22)',
    border: '#fbbf24',
    text: '#b45309',
    darkBg: 'rgba(217, 119, 6, 0.22)',
    darkBorder: 'rgba(251, 191, 36, 0.5)',
    darkText: '#fde68a',
  },
  5: {
    id: 5,
    primary: '#e11d48', // Rose / Red
    bg: '#ffe4e6',
    waveformBg: 'rgba(225, 29, 72, 0.22)',
    border: '#fb7185',
    text: '#be123c',
    darkBg: 'rgba(225, 29, 72, 0.22)',
    darkBorder: 'rgba(251, 113, 133, 0.5)',
    darkText: '#fecdd3',
  },
};

export const DEFAULT_SPEAKER_COLOR = {
  id: 0,
  primary: '#64748b',
  bg: '#f1f5f9',
  border: '#cbd5e1',
  text: '#334155',
  darkBg: 'rgba(255, 255, 255, 0.1)',
  darkBorder: 'rgba(255, 255, 255, 0.2)',
  darkText: '#e2e8f0',
};

/**
 * Returns the color palette object for a speaker ID (1 to 5).
 * @param {number|string} speakerId
 * @returns {typeof SPEAKER_COLORS[1]}
 */
export function getSpeakerColor(speakerId) {
  const numId = Number(speakerId);
  return SPEAKER_COLORS[numId] || DEFAULT_SPEAKER_COLOR;
}

/**
 * Returns clean initials (up to 3 uppercase chars) for a speaker object or name.
 * @param {Object|string} speaker
 * @param {number} [fallbackId=1]
 * @returns {string}
 */
export function getSpeakerInitials(speaker, fallbackId = 1) {
  if (speaker && typeof speaker === 'object') {
    if (speaker.initials && speaker.initials.trim()) {
      return speaker.initials.trim().slice(0, 3).toUpperCase();
    }
    if (speaker.name && speaker.name.trim()) {
      const parts = speaker.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).slice(0, 3).toUpperCase();
      }
      return speaker.name.trim().slice(0, 3).toUpperCase();
    }
    return `S${speaker.id || fallbackId}`;
  }

  if (typeof speaker === 'string' && speaker.trim()) {
    const parts = speaker.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).slice(0, 3).toUpperCase();
    }
    return speaker.trim().slice(0, 3).toUpperCase();
  }

  return `S${fallbackId}`;
}

/**
 * Finds a speaker by ID in a speakers list.
 * @param {Array} speakers
 * @param {number|string} speakerId
 * @returns {Object|null}
 */
export function getSpeakerById(speakers, speakerId) {
  if (!Array.isArray(speakers) || !speakerId) return null;
  const numId = Number(speakerId);
  return speakers.find((s) => s.id === numId) || null;
}

/**
 * Ensures a project has at least Speaker 1 configured.
 * @param {Array} [speakers]
 * @returns {Array}
 */
export function ensureDefaultSpeakers(speakers) {
  if (Array.isArray(speakers) && speakers.length > 0) {
    return speakers;
  }
  return [
    {
      id: 1,
      name: 'Speaker 1',
      initials: 'S1',
    },
  ];
}

/**
 * Returns the CSS tint class name (`speaker-tint-1`..`speaker-tint-5`) for a
 * speaker given as a numeric id, a speaker object, or a display name.
 * @param {number|Object|string} speaker
 * @returns {string}
 */
export function getSpeakerClass(speaker) {
  if (typeof speaker === 'number') {
    const idx = Math.max(1, Math.min(5, Math.floor(speaker)));
    return `speaker-tint-${idx}`;
  }
  if (speaker && typeof speaker === 'object') {
    const id = speaker.id || 1;
    return `speaker-tint-${Math.max(1, Math.min(5, Math.floor(id)))}`;
  }
  const sp = String(speaker || 'Speaker 1');
  const match = sp.match(/\d+/);
  if (match) {
    const idx = ((parseInt(match[0], 10) - 1) % 5) + 1;
    return `speaker-tint-${idx}`;
  }
  let hash = 0;
  for (let i = 0; i < sp.length; i++) {
    hash = (hash << 5) - hash + sp.charCodeAt(i);
  }
  const idx = (Math.abs(hash) % 5) + 1;
  return `speaker-tint-${idx}`;
}

/**
 * Normalizes and extracts the numeric speaker ID (1 to 5) from a segment.
 * @param {Object} seg
 * @returns {number}
 */
export function getSegmentSpeakerId(seg) {
  if (!seg) return 1;
  if (seg.speakerId != null) {
    const num = Number(seg.speakerId);
    if (!isNaN(num) && num > 0) {
      return Math.max(1, Math.min(5, Math.floor(num)));
    }
  }
  if (seg.speaker) {
    const m = String(seg.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
    if (m) {
      return Number(m[1]);
    }
    const numMatch = String(seg.speaker).match(/\d+/);
    if (numMatch) {
      const num = Number(numMatch[0]);
      if (!isNaN(num) && num > 0) {
        return Math.max(1, Math.min(5, Math.floor(num)));
      }
    }
  }
  return 1;
}

/**
 * Checks whether two segments belong to the same speaker.
 * @param {Object} segA
 * @param {Object} segB
 * @returns {boolean}
 */
export function isSameSpeaker(segA, segB) {
  if (!segA || !segB) return false;
  // If explicit numeric speakerId is present on both:
  if (segA.speakerId != null && segB.speakerId != null) {
    return Number(segA.speakerId) === Number(segB.speakerId);
  }
  // If speaker name/label is present on both:
  if (segA.speaker && segB.speaker) {
    if (typeof segA.speaker === 'string' && typeof segB.speaker === 'string') {
      if (segA.speaker.trim().toLowerCase() === segB.speaker.trim().toLowerCase()) {
        return true;
      }
    }
  }
  // If one has speakerId and the other has a speaker name with a speaker number (e.g. "Speaker 1"):
  const hasSpkPatternA = segA.speakerId != null || (segA.speaker && /\d+/.test(segA.speaker));
  const hasSpkPatternB = segB.speakerId != null || (segB.speaker && /\d+/.test(segB.speaker));
  if (hasSpkPatternA && hasSpkPatternB) {
    return getSegmentSpeakerId(segA) === getSegmentSpeakerId(segB);
  }
  // If neither has any speaker info, both default to Speaker 1
  if (!segA.speaker && segA.speakerId == null && !segB.speaker && segB.speakerId == null) {
    return true;
  }
  return false;
}

/**
 * Ensures that no segments of the same speaker overlap.
 * When an overlap between two consecutive segments of the same speaker is detected,
 * the ending boundary of the previous segment is pushed back to the starting boundary
 * of the succeeding segment.
 *
 * @param {Array<Object>} segments
 * @param {number|string|null} [targetSpeakerId=null] If specified, only enforce for this speaker
 * @returns {Array<Object>}
 */
export function resolveSameSpeakerOverlaps(segments, targetSpeakerId = null) {
  if (!Array.isArray(segments) || segments.length <= 1) return segments;

  const speakerMap = new Map();
  for (const seg of segments) {
    const spk = getSegmentSpeakerId(seg);
    if (targetSpeakerId !== null && spk !== Number(targetSpeakerId)) continue;
    if (!speakerMap.has(spk)) {
      speakerMap.set(spk, []);
    }
    speakerMap.get(spk).push(seg);
  }

  const minDuration = 0.1;
  for (const [, list] of speakerMap) {
    if (list.length <= 1) continue;
    list.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    for (let i = 0; i < list.length - 1; i++) {
      const current = list[i];
      const next = list[i + 1];
      const curStart = current.start ?? 0;
      const curEnd = current.end ?? curStart + minDuration;
      const nextStart = next.start ?? curEnd;
      const nextEnd = next.end ?? nextStart + minDuration;

      if (curEnd > nextStart) {
        // Overlap detected! Push back ending boundary of the previous segment
        const minCurEnd = curStart + minDuration;
        if (nextStart >= minCurEnd) {
          current.end = Number(nextStart.toFixed(2));
        } else {
          current.end = Number(minCurEnd.toFixed(2));
          next.start = Number(current.end.toFixed(2));
          next.duration = Number(Math.max(minDuration, (next.end ?? (next.start + minDuration)) - next.start).toFixed(2));
        }
        current.duration = Number(Math.max(minDuration, current.end - current.start).toFixed(2));
      }
    }
  }

  return segments;
}

/**
 * Adjusts boundaries during interactive waveform handle dragging, adhering to the rule:
 * "no segments of the same speaker can overlap."
 *
 * - When modifying the START boundary of a segment:
 *   If there is another segment of the same speaker preceding it, ensure that the new
 *   starting boundary time is not smaller than the previous segment's end time.
 *   If it is, push back the ending boundary of the previous segment to avoid overlap.
 *
 * - When modifying the END boundary of a segment:
 *   If there is another segment of the same speaker succeeding it, ensure that the new
 *   ending boundary time is not greater than the next segment's start time.
 *   If it is, push forward the starting boundary of the next segment to avoid overlap.
 *
 * @param {Object} options
 * @param {Array<Object>} options.segments
 * @param {string} options.selectedSegId
 * @param {'start'|'end'} options.handle
 * @param {number} options.time Current hover/pointer time
 * @param {number} [options.startTime=0] Audio timeline start time
 * @param {number} [options.duration=1] Audio timeline duration
 * @param {Object|null} [options.boundaryDragState=null] Cached drag context from pointerdown
 * @returns {{ segments: Array<Object>, selectedSeg: Object|null, prevSeg: Object|null, nextSeg: Object|null, newTime: number }}
 */
export function adjustSameSpeakerBoundariesOnDrag({
  segments,
  selectedSegId,
  handle,
  time,
  startTime = 0,
  duration = 1,
  boundaryDragState = null,
}) {
  if (!Array.isArray(segments) || !selectedSegId) {
    return { segments, selectedSeg: null, prevSeg: null, nextSeg: null, newTime: time };
  }

  const selectedSeg = segments.find((s) => s.id === selectedSegId);
  if (!selectedSeg) {
    return { segments, selectedSeg: null, prevSeg: null, nextSeg: null, newTime: time };
  }

  // Find neighboring segments of the same speaker
  let prevSeg = null;
  let nextSeg = null;

  if (boundaryDragState?.prevSegId) {
    prevSeg = segments.find((s) => s.id === boundaryDragState.prevSegId) || null;
  }
  if (boundaryDragState?.nextSegId) {
    nextSeg = segments.find((s) => s.id === boundaryDragState.nextSegId) || null;
  }

  if (!prevSeg || !nextSeg) {
    const sortedSameSpeaker = segments
      .filter((s) => isSameSpeaker(s, selectedSeg))
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const idx = sortedSameSpeaker.findIndex((s) => s.id === selectedSeg.id);
    if (!prevSeg && idx > 0) {
      prevSeg = sortedSameSpeaker[idx - 1];
    }
    if (!nextSeg && idx >= 0 && idx < sortedSameSpeaker.length - 1) {
      nextSeg = sortedSameSpeaker[idx + 1];
    }
  }

  const minDuration = 0.1;
  let newTime = time;

  if (handle === 'start') {
    const prevStart = prevSeg?.start ?? startTime;
    const initialPrevEnd = boundaryDragState?.initialPrevEnd ?? (prevSeg?.end ?? null);

    // Minimum start: prevSeg must maintain at least minDuration
    const minAllowed = prevSeg
      ? Math.max(startTime, Number((prevStart + minDuration).toFixed(2)))
      : startTime;
    // Maximum start: selectedSeg must maintain at least 0.2s duration
    const maxAllowed = Math.max(minAllowed, Number(((selectedSeg.end ?? 1) - 0.2).toFixed(2)));
    const newStart = Number(Math.max(minAllowed, Math.min(maxAllowed, time)).toFixed(2));

    selectedSeg.start = newStart;
    selectedSeg.duration = Number(
      Math.max(minDuration, selectedSeg.end - selectedSeg.start).toFixed(2),
    );
    newTime = selectedSeg.start;

    // Rule: new starting boundary time must not be smaller than previous segment's end time.
    // If it is, push back the ending boundary of the previous segment to avoid any overlap.
    if (prevSeg) {
      const baselinePrevEnd = initialPrevEnd !== null ? initialPrevEnd : prevSeg.end;
      if (newStart < baselinePrevEnd) {
        prevSeg.end = Number(Math.max(prevStart + minDuration, newStart).toFixed(2));
      } else {
        prevSeg.end = Number(baselinePrevEnd.toFixed(2));
      }
      prevSeg.duration = Number(
        Math.max(minDuration, prevSeg.end - prevSeg.start).toFixed(2),
      );
    }
  } else if (handle === 'end') {
    const nextEnd = nextSeg?.end ?? (startTime + duration);
    const initialNextStart = boundaryDragState?.initialNextStart ?? (nextSeg?.start ?? null);

    // Maximum end: nextSeg must maintain at least minDuration
    const maxAllowed = nextSeg
      ? Math.min(startTime + duration, Number((nextEnd - minDuration).toFixed(2)))
      : startTime + duration;
    // Minimum end: selectedSeg must maintain at least 0.2s duration
    const minAllowed = Math.min(maxAllowed, Number(((selectedSeg.start ?? 0) + 0.2).toFixed(2)));
    const newEnd = Number(Math.max(minAllowed, Math.min(maxAllowed, time)).toFixed(2));

    selectedSeg.end = newEnd;
    selectedSeg.duration = Number(
      Math.max(minDuration, selectedSeg.end - selectedSeg.start).toFixed(2),
    );
    newTime = selectedSeg.end;

    // Rule: new ending boundary time must not be greater than next segment's start time.
    // If it is, push forward the starting boundary of the next segment to avoid any overlap.
    if (nextSeg) {
      const baselineNextStart = initialNextStart !== null ? initialNextStart : nextSeg.start;
      if (newEnd > baselineNextStart) {
        nextSeg.start = Number(Math.min(nextEnd - minDuration, newEnd).toFixed(2));
      } else {
        nextSeg.start = Number(baselineNextStart.toFixed(2));
      }
      nextSeg.duration = Number(
        Math.max(minDuration, nextSeg.end - nextSeg.start).toFixed(2),
      );
    }
  }

  return {
    segments,
    selectedSeg,
    prevSeg,
    nextSeg,
    newTime,
  };
}

/**
 * Calculates segment split boundaries at a specific time point or midpoint fallback.
 * Guarantees each split half maintains at least minDuration (default 0.05s).
 *
 * @param {Object} seg
 * @param {number|null} [splitTime=null] Specific time to split at
 * @param {number} [minDuration=0.05]
 * @returns {{ seg1: Object, seg2: Object, splitPoint: number }|null}
 */
export function calculateSegmentSplit(seg, splitTime = null, minDuration = 0.05) {
  if (!seg) return null;
  const start = seg.start ?? 0;
  const end = seg.end ?? start + 1;
  const totalDuration = end - start;
  if (totalDuration < minDuration * 2) return null;

  let splitPoint;
  if (splitTime !== null && splitTime !== undefined && !isNaN(splitTime)) {
    const minSplit = Number((start + minDuration).toFixed(2));
    const maxSplit = Number((end - minDuration).toFixed(2));
    splitPoint = Number(Math.max(minSplit, Math.min(maxSplit, Number(splitTime))).toFixed(2));
  } else {
    splitPoint = Number(((start + end) / 2).toFixed(2));
  }

  const dur1 = Number(Math.max(minDuration, splitPoint - start).toFixed(2));
  const dur2 = Number(Math.max(minDuration, end - splitPoint).toFixed(2));

  const seg1 = {
    ...seg,
    start,
    end: splitPoint,
    duration: dur1,
  };

  const segSpeakerId = getSegmentSpeakerId(seg);
  const seg2 = {
    id: `seg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    start: splitPoint,
    end,
    duration: dur2,
    speakerId: segSpeakerId,
    speaker: seg.speaker || `Speaker ${segSpeakerId}`,
    text: '',
  };

  return { seg1, seg2, splitPoint };
}

