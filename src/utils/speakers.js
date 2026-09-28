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

