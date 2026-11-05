import { describe, it, expect } from 'bun:test';
import {
  ACRONYM_MODES,
  DEFAULT_ALLOWED_TAGS,
  normalizeValidationRules,
  isValidationActive,
  validateSegmentText,
  getValidationIssueAtOffset,
  parseAllowedTags,
  scanAllSegmentsValidation,
  applyBatchValidationFix,
} from '../src/utils/segmentValidator.js';

describe('segmentValidator', () => {
  it('normalizes default validation rules with all checks off by default', () => {
    const config = normalizeValidationRules(null);
    expect(config.validateTags).toBe(false);
    expect(config.fixApostropheBacktick).toBe(false);
    expect(config.acronymMode).toBe(ACRONYM_MODES.DISABLED);
    expect(config.allowedTags).toEqual(DEFAULT_ALLOWED_TAGS);
    expect(isValidationActive(config)).toBe(false);
  });

  it('parses allowed tags from space or comma separated strings', () => {
    const tags = parseAllowedTags('hes, <overlap>  cough ');
    expect(tags).toEqual(['<hes>', '<overlap>', '<cough>']);
  });

  it('detects malformed markup tags with spaces, wrong case, misspellings, and missing brackets', () => {
    const rules = normalizeValidationRules({
      validateTags: true,
      allowedTags: ['<hes>', '<overlap>', '<cough>'],
    });

    const text =
      'Hello < hes> world <  overlap  > and <Cough > or hes> and <ovrlap> with valid <hes>';
    const { issues, validTagRanges } = validateSegmentText(text, rules);

    // Valid <hes> at the end should be in validTagRanges and NOT in issues
    expect(validTagRanges.length).toBe(1);
    expect(text.slice(validTagRanges[0].start, validTagRanges[0].end)).toBe(
      '<hes>',
    );

    const flaggedTexts = issues.map((i) => i.text);
    expect(flaggedTexts).toEqual([
      '< hes>',
      '<  overlap  >',
      '<Cough >',
      'hes>',
      '<ovrlap>',
    ]);

    expect(issues[0].suggestions[0]).toBe('<hes>');
    expect(issues[1].suggestions[0]).toBe('<overlap>');
    expect(issues[2].suggestions[0]).toBe('<cough>');
    expect(issues[3].suggestions[0]).toBe('<hes>');
    expect(issues[4].suggestions[0]).toBe('<overlap>');
  });

  it('detects invalid backtick apostrophe (` instead of \')', () => {
    const rules = normalizeValidationRules({
      fixApostropheBacktick: true,
    });

    const text = 'I don`t know `bout that';
    const { issues } = validateSegmentText(text, rules);

    expect(issues.length).toBe(2);
    expect(issues[0].text).toBe('don`t');
    expect(issues[0].suggestions).toEqual(["don't"]);
    expect(issues[1].text).toBe('`bout');
    expect(issues[1].suggestions).toEqual(["'bout"]);
  });

  it('detects acronym variations according to project acronymMode', () => {
    // 1. Plain mode (PNG)
    const plainRules = normalizeValidationRules({
      acronymMode: ACRONYM_MODES.PLAIN,
    });
    const resPlain = validateSegmentText(
      'From P_N_G_ to P_N_G and PNG',
      plainRules,
    );
    expect(resPlain.issues.map((i) => i.text)).toEqual(['P_N_G_', 'P_N_G']);
    expect(resPlain.issues[0].suggestions[0]).toBe('PNG');
    expect(resPlain.issues[1].suggestions[0]).toBe('PNG');

    // 2. Underscore mode (P_N_G)
    const underRules = normalizeValidationRules({
      acronymMode: ACRONYM_MODES.UNDERSCORE,
    });
    const resUnder = validateSegmentText(
      'From P_N_G_ to P_N_G and PNG',
      underRules,
    );
    expect(resUnder.issues.map((i) => i.text)).toEqual(['P_N_G_', 'PNG']);
    expect(resUnder.issues[0].suggestions[0]).toBe('P_N_G');
    expect(resUnder.issues[1].suggestions[0]).toBe('P_N_G');

    // 3. Trailing underscore mode (P_N_G_)
    const trailRules = normalizeValidationRules({
      acronymMode: ACRONYM_MODES.TRAILING,
    });
    const resTrail = validateSegmentText(
      'From P_N_G_ to P_N_G and PNG',
      trailRules,
    );
    expect(resTrail.issues.map((i) => i.text)).toEqual(['P_N_G', 'PNG']);
    expect(resTrail.issues[0].suggestions[0]).toBe('P_N_G_');
    expect(resTrail.issues[1].suggestions[0]).toBe('P_N_G_');
  });

  it('supports custom find -> replace validation rules and offset lookup', () => {
    const rules = normalizeValidationRules({
      customRules: [
        { id: '1', find: 'gonna', replace: 'going to', isRegex: false },
      ],
    });

    const text = 'We are gonna test this';
    const { issues } = validateSegmentText(text, rules);
    expect(issues.length).toBe(1);
    expect(issues[0].text).toBe('gonna');
    expect(issues[0].suggestions).toEqual(['going to']);

    const found = getValidationIssueAtOffset(issues, 9);
    expect(found).not.toBeNull();
    expect(found.text).toBe('gonna');
  });

  it('scans all segments in batch and returns aggregated summary', () => {
    const rules = normalizeValidationRules({
      validateTags: true,
      allowedTags: ['<hes>', '<cough>'],
      fixApostropheBacktick: true,
      fixDoubleSpaces: true,
    });

    const segments = [
      { id: 'seg-1', text: 'Hello  world <hes', start: 0, end: 2 },
      { id: 'seg-2', text: 'Clean segment here', start: 2, end: 4 },
      { id: 'seg-3', text: "It`s okay   now", start: 4, end: 6 },
    ];

    const summary = scanAllSegmentsValidation(segments, rules);
    expect(summary.totalIssues).toBe(4); // 2 in seg-1 (double space, unclosed tag), 2 in seg-3 (backtick, 3 spaces)
    expect(summary.affectedSegmentsCount).toBe(2);
    expect(summary.flatIssues.length).toBe(4);
    expect(summary.categoryCounts.tag).toBe(1);
    expect(summary.categoryCounts.punctuation).toBe(3);
  });

  it('applies batch fixes for safe punctuation and spacing issues', () => {
    const segments = [
      { id: 'seg-1', text: 'Hello  world and it`s fine', start: 0, end: 2 },
      { id: 'seg-2', text: "We don`t want   spaces", start: 2, end: 4 },
    ];

    const { updatedSegments, fixedCount } = applyBatchValidationFix(segments, 'all_safe');
    expect(fixedCount).toBe(4);
    expect(updatedSegments[0].text).toBe("Hello world and it's fine");
    expect(updatedSegments[1].text).toBe("We don't want spaces");
  });
});

