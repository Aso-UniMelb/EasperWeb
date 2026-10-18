import { describe, expect, it } from 'bun:test';
import { exportToEaf } from '../src/elan.js';
import { parseEaf } from '../src/utils/elanParser.js';
import { detectTierDefaults, compileElanToProject } from '../src/utils/elanImporter.js';

describe('ELAN import with annotators and main tier title', () => {
  it('detects main tier prefix, transcriber, and sub-tier annotators from parsed EAF', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="DocAuthor" DATE="2026-10-16T00:00:00" VERSION="3.0" FORMAT="3.0">
  <HEADER TIME_UNITS="milliseconds" />
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="2000" />
  </TIME_ORDER>
  <TIER TIER_ID="BIS@Speaker1" ANNOTATOR="Alice Transcriber" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>First utterance</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="Translation@Speaker1" ANNOTATOR="Bob Translator" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="dependent-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>First translation</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="Notes@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="dependent-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a3" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>A note</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="dependent-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" />
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'dialogue-session.eaf');
    const detected = detectTierDefaults(parsed);

    // Title & Main tier title & Transcriber
    expect(detected.suggestedTitle).toBe('dialogue-session');
    expect(detected.suggestedMainTierTitle).toBe('BIS');
    expect(detected.suggestedTranscriber).toBe('Alice Transcriber');

    // Speakers
    expect(detected.speakers).toHaveLength(1);
    expect(detected.speakers[0].name).toBe('Speaker1');

    // Sub-tiers with annotators
    expect(detected.subTiers).toHaveLength(2);
    const translationTier = detected.subTiers.find((st) => st.name === 'Translation');
    const notesTier = detected.subTiers.find((st) => st.name === 'Notes');

    expect(translationTier).toBeDefined();
    expect(translationTier.annotator).toBe('Bob Translator');

    expect(notesTier).toBeDefined();
    expect(notesTier.annotator).toBe('');

    // Tier configs
    const mainConfig = detected.tierConfigs.find((tc) => tc.tierId === 'BIS@Speaker1');
    const transConfig = detected.tierConfigs.find((tc) => tc.tierId === 'Translation@Speaker1');
    expect(mainConfig.annotator).toBe('Alice Transcriber');
    expect(transConfig.annotator).toBe('Bob Translator');
  });

  it('strips prefix from speaker names when participant is absent', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT VERSION="3.0">
  <TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000"/></TIME_ORDER>
  <TIER TIER_ID="ORTHO@Speaker_A" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hi</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'ortho.eaf');
    const detected = detectTierDefaults(parsed);

    expect(detected.suggestedMainTierTitle).toBe('ORTHO');
    expect(detected.speakers).toHaveLength(1);
    expect(detected.speakers[0].name).toBe('Speaker_A');
  });

  it('preserves annotator metadata through full export -> parse -> detect -> compile roundtrip', () => {
    const originalSegments = [
      {
        id: 'seg-1',
        start: 0,
        end: 2.5,
        speaker: 'Sara',
        speakerId: 1,
        text: 'Choni bashi',
        subTexts: {
          '1': 'How are you',
        },
      },
    ];

    const originalSubTiers = [
      { id: 1, name: 'Translation', type: 'sentence', annotator: 'John Doe' },
    ];

    const originalSpeakers = [
      { id: 1, name: 'Sara', initials: 'S' },
    ];

    // 1. Export to ELAN XML
    const xml = exportToEaf({
      segments: originalSegments,
      subTiers: originalSubTiers,
      speakers: originalSpeakers,
      mainTierTitle: 'ORTHO',
      transcriber: 'Mary Transcriber',
      audioFileName: 'interview.wav',
    });

    // 2. Parse ELAN XML
    const parsed = parseEaf(xml, 'interview.eaf');

    // 3. Detect Tier Defaults
    const detected = detectTierDefaults(parsed);
    expect(detected.suggestedMainTierTitle).toBe('ORTHO');
    expect(detected.suggestedTranscriber).toBe('Mary Transcriber');
    expect(detected.subTiers).toHaveLength(1);
    expect(detected.subTiers[0].name).toBe('Translation');
    expect(detected.subTiers[0].annotator).toBe('John Doe');

    // 4. Compile ELAN into project data
    const compiled = compileElanToProject({
      eafData: parsed,
      tierConfigs: detected.tierConfigs,
      speakers: detected.speakers,
      subTiers: detected.subTiers,
    });

    expect(compiled.segments).toHaveLength(1);
    expect(compiled.segments[0].text).toBe('Choni bashi');
    expect(compiled.segments[0].subTexts['1']).toBe('How are you');
    expect(compiled.subTiers[0].annotator).toBe('John Doe');
  });
});

