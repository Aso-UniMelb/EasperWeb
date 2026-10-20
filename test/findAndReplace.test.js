import { describe, it, expect } from 'bun:test';
import {
  escapeRegExp,
  buildFindRegex,
  getSearchableTiers,
  findAllMatches,
  replaceSingleMatch,
  replaceAllMatches,
} from '../src/utils/findAndReplace.js';

describe('Find and Replace Utilities', () => {
  const mockSubTiers = [
    { id: 1, name: 'Translation', type: 'sentence' },
    { id: 2, name: 'Notes', type: 'sentence' },
    { id: 3, name: 'POS', type: 'word' }, // Should be excluded from sentence search
  ];

  const mockSegments = [
    {
      id: 101,
      start: 0,
      end: 2.5,
      text: 'Hello world, hello Kurdish language.',
      subTexts: {
        '1': 'Silaw cihan, silaw zimani kurdi.',
        '2': 'Greeting in English and Kurdish',
      },
    },
    {
      id: 102,
      start: 2.5,
      end: 5.0,
      text: 'The quick brown fox jumps over the lazy dog.',
      subTexts: {
        '1': 'Ruwiya ziringe.',
      },
    },
    {
      id: 103,
      start: 5.0,
      end: 8.0,
      text: 'Another world of possibilities.',
      subTexts: {
        '1': 'Cihaneki tir.',
        '2': 'Second greeting world note',
      },
    },
  ];

  describe('escapeRegExp', () => {
    it('escapes special regex characters', () => {
      expect(escapeRegExp('hello.world[1]?*+^$()')).toBe(
        'hello\\.world\\[1\\]\\?\\*\\+\\^\\$\\(\\)',
      );
    });
  });

  describe('buildFindRegex', () => {
    it('returns null for empty search string', () => {
      expect(buildFindRegex('')).toBeNull();
      expect(buildFindRegex(null)).toBeNull();
    });

    it('creates case-insensitive regex by default', () => {
      const re = buildFindRegex('hello');
      expect(re.test('Hello')).toBe(true);
      re.lastIndex = 0;
      expect(re.test('HELLO')).toBe(true);
      re.lastIndex = 0;
      expect(re.test('hello')).toBe(true);
    });

    it('creates case-sensitive regex when matchCase is true', () => {
      const re = buildFindRegex('Hello', { matchCase: true });
      expect(re.test('Hello')).toBe(true);
      expect(re.test('hello')).toBe(false);
    });

    it('handles wholeWord option with Unicode characters', () => {
      const re = buildFindRegex('world', { wholeWord: true });
      expect(re.test('hello world!')).toBe(true);
      expect(re.test('hello otherworldly!')).toBe(false);

      const reKurdish = buildFindRegex('سڵاو', { wholeWord: true });
      expect(reKurdish.test('سڵاو هاوڕێ')).toBe(true);
      expect(reKurdish.test('بەسڵاوەوە')).toBe(false);
    });
  });

  describe('getSearchableTiers', () => {
    it('returns only main tier when targetTier is main', () => {
      const tiers = getSearchableTiers('main', mockSubTiers, 'Main Transcription');
      expect(tiers.length).toBe(1);
      expect(tiers[0].key).toBe('main');
      expect(tiers[0].isMain).toBe(true);
    });

    it('returns all sentence tiers including main and excluding word tiers when targetTier is all', () => {
      const tiers = getSearchableTiers('all', mockSubTiers, 'Main Transcription');
      expect(tiers.length).toBe(3); // main + sub-tier 1 + sub-tier 2 (excluding POS word tier)
      expect(tiers.map((t) => t.key)).toEqual(['main', '1', '2']);
    });

    it('returns specific sub-tier when targetTier matches sub-tier id', () => {
      const tiers = getSearchableTiers('1', mockSubTiers);
      expect(tiers.length).toBe(1);
      expect(tiers[0].key).toBe('1');
      expect(tiers[0].name).toBe('Translation');
    });

    it('ignores word/morpheme sub-tier even if specifically requested and falls back to main', () => {
      const tiers = getSearchableTiers('3', mockSubTiers);
      expect(tiers.length).toBe(1);
      expect(tiers[0].key).toBe('main');
    });
  });

  describe('findAllMatches', () => {
    it('finds all occurrences in main transcription', () => {
      const result = findAllMatches({
        segments: mockSegments,
        findText: 'hello',
        targetTier: 'main',
      });

      expect(result.totalMatches).toBe(2);
      expect(result.matchingSegmentsCount).toBe(1);
      expect(result.matches[0].segmentId).toBe(101);
      expect(result.matches[0].matchedText).toBe('Hello');
      expect(result.matches[1].matchedText).toBe('hello');
    });

    it('finds occurrences across sub-tiers when targetTier is all', () => {
      const result = findAllMatches({
        segments: mockSegments,
        findText: 'world',
        targetTier: 'all',
        subTiers: mockSubTiers,
      });

      // 1 in seg 101 main ("world")
      // 1 in seg 103 main ("world")
      // 1 in seg 103 subTier '2' ("world")
      expect(result.totalMatches).toBe(3);
      expect(result.matchingSegmentsCount).toBe(2);
    });

    it('finds matches in a specific sentence sub-tier', () => {
      const result = findAllMatches({
        segments: mockSegments,
        findText: 'silaw',
        targetTier: '1',
        subTiers: mockSubTiers,
      });

      expect(result.totalMatches).toBe(2);
      expect(result.matches[0].tierKey).toBe('1');
      expect(result.matches[1].tierKey).toBe('1');
    });

    it('respects whole word boundary option', () => {
      const resultAll = findAllMatches({
        segments: mockSegments,
        findText: 'or',
        targetTier: 'main',
        wholeWord: false,
      });
      // "world", "Kurdish", "brown", "world" contains "or" or similar
      expect(resultAll.totalMatches).toBeGreaterThan(0);

      const resultWhole = findAllMatches({
        segments: mockSegments,
        findText: 'or',
        targetTier: 'main',
        wholeWord: true,
      });
      expect(resultWhole.totalMatches).toBe(0);
    });
  });

  describe('replaceSingleMatch', () => {
    it('replaces a single match in main tier without altering others', () => {
      const matchesResult = findAllMatches({
        segments: mockSegments,
        findText: 'hello',
        targetTier: 'main',
      });

      const firstMatch = matchesResult.matches[0];
      const { updatedSegments, success, newText } = replaceSingleMatch({
        segments: mockSegments,
        match: firstMatch,
        replaceText: 'Greetings',
      });

      expect(success).toBe(true);
      expect(newText).toBe('Greetings world, hello Kurdish language.');
      expect(updatedSegments[0].text).toBe('Greetings world, hello Kurdish language.');
      // Second match in same segment remains untouched
      expect(updatedSegments[0].text).toContain('hello Kurdish');
    });

    it('replaces a single match in sub-tier', () => {
      const matchesResult = findAllMatches({
        segments: mockSegments,
        findText: 'silaw',
        targetTier: '1',
        subTiers: mockSubTiers,
      });

      const firstMatch = matchesResult.matches[0];
      const { updatedSegments, success } = replaceSingleMatch({
        segments: mockSegments,
        match: firstMatch,
        replaceText: 'Merheba',
      });

      expect(success).toBe(true);
      expect(updatedSegments[0].subTexts['1']).toBe('Merheba cihan, silaw zimani kurdi.');
    });
  });

  describe('replaceAllMatches', () => {
    it('replaces all matches in main transcription and returns accurate stats', () => {
      const { updatedSegments, totalReplaced, modifiedSegmentsCount } = replaceAllMatches({
        segments: mockSegments,
        findText: 'world',
        replaceText: 'universe',
        targetTier: 'main',
      });

      expect(totalReplaced).toBe(2);
      expect(modifiedSegmentsCount).toBe(2);
      expect(updatedSegments[0].text).toBe('Hello universe, hello Kurdish language.');
      expect(updatedSegments[2].text).toBe('Another universe of possibilities.');
      // Sub-tier untouched
      expect(updatedSegments[2].subTexts['2']).toContain('world note');
    });

    it('replaces all matches across all sentence tiers', () => {
      const { updatedSegments, totalReplaced, modifiedSegmentsCount } = replaceAllMatches({
        segments: mockSegments,
        findText: 'world',
        replaceText: 'globe',
        targetTier: 'all',
        subTiers: mockSubTiers,
      });

      expect(totalReplaced).toBe(3);
      expect(modifiedSegmentsCount).toBe(2);
      expect(updatedSegments[0].text).toContain('Hello globe');
      expect(updatedSegments[2].text).toContain('Another globe');
      expect(updatedSegments[2].subTexts['2']).toBe('Second greeting globe note');
    });

    it('safely handles replacement strings containing dollar signs ($100)', () => {
      const { updatedSegments, totalReplaced } = replaceAllMatches({
        segments: mockSegments,
        findText: 'possibilities',
        replaceText: '$100.00',
        targetTier: 'main',
      });

      expect(totalReplaced).toBe(1);
      expect(updatedSegments[2].text).toBe('Another world of $100.00.');
    });
  });
});
