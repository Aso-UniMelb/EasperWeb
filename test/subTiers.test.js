import { describe, expect, it } from 'bun:test';
import {
  tokenizeWords,
  buildSplitterRegex,
  DEFAULT_SPLITTERS,
  isLexiconValueValid,
  normalizeSubTiers,
  buildColumns,
  getSubText,
  getWordAnnotations,
  mergeSubTexts,
  SUB_TIER_TYPE_SENTENCE,
  SUB_TIER_TYPE_WORD,
  COMMON_POS_LEXICON,
  parseLexicon,
  formatLexiconItem,
  formatLexicon,
} from '../src/utils/subTiers.js';

describe('subTiers utils', () => {
  describe('tokenizeWords', () => {
    it('splits standard sentence by whitespace', () => {
      expect(tokenizeWords('my books are here')).toEqual([
        'my',
        'books',
        'are',
        'here',
      ]);
    });

    it('splits by whitespace and default splitters (hyphen and equal sign)', () => {
      expect(tokenizeWords('un-do = it now')).toEqual([
        'un',
        'do',
        'it',
        'now',
      ]);
    });

    it('does not split on punctuation unless configured as splitters', () => {
      expect(tokenizeWords('hello, world! How are you?')).toEqual([
        'hello,',
        'world!',
        'How',
        'are',
        'you?',
      ]);

      // When punctuation is explicitly added to splitters
      expect(tokenizeWords('hello, world! How are you?', '- = , ! ?')).toEqual([
        'hello',
        'world',
        'How',
        'are',
        'you',
      ]);
    });

    it('handles Kurdish, Arabic, and diacritics with configured splitters', () => {
      // With default splitters '- =', the period remains part of the last word
      expect(tokenizeWords('كتێب-ێک=مان خوێندەوە.')).toEqual([
        'كتێب',
        'ێک',
        'مان',
        'خوێندەوە.',
      ]);

      // When period is included as a splitter
      expect(tokenizeWords('كتێب-ێک=مان خوێندەوە.', '- = .')).toEqual([
        'كتێب',
        'ێک',
        'مان',
        'خوێندەوە',
      ]);
    });

    it('handles custom splitters like tilde and colon', () => {
      expect(tokenizeWords('stem~suf:clitic_part', '~ :')).toEqual([
        'stem',
        'suf',
        'clitic_part',
      ]);
    });

    it('always splits by whitespace even when splitters string is empty', () => {
      expect(tokenizeWords('word1-part word2=clitic word3', '')).toEqual([
        'word1-part',
        'word2=clitic',
        'word3',
      ]);
    });

    it('returns empty array for empty or null text', () => {
      expect(tokenizeWords('')).toEqual([]);
      expect(tokenizeWords(null)).toEqual([]);
      expect(tokenizeWords(undefined)).toEqual([]);
      expect(tokenizeWords('   --- === ')).toEqual([]);
    });
  });

  describe('parseLexicon and formatLexicon', () => {
    it('parses tags with {Label}, (Label), and colon representations', () => {
      const input = 'prop {Proper Name}, n {Noun}, v (Verb); adj: Adjective, adv';
      const parsed = parseLexicon(input);
      expect(parsed).toEqual([
        { value: 'prop', label: 'Proper Name' },
        { value: 'n', label: 'Noun' },
        { value: 'v', label: 'Verb' },
        { value: 'adj', label: 'Adjective' },
        { value: 'adv', label: '' },
      ]);
    });

    it('formats lexicon items with labels back to string representation', () => {
      const list = [
        { value: 'prop', label: 'Proper Name' },
        { value: 'n', label: 'Noun' },
        { value: 'adv', label: '' },
      ];
      expect(formatLexicon(list)).toBe('prop {Proper Name}, n {Noun}, adv');
    });

    it('deduplicates case-insensitively and ignores empty entries', () => {
      const input = 'n {Noun}, N {Noun Duplicate}, v';
      expect(parseLexicon(input)).toEqual([
        { value: 'n', label: 'Noun' },
        { value: 'v', label: '' },
      ]);
    });
  });

  describe('isLexiconValueValid', () => {
    const lexicon = [
      { value: 'prop', label: 'Proper Name' },
      { value: 'n', label: 'Noun' },
      { value: 'v', label: 'Verb' },
    ];

    it('returns true when value is in lexicon (case-insensitive)', () => {
      expect(isLexiconValueValid('prop', lexicon)).toBe(true);
      expect(isLexiconValueValid('PROP', lexicon)).toBe(true);
      expect(isLexiconValueValid('n', lexicon)).toBe(true);
    });

    it('returns false when value is not in lexicon', () => {
      expect(isLexiconValueValid('unknown_tag', lexicon)).toBe(false);
      expect(isLexiconValueValid('adj', lexicon)).toBe(false);
    });

    it('returns true for empty or whitespace values (not an error, just unannotated)', () => {
      expect(isLexiconValueValid('', lexicon)).toBe(true);
      expect(isLexiconValueValid('   ', lexicon)).toBe(true);
      expect(isLexiconValueValid(null, lexicon)).toBe(true);
      expect(isLexiconValueValid(undefined, lexicon)).toBe(true);
    });

    it('returns true when lexicon is empty or undefined (no restrictions)', () => {
      expect(isLexiconValueValid('any_value', [])).toBe(true);
      expect(isLexiconValueValid('any_value', null)).toBe(true);
      expect(isLexiconValueValid('any_value', undefined)).toBe(true);
    });
  });

  describe('normalizeSubTiers', () => {
    it('handles sentence and word sub-tiers, normalizes lexicons, and sets default splitters', () => {
      const raw = [
        { id: 1, name: 'Translation', type: 'sentence' },
        {
          id: 2,
          name: 'POS',
          type: 'word',
          lexicon: ['prop {Proper Name}', 'n {Noun}', 'h', 'adv'],
        },
      ];
      const normalized = normalizeSubTiers(raw);
      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({
        id: 1,
        name: 'Translation',
        type: 'sentence',
        lexicon: [],
        splitters: DEFAULT_SPLITTERS,
        lexiconField: '',
      });
      expect(normalized[1]).toEqual({
        id: 2,
        name: 'POS',
        type: 'word',
        lexicon: [
          { value: 'prop', label: 'Proper Name' },
          { value: 'n', label: 'Noun' },
          { value: 'h', label: '' },
          { value: 'adv', label: '' },
        ],
        splitters: DEFAULT_SPLITTERS,
        lexiconField: '',
      });
    });

    it('preserves custom splitters and lexiconField when specified', () => {
      const raw = [
        {
          id: 1,
          name: 'Morphs',
          type: 'word',
          splitters: '~ = :',
          lexiconField: 'Gloss',
        },
      ];
      const normalized = normalizeSubTiers(raw);
      expect(normalized[0].splitters).toBe('~ = :');
      expect(normalized[0].lexiconField).toBe('Gloss');
    });

    it('defaults type to sentence and cleans string lexicons with labels', () => {
      const raw = [
        {
          id: 1,
          name: 'Gloss',
          type: 'morpheme',
          lexicon: '1SG {1st person singular}, 2SG; PAST {Past tense}\nNOM',
        },
      ];
      const normalized = normalizeSubTiers(raw);
      expect(normalized[0].type).toBe('word');
      expect(normalized[0].lexicon).toEqual([
        { value: '1SG', label: '1st person singular' },
        { value: '2SG', label: '' },
        { value: 'PAST', label: 'Past tense' },
        { value: 'NOM', label: '' },
      ]);
      expect(normalized[0].splitters).toBe(DEFAULT_SPLITTERS);
    });
  });

  describe('buildColumns', () => {
    it('populates columns with tier type, lexicon, and splitters', () => {
      const subTiers = [
        { id: 1, name: 'Translation', type: 'sentence' },
        {
          id: 2,
          name: 'POS',
          type: 'word',
          lexicon: [{ value: 'prop', label: 'Proper Name' }, { value: 'n', label: 'Noun' }],
          splitters: '- = ~',
        },
      ];
      const columns = buildColumns(subTiers);
      expect(columns).toHaveLength(3);
      expect(columns[0]).toMatchObject({
        key: 'main',
        name: 'Transcription',
        isMain: true,
        type: 'sentence',
        splitters: DEFAULT_SPLITTERS,
      });
      expect(columns[1]).toMatchObject({
        key: '1',
        name: 'Translation',
        isMain: false,
        type: 'sentence',
        splitters: DEFAULT_SPLITTERS,
      });
      expect(columns[2]).toMatchObject({
        key: '2',
        name: 'POS',
        isMain: false,
        type: 'word',
        lexicon: [
          { value: 'prop', label: 'Proper Name' },
          { value: 'n', label: 'Noun' },
        ],
        splitters: '- = ~',
      });
    });
  });

  describe('getWordAnnotations and getSubText', () => {
    it('retrieves word annotations array and handles serialization', () => {
      const seg = {
        id: 's1',
        text: 'my books are here',
        subTexts: {
          '1': ['prop', 'n', 'h', 'adv'],
          '2': 'Free translation text',
        },
      };

      expect(getWordAnnotations(seg, 1, 4)).toEqual([
        'prop',
        'n',
        'h',
        'adv',
      ]);
      expect(getWordAnnotations(seg, 1, 6)).toEqual([
        'prop',
        'n',
        'h',
        'adv',
        '',
        '',
      ]);

      expect(getSubText(seg, 1)).toBe('prop n h adv');
      expect(getSubText(seg, 2)).toBe('Free translation text');
      expect(getSubText(seg, 3)).toBe('');
    });
  });

  describe('mergeSubTexts', () => {
    it('merges string subTexts and array subTexts properly', () => {
      const segA = {
        '1': 'Hello',
        '2': ['prop', 'n'],
      };
      const segB = {
        '1': 'World',
        '2': ['h', 'adv'],
      };
      const merged = mergeSubTexts(segA, segB);
      expect(merged['1']).toBe('Hello World');
      expect(merged['2']).toEqual(['prop', 'n', 'h', 'adv']);
    });
  });
});
