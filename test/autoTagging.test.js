import { describe, expect, it } from 'bun:test';
import {
  resolveLexiconField,
  getLexiconHeadwordField,
  cleanWordForLookup,
  buildLexiconLookupMap,
  lookupWordTag,
  autoTagSegments,
  autoTagSingleSegment,
} from '../src/utils/autoTagging.js';

describe('Auto Tagging Utilities', () => {
  const sampleLexicon = {
    id: 'lex_1',
    title: 'English Grammar Lexicon',
    fields: [
      { id: 'f_headword', name: 'Headword' },
      { id: 'f_pos', name: 'POS' },
      { id: 'f_gloss', name: 'Gloss' },
    ],
    entries: [
      {
        id: 'e_1',
        fields: {
          f_headword: 'cat',
          f_pos: 'NOUN',
          f_gloss: 'feline',
        },
      },
      {
        id: 'e_2',
        fields: {
          f_headword: 'slept',
          f_pos: 'VERB',
          f_gloss: 'sleep.PAST',
        },
      },
      {
        id: 'e_3',
        fields: {
          f_headword: 'the',
          f_pos: 'DET',
          f_gloss: 'DEF',
        },
      },
      {
        id: 'e_4',
        fields: {
          f_headword: 'peacefully',
          f_pos: 'ADV',
          f_gloss: 'peaceful-ly',
        },
      },
    ],
  };

  describe('resolveLexiconField', () => {
    it('finds field by exact id', () => {
      const field = resolveLexiconField(sampleLexicon, 'f_pos');
      expect(field).toBeDefined();
      expect(field.name).toBe('POS');
    });

    it('finds field by case-insensitive name', () => {
      const field = resolveLexiconField(sampleLexicon, 'pos');
      expect(field).toBeDefined();
      expect(field.id).toBe('f_pos');

      const glossField = resolveLexiconField(sampleLexicon, 'Gloss');
      expect(glossField).toBeDefined();
      expect(glossField.id).toBe('f_gloss');
    });

    it('returns null if field does not exist', () => {
      expect(resolveLexiconField(sampleLexicon, 'nonexistent')).toBeNull();
      expect(resolveLexiconField(sampleLexicon, '')).toBeNull();
      expect(resolveLexiconField(null, 'POS')).toBeNull();
    });
  });

  describe('cleanWordForLookup', () => {
    it('strips leading and trailing punctuation while preserving internal hyphens', () => {
      expect(cleanWordForLookup('cat,')).toBe('cat');
      expect(cleanWordForLookup('"slept."')).toBe('slept');
      expect(cleanWordForLookup('book-s')).toBe('book-s');
      expect(cleanWordForLookup('¡hola!')).toBe('hola');
      expect(cleanWordForLookup('...test...')).toBe('test');
    });

    it('handles empty input gracefully', () => {
      expect(cleanWordForLookup('')).toBe('');
      expect(cleanWordForLookup(null)).toBe('');
    });
  });

  describe('buildLexiconLookupMap & lookupWordTag', () => {
    it('indexes entries and looks up tags accurately', () => {
      const posField = resolveLexiconField(sampleLexicon, 'POS');
      const { exactMap, lowerMap } = buildLexiconLookupMap(sampleLexicon, posField);

      expect(exactMap.get('cat')).toBe('NOUN');
      expect(exactMap.get('slept')).toBe('VERB');

      // Case-insensitive lookup with punctuation
      expect(lookupWordTag('The', exactMap, lowerMap)).toBe('DET');
      expect(lookupWordTag('cat,', exactMap, lowerMap)).toBe('NOUN');
      expect(lookupWordTag('slept.', exactMap, lowerMap)).toBe('VERB');
      expect(lookupWordTag('dog', exactMap, lowerMap)).toBeNull();
    });
  });

  describe('autoTagSegments', () => {
    const tier = {
      id: 2,
      name: 'POS',
      type: 'word',
      splitters: '- =',
      lexiconField: 'POS',
    };

    const segments = [
      {
        id: 'seg_1',
        text: 'The cat slept peacefully.',
        subTexts: {},
      },
      {
        id: 'seg_2',
        text: 'Unknown words here',
        subTexts: {},
      },
    ];

    it('tags all words in all segments based on the mapped lexicon field', () => {
      const result = autoTagSegments({
        segments,
        tier,
        lexicon: sampleLexicon,
      });

      expect(result.success).toBe(true);
      expect(result.stats.totalWords).toBe(7); // 4 + 3
      expect(result.stats.newlyTaggedCount).toBe(4); // The, cat, slept, peacefully
      expect(result.stats.unmatchedCount).toBe(3); // Unknown, words, here
      expect(result.stats.modifiedSegmentsCount).toBe(1);

      const seg1 = result.updatedSegments[0];
      expect(seg1.subTexts['2']).toEqual(['DET', 'NOUN', 'VERB', 'ADV']);

      const seg2 = result.updatedSegments[1];
      expect(seg2.subTexts['2']).toBeUndefined(); // No words matched, unchanged
    });

    it('respects overwrite=false and preserves existing tags', () => {
      const segWithExisting = [
        {
          id: 'seg_1',
          text: 'The cat slept',
          subTexts: {
            '2': ['CUSTOM_DET', '', ''],
          },
        },
      ];

      const result = autoTagSegments({
        segments: segWithExisting,
        tier,
        lexicon: sampleLexicon,
        overwrite: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.alreadyTaggedCount).toBe(1);
      expect(result.stats.newlyTaggedCount).toBe(2);
      expect(result.updatedSegments[0].subTexts['2']).toEqual(['CUSTOM_DET', 'NOUN', 'VERB']);
    });

    it('replaces existing tags when overwrite=true', () => {
      const segWithExisting = [
        {
          id: 'seg_1',
          text: 'The cat slept',
          subTexts: {
            '2': ['CUSTOM_DET', '', ''],
          },
        },
      ];

      const result = autoTagSegments({
        segments: segWithExisting,
        tier,
        lexicon: sampleLexicon,
        overwrite: true,
      });

      expect(result.success).toBe(true);
      expect(result.stats.newlyTaggedCount).toBe(3);
      expect(result.updatedSegments[0].subTexts['2']).toEqual(['DET', 'NOUN', 'VERB']);
    });

    it('allows overriding target field to Gloss', () => {
      const result = autoTagSegments({
        segments: [segments[0]],
        tier,
        lexicon: sampleLexicon,
        targetFieldNameOrId: 'Gloss',
      });

      expect(result.success).toBe(true);
      expect(result.updatedSegments[0].subTexts['2']).toEqual(['DEF', 'feline', 'sleep.PAST', 'peaceful-ly']);
    });

    it('rejects sentence-level sub-tiers with an informative error', () => {
      const sentenceTier = {
        id: 1,
        name: 'Translation',
        type: 'sentence',
      };

      const result = autoTagSegments({
        segments,
        tier: sentenceTier,
        lexicon: sampleLexicon,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('sentence-level tier');
    });

    it('rejects missing or unmatched field', () => {
      const result = autoTagSegments({
        segments,
        tier: { ...tier, lexiconField: 'NonexistentField' },
        lexicon: sampleLexicon,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('was not found in lexicon');
    });
  });

  describe('autoTagSingleSegment', () => {
    it('tags a single segment correctly', () => {
      const tier = { id: 2, type: 'word', lexiconField: 'POS' };
      const segment = { id: 's1', text: 'The cat', subTexts: {} };

      const result = autoTagSingleSegment({
        segment,
        tier,
        lexicon: sampleLexicon,
      });

      expect(result.success).toBe(true);
      expect(result.updatedSegment.subTexts['2']).toEqual(['DET', 'NOUN']);
    });
  });
});

