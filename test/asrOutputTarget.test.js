import { describe, expect, it, beforeEach } from 'bun:test';
import {
  normalizeSubTiers,
  SUB_TIER_TYPE_SENTENCE,
  SUB_TIER_TYPE_WORD,
  getSubText,
} from '../src/utils/subTiers.js';

describe('ASR Output Target Selection', () => {
  let projectSubTiers;

  beforeEach(() => {
    projectSubTiers = [
      { id: 1, name: 'Translation', type: SUB_TIER_TYPE_SENTENCE },
      { id: 2, name: 'POS Tags', type: SUB_TIER_TYPE_WORD },
      { id: 3, name: 'Notes', type: SUB_TIER_TYPE_SENTENCE },
    ];
  });

  describe('Filtering sentence-level sub-tiers vs morpheme/word-level', () => {
    it('filters only sentence-level sub-tiers and excludes morpheme/word-level sub-tiers', () => {
      const allSubTiers = normalizeSubTiers(projectSubTiers);
      const sentenceSubTiers = allSubTiers.filter(
        (t) => t.type === SUB_TIER_TYPE_SENTENCE,
      );

      expect(sentenceSubTiers.length).toBe(2);
      expect(sentenceSubTiers[0].id).toBe(1);
      expect(sentenceSubTiers[0].name).toBe('Translation');
      expect(sentenceSubTiers[1].id).toBe(3);
      expect(sentenceSubTiers[1].name).toBe('Notes');

      // Check that POS Tags (word/morpheme level) was excluded
      const morphemeTiers = allSubTiers.filter(
        (t) => t.type === SUB_TIER_TYPE_WORD,
      );
      expect(morphemeTiers.length).toBe(1);
      expect(morphemeTiers[0].id).toBe(2);
      expect(morphemeTiers[0].name).toBe('POS Tags');
    });

    it('defaults unclassified sub-tiers to sentence type', () => {
      const raw = [{ id: 1, name: 'Gloss' }];
      const normalized = normalizeSubTiers(raw);
      expect(normalized[0].type).toBe(SUB_TIER_TYPE_SENTENCE);

      const sentenceSubTiers = normalized.filter(
        (t) => t.type === SUB_TIER_TYPE_SENTENCE,
      );
      expect(sentenceSubTiers.length).toBe(1);
    });

    it('identifies morpheme alias as word type and excludes it', () => {
      const raw = [{ id: 1, name: 'Morphemes', type: 'morpheme' }];
      const normalized = normalizeSubTiers(raw);
      expect(normalized[0].type).toBe(SUB_TIER_TYPE_WORD);

      const sentenceSubTiers = normalized.filter(
        (t) => t.type === SUB_TIER_TYPE_SENTENCE,
      );
      expect(sentenceSubTiers.length).toBe(0);
    });
  });

  describe('Effective ASR target resolution logic', () => {
    function resolveEffectiveTarget(target, subTiers) {
      if (!target || target === 'main') return 'main';
      const normalized = normalizeSubTiers(subTiers);
      const valid = normalized.find(
        (t) => String(t.id) === String(target) && t.type === SUB_TIER_TYPE_SENTENCE,
      );
      return valid ? String(valid.id) : 'main';
    }

    function getTargetName(target, subTiers) {
      const eff = resolveEffectiveTarget(target, subTiers);
      if (eff === 'main') return 'Main Transcription';
      const normalized = normalizeSubTiers(subTiers);
      const tier = normalized.find((t) => String(t.id) === String(eff));
      return tier ? tier.name : 'Main Transcription';
    }

    it('resolves main transcription as default', () => {
      expect(resolveEffectiveTarget('main', projectSubTiers)).toBe('main');
      expect(resolveEffectiveTarget(null, projectSubTiers)).toBe('main');
      expect(getTargetName('main', projectSubTiers)).toBe('Main Transcription');
    });

    it('resolves valid sentence sub-tier IDs correctly', () => {
      expect(resolveEffectiveTarget('1', projectSubTiers)).toBe('1');
      expect(getTargetName('1', projectSubTiers)).toBe('Translation');

      expect(resolveEffectiveTarget('3', projectSubTiers)).toBe('3');
      expect(getTargetName('3', projectSubTiers)).toBe('Notes');
    });

    it('falls back to main when targeting a morpheme/word sub-tier', () => {
      // Sub-tier 2 is POS Tags (word/morpheme level)
      expect(resolveEffectiveTarget('2', projectSubTiers)).toBe('main');
      expect(getTargetName('2', projectSubTiers)).toBe('Main Transcription');
    });

    it('falls back to main when targeting non-existent sub-tier ID', () => {
      expect(resolveEffectiveTarget('99', projectSubTiers)).toBe('main');
      expect(getTargetName('99', projectSubTiers)).toBe('Main Transcription');
    });
  });

  describe('Empty and transcribed segments counting logic', () => {
    const segments = [
      {
        id: 'seg-1',
        start: 0,
        end: 2,
        text: 'Hello world',
        subTexts: { '1': '' },
      },
      {
        id: 'seg-2',
        start: 2,
        end: 4,
        text: '',
        subTexts: { '1': 'Bonjour le monde' },
      },
      {
        id: 'seg-3',
        start: 4,
        end: 6,
        text: '',
        subTexts: { '1': '   ' },
      },
    ];

    function countEmpty(segs, target) {
      if (!Array.isArray(segs)) return 0;
      if (target !== 'main') {
        return segs.filter(
          (s) => !getSubText(s, target) || getSubText(s, target).trim() === '',
        ).length;
      }
      return segs.filter((s) => !s.text || s.text.trim() === '').length;
    }

    function countTranscribed(segs, target) {
      if (!Array.isArray(segs)) return 0;
      if (target !== 'main') {
        return segs.filter(
          (s) => getSubText(s, target) && getSubText(s, target).trim() !== '',
        ).length;
      }
      return segs.filter((s) => s.text && s.text.trim() !== '').length;
    }

    it('counts empty and transcribed segments for main tier', () => {
      // seg-2 and seg-3 have no main text; seg-1 has main text
      expect(countEmpty(segments, 'main')).toBe(2);
      expect(countTranscribed(segments, 'main')).toBe(1);
    });

    it('counts empty and transcribed segments for sentence sub-tier', () => {
      // seg-1 (empty) and seg-3 (whitespace) are empty for Sub-tier 1
      // seg-2 has 'Bonjour le monde'
      expect(countEmpty(segments, '1')).toBe(2);
      expect(countTranscribed(segments, '1')).toBe(1);
    });
  });

  describe('Output text routing logic', () => {
    it('updates seg.text when destination is main', () => {
      const seg = { id: 'seg-1', text: '', subTexts: {} };
      const target = 'main';
      const cleanText = 'Transcribed utterance';

      if (target !== 'main') {
        seg.subTexts = { ...seg.subTexts, [String(target)]: cleanText };
      } else {
        seg.text = cleanText;
      }

      expect(seg.text).toBe('Transcribed utterance');
      expect(seg.subTexts['1']).toBeUndefined();
    });

    it('updates seg.subTexts when destination is a sentence sub-tier', () => {
      const seg = { id: 'seg-1', text: 'Original Main Text', subTexts: {} };
      const target = '1';
      const cleanText = 'Translated Sub-tier text';

      if (target !== 'main') {
        seg.subTexts = { ...seg.subTexts, [String(target)]: cleanText };
      } else {
        seg.text = cleanText;
      }

      // Original text preserved!
      expect(seg.text).toBe('Original Main Text');
      // Sub-tier received the ASR output!
      expect(getSubText(seg, '1')).toBe('Translated Sub-tier text');
    });

    it('unhides target column when set', () => {
      let hiddenColumns = ['1', '2'];
      const target = '1';

      if (target !== 'main' && hiddenColumns.includes(String(target))) {
        hiddenColumns = hiddenColumns.filter((k) => String(k) !== String(target));
      }

      expect(hiddenColumns).toEqual(['2']);
    });
  });
});

