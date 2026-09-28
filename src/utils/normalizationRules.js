/**
 * Utilities for loading and applying Find & Replace normalization rules (.tsv / .txt).
 */

/**
 * Parses a TSV or TXT file content into regex replacement rules.
 * Format per line:
 * `find_pattern \t replace_with`
 * or
 * `find_pattern` (replaces with empty string "")
 *
 * @param {string} text - Raw string content of the rules file
 * @returns {Array<{ pattern: RegExp, rawPattern: string, replacement: string }>}
 */
export function parseNormalizationRules(text) {
  const rules = [];
  if (!text || typeof text !== 'string') return rules;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = lines[i].split('\t');
    const findWhat = parts[0]?.trim();
    if (!findWhat) continue;

    // Skip header line if present
    if (
      i === 0 &&
      (findWhat.toLowerCase() === 'find' ||
        findWhat.toLowerCase() === 'pattern' ||
        findWhat.toLowerCase() === 'find string' ||
        findWhat.toLowerCase() === 'find_pattern')
    ) {
      continue;
    }

    const replaceWith = parts.length >= 2 ? parts[1] : '';
    let isRegex = false;
    if (parts.length >= 3) {
      const val = parts[2]?.trim().toLowerCase();
      isRegex = val === 'true' || val === '1' || val === 'regex' || val === 'yes';
    } else {
      // Default: if pattern looks like regex or exact text, allow regex unless specified
      isRegex = true;
    }

    try {
      const rawPattern = isRegex
        ? findWhat
        : findWhat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(rawPattern, 'g');
      rules.push({ pattern: regex, rawPattern, replacement: replaceWith, isRegex });
    } catch (err) {
      console.warn(`[Normalization] Invalid pattern on line ${i + 1}: "${findWhat}"`, err);
    }
  }

  return rules;
}

/**
 * Applies a list of replacement rules to a text string.
 *
 * @param {string} text
 * @param {Array<{ pattern: RegExp, replacement: string }>} rules
 * @returns {string} Normalized text
 */
export function applyNormalizationRules(text, rules) {
  if (!text || !rules || rules.length === 0) return text || '';
  let result = text;
  for (const rule of rules) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

