/**
 * Utilities for finding and replacing text across transcription tiers and sub-tiers.
 */

import { getSubText } from './subTiers.js';

/**
 * Escapes special characters for use in regular expressions.
 * @param {string} string
 * @returns {string}
 */
export function escapeRegExp(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a search RegExp with optional case sensitivity, Unicode word boundary, and regex support.
 * @param {string} findText
 * @param {Object} [options]
 * @param {boolean} [options.matchCase=false]
 * @param {boolean} [options.wholeWord=false]
 * @param {boolean} [options.useRegex=false]
 * @returns {RegExp|null}
 */
export function buildFindRegex(
  findText,
  { matchCase = false, wholeWord = false, useRegex = false } = {},
) {
  if (!findText || typeof findText !== 'string') return null;

  const basePattern = useRegex ? findText : escapeRegExp(findText);
  let pattern;

  if (wholeWord) {
    // Unicode-aware word boundary: (?<=^|[^\p{L}\p{N}_]) and (?=$|[^\p{L}\p{N}_])
    pattern = `(?<=^|[^\\p{L}\\p{N}_])(?:${basePattern})(?=$|[^\\p{L}\\p{N}_])`;
  } else {
    pattern = basePattern;
  }

  const flags = matchCase ? 'gu' : 'giu';
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    return null;
  }
}

/**
 * Validates whether the provided regex string compiles cleanly.
 * @param {string} findText
 * @param {Object} [options]
 * @param {boolean} [options.matchCase=false]
 * @param {boolean} [options.wholeWord=false]
 * @returns {string|null} Error message if invalid, or null if valid
 */
export function validateFindRegex(
  findText,
  { matchCase = false, wholeWord = false } = {},
) {
  if (!findText || typeof findText !== 'string') return null;
  const pattern = wholeWord
    ? `(?<=^|[^\\p{L}\\p{N}_])(?:${findText})(?=$|[^\\p{L}\\p{N}_])`
    : findText;
  const flags = matchCase ? 'gu' : 'giu';
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (e) {
    return e.message || 'Invalid regular expression';
  }
}

/**
 * Resolves the searchable tier descriptors based on the user's selection.
 * Filters out word/morpheme sub-tiers since they store structured token tag arrays.
 *
 * @param {string} targetTier - 'main', 'all', or a specific sub-tier id (e.g. '1')
 * @param {Array<Object>} [subTiers=[]]
 * @param {string} [mainTierTitle='Main Transcription']
 * @returns {Array<{ key: string, name: string, isMain: boolean }>}
 */
export function getSearchableTiers(targetTier, subTiers = [], mainTierTitle = 'Main Transcription') {
  const sentenceSubTiers = (subTiers || [])
    .filter((t) => t && t.type !== 'word' && t.type !== 'morpheme')
    .map((t) => ({
      key: String(t.id),
      name: t.name || `Sub-tier #${t.id}`,
      isMain: false,
    }));

  const mainTierObj = {
    key: 'main',
    name: mainTierTitle || 'Main Transcription',
    isMain: true,
  };

  if (targetTier === 'main') {
    return [mainTierObj];
  }

  if (targetTier === 'all') {
    return [mainTierObj, ...sentenceSubTiers];
  }

  const matchedSubTier = sentenceSubTiers.find((t) => t.key === String(targetTier));
  if (matchedSubTier) {
    return [matchedSubTier];
  }

  // Fallback to main tier
  return [mainTierObj];
}

/**
 * Finds all matches for `findText` across the provided segments and target tiers.
 *
 * @param {Object} params
 * @param {Array<Object>} params.segments
 * @param {string} params.findText
 * @param {string} [params.targetTier='all'] - 'main', 'all', or specific sub-tier id
 * @param {Array<Object>} [params.subTiers=[]]
 * @param {boolean} [params.matchCase=false]
 * @param {boolean} [params.wholeWord=false]
 * @param {boolean} [params.useRegex=false]
 * @param {string} [params.mainTierTitle='Main Transcription']
 * @returns {{ matches: Array<Object>, totalMatches: number, matchingSegmentsCount: number }}
 */
export function findAllMatches({
  segments = [],
  findText = '',
  targetTier = 'all',
  subTiers = [],
  matchCase = false,
  wholeWord = false,
  useRegex = false,
  mainTierTitle = 'Main Transcription',
} = {}) {
  if (!findText || !Array.isArray(segments) || segments.length === 0) {
    return { matches: [], totalMatches: 0, matchingSegmentsCount: 0 };
  }

  const regex = buildFindRegex(findText, { matchCase, wholeWord, useRegex });
  if (!regex) {
    return { matches: [], totalMatches: 0, matchingSegmentsCount: 0 };
  }

  const tiersToSearch = getSearchableTiers(targetTier, subTiers, mainTierTitle);
  const matches = [];
  const matchedSegmentIds = new Set();

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    if (!seg) continue;

    for (const tier of tiersToSearch) {
      let text = '';
      if (tier.isMain) {
        text = seg.text || '';
      } else {
        text = getSubText(seg, tier.key);
      }

      if (!text) continue;

      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          matchId: `${seg.id}-${tier.key}-${m.index}`,
          segmentId: seg.id,
          segmentIndex: sIdx,
          tierKey: tier.key,
          tierName: tier.name,
          index: m.index,
          length: m[0].length,
          matchedText: m[0],
        });
        matchedSegmentIds.add(seg.id);

        // Guard against zero-length matches looping infinitely
        if (regex.lastIndex === m.index) {
          regex.lastIndex++;
        }
      }
    }
  }

  return {
    matches,
    totalMatches: matches.length,
    matchingSegmentsCount: matchedSegmentIds.size,
  };
}

/**
 * Replaces a single match in the given segments list.
 * Returns a new segments array or modified copy with the match replaced.
 *
 * @param {Object} params
 * @param {Array<Object>} params.segments
 * @param {Object} params.match - Match object from findAllMatches
 * @param {string} params.replaceText
 * @param {string} [params.findText='']
 * @param {boolean} [params.matchCase=false]
 * @param {boolean} [params.wholeWord=false]
 * @param {boolean} [params.useRegex=false]
 * @returns {{ updatedSegments: Array<Object>, success: boolean, newText: string }}
 */
export function replaceSingleMatch({
  segments,
  match,
  replaceText = '',
  findText = '',
  matchCase = false,
  wholeWord = false,
  useRegex = false,
}) {
  if (!match || !Array.isArray(segments)) {
    return { updatedSegments: segments, success: false, newText: '' };
  }

  const segIndex = segments.findIndex((s) => s.id === match.segmentId);
  if (segIndex < 0) {
    return { updatedSegments: segments, success: false, newText: '' };
  }

  const seg = segments[segIndex];
  const isMain = match.tierKey === 'main';
  const currentText = isMain ? (seg.text || '') : getSubText(seg, match.tierKey);

  // Validate that match position matches expected text
  const actualSlice = currentText.slice(match.index, match.index + match.length);
  if (actualSlice.toLowerCase() !== match.matchedText.toLowerCase()) {
    // Position has shifted or text was modified
    return { updatedSegments: segments, success: false, newText: currentText };
  }

  let replacement = replaceText;
  if (useRegex && findText) {
    const singleRegex = buildFindRegex(findText, { matchCase, wholeWord, useRegex });
    if (singleRegex) {
      // Remove global flag so .replace only replaces the matched slice with group expansion
      const nonGlobalFlags = singleRegex.flags.replace('g', '');
      try {
        const localRegex = new RegExp(singleRegex.source, nonGlobalFlags);
        replacement = actualSlice.replace(localRegex, replaceText);
      } catch (_) {}
    }
  }

  const newText =
    currentText.slice(0, match.index) +
    replacement +
    currentText.slice(match.index + match.length);

  const updatedSegments = segments.map((s, idx) => {
    if (idx !== segIndex) return s;

    if (isMain) {
      return { ...s, text: newText };
    } else {
      const subTexts = { ...(s.subTexts || {}), [String(match.tierKey)]: newText };
      return { ...s, subTexts };
    }
  });

  return {
    updatedSegments,
    success: true,
    newText,
  };
}

/**
 * Replaces all occurrences of `findText` across all specified tiers and segments.
 *
 * @param {Object} params
 * @param {Array<Object>} params.segments
 * @param {string} params.findText
 * @param {string} params.replaceText
 * @param {string} [params.targetTier='all']
 * @param {Array<Object>} [params.subTiers=[]]
 * @param {boolean} [params.matchCase=false]
 * @param {boolean} [params.wholeWord=false]
 * @param {boolean} [params.useRegex=false]
 * @param {string} [params.mainTierTitle='Main Transcription']
 * @returns {{ updatedSegments: Array<Object>, totalReplaced: number, modifiedSegmentsCount: number }}
 */
export function replaceAllMatches({
  segments = [],
  findText = '',
  replaceText = '',
  targetTier = 'all',
  subTiers = [],
  matchCase = false,
  wholeWord = false,
  useRegex = false,
  mainTierTitle = 'Main Transcription',
} = {}) {
  if (!findText || !Array.isArray(segments) || segments.length === 0) {
    return { updatedSegments: segments, totalReplaced: 0, modifiedSegmentsCount: 0 };
  }

  const regex = buildFindRegex(findText, { matchCase, wholeWord, useRegex });
  if (!regex) {
    return { updatedSegments: segments, totalReplaced: 0, modifiedSegmentsCount: 0 };
  }

  const tiersToSearch = getSearchableTiers(targetTier, subTiers, mainTierTitle);
  let totalReplaced = 0;
  let modifiedSegmentsCount = 0;

  const updatedSegments = segments.map((seg) => {
    let segmentModified = false;
    let newSegText = seg.text;
    let newSubTexts = seg.subTexts ? { ...seg.subTexts } : null;

    for (const tier of tiersToSearch) {
      if (tier.isMain) {
        const text = seg.text || '';
        if (!text) continue;

        const matches = text.match(regex);
        const count = matches ? matches.length : 0;

        if (count > 0) {
          totalReplaced += count;
          segmentModified = true;
          // In regex mode allow capture group references ($1, $&, etc.); otherwise literal
          newSegText = useRegex
            ? text.replace(regex, replaceText)
            : text.replace(regex, () => replaceText);
        }
      } else {
        const tierKey = String(tier.key);
        const text = seg.subTexts?.[tierKey] ?? '';
        if (typeof text !== 'string' || !text) continue;

        const matches = text.match(regex);
        const count = matches ? matches.length : 0;

        if (count > 0) {
          totalReplaced += count;
          segmentModified = true;
          if (!newSubTexts) newSubTexts = {};
          newSubTexts[tierKey] = useRegex
            ? text.replace(regex, replaceText)
            : text.replace(regex, () => replaceText);
        }
      }
    }

    if (segmentModified) {
      modifiedSegmentsCount++;
      const result = { ...seg, text: newSegText };
      if (newSubTexts) {
        result.subTexts = newSubTexts;
      }
      return result;
    }

    return seg;
  });

  return {
    updatedSegments,
    totalReplaced,
    modifiedSegmentsCount,
  };
}
