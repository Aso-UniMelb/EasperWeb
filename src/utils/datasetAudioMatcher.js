/**
 * Utility for pairing ELAN (.eaf) files with audio files (.wav, .mp3, .ogg, .flac, .m4a).
 */

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.m4a'];

/**
 * Strips directory and extension from a filename.
 * @param {string} filename
 * @returns {string} Clean lowercase base name
 */
export function getBaseName(filename) {
  if (!filename) return '';
  // Remove file:/// or path separators
  const clean = filename.replace(/^file:\/{2,3}/i, '').replace(/\\/g, '/');
  const baseWithExt = clean.split('/').pop() || '';
  const lastDot = baseWithExt.lastIndexOf('.');
  if (lastDot === -1) return baseWithExt.toLowerCase();
  return baseWithExt.substring(0, lastDot).toLowerCase();
}

/**
 * Extracts pure filename from any URL or path.
 * @param {string} pathOrUrl
 * @returns {string} Filename with extension
 */
export function getFileName(pathOrUrl) {
  if (!pathOrUrl) return '';
  const clean = pathOrUrl.replace(/^file:\/{2,3}/i, '').replace(/\\/g, '/');
  return clean.split('/').pop() || '';
}

/**
 * Matches loaded EAF files with loaded audio files.
 *
 * @param {Array<{ file: File, parsed: Object }>} eafList
 * @param {Array<File>} audioList
 * @returns {{
 *   pairs: Array<{
 *     id: string,
 *     eafFile: File,
 *     parsedEaf: Object,
 *     audioFile: File | null,
 *     audioFileName: string,
 *     offsetMs: number,
 *     hasAudio: boolean
 *   }>,
 *   unmatchedEaf: Array<string>,
 *   unmatchedAudio: Array<string>
 * }}
 */
export function pairEafWithAudio(eafList, audioList) {
  // Build lookup maps for audio files:
  // 1. By exact filename lowercase
  // 2. By base name lowercase
  const audioByFullName = new Map();
  const audioByBaseName = new Map();

  for (const audio of audioList) {
    const fullName = audio.name.toLowerCase();
    const base = getBaseName(audio.name);
    audioByFullName.set(fullName, audio);
    if (!audioByBaseName.has(base)) {
      audioByBaseName.set(base, audio);
    }
  }

  const pairs = [];
  const unmatchedEaf = [];
  const matchedAudioFiles = new Set();

  for (const item of eafList) {
    const eafFile = item.file;
    const parsed = item.parsed;
    const eafBase = getBaseName(eafFile.name);

    let matchedAudio = null;
    let offsetMs = 0;

    // 1. Check MEDIA_DESCRIPTOR in EAF
    if (parsed && parsed.mediaDescriptors && parsed.mediaDescriptors.length > 0) {
      for (const md of parsed.mediaDescriptors) {
        const urlCandidate = getFileName(md.relativeUrl || md.mediaUrl).toLowerCase();
        if (urlCandidate && audioByFullName.has(urlCandidate)) {
          matchedAudio = audioByFullName.get(urlCandidate);
          offsetMs = md.timeOrigin || 0;
          break;
        }
        const urlBase = getBaseName(urlCandidate);
        if (urlBase && audioByBaseName.has(urlBase)) {
          matchedAudio = audioByBaseName.get(urlBase);
          offsetMs = md.timeOrigin || 0;
          break;
        }
      }
    }

    // 2. Fallback to base name match with loaded audio files
    if (!matchedAudio && audioByBaseName.has(eafBase)) {
      matchedAudio = audioByBaseName.get(eafBase);
    }

    if (matchedAudio) {
      matchedAudioFiles.add(matchedAudio);
    } else {
      unmatchedEaf.push(eafFile.name);
    }

    pairs.push({
      id: `${eafFile.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eafFile,
      parsedEaf: parsed,
      audioFile: matchedAudio,
      audioFileName: matchedAudio ? matchedAudio.name : '',
      offsetMs,
      hasAudio: !!matchedAudio,
    });
  }

  const unmatchedAudio = audioList
    .filter((a) => !matchedAudioFiles.has(a))
    .map((a) => a.name);

  return {
    pairs,
    unmatchedEaf,
    unmatchedAudio,
  };
}

/**
 * Checks if a file is an accepted audio format.
 * @param {File|string} fileOrName
 * @returns {boolean}
 */
export function isAudioFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  if (!name) return false;
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Checks if a file is an ELAN .eaf file.
 * @param {File|string} fileOrName
 * @returns {boolean}
 */
export function isEafFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  return !!name && name.toLowerCase().endsWith('.eaf');
}

