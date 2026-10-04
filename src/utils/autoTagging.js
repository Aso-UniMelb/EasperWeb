/**
 * Auto-Tagging Utilities for Word/Morpheme-level Sub-Tiers.
 *
 * Automatically inspects words across all segments in a specified word-level sub-tier
 * and looks up corresponding values (e.g. POS tags, Glosses, Meanings) from an active
 * lexicon's mapped field.
 */

import { tokenizeWords, getWordAnnotations } from './subTiers.js';
import { getEntryFieldValue } from './lexiconTsv.js';

/**
 * Resolves a field within a lexicon matching a target identifier (by field ID or field name).
 * Matching by name is case-insensitive.
 *
 * @param {Object} lexicon
 * @param {string} fieldNameOrId
 * @returns {Object|null}
 */
export function resolveLexiconField(lexicon, fieldNameOrId) {
  if (!lexicon || !Array.isArray(lexicon.fields) || !fieldNameOrId) return null;
  const target = String(fieldNameOrId).trim().toLowerCase();
  if (!target) return null;

  // 1. Exact ID match
  const byId = lexicon.fields.find((f) => f.id === fieldNameOrId);
  if (byId) return byId;

  // 2. Case-insensitive Name match
  const byName = lexicon.fields.find(
    (f) => (f.name || '').trim().toLowerCase() === target,
  );
  if (byName) return byName;

  return null;
}

/**
 * Finds the mandatory Headword field in a lexicon, with fallback to the first field.
 *
 * @param {Object} lexicon
 * @returns {Object|null}
 */
export function getLexiconHeadwordField(lexicon) {
  if (!lexicon || !Array.isArray(lexicon.fields) || lexicon.fields.length === 0) {
    return null;
  }
  const hw = lexicon.fields.find(
    (f) => (f.name || '').trim().toLowerCase() === 'headword',
  );
  return hw || lexicon.fields[0];
}

/**
 * Cleans surrounding punctuation from a tokenized word for lexical lookup,
 * preserving internal hyphens, underscores, or letters.
 *
 * @param {string} word
 * @returns {string}
 */
export function cleanWordForLookup(word) {
  if (!word) return '';
  const trimmed = String(word).trim();
  // Strip non-letter/non-number punctuation from start and end
  return trimmed.replace(/^[^\p{L}\p{N}_\-]+|[^\p{L}\p{N}_\-]+$/gu, '');
}

/**
 * Builds lookup maps from headwords to field values for rapid O(1) tagging across many segments.
 *
 * @param {Object} lexicon
 * @param {Object} targetField
 * @returns {{ exactMap: Map<string, string>, lowerMap: Map<string, string> }}
 */
export function buildLexiconLookupMap(lexicon, targetField) {
  const exactMap = new Map();
  const lowerMap = new Map();

  if (!lexicon || !Array.isArray(lexicon.entries) || !targetField) {
    return { exactMap, lowerMap };
  }

  const headwordField = getLexiconHeadwordField(lexicon);
  if (!headwordField) {
    return { exactMap, lowerMap };
  }

  for (const entry of lexicon.entries) {
    const hw = getEntryFieldValue(entry, headwordField).trim();
    const val = getEntryFieldValue(entry, targetField).trim();
    if (!hw || !val) continue;

    if (!exactMap.has(hw)) {
      exactMap.set(hw, val);
    }
    const hwLower = hw.toLowerCase();
    if (!lowerMap.has(hwLower)) {
      lowerMap.set(hwLower, val);
    }
  }

  return { exactMap, lowerMap };
}

/**
 * Looks up a tag for a word from indexed lexicon lookup maps.
 *
 * @param {string} word
 * @param {Map<string, string>} exactMap
 * @param {Map<string, string>} lowerMap
 * @param {Object} [options]
 * @param {boolean} [options.caseInsensitive=true]
 * @param {boolean} [options.stripPunctuation=true]
 * @returns {string|null}
 */
export function lookupWordTag(
  word,
  exactMap,
  lowerMap,
  { caseInsensitive = true, stripPunctuation = true } = {},
) {
  if (!word) return null;
  const raw = String(word).trim();
  if (!raw) return null;

  // 1. Direct exact match
  if (exactMap.has(raw)) {
    return exactMap.get(raw);
  }

  // 2. Cleaned exact match (e.g. without trailing commas or periods)
  const cleaned = stripPunctuation ? cleanWordForLookup(raw) : raw;
  if (cleaned && cleaned !== raw && exactMap.has(cleaned)) {
    return exactMap.get(cleaned);
  }

  // 3. Case-insensitive match
  if (caseInsensitive) {
    const rawLower = raw.toLowerCase();
    if (lowerMap.has(rawLower)) {
      return lowerMap.get(rawLower);
    }
    if (cleaned) {
      const cleanedLower = cleaned.toLowerCase();
      if (lowerMap.has(cleanedLower)) {
        return lowerMap.get(cleanedLower);
      }
    }
  }

  return null;
}

/**
 * Automatically tags words across all segments for a specific sub-tier using the given lexicon.
 *
 * @param {Object} params
 * @param {Array<Object>} params.segments - Current segments array
 * @param {Object} params.tier - Target word-level sub-tier { id, name, type, splitters, lexiconField }
 * @param {Object} params.lexicon - Active lexicon object { id, title, fields, entries }
 * @param {string} [params.targetFieldNameOrId] - Optional field override (defaults to tier.lexiconField)
 * @param {boolean} [params.overwrite=false] - Whether to overwrite existing tags or only fill empty ones
 * @param {boolean} [params.caseInsensitive=true] - Match case-insensitively
 * @param {boolean} [params.stripPunctuation=true] - Strip punctuation from word edges before lookup
 * @returns {{
 *   success: boolean,
 *   error?: string,
 *   targetField?: Object,
 *   updatedSegments: Array<Object>,
 *   stats: {
 *     totalWords: number,
 *     newlyTaggedCount: number,
 *     alreadyTaggedCount: number,
 *     unmatchedCount: number,
 *     modifiedSegmentsCount: number,
 *     totalSegmentsCount: number,
 *   }
 * }}
 */
export function autoTagSegments({
  segments,
  tier,
  lexicon,
  targetFieldNameOrId = null,
  overwrite = false,
  caseInsensitive = true,
  stripPunctuation = true,
}) {
  if (!Array.isArray(segments)) {
    return {
      success: false,
      error: 'Segments must be an array.',
      updatedSegments: [],
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: 0 },
    };
  }

  if (!tier) {
    return {
      success: false,
      error: 'A target sub-tier must be specified.',
      updatedSegments: segments,
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: segments.length },
    };
  }

  if (tier.type !== 'word' && tier.type !== 'morpheme') {
    return {
      success: false,
      error: `Sub-tier "${tier.name || tier.id}" is a sentence-level tier. Auto Tagging only applies to word/morpheme-level sub-tiers.`,
      updatedSegments: segments,
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: segments.length },
    };
  }

  if (!lexicon) {
    return {
      success: false,
      error: 'No active lexicon provided.',
      updatedSegments: segments,
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: segments.length },
    };
  }

  const fieldKey = targetFieldNameOrId || tier.lexiconField;
  if (!fieldKey) {
    return {
      success: false,
      error: `Sub-tier "${tier.name || tier.id}" does not have an active lexicon field configured. Specify a field (such as POS or Gloss) in Project Settings or in the Auto Tagging panel.`,
      updatedSegments: segments,
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: segments.length },
    };
  }

  const targetField = resolveLexiconField(lexicon, fieldKey);
  if (!targetField) {
    return {
      success: false,
      error: `Field "${fieldKey}" was not found in lexicon "${lexicon.title || lexicon.name || 'Untitled'}".`,
      updatedSegments: segments,
      stats: { totalWords: 0, newlyTaggedCount: 0, alreadyTaggedCount: 0, unmatchedCount: 0, modifiedSegmentsCount: 0, totalSegmentsCount: segments.length },
    };
  }

  const { exactMap, lowerMap } = buildLexiconLookupMap(lexicon, targetField);
  const tierKey = String(tier.id);

  let totalWords = 0;
  let newlyTaggedCount = 0;
  let alreadyTaggedCount = 0;
  let unmatchedCount = 0;
  let modifiedSegmentsCount = 0;

  const updatedSegments = segments.map((seg) => {
    const words = tokenizeWords(seg.text, tier.splitters);
    if (words.length === 0) return seg;

    totalWords += words.length;
    const existing = getWordAnnotations(seg, tier.id, words.length);
    const nextAnn = [...existing];
    let segChanged = false;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const curVal = nextAnn[i] != null ? String(nextAnn[i]).trim() : '';

      if (curVal && !overwrite) {
        alreadyTaggedCount++;
        continue;
      }

      const tag = lookupWordTag(w, exactMap, lowerMap, {
        caseInsensitive,
        stripPunctuation,
      });

      if (tag) {
        if (tag !== curVal) {
          nextAnn[i] = tag;
          segChanged = true;
        }
        newlyTaggedCount++;
      } else {
        unmatchedCount++;
      }
    }

    if (segChanged) {
      modifiedSegmentsCount++;
      return {
        ...seg,
        subTexts: {
          ...(seg.subTexts || {}),
          [tierKey]: nextAnn,
        },
      };
    }
    return seg;
  });

  return {
    success: true,
    targetField,
    updatedSegments,
    stats: {
      totalWords,
      newlyTaggedCount,
      alreadyTaggedCount,
      unmatchedCount,
      modifiedSegmentsCount,
      totalSegmentsCount: segments.length,
    },
  };
}

/**
 * Automatically tags words for a single segment.
 *
 * @param {Object} params
 * @returns {{ success: boolean, error?: string, updatedSegment: Object, stats: Object }}
 */
export function autoTagSingleSegment(params) {
  const { segment, ...rest } = params;
  if (!segment) {
    return { success: false, error: 'No segment provided', updatedSegment: null, stats: {} };
  }
  const result = autoTagSegments({
    ...rest,
    segments: [segment],
  });
  return {
    ...result,
    updatedSegment: result.updatedSegments?.[0] || segment,
  };
}

