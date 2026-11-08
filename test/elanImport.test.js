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

  it('imports Symbolic_Subdivision and Symbolic_Association into word and sentence sub-tiers with exact token arrays', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Linguist" DATE="2026-11-05T00:00:00" VERSION="3.0" FORMAT="3.0">
  <HEADER TIME_UNITS="milliseconds" />
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="500" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="3500" />
  </TIME_ORDER>
  <TIER TIER_ID="Speaker1" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>The quick foxes</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="words@Speaker1" PARENT_REF="Speaker1" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="sym-sub-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>The</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a3" ANNOTATION_REF="a1" PREVIOUS_ANNOTATION="a2">
        <ANNOTATION_VALUE>quick</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a4" ANNOTATION_REF="a1" PREVIOUS_ANNOTATION="a3">
        <ANNOTATION_VALUE>foxes</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="POS@Speaker1" PARENT_REF="words@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a5" ANNOTATION_REF="a2">
        <ANNOTATION_VALUE>DET</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a6" ANNOTATION_REF="a3">
        <ANNOTATION_VALUE>ADJ</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a7" ANNOTATION_REF="a4">
        <ANNOTATION_VALUE>NOUN</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="Translation@Speaker1" PARENT_REF="Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a8" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>Die schnellen Füchse</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="sym-sub-lt" CONSTRAINTS="Symbolic_Subdivision" TIME_ALIGNABLE="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="sym-assoc-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" />
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'foxes.eaf');

    // 1. Check parsed stereotypes
    const wordsTier = parsed.tiers.find((t) => t.tierId === 'words@Speaker1');
    const posTier = parsed.tiers.find((t) => t.tierId === 'POS@Speaker1');
    const transTier = parsed.tiers.find((t) => t.tierId === 'Translation@Speaker1');

    expect(wordsTier.stereotype).toBe('Symbolic_Subdivision');
    expect(posTier.stereotype).toBe('Symbolic_Association');
    expect(transTier.stereotype).toBe('Symbolic_Association');

    // 2. Check detected defaults
    const detected = detectTierDefaults(parsed);
    expect(detected.speakers).toHaveLength(1);
    expect(detected.speakers[0].name).toBe('Speaker1');

    // POS should be detected as 'word' type, Translation as 'sentence'
    const posSubTier = detected.subTiers.find((st) => st.name === 'POS');
    const transSubTier = detected.subTiers.find((st) => st.name === 'Translation');
    expect(posSubTier).toBeDefined();
    expect(posSubTier.type).toBe('word');
    expect(transSubTier).toBeDefined();
    expect(transSubTier.type).toBe('sentence');

    // 3. Compile to project
    const compiled = compileElanToProject({
      eafData: parsed,
      tierConfigs: detected.tierConfigs,
      speakers: detected.speakers,
      subTiers: detected.subTiers,
    });

    expect(compiled.segments).toHaveLength(1);
    const seg = compiled.segments[0];
    expect(seg.text).toBe('The quick foxes');
    expect(seg.start).toBe(0.5);
    expect(seg.end).toBe(3.5);

    // POS word annotations array mapped 1:1 through the Symbolic_Subdivision hierarchy
    expect(seg.subTexts[String(posSubTier.id)]).toEqual(['DET', 'ADJ', 'NOUN']);

    // Sentence translation mapped to string
    expect(seg.subTexts[String(transSubTier.id)]).toBe('Die schnellen Füchse');
  });

  it('does not change Symbolic_Association tiers to word type based on tier name and does not add unintended morphs@ tier on export', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Linguist" DATE="2026-11-07T00:00:00" VERSION="3.0" FORMAT="3.0">
  <HEADER TIME_UNITS="milliseconds" />
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="2000" />
  </TIME_ORDER>
  <TIER TIER_ID="BIS@Speaker1" PARTICIPANT="Speaker1" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>book-s are here</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="Gloss@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>BOOK-PL COP ADV</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="POS@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a3" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>N V ADV</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="morph@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a4" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>book -s are here</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="sym-assoc-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" />
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'assoc-names.eaf');
    const detected = detectTierDefaults(parsed);

    expect(detected.subTiers).toHaveLength(3);
    for (const st of detected.subTiers) {
      expect(st.type).toBe('sentence');
    }

    const compiled = compileElanToProject({
      eafData: parsed,
      tierConfigs: detected.tierConfigs,
      speakers: detected.speakers,
      subTiers: detected.subTiers,
    });

    for (const st of compiled.subTiers) {
      expect(st.type).toBe('sentence');
    }

    const exportedXml = exportToEaf({
      segments: compiled.segments,
      subTiers: compiled.subTiers,
      speakers: compiled.speakers,
      mainTierTitle: detected.suggestedMainTierTitle,
    });

    expect(exportedXml).not.toContain('morphs@');
    expect(exportedXml).not.toContain('morphemes@');
    expect(exportedXml).not.toContain('Symbolic_Subdivision" TIME_ALIGNABLE');
    expect(exportedXml).toContain('TIER_ID="Gloss@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt"');
    expect(exportedXml).toContain('TIER_ID="POS@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt"');
    expect(exportedXml).toContain('TIER_ID="morph@Speaker1" PARENT_REF="BIS@Speaker1" LINGUISTIC_TYPE_REF="sym-assoc-lt"');
  });

  it('preserves custom ELAN tier types (elanTierType) and stereotypes for speakers and sub-tiers through import and export roundtrip', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Linguist" DATE="2026-11-08T00:00:00" VERSION="3.0" FORMAT="3.0">
  <HEADER TIME_UNITS="milliseconds" />
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="2000" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="3000" />
  </TIME_ORDER>
  <TIER TIER_ID="tx@SpkA" PARTICIPANT="SpkA" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts3">
        <ANNOTATION_VALUE>hello world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="tx@SpkB" PARTICIPANT="SpkB" LINGUISTIC_TYPE_REF="utterance-b-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4">
        <ANNOTATION_VALUE>hi</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="ft@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="free-trans-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a3" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>greeting world</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="pos@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="pos-sym-lt">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a4" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>INTJ</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a5" ANNOTATION_REF="a1" PREVIOUS_ANNOTATION="a4">
        <ANNOTATION_VALUE>NOUN</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="morph@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="morph-time-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a6" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>M1</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a7" TIME_SLOT_REF1="ts2" TIME_SLOT_REF2="ts3">
        <ANNOTATION_VALUE>M2</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-b-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="free-trans-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="pos-sym-lt" CONSTRAINTS="Symbolic_Subdivision" TIME_ALIGNABLE="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="morph-time-lt" CONSTRAINTS="Time_Subdivision" TIME_ALIGNABLE="true" />
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'custom-types.eaf');
    expect(parsed.linguisticTypes).toHaveLength(5);

    const detected = detectTierDefaults(parsed);

    // Per-speaker ELAN tier type preserved
    const spkA = detected.speakers.find((s) => s.name === 'SpkA');
    const spkB = detected.speakers.find((s) => s.name === 'SpkB');
    expect(spkA?.elanTierType).toBe('utterance-lt');
    expect(spkB?.elanTierType).toBe('utterance-b-lt');

    // Per-sub-tier ELAN tier type and stereotype preserved
    const ftSub = detected.subTiers.find((st) => st.name === 'ft');
    const posSub = detected.subTiers.find((st) => st.name === 'pos');
    const morphSub = detected.subTiers.find((st) => st.name === 'morph');

    expect(ftSub).toMatchObject({
      type: 'sentence',
      stereotype: 'Symbolic_Association',
      elanTierType: 'free-trans-lt',
    });
    expect(posSub).toMatchObject({
      type: 'word',
      stereotype: 'Symbolic_Subdivision',
      elanTierType: 'pos-sym-lt',
    });
    expect(morphSub).toMatchObject({
      type: 'word',
      stereotype: 'Time_Subdivision',
      elanTierType: 'morph-time-lt',
    });

    const compiled = compileElanToProject({
      eafData: parsed,
      tierConfigs: detected.tierConfigs,
      speakers: detected.speakers,
      subTiers: detected.subTiers,
    });

    expect(compiled.speakers.find((s) => s.name === 'SpkA')?.elanTierType).toBe('utterance-lt');
    expect(compiled.speakers.find((s) => s.name === 'SpkB')?.elanTierType).toBe('utterance-b-lt');

    const exportedXml = exportToEaf({
      segments: compiled.segments,
      subTiers: compiled.subTiers,
      speakers: compiled.speakers,
      mainTierTitle: detected.suggestedMainTierTitle,
    });

    // Verify exported XML preserves custom LINGUISTIC_TYPE_IDs and CONSTRAINTS
    expect(exportedXml).toContain('<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />');
    expect(exportedXml).toContain('<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-b-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />');
    expect(exportedXml).toContain('<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="free-trans-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />');
    expect(exportedXml).toContain('<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="pos-sym-lt" CONSTRAINTS="Symbolic_Subdivision" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />');
    expect(exportedXml).toContain('<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="morph-time-lt" CONSTRAINTS="Time_Subdivision" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />');

    expect(exportedXml).toContain('<TIER TIER_ID="tx@SpkA" PARTICIPANT="SpkA" LINGUISTIC_TYPE_REF="utterance-lt">');
    expect(exportedXml).toContain('<TIER TIER_ID="tx@SpkB" PARTICIPANT="SpkB" LINGUISTIC_TYPE_REF="utterance-b-lt">');
    expect(exportedXml).toContain('<TIER TIER_ID="ft@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="free-trans-lt">');
    expect(exportedXml).toContain('<TIER TIER_ID="pos@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="pos-sym-lt">');
    expect(exportedXml).toContain('<TIER TIER_ID="morph@SpkA" PARENT_REF="tx@SpkA" LINGUISTIC_TYPE_REF="morph-time-lt">');
  });

  it('roundtrips word sub-tiers cleanly without creating an intermediary morphs@ tier', () => {
    const initialSegments = [
      {
        id: 1,
        start: 0,
        end: 4.0,
        speaker: 'Speaker1',
        speakerId: 1,
        text: 'book-s are here',
        subTexts: {
          '1': ['N', '', 'V', 'ADV'],
          '2': 'The books are here',
        },
      },
    ];
    const initialSubTiers = [
      { id: 1, name: 'POS', type: 'word' },
      { id: 2, name: 'Translation', type: 'sentence' },
    ];
    const initialSpeakers = [{ id: 1, name: 'Speaker1', initials: 'S1' }];

    const xml = exportToEaf({
      segments: initialSegments,
      subTiers: initialSubTiers,
      speakers: initialSpeakers,
      mainTierTitle: 'BIS',
    });

    expect(xml).not.toContain('morphs@');
    expect(xml).not.toContain('morphemes@');

    const parsed = parseEaf(xml, 'word-roundtrip.eaf');
    const detected = detectTierDefaults(parsed);

    expect(detected.subTiers).toHaveLength(2);
    const posTier = detected.subTiers.find((st) => st.name === 'POS');
    const transTier = detected.subTiers.find((st) => st.name === 'Translation');
    expect(posTier?.type).toBe('word');
    expect(transTier?.type).toBe('sentence');

    const compiled = compileElanToProject({
      eafData: parsed,
      tierConfigs: detected.tierConfigs,
      speakers: detected.speakers,
      subTiers: detected.subTiers,
    });

    expect(compiled.segments).toHaveLength(1);
    expect(compiled.segments[0].subTexts[String(posTier.id)]).toEqual([
      'N',
      '',
      'V',
      'ADV',
    ]);
    expect(compiled.segments[0].subTexts[String(transTier.id)]).toBe(
      'The books are here',
    );
  });

  it('sorts tierConfigs so dependent tiers appear directly below their parent tier', () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/>
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000"/>
  </TIME_ORDER>
  <TIER TIER_ID="Spk1" LINGUISTIC_TYPE_REF="default-lt" />
  <TIER TIER_ID="Spk2" LINGUISTIC_TYPE_REF="default-lt" />
  <TIER TIER_ID="Trans@Spk2" PARENT_REF="Spk2" LINGUISTIC_TYPE_REF="dependent-lt" />
  <TIER TIER_ID="Trans@Spk1" PARENT_REF="Spk1" LINGUISTIC_TYPE_REF="dependent-lt" />
  <TIER TIER_ID="Gloss@Spk1" PARENT_REF="Spk1" LINGUISTIC_TYPE_REF="dependent-lt" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="dependent-lt" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" />
</ANNOTATION_DOCUMENT>`;

    const parsed = parseEaf(rawXml, 'sorted.eaf');
    const detected = detectTierDefaults(parsed);

    expect(detected.tierConfigs.map((tc) => tc.tierId)).toEqual([
      'Spk1',
      'Trans@Spk1',
      'Gloss@Spk1',
      'Spk2',
      'Trans@Spk2',
    ]);
  });
});

