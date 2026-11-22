/**
 * Word & Tag List Extraction and TSV Export Engine.
 * Extracts unique (token, sub-tier tags...) combinations, frequencies,
 * inconsistency flags, lexicon presence, and segment occurrences across a project.
 */

import {
  normalizeSubTiers,
  tokenizeWords,
  getWordAnnotations,
  SUB_TIER_TYPE_WORD,
  DEFAULT_SPLITTERS,
} from './subTiers.js';
import { isNoteTierSegment } from './speakers.js';
import { getEntryFieldValue } from './lexiconTsv.js';

const EDGE_PUNCTUATION_REGEX =
  /^[.,!?;:"“”‘’«»()[\]{}/\\|]+|[.,!?;:"“”‘’«»()[\]{}/\\|]+$/gu;

/**
 * Cleans a raw token according to punctuation and tag-ignoring preferences.
 * Returns null if the token should be skipped (e.g. paralinguistic <tag> or (())).
 *
 * @param {string} rawWord
 * @param {boolean} ignorePunctuationAndTags
 * @returns {string|null}
 */
export function normalizeDisplayToken(rawWord, ignorePunctuationAndTags = true) {
  if (!rawWord) return null;
  let str = String(rawWord).trim();
  if (!str) return null;

  if (ignorePunctuationAndTags) {
    // Skip angle-bracket paralinguistic tags (<hes>, <overlap>, <no-speech>...) and (())
    if (/^<[^<>]+>$/.test(str) || /^\(\(.*\)\)$/.test(str)) {
      return null;
    }
    str = str.replace(EDGE_PUNCTUATION_REGEX, '').trim();
    if (!str) return null;
    // Re-check in case punctuation surrounded a tag like "<hes>,"
    if (/^<[^<>]+>$/.test(str) || /^\(\(.*\)\)$/.test(str)) {
      return null;
    }
  }

  return str;
}

/**
 * Builds a lowercase lookup Set of all existing Headwords in the given lexicon.
 *
 * @param {Object|null} lexicon
 * @returns {Set<string>|null}
 */
export function buildLexiconHeadwordSet(lexicon) {
  if (!lexicon || !Array.isArray(lexicon.entries)) return null;
  const headwordField = (lexicon.fields || []).find(
    (f) => (f.name || '').trim().toLowerCase() === 'headword',
  );
  if (!headwordField) return null;

  const set = new Set();
  for (const entry of lexicon.entries) {
    const hw = getEntryFieldValue(entry, headwordField).trim().toLowerCase();
    if (hw) set.add(hw);
  }
  return set;
}

/**
 * Extracts delimiter groups for tokenised ('word') sub-tiers so sub-tiers sharing
 * the same Token Delimiter are displayed side-by-side as columns.
 *
 * @param {Array<Object>} subTiers
 * @returns {Array<{ key: string, splitters: string, label: string, tiers: Array<Object> }>}
 */
export function getTokenisedTierGroups(subTiers) {
  const clean = normalizeSubTiers(subTiers, { sort: false });
  const wordTiers = clean.filter((t) => t.type === SUB_TIER_TYPE_WORD);
  if (wordTiers.length === 0) return [];

  const groupsMap = new Map();
  for (const tier of wordTiers) {
    const splitters =
      tier.splitters != null ? String(tier.splitters) : DEFAULT_SPLITTERS;
    const normKey = splitters.trim().split(/\s+/u).filter(Boolean).sort().join(' ');
    if (!groupsMap.has(normKey)) {
      groupsMap.set(normKey, {
        key: normKey || '__space__',
        splitters,
        tiers: [],
      });
    }
    groupsMap.get(normKey).tiers.push(tier);
  }

  return Array.from(groupsMap.values()).map((g) => ({
    ...g,
    label: g.tiers.map((t) => t.name).join(' + '),
  }));
}

/**
 * Scans project segments and builds the aggregated Word & Tag List.
 *
 * @param {Object} options
 * @param {Array<Object>} options.segments
 * @param {Array<Object>} [options.subTiers=[]]
 * @param {Array<Object>} [options.speakers=[]]
 * @param {Object|null} [options.lexicon=null]
 * @param {boolean} [options.caseInsensitive=true]
 * @param {boolean} [options.ignorePunctuationAndTags=true]
 * @param {string|null} [options.selectedGroupKey=null]
 * @returns {{
 *   rows: Array<{
 *     id: string,
 *     token: string,
 *     tokenKey: string,
 *     tags: Object<string, string>,
 *     frequency: number,
 *     occurrences: Array<{
 *       segmentId: string|number,
 *       segmentIndex: number,
 *       wordIndex: number,
 *       rawWord: string,
 *       charOffset: number,
 *       charLength: number,
 *       start: number,
 *       end: number,
 *       speaker: string,
 *       speakerId: number
 *     }>,
 *     hasUntagged: boolean,
 *     isMultiTag: boolean,
 *     variantCount: number,
 *     inLexicon: boolean
 *   }>,
 *   activeWordTiers: Array<Object>,
 *   delimiterGroups: Array<Object>,
 *   activeGroupKey: string|null,
 *   totalTokensCount: number,
 *   uniqueFormsCount: number,
 *   multiTagRowsCount: number,
 *   untaggedRowsCount: number,
 *   notInLexiconRowsCount: number
 * }}
 */
export function extractWordTagList({
  segments = [],
  subTiers = [],
  speakers = [],
  lexicon = null,
  caseInsensitive = true,
  ignorePunctuationAndTags = true,
  selectedGroupKey = null,
} = {}) {
  const delimiterGroups = getTokenisedTierGroups(subTiers);
  let activeGroup = null;
  if (delimiterGroups.length > 0) {
    activeGroup =
      delimiterGroups.find((g) => g.key === selectedGroupKey) ||
      delimiterGroups[0];
  }

  const activeWordTiers = activeGroup ? activeGroup.tiers : [];
  const activeSplitters = activeGroup ? activeGroup.splitters : '';
  const lexiconHeadwords = buildLexiconHeadwordSet(lexicon);

  const rowMap = new Map(); // compositeKey -> row builder
  const tokenVariantsMap = new Map(); // tokenKey -> Set<tagSignature>
  let totalTokensCount = 0;

  if (Array.isArray(segments)) {
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const seg = segments[segIdx];
      if (!seg || !seg.text || isNoteTierSegment(seg, speakers)) continue;

      const mainText = String(seg.text);
      if (!mainText.trim()) continue;

      // Tokenize using active tokenised sub-tier splitters, or plain whitespace when none exist
      const rawWords = activeGroup
        ? tokenizeWords(mainText, activeSplitters)
        : tokenizeWords(mainText, '');

      if (rawWords.length === 0) continue;

      // Retrieve aligned annotations for each active tokenised sub-tier
      const tierAnnotations = {};
      for (const tier of activeWordTiers) {
        tierAnnotations[tier.id] = getWordAnnotations(
          seg,
          tier.id,
          rawWords.length,
        );
      }

      // Track approximate character offsets in mainText so clicking a row can highlight in main textarea when no sub-tiers exist
      let searchFrom = 0;

      for (let wIdx = 0; wIdx < rawWords.length; wIdx++) {
        const rawWord = rawWords[wIdx];
        const foundAt = mainText.indexOf(rawWord, searchFrom);
        const charOffset = foundAt >= 0 ? foundAt : searchFrom;
        if (foundAt >= 0) {
          searchFrom = foundAt + rawWord.length;
        }

        const cleanedWord = normalizeDisplayToken(
          rawWord,
          ignorePunctuationAndTags,
        );
        if (!cleanedWord) continue;

        const tokenKey = caseInsensitive
          ? cleanedWord.toLowerCase()
          : cleanedWord;
        const displayToken = caseInsensitive
          ? cleanedWord.toLowerCase()
          : cleanedWord;

        const tagsObj = {};
        const tagSigParts = [];
        let hasUntagged = false;

        for (const tier of activeWordTiers) {
          const rawTag = String(tierAnnotations[tier.id]?.[wIdx] ?? '').trim();
          tagsObj[String(tier.id)] = rawTag;
          tagSigParts.push(caseInsensitive ? rawTag.toLowerCase() : rawTag);
          if (!rawTag) {
            hasUntagged = true;
          }
        }

        const tagSignature = tagSigParts.join('\u0001');
        const compositeKey = `${tokenKey}\u0000${tagSignature}`;

        if (!tokenVariantsMap.has(tokenKey)) {
          tokenVariantsMap.set(tokenKey, new Set());
        }
        tokenVariantsMap.get(tokenKey).add(tagSignature);

        let row = rowMap.get(compositeKey);
        if (!row) {
          const inLexicon = lexiconHeadwords
            ? lexiconHeadwords.has(cleanedWord.toLowerCase())
            : false;
          row = {
            id: compositeKey,
            token: displayToken,
            tokenKey,
            tags: tagsObj,
            frequency: 0,
            occurrences: [],
            hasUntagged,
            isMultiTag: false,
            variantCount: 1,
            inLexicon,
          };
          rowMap.set(compositeKey, row);
        }

        row.frequency++;
        totalTokensCount++;
        row.occurrences.push({
          segmentId: seg.id,
          segmentIndex: segIdx + 1,
          wordIndex: wIdx,
          rawWord,
          charOffset,
          charLength: rawWord.length,
          start: seg.start ?? 0,
          end: seg.end ?? (seg.start ?? 0) + 1,
          speaker: seg.speaker || `Speaker ${seg.speakerId || 1}`,
          speakerId: Number(seg.speakerId) || 1,
        });
      }
    }
  }

  const rows = Array.from(rowMap.values());
  let multiTagRowsCount = 0;
  let untaggedRowsCount = 0;
  let notInLexiconRowsCount = 0;

  for (const row of rows) {
    const variants = tokenVariantsMap.get(row.tokenKey);
    const variantCount = variants ? variants.size : 1;
    row.variantCount = variantCount;
    row.isMultiTag = activeWordTiers.length > 0 && variantCount > 1;

    if (row.isMultiTag) multiTagRowsCount++;
    if (row.hasUntagged) untaggedRowsCount++;
    if (!row.inLexicon) notInLexiconRowsCount++;
  }

  return {
    rows,
    activeWordTiers,
    delimiterGroups,
    activeGroupKey: activeGroup ? activeGroup.key : null,
    totalTokensCount,
    uniqueFormsCount: tokenVariantsMap.size,
    multiTagRowsCount,
    untaggedRowsCount,
    notInLexiconRowsCount,
  };
}

/**
 * Formats extracted Word & Tag List rows into a TSV string.
 *
 * @param {Array<Object>} rows
 * @param {Array<Object>} [activeWordTiers=[]]
 * @returns {string}
 */
export function buildWordTagTsv(rows, activeWordTiers = []) {
  const sanitizeCell = (val) =>
    String(val ?? '')
      .replace(/[\t\r\n]+/g, ' ')
      .trim();

  const headers = [
    'Token',
    ...activeWordTiers.map((t) => sanitizeCell(t.name)),
    'Frequency',
  ];

  const lines = [headers.join('\t')];
  for (const row of rows || []) {
    const cols = [
      sanitizeCell(row.token),
      ...activeWordTiers.map((t) => sanitizeCell(row.tags?.[String(t.id)] ?? '')),
      String(row.frequency ?? 0),
    ];
    lines.push(cols.join('\t'));
  }

  return lines.join('\n');
}
