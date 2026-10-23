/**
 * Segment Text Validation Engine.
 * Detects formatting, tag, punctuation, acronym, and custom rule violations
 * within segment transcriptions and provides quick-fix suggestions.
 */

export const DEFAULT_ALLOWED_TAGS = [
  '<hes>',
  '<overlap>',
  '<cough>',
  '<laughter>',
  '<sigh>',
  '<gasp>',
  '<int>',
  '<unk>',
];

export const ACRONYM_MODES = {
  DISABLED: 'disabled',
  PLAIN: 'plain', // e.g. PNG
  UNDERSCORE: 'underscore', // e.g. P_N_G
  TRAILING: 'trailing', // e.g. P_N_G_
};

export const DEFAULT_VALIDATION_RULES = {
  validateTags: false,
  allowedTags: [...DEFAULT_ALLOWED_TAGS],
  fixApostropheBacktick: false,
  fixDoubleSpaces: false,
  validateAcronyms: false,
  acronymMode: ACRONYM_MODES.DISABLED,
  validateCustomRules: false,
  customRules: [],
};

/**
 * Normalizes a raw tag string into canonical `<tag>` form.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTagToken(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const inner = trimmed.replace(/^<+|\s+|>+$/g, '').trim();
  if (!inner) return '';
  return `<${inner}>`;
}

/**
 * Parses a comma- or whitespace-separated string of tags into an array of canonical `<tag>` strings.
 * @param {string|Array<string>} input
 * @returns {Array<string>}
 */
export function parseAllowedTags(input) {
  if (Array.isArray(input)) {
    const seen = new Set();
    const out = [];
    for (const item of input) {
      const norm = normalizeTagToken(item);
      if (norm && !seen.has(norm.toLowerCase())) {
        seen.add(norm.toLowerCase());
        out.push(norm);
      }
    }
    return out;
  }
  if (typeof input !== 'string' || !input.trim()) return [];
  const parts = input.split(/[\s,]+/);
  return parseAllowedTags(parts);
}

/**
 * Formats an array of allowed tags into a space-separated string for input editing.
 * @param {Array<string>} tags
 * @returns {string}
 */
export function formatAllowedTags(tags) {
  if (!Array.isArray(tags)) return '';
  return tags.map(normalizeTagToken).filter(Boolean).join(' ');
}

/**
 * Sanitizes and normalizes a project's validationRules configuration object.
 * @param {Object|null|undefined} raw
 * @returns {Object}
 */
export function normalizeValidationRules(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_VALIDATION_RULES,
      allowedTags: [...DEFAULT_ALLOWED_TAGS],
      customRules: [],
    };
  }

  const allowedTags = Array.isArray(raw.allowedTags)
    ? parseAllowedTags(raw.allowedTags)
    : [...DEFAULT_ALLOWED_TAGS];

  const validAcronymModes = new Set(Object.values(ACRONYM_MODES));
  const rawMode = validAcronymModes.has(raw.acronymMode)
    ? raw.acronymMode
    : ACRONYM_MODES.DISABLED;
  const validateAcronyms =
    raw.validateAcronyms !== undefined
      ? Boolean(raw.validateAcronyms)
      : rawMode !== ACRONYM_MODES.DISABLED;
  const acronymMode = validateAcronyms
    ? rawMode === ACRONYM_MODES.DISABLED
      ? ACRONYM_MODES.PLAIN
      : rawMode
    : ACRONYM_MODES.DISABLED;

  const customRules = Array.isArray(raw.customRules)
    ? raw.customRules
        .map((r, idx) => ({
          id: r?.id ? String(r.id) : `vrule_${idx + 1}`,
          find: String(r?.find || ''),
          replace: String(r?.replace ?? ''),
          isRegex: Boolean(r?.isRegex),
          matchCase: Boolean(r?.matchCase),
          enabled: r?.enabled !== undefined ? Boolean(r.enabled) : true,
        }))
        .filter((r) => r.find.trim().length > 0)
    : [];

  const validateCustomRules =
    raw.validateCustomRules !== undefined
      ? Boolean(raw.validateCustomRules)
      : customRules.length > 0;

  return {
    validateTags: Boolean(raw.validateTags),
    allowedTags,
    fixApostropheBacktick: Boolean(raw.fixApostropheBacktick),
    fixDoubleSpaces: Boolean(raw.fixDoubleSpaces),
    validateAcronyms,
    acronymMode,
    validateCustomRules,
    customRules,
  };
}

/**
 * Returns true if any validation rule or check is currently active in the config.
 * @param {Object|null|undefined} rules
 * @returns {boolean}
 */
export function isValidationActive(rules) {
  if (!rules || typeof rules !== 'object') return false;
  if (rules.validateTags) return true;
  if (rules.fixApostropheBacktick) return true;
  if (rules.fixDoubleSpaces) return true;
  if (
    rules.validateAcronyms !== false &&
    rules.acronymMode &&
    rules.acronymMode !== ACRONYM_MODES.DISABLED
  ) {
    return true;
  }
  if (
    rules.validateCustomRules !== false &&
    Array.isArray(rules.customRules) &&
    rules.customRules.some((r) => r && r.enabled !== false && r.find?.trim())
  ) {
    return true;
  }
  return false;
}

/**
 * Computes Levenshtein edit distance between two strings (case-insensitive).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function editDistance(a, b) {
  const s1 = String(a || '').toLowerCase();
  const s2 = String(b || '').toLowerCase();
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * Ranks allowed tags by similarity to a candidate inner tag name.
 * @param {string} candidateInner
 * @param {Array<string>} allowedTags
 * @returns {Array<{ tag: string, inner: string, distance: number }>}
 */
function rankAllowedTagMatches(candidateInner, allowedTags) {
  const cleanCandidate = String(candidateInner || '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toLowerCase();

  const entries = (allowedTags || []).map((t) => {
    const norm = normalizeTagToken(t);
    const inner = norm.slice(1, -1);
    const lowerInner = inner.toLowerCase();
    let dist = editDistance(cleanCandidate, lowerInner);

    // Boost prefix/substring matches (e.g. "over" -> "overlap", "coug" -> "cough")
    if (
      cleanCandidate &&
      cleanCandidate.length >= 2 &&
      (lowerInner.startsWith(cleanCandidate) ||
        cleanCandidate.startsWith(lowerInner))
    ) {
      dist = Math.min(dist, 1);
    }

    return { tag: norm, inner, lowerInner, distance: dist };
  });

  entries.sort((a, b) => a.distance - b.distance);
  return entries;
}

/**
 * Formats an array of acronym letters into the requested acronym styles.
 * @param {Array<string>} letters
 * @param {string} preferredMode
 * @returns {Array<string>}
 */
function buildAcronymSuggestions(letters, preferredMode) {
  const upperLetters = letters.map((c) => c.toUpperCase());
  const plain = upperLetters.join('');
  const underscore = upperLetters.join('_');
  const trailing = `${underscore}_`;

  if (preferredMode === ACRONYM_MODES.PLAIN) {
    return [plain, underscore, trailing];
  }
  if (preferredMode === ACRONYM_MODES.UNDERSCORE) {
    return [underscore, plain, trailing];
  }
  if (preferredMode === ACRONYM_MODES.TRAILING) {
    return [trailing, underscore, plain];
  }
  return [plain, underscore, trailing];
}

/**
 * Scans segment text against configured validation rules.
 * Returns sorted, non-overlapping validation issues and valid tag spans.
 *
 * @param {string} text
 * @param {Object} rawConfig
 * @returns {{
 *   issues: Array<{
 *     start: number,
 *     end: number,
 *     text: string,
 *     type: string,
 *     label: string,
 *     suggestions: Array<string>
 *   }>,
 *   validTagRanges: Array<{ start: number, end: number }>
 * }}
 */
export function validateSegmentText(text, rawConfig) {
  if (!text || typeof text !== 'string') {
    return { issues: [], validTagRanges: [] };
  }

  const config = normalizeValidationRules(rawConfig);
  const issues = [];
  const validTagRanges = [];

  const isRangeOccupied = (start, end) =>
    issues.some((iss) => Math.max(iss.start, start) < Math.min(iss.end, end)) ||
    validTagRanges.some(
      (vr) => Math.max(vr.start, start) < Math.min(vr.end, end),
    );

  const allowedTags = config.allowedTags;
  const exactAllowedSet = new Set(allowedTags);

  // Even when tag validation is off, recognize exact allowed tags so spellcheck skips them
  if (!config.validateTags && allowedTags.length > 0) {
    const exactTagRegex = /<[^<>\s]+>/g;
    let m;
    while ((m = exactTagRegex.exec(text)) !== null) {
      if (exactAllowedSet.has(m[0])) {
        validTagRanges.push({ start: m.index, end: m.index + m[0].length });
      }
    }
  }

  // 1. Markup Tag Validation (<hes>, < hes>, <  overlap  >, <Cough >, hes>, <hes)
  if (config.validateTags) {
    // 1a. Complete angle-bracketed spans: <...>
    const fullTagRegex = /<[^<>]*>/g;
    let match;
    while ((match = fullTagRegex.exec(text)) !== null) {
      const fullText = match[0];
      const start = match.index;
      const end = start + fullText.length;

      if (exactAllowedSet.has(fullText)) {
        validTagRanges.push({ start, end });
        continue;
      }

      const rawInner = fullText.slice(1, -1);
      const trimmedInner = rawInner.trim();

      if (!trimmedInner) {
        issues.push({
          start,
          end,
          text: fullText,
          type: 'tag',
          label: 'Empty tag brackets',
          suggestions: allowedTags.slice(0, 4),
        });
        continue;
      }

      const ranked = rankAllowedTagMatches(trimmedInner, allowedTags);
      const best = ranked[0];

      // Determine label reason
      let label = 'Invalid paralinguistic tag';
      if (
        best &&
        best.lowerInner === trimmedInner.toLowerCase() &&
        rawInner !== trimmedInner
      ) {
        label = 'Extra spaces in tag';
      } else if (
        best &&
        best.lowerInner === trimmedInner.toLowerCase() &&
        best.inner !== trimmedInner
      ) {
        label = 'Tag case mismatch';
      } else if (best && best.distance <= 2) {
        label = 'Misspelled paralinguistic tag';
      } else {
        label = 'Unrecognized paralinguistic tag';
      }

      const closeSuggestions = ranked
        .filter((r) => r.distance <= 3)
        .map((r) => r.tag);
      const suggestions =
        closeSuggestions.length > 0
          ? closeSuggestions.slice(0, 5)
          : allowedTags.slice(0, 5);

      issues.push({
        start,
        end,
        text: fullText,
        type: 'tag',
        label,
        suggestions,
      });
    }

    // 1b. Broken tags missing opening `<`: e.g., `hes>`, `overlap >`
    const missingOpenRegex = /(?:^|(?<=[\s.,!?;:()[\]"']))([A-Za-z_][A-Za-z0-9_]*\s*>)/g;
    while ((match = missingOpenRegex.exec(text)) !== null) {
      const fullText = match[1];
      const start = match.index;
      const end = start + fullText.length;
      if (isRangeOccupied(start, end)) continue;

      const inner = fullText.replace(/>$/, '').trim();
      const ranked = rankAllowedTagMatches(inner, allowedTags);
      const closeSuggestions = ranked
        .filter((r) => r.distance <= 3)
        .map((r) => r.tag);
      const suggestions =
        closeSuggestions.length > 0
          ? closeSuggestions.slice(0, 5)
          : [`<${inner.toLowerCase()}>`, ...allowedTags.slice(0, 4)];

      issues.push({
        start,
        end,
        text: fullText,
        type: 'tag',
        label: 'Missing opening "<" in tag',
        suggestions,
      });
    }

    // 1c. Broken tags missing closing `>`: e.g., `<hes`, `< overlap`
    const missingCloseRegex = /(<\s*[A-Za-z_][A-Za-z0-9_]*)(?=$|[\s.,!?;:()[\]"'])/g;
    while ((match = missingCloseRegex.exec(text)) !== null) {
      const fullText = match[1];
      const start = match.index;
      const end = start + fullText.length;
      if (isRangeOccupied(start, end)) continue;

      const inner = fullText.replace(/^</, '').trim();
      const ranked = rankAllowedTagMatches(inner, allowedTags);
      const closeSuggestions = ranked
        .filter((r) => r.distance <= 3)
        .map((r) => r.tag);
      const suggestions =
        closeSuggestions.length > 0
          ? closeSuggestions.slice(0, 5)
          : [`<${inner.toLowerCase()}>`, ...allowedTags.slice(0, 4)];

      issues.push({
        start,
        end,
        text: fullText,
        type: 'tag',
        label: 'Missing closing ">" in tag',
        suggestions,
      });
    }
  }

  // 2. Invalid Apostrophe / Backtick (` instead of ')
  if (config.fixApostropheBacktick) {
    // Match either a word containing ` or ´ (e.g. don`t) or a standalone ` / ´
    const backtickWordOrCharRegex =
      /[\p{L}\p{N}']*`[\p{L}\p{N}`']*|\b[\p{L}\p{N}']*´[\p{L}\p{N}´']*|[`´]/gu;
    let match;
    while ((match = backtickWordOrCharRegex.exec(text)) !== null) {
      const fullText = match[0];
      const start = match.index;
      const end = start + fullText.length;
      if (isRangeOccupied(start, end)) continue;

      const fixed = fullText.replace(/[`´]/g, "'");
      issues.push({
        start,
        end,
        text: fullText,
        type: 'punctuation',
        label: "Invalid apostrophe (` instead of ')",
        suggestions: [fixed],
      });
    }
  }

  // 3. Multiple consecutive spaces
  if (config.fixDoubleSpaces) {
    const multiSpaceRegex = / {2,}/g;
    let match;
    while ((match = multiSpaceRegex.exec(text)) !== null) {
      const fullText = match[0];
      const start = match.index;
      const end = start + fullText.length;
      if (isRangeOccupied(start, end)) continue;

      issues.push({
        start,
        end,
        text: fullText,
        type: 'punctuation',
        label: 'Multiple consecutive spaces',
        suggestions: [' '],
      });
    }
  }

  // 4. Acronym Convention Validation (e.g. P_N_G_ vs P_N_G vs PNG)
  if (config.acronymMode && config.acronymMode !== ACRONYM_MODES.DISABLED) {
    const mode = config.acronymMode;

    // 4a. Underscore-separated acronyms (with or without trailing underscore): P_N_G_ or P_N_G
    const underscoredAcronymRegex =
      /(?<![\p{L}\p{N}_])([A-Za-z])(?:_([A-Za-z]))+(_)?(?![\p{L}\p{N}_])/gu;
    let match;
    while ((match = underscoredAcronymRegex.exec(text)) !== null) {
      const fullText = match[0];
      const start = match.index;
      const end = start + fullText.length;
      if (isRangeOccupied(start, end)) continue;

      const letters = fullText
        .replace(/_+$/g, '')
        .split('_')
        .filter(Boolean);
      if (letters.length < 2) continue;

      const allSuggestions = buildAcronymSuggestions(letters, mode);
      const canonical = allSuggestions[0];

      if (fullText !== canonical) {
        issues.push({
          start,
          end,
          text: fullText,
          type: 'acronym',
          label: `Acronym format (expected ${canonical})`,
          suggestions: allSuggestions.filter((s) => s !== fullText),
        });
      }
    }

    // 4b. Contiguous uppercase acronyms (2 to 6 capital letters, e.g. PNG, USA) when mode expects underscores
    if (
      mode === ACRONYM_MODES.UNDERSCORE ||
      mode === ACRONYM_MODES.TRAILING
    ) {
      const plainAcronymRegex = /(?<![\p{L}\p{N}_])([A-Z]{2,6})(?![\p{L}\p{N}_])/gu;
      while ((match = plainAcronymRegex.exec(text)) !== null) {
        const fullText = match[1];
        const start = match.index;
        const end = start + fullText.length;
        if (isRangeOccupied(start, end)) continue;

        const letters = Array.from(fullText);
        const allSuggestions = buildAcronymSuggestions(letters, mode);
        const canonical = allSuggestions[0];

        if (fullText !== canonical) {
          issues.push({
            start,
            end,
            text: fullText,
            type: 'acronym',
            label: `Acronym format (expected ${canonical})`,
            suggestions: allSuggestions.filter((s) => s !== fullText),
          });
        }
      }
    }
  }

  // 5. Custom Rules (Find -> Suggest)
  if (config.validateCustomRules) {
    for (const rule of config.customRules) {
      if (!rule || rule.enabled === false || !rule.find) continue;
      let regex;
      try {
        const flags = rule.matchCase ? 'gu' : 'giu';
        const pat = rule.isRegex
          ? rule.find
          : rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pat, flags);
      } catch {
        continue;
      }

      let match;
      while ((match = regex.exec(text)) !== null) {
        const fullText = match[0];
        if (!fullText) {
          regex.lastIndex++;
          continue;
        }
        const start = match.index;
        const end = start + fullText.length;
        if (isRangeOccupied(start, end)) continue;

        const replacement = rule.isRegex
          ? fullText.replace(
              new RegExp(rule.find, rule.matchCase ? 'u' : 'iu'),
              rule.replace ?? '',
            )
          : (rule.replace ?? '');

        if (replacement === fullText) continue;

        issues.push({
          start,
          end,
          text: fullText,
          type: 'custom',
          label:
            replacement === ''
              ? `Disallowed pattern "${fullText}"`
              : `Replace "${fullText}" → "${replacement}"`,
          suggestions: [replacement],
        });
      }
    }
  }

  issues.sort((a, b) => a.start - b.start);
  validTagRanges.sort((a, b) => a.start - b.start);

  return { issues, validTagRanges };
}

/**
 * Finds a validation issue at or adjacent to a caret offset in the textarea.
 * @param {Array<Object>} issues
 * @param {number} offset
 * @returns {Object|null}
 */
export function getValidationIssueAtOffset(issues, offset) {
  if (!Array.isArray(issues) || issues.length === 0 || offset == null) {
    return null;
  }
  for (const iss of issues) {
    if (offset >= iss.start && offset <= iss.end) {
      return iss;
    }
  }
  return null;
}

