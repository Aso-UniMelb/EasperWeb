/**
 * Sub-tier (dependent tier) configuration.
 *
 * A sub-tier mirrors ELAN's notion of a tier whose annotations hang off a parent
 * tier's annotations — the usual home for a free translation, a morphological
 * breakdown, or any other layer of analysis that lines up one-to-one with an
 * utterance. In Easper each project may define up to three of them; every segment
 * then carries one text value per sub-tier, keyed by the sub-tier's stable id.
 */

export const MAX_SUB_TIERS = 3;

/** Suggestions offered in the project settings UI. */
export const SUB_TIER_PRESETS = [
  'Translation',
  'Morphology',
  'Gloss',
  'Notes',
  'Phonetic',
];

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
 * @returns {Array<{ id: number, name: string }>}
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
    out.push({ id, name: name || `Sub-tier ${id}` });
  }

  return sort ? out.sort((a, b) => a.id - b.id) : out;
}

/**
 * Reads a segment's text for one sub-tier. Segments created before a sub-tier
 * existed simply have no entry, which reads as an empty string.
 *
 * @param {Object} seg
 * @param {number|string} tierId
 * @returns {string}
 */
export function getSubText(seg, tierId) {
  if (!seg || !seg.subTexts) return '';
  const val = seg.subTexts[String(tierId)] ?? seg.subTexts[tierId];
  return val == null ? '' : String(val);
}

/**
 * Merges two sub-tier text maps ({ [tierId]: string }), concatenating matching
 * sub-tiers with a space between non-empty strings.
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
    const valA = (a[key] == null ? '' : String(a[key])).trim();
    const valB = (b[key] == null ? '' : String(b[key])).trim();
    if (valA && valB) {
      merged[key] = `${valA} ${valB}`;
    } else if (valA) {
      merged[key] = valA;
    } else if (valB) {
      merged[key] = valB;
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
 * Order and visibility live on the project rather than in component state so that
 * they survive a reload and stay consistent between the segment rows, the legend and
 * the exports. Both are stored as plain key lists, which keeps them valid when a
 * sub-tier is later added or removed: unknown keys are ignored and newly added tiers
 * fall in at the end rather than blocking the whole arrangement.
 *
 * @param {Array<{ id: number, name: string }>} subTiers
 * @param {Object} [options]
 * @param {Array<string>} [options.columnOrder] Column keys in display order
 * @param {Array<string>} [options.hiddenColumns] Column keys currently collapsed
 * @returns {Array<{ key: string, name: string, isMain: boolean, hidden: boolean }>}
 */
export function buildColumns(
  subTiers,
  { columnOrder = [], hiddenColumns = [] } = {},
) {
  const canonical = [
    { key: MAIN_COLUMN_KEY, name: MAIN_COLUMN_NAME, isMain: true },
    ...normalizeSubTiers(subTiers).map((t) => ({
      key: String(t.id),
      name: t.name,
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
