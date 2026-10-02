import { describe, expect, it } from 'bun:test';
import { exportToEaf } from '../src/elan.js';
import { parseEaf } from '../src/utils/elanParser.js';

describe('ELAN export with word/morpheme sub-tiers', () => {
  it('exports split morphemes with equal durations on Time_Subdivision tier and links POS tags', () => {
    // 4 seconds segment with 4 morphemes
    const segments = [
      {
        id: 'seg-1',
        start: 0,
        end: 4.0,
        speaker: 'Speaker1',
        speakerId: 1,
        text: 'book-s are here',
        subTexts: {
          '1': ['N', 'SUF', 'V', 'ADV'],
        },
      },
    ];

    const subTiers = [
      { id: 1, name: 'POS', type: 'word' },
    ];

    const speakers = [
      { id: 1, name: 'Speaker1', initials: 'S1' },
    ];

    const xml = exportToEaf({
      segments,
      subTiers,
      speakers,
      audioFileName: 'audio.wav',
    });

    // Verify XML contains linguistic types
    expect(xml).toContain('LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"');
    expect(xml).toContain('LINGUISTIC_TYPE_ID="words-lt" CONSTRAINTS="Time_Subdivision" TIME_ALIGNABLE="true"');
    expect(xml).toContain('LINGUISTIC_TYPE_ID="dependent-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false"');

    // Verify tier hierarchy
    expect(xml).toContain('<TIER TIER_ID="Speaker1" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="default-lt">');
    expect(xml).toContain('<TIER TIER_ID="morphs@Speaker1" PARENT_REF="Speaker1" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="words-lt">');
    expect(xml).toContain('<TIER TIER_ID="POS@Speaker1" PARENT_REF="morphs@Speaker1" LINGUISTIC_TYPE_REF="dependent-lt">');

    // Parse the generated XML to verify time intervals and references
    const parsed = parseEaf(xml, 'test.eaf');
    const speakerTier = parsed.tiers.find((t) => t.tierId === 'Speaker1');
    const morphTier = parsed.tiers.find((t) => t.tierId === 'morphs@Speaker1');
    const posTier = parsed.tiers.find((t) => t.tierId === 'POS@Speaker1');

    expect(speakerTier).toBeDefined();
    expect(morphTier).toBeDefined();
    expect(posTier).toBeDefined();

    // Speaker utterance duration is 4 seconds (0 to 4000 ms)
    expect(speakerTier.annotations).toHaveLength(1);
    expect(speakerTier.annotations[0].start).toBe(0);
    expect(speakerTier.annotations[0].end).toBe(4000);
    expect(speakerTier.annotations[0].text).toBe('book-s are here');

    // 4 morphemes, each with 1 second duration
    expect(morphTier.annotations).toHaveLength(4);
    expect(morphTier.annotations[0]).toMatchObject({
      start: 0,
      end: 1000,
      text: 'book',
    });
    expect(morphTier.annotations[1]).toMatchObject({
      start: 1000,
      end: 2000,
      text: 's',
    });
    expect(morphTier.annotations[2]).toMatchObject({
      start: 2000,
      end: 3000,
      text: 'are',
    });
    expect(morphTier.annotations[3]).toMatchObject({
      start: 3000,
      end: 4000,
      text: 'here',
    });

    // POS annotations correspond 1:1 with morphemes
    expect(posTier.annotations).toHaveLength(4);
    expect(posTier.annotations[0]).toMatchObject({
      start: 0,
      end: 1000,
      text: 'N',
    });
    expect(posTier.annotations[1]).toMatchObject({
      start: 1000,
      end: 2000,
      text: 'SUF',
    });
    expect(posTier.annotations[2]).toMatchObject({
      start: 2000,
      end: 3000,
      text: 'V',
    });
    expect(posTier.annotations[3]).toMatchObject({
      start: 3000,
      end: 4000,
      text: 'ADV',
    });
  });

  it('preserves empty tags as empty annotations instead of dismissing them', () => {
    const segments = [
      {
        id: 'seg-1',
        start: 0,
        end: 4.0,
        speaker: 'Speaker1',
        text: 'book-s are here',
        subTexts: {
          // Only 2 of the 4 morphemes have tags, the other 2 are empty
          '1': ['N', '', 'V', ''],
        },
      },
    ];

    const subTiers = [{ id: 1, name: 'POS', type: 'word' }];
    const xml = exportToEaf({ segments, subTiers });
    const parsed = parseEaf(xml, 'empty-tags.eaf');

    const posTier = parsed.tiers.find((t) => t.tierId === 'POS@Speaker1');
    expect(posTier).toBeDefined();

    // All 4 annotations exist! Empty ones are NOT dismissed
    expect(posTier.annotations).toHaveLength(4);
    expect(posTier.annotations[0].text).toBe('N');
    expect(posTier.annotations[1].text).toBe('');
    expect(posTier.annotations[2].text).toBe('V');
    expect(posTier.annotations[3].text).toBe('');

    // Check raw XML to ensure <ANNOTATION_VALUE></ANNOTATION_VALUE> is produced
    expect(xml).toMatch(/<REF_ANNOTATION [^>]+>\s*<ANNOTATION_VALUE><\/ANNOTATION_VALUE>\s*<\/REF_ANNOTATION>/);
  });

  it('handles mixed sentence sub-tiers and word sub-tiers correctly', () => {
    const segments = [
      {
        id: 'seg-1',
        start: 1.0,
        end: 3.5, // 2500 ms duration, 2 morphemes -> 1250ms each
        speaker: 'Alice',
        speakerId: 1,
        text: 'hello world',
        subTexts: {
          '1': 'A greeting to the world',
          '2': ['INTJ', 'NOUN'],
        },
      },
    ];

    const subTiers = [
      { id: 1, name: 'Translation', type: 'sentence' },
      { id: 2, name: 'POS', type: 'word' },
    ];

    const speakers = [{ id: 1, name: 'Alice', initials: 'A' }];

    const xml = exportToEaf({ segments, subTiers, speakers });
    const parsed = parseEaf(xml, 'mixed.eaf');

    const aliceTier = parsed.tiers.find((t) => t.tierId === 'Alice');
    const morphTier = parsed.tiers.find((t) => t.tierId === 'morphs@Alice');
    const transTier = parsed.tiers.find((t) => t.tierId === 'Translation@Alice');
    const posTier = parsed.tiers.find((t) => t.tierId === 'POS@Alice');

    expect(aliceTier).toBeDefined();
    expect(morphTier).toBeDefined();
    expect(transTier).toBeDefined();
    expect(posTier).toBeDefined();

    // Translation hangs off Alice (full utterance 1000 to 3500)
    expect(transTier.annotations).toHaveLength(1);
    expect(transTier.annotations[0]).toMatchObject({
      start: 1000,
      end: 3500,
      text: 'A greeting to the world',
    });

    // Morphs are subdivided: 1000 to 2250, 2250 to 3500
    expect(morphTier.annotations).toHaveLength(2);
    expect(morphTier.annotations[0]).toMatchObject({
      start: 1000,
      end: 2250,
      text: 'hello',
    });
    expect(morphTier.annotations[1]).toMatchObject({
      start: 2250,
      end: 3500,
      text: 'world',
    });

    // POS tags hang off the morphemes
    expect(posTier.annotations).toHaveLength(2);
    expect(posTier.annotations[0]).toMatchObject({
      start: 1000,
      end: 2250,
      text: 'INTJ',
    });
    expect(posTier.annotations[1]).toMatchObject({
      start: 2250,
      end: 3500,
      text: 'NOUN',
    });
  });

  it('does not create morphs tier when there are only sentence-level sub-tiers', () => {
    const segments = [
      {
        id: 'seg-1',
        start: 0,
        end: 2.0,
        speaker: 'Speaker1',
        text: 'just sentences',
        subTexts: {
          '1': 'Sentence translation',
        },
      },
    ];

    const subTiers = [
      { id: 1, name: 'Translation', type: 'sentence' },
    ];

    const xml = exportToEaf({ segments, subTiers });
    expect(xml).not.toContain('morphs@');
    expect(xml).not.toContain('words-lt');
    expect(xml).toContain('Translation@Speaker1');
  });

  it('respects custom morpheme splitters in ELAN export', () => {
    const segments = [
      {
        id: 'seg-1',
        start: 0,
        end: 3.0,
        speaker: 'Speaker1',
        speakerId: 1,
        text: 'kitab~i=man hat',
        subTexts: {
          '1': ['BOOK', 'SG', '1SG', 'COME.PAST'],
        },
      },
    ];

    const subTiers = [
      { id: 1, name: 'Gloss', type: 'word', splitters: '~ =' },
    ];

    const xml = exportToEaf({ segments, subTiers });
    const parsed = parseEaf(xml, 'custom-splitters.eaf');
    const morphTier = parsed.tiers.find((t) => t.tierId === 'morphs@Speaker1');
    const glossTier = parsed.tiers.find((t) => t.tierId === 'Gloss@Speaker1');

    expect(morphTier).toBeDefined();
    expect(glossTier).toBeDefined();

    expect(morphTier.annotations).toHaveLength(4);
    expect(morphTier.annotations.map((a) => a.text)).toEqual([
      'kitab',
      'i',
      'man',
      'hat',
    ]);

    expect(glossTier.annotations).toHaveLength(4);
    expect(glossTier.annotations.map((a) => a.text)).toEqual([
      'BOOK',
      'SG',
      '1SG',
      'COME.PAST',
    ]);
  });
});
