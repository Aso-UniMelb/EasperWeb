/**
 * Sub-tier (dependent tier) configuration.
 *
 * A sub-tier mirrors ELAN's notion of a tier whose annotations hang off a parent
 * tier's annotations — the usual home for a free translation, a morphological
 * breakdown, or any other layer of analysis that lines up one-to-one with an
 * utterance. In Easper each project may define up to three of them; every segment
 * then carries one text value per sub-tier, keyed by the sub-tier's stable id.
 *
 * Easper supports two types of sub-tiers:
 * 1. Sentence-level ('sentence'): Simple text tier for full sentences (e.g. translation, notes).
 * 2. Word/Morpheme-level ('word'): Token-level annotations where for each word/morpheme
 *    in the transcription (split by whitespace, dashes, equal signs, or punctuation marks),
 *    there is an annotation space with lexicon auto-complete (e.g. POS tags, glossing, etymology).
 */

export const MAX_SUB_TIERS = 3;

export const SUB_TIER_TYPE_SENTENCE = 'sentence';
export const SUB_TIER_TYPE_WORD = 'word';

/** Suggestions offered in the project settings UI. */
export const SUB_TIER_PRESETS = [
  'Translation',
  'POS',
  'Morphology',
  'Gloss',
  'Notes',
  'Phonetic',
];

/** Standard Lexicon Presets for Word/Morpheme sub-tiers with descriptive labels. */
export const COMMON_POS_LEXICON = [
  { value: 'prop', label: 'Proper Name' },
  { value: 'n', label: 'Noun' },
  { value: 'v', label: 'Verb' },
  { value: 'adj', label: 'Adjective' },
  { value: 'adv', label: 'Adverb' },
  { value: 'pron', label: 'Pronoun' },
  { value: 'prep', label: 'Preposition' },
  { value: 'conj', label: 'Conjunction' },
  { value: 'art', label: 'Article' },
  { value: 'num', label: 'Numeral' },
  { value: 'interj', label: 'Interjection' },
  { value: 'h', label: 'Helping Verb' },
  { value: 'aux', label: 'Auxiliary' },
  { value: 'part', label: 'Particle' },
];

export const UNIVERSAL_POS_LEXICON = [
  { value: 'NOUN', label: 'Noun' },
  { value: 'VERB', label: 'Verb' },
  { value: 'ADJ', label: 'Adjective' },
  { value: 'ADV', label: 'Adverb' },
  { value: 'PRON', label: 'Pronoun' },
  { value: 'PROPN', label: 'Proper Noun' },
  { value: 'DET', label: 'Determiner' },
  { value: 'ADP', label: 'Adposition' },
  { value: 'NUM', label: 'Numeral' },
  { value: 'CCONJ', label: 'Coordinating Conjunction' },
  { value: 'SCONJ', label: 'Subordinating Conjunction' },
  { value: 'AUX', label: 'Auxiliary' },
  { value: 'INTJ', label: 'Interjection' },
  { value: 'PART', label: 'Particle' },
  { value: 'PUNCT', label: 'Punctuation' },
  { value: 'SYM', label: 'Symbol' },
  { value: 'X', label: 'Other' },
];

export const LEIPZIG_GLOSS_LEXICON = [
  { value: '1SG', label: '1st person singular' },
  { value: '2SG', label: '2nd person singular' },
  { value: '3SG', label: '3rd person singular' },
  { value: '1PL', label: '1st person plural' },
  { value: '2PL', label: '2nd person plural' },
  { value: '3PL', label: '3rd person plural' },
  { value: 'NOM', label: 'Nominative' },
  { value: 'ACC', label: 'Accusative' },
  { value: 'DAT', label: 'Dative' },
  { value: 'GEN', label: 'Genitive' },
  { value: 'INS', label: 'Instrumental' },
  { value: 'ABL', label: 'Ablative' },
  { value: 'LOC', label: 'Locative' },
  { value: 'VOC', label: 'Vocative' },
  { value: 'PAST', label: 'Past' },
  { value: 'PRES', label: 'Present' },
  { value: 'FUT', label: 'Future' },
  { value: 'PFV', label: 'Perfective' },
  { value: 'IPFV', label: 'Imperfective' },
  { value: 'PL', label: 'Plural' },
  { value: 'SG', label: 'Singular' },
  { value: 'DU', label: 'Dual' },
  { value: 'NEG', label: 'Negative' },
  { value: 'PASS', label: 'Passive' },
  { value: 'ACT', label: 'Active' },
  { value: 'CAUS', label: 'Causative' },
  { value: 'IND', label: 'Indicative' },
  { value: 'SBJV', label: 'Subjunctive' },
  { value: 'COND', label: 'Conditional' },
  { value: 'IMP', label: 'Imperative' },
  { value: 'INF', label: 'Infinitive' },
  { value: 'PTCP', label: 'Participle' },
];

/**
 * Formats a single lexicon item object { value, label } into string representation,
 * e.g. "prop {Proper Name}" or "n" if no label.
 *
 * @param {Object|string} item
 * @returns {string}
 */
export function formatLexiconItem(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  const val = String(item.value || '').trim();
  const lbl = String(item.label || '').trim();
  return lbl ? `${val} {${lbl}}` : val;
}

/**
 * Formats an array of lexicon items into a comma-separated string,
 * e.g. "prop {Proper Name}, n {Noun}, v {Verb}"
 *
 * @param {Array<Object|string>} list
 * @returns {string}
 */
export function formatLexicon(list) {
  if (!Array.isArray(list)) return '';
  return list.map(formatLexiconItem).filter(Boolean).join(', ');
}

/**
 * Parses raw input (string, array of strings, or array of objects) into a normalized
 * array of { value: string, label: string }.
 * Supports formats: "prop {Proper Name}", "prop (Proper Name)", "prop: Proper Name", or just "prop".
 *
 * @param {string|Array} input
 * @returns {Array<{ value: string, label: string }>}
 */
export function parseLexicon(input) {
  if (!input) return [];

  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    rawList = input.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
  }

  const seen = new Set();
  const result = [];

  for (const item of rawList) {
    if (!item) continue;
    let value = '';
    let label = '';

    if (typeof item === 'object') {
      value = String(item.value ?? item.tag ?? '').trim();
      label = String(item.label ?? item.desc ?? '').trim();
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      const mBrace = trimmed.match(/^([^{]+)\s*\{([^}]+)\}/);
      const mParen = trimmed.match(/^([^(\s]+)\s*\(([^)]+)\)/);
      const mColon = trimmed.match(/^([^:\s]+)\s*:\s*(.+)$/);

      if (mBrace) {
        value = mBrace[1].trim();
        label = mBrace[2].trim();
      } else if (mParen) {
        value = mParen[1].trim();
        label = mParen[2].trim();
      } else if (mColon) {
        value = mColon[1].trim();
        label = mColon[2].trim();
      } else {
        value = trimmed;
        label = '';
      }
    }

    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ value, label });
  }

  return result;
}

/**
 * Checks whether an annotation value is valid according to the given lexicon.
 * Returns true if valid or if no lexicon restrictions exist, or if the value is empty.
 * Returns false if the value is non-empty and not in the lexicon.
 *
 * @param {string|null|undefined} value
 * @param {Array<Object|string>|null|undefined} lexicon
 * @returns {boolean}
 */
export function isLexiconValueValid(value, lexicon) {
  if (!lexicon || lexicon.length === 0) return true;
  if (!value) return true;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return true;
  for (const item of lexicon) {
    const itemVal = (
      typeof item === 'object' && item !== null
        ? String(item.value ?? item.tag ?? '')
        : String(item)
    )
      .trim()
      .toLowerCase();
    if (itemVal === trimmed) return true;
  }
  return false;
}

export const DEFAULT_SPLITTERS = '- =';

/**
 * Builds a regex that splits text by whitespace and user-specified delimiter characters.
 * Whitespace is always matched as a splitter.
 *
 * @param {string} [splitters=DEFAULT_SPLITTERS]
 * @returns {RegExp}
 */
export function buildSplitterRegex(splitters = DEFAULT_SPLITTERS) {
  if (splitters == null) splitters = DEFAULT_SPLITTERS;
  const str = String(splitters);
  // Extract all unique non-whitespace characters
  const chars = Array.from(
    new Set(Array.from(str).filter((c) => !/\s/.test(c))),
  );
  if (chars.length === 0) {
    return /\s+/u;
  }
  const escaped = chars
    .map((c) =>
      c === '\\' || c === ']' || c === '-' || c === '^' ? `\\${c}` : c,
    )
    .join('');
  try {
    return new RegExp(`[\\s${escaped}]+`, 'u');
  } catch {
    return /\s+/u;
  }
}

/**
 * Default word/morpheme delimiter regex.
 */
export const WORD_DELIMITER_REGEX = buildSplitterRegex(DEFAULT_SPLITTERS);

/**
 * Splits text into words/morphemes.
 * Sequences are split by whitespace and any configured splitter characters.
 *
 * @param {string|null|undefined} text
 * @param {string} [splitters=DEFAULT_SPLITTERS]
 * @returns {Array<string>}
 */
export function tokenizeWords(text, splitters = DEFAULT_SPLITTERS) {
  if (!text) return [];
  const regex = buildSplitterRegex(splitters);
  return String(text)
    .split(regex)
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Coerces whatever is stored on a project into a clean, ordered sub-tier list.
 * Tolerates plain strings, missing ids, duplicates and over-long lists, because
 * project documents are long-lived and may predate this feature.
 *
 * @param {Array|undefined|null} raw
 * @param {Object} [options]
 * @param {boolean} [options.sort=true] Sort by id. Pass false when the caller has
 *   already arranged the list in the order it wants (e.g. the display order chosen
 *   in the legend, which decides tier order in the exported .eaf).
 * @returns {Array<{ id: number, name: string, type: 'sentence'|'word', lexicon: Array<{ value: string, label: string }> }>}
 */
export function normalizeSubTiers(raw, { sort = true } = {}) {
  if (!Array.isArray(raw)) return [];

  const out = [];
  const usedIds = new Set();

  for (const item of raw) {
    if (out.length >= MAX_SUB_TIERS) break;
    if (item == null) continue;

    const rawName = typeof item === 'string' ? item : item.name;
    const name = String(rawName ?? '').trim();

    let id = typeof item === 'object' ? Number(item.id) : NaN;
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > MAX_SUB_TIERS ||
      usedIds.has(id)
    ) {
      id = 1;
      while (id <= MAX_SUB_TIERS && usedIds.has(id)) id++;
      if (id > MAX_SUB_TIERS) break;
    }

    usedIds.add(id);

    const type =
      typeof item === 'object' &&
      (item.type === SUB_TIER_TYPE_WORD || item.type === 'morpheme')
        ? SUB_TIER_TYPE_WORD
        : SUB_TIER_TYPE_SENTENCE;

    let lexicon = [];
    if (typeof item === 'object') {
      lexicon = parseLexicon(item.lexicon);
    }

    const splitters =
      typeof item === 'object' && item.splitters != null
        ? String(item.splitters)
        : DEFAULT_SPLITTERS;

    out.push({
      id,
      name: name || `Sub-tier ${id}`,
      type,
      lexicon,
      splitters,
    });
  }

  return sort ? out.sort((a, b) => a.id - b.id) : out;
}

/**
 * Reads a segment's text for one sub-tier. Segments created before a sub-tier
 * existed simply have no entry, which reads as an empty string.
 * For word-level sub-tiers whose value is an array, returns a space-separated string.
 *
 * @param {Object} seg
 * @param {number|string} tierId
 * @returns {string}
 */
export function getSubText(seg, tierId) {
  if (!seg || !seg.subTexts) return '';
  const val = seg.subTexts[String(tierId)] ?? seg.subTexts[tierId];
  if (val == null) return '';
  if (Array.isArray(val)) {
    return val
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .join(' ');
  }
  return String(val);
}

/**
 * Retrieves the word-level annotations array for a segment and tier.
 * Returns an array with exactly `count` items (padded with empty strings if needed).
 *
 * @param {Object} seg
 * @param {number|string} tierId
 * @param {number} [count=0]
 * @returns {Array<string>}
 */
export function getWordAnnotations(seg, tierId, count = 0) {
  if (!seg || !seg.subTexts) return Array(count).fill('');
  const val = seg.subTexts[String(tierId)] ?? seg.subTexts[tierId];
  let arr = [];
  if (Array.isArray(val)) {
    arr = val.map((v) => (v == null ? '' : String(v)));
  } else if (typeof val === 'string' && val.trim()) {
    arr = val.trim().split(/\s+/);
  }
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(arr[i] != null ? arr[i] : '');
  }
  return result;
}

/**
 * Merges two sub-tier text maps ({ [tierId]: string | Array<string> }).
 * For sentence sub-tiers, concatenates matching sub-tiers with a space between non-empty strings.
 * For word sub-tiers, concatenates the annotation arrays.
 *
 * @param {Object} [subTextsA={}]
 * @param {Object} [subTextsB={}]
 * @returns {Object}
 */
export function mergeSubTexts(subTextsA = {}, subTextsB = {}) {
  const a = subTextsA || {};
  const b = subTextsB || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged = {};
  for (const key of keys) {
    const valA = a[key];
    const valB = b[key];
    if (Array.isArray(valA) || Array.isArray(valB)) {
      const arrA = Array.isArray(valA)
        ? valA
        : valA
          ? String(valA).trim().split(/\s+/)
          : [];
      const arrB = Array.isArray(valB)
        ? valB
        : valB
          ? String(valB).trim().split(/\s+/)
          : [];
      merged[key] = [...arrA, ...arrB];
    } else {
      const strA = (valA == null ? '' : String(valA)).trim();
      const strB = (valB == null ? '' : String(valB)).trim();
      if (strA && strB) {
        merged[key] = `${strA} ${strB}`;
      } else if (strA) {
        merged[key] = strA;
      } else if (strB) {
        merged[key] = strB;
      }
    }
  }
  return merged;
}

export const MAIN_COLUMN_KEY = 'main';
export const MAIN_COLUMN_NAME = 'Transcription';

/**
 * Resolves the text columns a segment row shows, in the order the user has arranged
 * them and with their visibility applied.
 *
 * @param {Array<{ id: number, name: string, type?: string, lexicon?: Array<string> }>} subTiers
 * @param {Object} [options]
 * @param {Array<string>} [options.columnOrder] Column keys in display order
 * @param {Array<string>} [options.hiddenColumns] Column keys currently collapsed
 * @returns {Array<{ key: string, name: string, isMain: boolean, type: 'sentence'|'word', lexicon: Array<string>, hidden: boolean }>}
 */
export function buildColumns(
  subTiers,
  { columnOrder = [], hiddenColumns = [] } = {},
) {
  const canonical = [
    {
      key: MAIN_COLUMN_KEY,
      name: MAIN_COLUMN_NAME,
      isMain: true,
      type: SUB_TIER_TYPE_SENTENCE,
      lexicon: [],
      splitters: DEFAULT_SPLITTERS,
    },
    ...normalizeSubTiers(subTiers).map((t) => ({
      key: String(t.id),
      name: t.name,
      type: t.type || SUB_TIER_TYPE_SENTENCE,
      lexicon: t.lexicon || [],
      splitters: t.splitters ?? DEFAULT_SPLITTERS,
      isMain: false,
    })),
  ];

  const byKey = new Map(canonical.map((c) => [c.key, c]));
  const hidden = new Set(
    (Array.isArray(hiddenColumns) ? hiddenColumns : []).map(String),
  );

  const ordered = [];
  const seen = new Set();
  for (const raw of Array.isArray(columnOrder) ? columnOrder : []) {
    const key = String(raw);
    if (byKey.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(byKey.get(key));
    }
  }
  for (const col of canonical) {
    if (!seen.has(col.key)) ordered.push(col);
  }

  return ordered.map((c) => ({ ...c, hidden: hidden.has(c.key) }));
}

/**
 * A segment's text for each of the given columns, in the same order.
 *
 * @param {Object} seg
 * @param {Array<{ key: string, isMain: boolean }>} columns
 * @returns {Array<string>}
 */
export function columnValues(seg, columns) {
  return (columns || []).map((c) =>
    c.isMain
      ? seg?.text == null
        ? ''
        : String(seg.text)
      : getSubText(seg, c.key),
  );
}

/**
 * All of a segment's text columns in canonical order: the main tier, then each
 * sub-tier by id. Used where no user arrangement applies.
 *
 * @param {Object} seg
 * @param {Array<{ id: number, name: string }>} subTiers
 * @returns {Array<string>}
 */
export function segmentColumns(seg, subTiers) {
  return columnValues(seg, buildColumns(subTiers));
}
