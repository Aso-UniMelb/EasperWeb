/**
 * ELAN Annotation Format (.eaf) Generator
 * Compatible with pympi-ling and ELAN 2.8 / 3.0 specification.
 */

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

import {
  normalizeSubTiers,
  getSubText,
  getWordAnnotations,
  tokenizeWords,
  SUB_TIER_TYPE_WORD,
  SUB_TIER_TYPE_SENTENCE,
  DEFAULT_SPLITTERS,
} from './utils/subTiers.js';

function cleanSpeechText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[BLANK_AUDIO\]/g, '')
    .trim();
}

export const ALIGNED_TYPE = 'default-lt';
export const DEPENDENT_TYPE = 'dependent-lt';
export const SUBDIVISION_TYPE = 'words-lt';
export const SYM_SUBDIVISION_TYPE = 'sym-subdivision-lt';
export const SYM_ASSOCIATION_TYPE = 'sym-association-lt';

export class ElanEaf {
  constructor({ author = 'EasperWeb' } = {}) {
    this.author = author;
    this.date = new Date().toISOString();
    this.mediaDescriptors = [];
    // tierId -> { participant, parentRef, typeRef, annotations: [] }
    // Aligned annotations hold { localId, startMs, endMs, value };
    // dependent ones hold { localId, parentLocalId, value }.
    this.tiers = new Map();
    this.localIdCounter = 0;
  }

  addLinkedFile(filePath, mimeType = 'audio/x-wav') {
    this.mediaDescriptors.push({
      mediaUrl: filePath,
      relativeUrl: filePath,
      mimeType: mimeType || 'audio/x-wav',
    });
  }

  addTier(
    tierId,
    participant = '',
    {
      parentRef = null,
      typeRef = ALIGNED_TYPE,
      stereotype = null,
      annotator = '',
    } = {},
  ) {
    const resolvedStereotype =
      stereotype ||
      (!parentRef
        ? 'None'
        : typeRef === SUBDIVISION_TYPE
          ? 'Time_Subdivision'
          : typeRef === SYM_SUBDIVISION_TYPE
            ? 'Symbolic_Subdivision'
            : 'Symbolic_Association');

    if (!this.tiers.has(tierId)) {
      this.tiers.set(tierId, {
        participant,
        annotator,
        parentRef,
        typeRef: typeRef || ALIGNED_TYPE,
        stereotype: resolvedStereotype,
        annotations: [],
      });
      return;
    }
    const tier = this.tiers.get(tierId);
    if (participant && !tier.participant) tier.participant = participant;
    if (annotator && !tier.annotator) tier.annotator = annotator;
    if (parentRef && !tier.parentRef) tier.parentRef = parentRef;
    if (typeRef && tier.typeRef === ALIGNED_TYPE && typeRef !== ALIGNED_TYPE) {
      tier.typeRef = typeRef;
    }
    if (stereotype && (!tier.stereotype || tier.stereotype === 'None')) {
      tier.stereotype = stereotype;
    }
  }

  /**
   * Adds a time-aligned annotation and returns a local handle, which dependent
   * annotations pass to `addRefAnnotation` to attach themselves to this one.
   * Returns null when the interval is unusable.
   *
   * @returns {string|null} local handle
   */
  addAnnotation(
    tierId,
    startMs,
    endMs,
    value = '',
    participant = '',
    { annotator = '', typeRef = ALIGNED_TYPE } = {},
  ) {
    const textVal = cleanSpeechText(value || '');
    this.addTier(tierId, participant, {
      annotator,
      typeRef: typeRef || ALIGNED_TYPE,
      stereotype: 'None',
    });
    const s = Math.round(Number(startMs));
    const e = Math.round(Number(endMs));
    if (e <= s) return null; // Discard invalid or zero-length duration
    const localId = `n${++this.localIdCounter}`;
    this.tiers.get(tierId).annotations.push({
      localId,
      startMs: s,
      endMs: e,
      value: textVal,
    });
    return localId;
  }

  /**
   * Adds a series of subdivided time-aligned annotations (e.g. morphemes)
   * under a parent time-aligned annotation. The subdivisions strictly
   * partition the parent's duration with no gaps.
   *
   * @param {string} tierId Child subdivision tier ID (e.g. morphs@Speaker1)
   * @param {string} parentTierId Parent tier ID
   * @param {string} parentLocalId Parent annotation handle
   * @param {Array<{ value: string, startMs: number, endMs: number }>} items
   * @param {Object} [options]
   * @param {string} [options.annotator='']
   * @param {string} [options.typeRef=SUBDIVISION_TYPE]
   * @returns {Array<string>} Array of local handles for each subdivided annotation
   */
  addSubdividedAnnotations(
    tierId,
    parentTierId,
    parentLocalId,
    items = [],
    { annotator = '', typeRef = SUBDIVISION_TYPE } = {},
  ) {
    if (!parentLocalId || !Array.isArray(items) || items.length === 0) return [];

    this.addTier(tierId, '', {
      parentRef: parentTierId,
      typeRef: typeRef || SUBDIVISION_TYPE,
      stereotype: 'Time_Subdivision',
      annotator,
    });

    const tier = this.tiers.get(tierId);
    const localIds = [];

    for (const item of items) {
      const textVal = cleanSpeechText(item.value || '');
      const s = Math.round(Number(item.startMs));
      const e = Math.round(Number(item.endMs));
      const localId = `n${++this.localIdCounter}`;
      localIds.push(localId);

      tier.annotations.push({
        localId,
        parentLocalId,
        startMs: s,
        endMs: e,
        value: textVal,
      });
    }

    return localIds;
  }

  /**
   * Adds an ordered series of symbolic subdivisions (e.g. words, morphemes)
   * under a parent annotation without independent time intervals.
   * In ELAN, these use REF_ANNOTATION chained together via PREVIOUS_ANNOTATION.
   *
   * @param {string} tierId Child subdivision tier ID (e.g. morphs@Speaker1)
   * @param {string} parentTierId Parent tier ID
   * @param {string} parentLocalId Parent annotation handle
   * @param {Array<string|{ value: string }>} items Array of word tokens or objects
   * @param {Object} [options]
   * @param {string} [options.annotator='']
   * @param {string} [options.typeRef=SYM_SUBDIVISION_TYPE]
   * @returns {Array<string>} Array of local handles for each subdivided annotation
   */
  addSymbolicSubdivisionAnnotations(
    tierId,
    parentTierId,
    parentLocalId,
    items = [],
    { annotator = '', typeRef = SYM_SUBDIVISION_TYPE } = {},
  ) {
    if (!parentLocalId || !Array.isArray(items) || items.length === 0) return [];

    this.addTier(tierId, '', {
      parentRef: parentTierId,
      typeRef: typeRef || SYM_SUBDIVISION_TYPE,
      stereotype: 'Symbolic_Subdivision',
      annotator,
    });

    const tier = this.tiers.get(tierId);
    const localIds = [];

    for (const item of items) {
      const textVal = cleanSpeechText(
        typeof item === 'string' ? item : item?.value || '',
      );
      const localId = `n${++this.localIdCounter}`;
      localIds.push(localId);

      tier.annotations.push({
        localId,
        parentLocalId,
        value: textVal,
      });
    }

    return localIds;
  }

  /**
   * Adds a dependent (ELAN "referring") annotation on a child tier, tied one-to-one
   * to a parent annotation. This is what makes a translation or gloss line show up
   * underneath its utterance in ELAN rather than as an unrelated tier.
   *
   * @param {string} tierId Child tier id
   * @param {string} parentTierId Tier the child hangs off
   * @param {string|null} parentLocalId Handle returned by addAnnotation or addSubdividedAnnotations
   * @param {string} value
   * @param {Object} [options]
   * @param {boolean} [options.allowEmpty=false] Whether to preserve empty annotations
   * @param {string} [options.annotator='']
   * @param {string} [options.typeRef=DEPENDENT_TYPE]
   */
  addRefAnnotation(
    tierId,
    parentTierId,
    parentLocalId,
    value = '',
    { allowEmpty = false, annotator = '', typeRef = DEPENDENT_TYPE } = {},
  ) {
    if (!parentLocalId) return null;
    const textVal = cleanSpeechText(value || '');
    if (!textVal && !allowEmpty) return null;
    this.addTier(tierId, '', {
      parentRef: parentTierId,
      typeRef: typeRef || DEPENDENT_TYPE,
      stereotype: 'Symbolic_Association',
      annotator,
    });
    const localId = `n${++this.localIdCounter}`;
    this.tiers.get(tierId).annotations.push({
      localId,
      parentLocalId,
      value: textVal,
    });
    return localId;
  }

  toXml() {
    let tsCounter = 1;
    let aidCounter = 1;

    const timeSlots = [];
    const localToAid = new Map();
    const parentSlots = new Map(); // localId -> { startTs, endTs }
    const tierOutput = new Map();

    // Pass 1 — Root time-aligned tiers (no parentRef).
    for (const [tierId, tierData] of this.tiers.entries()) {
      if (tierData.parentRef) continue;
      const sorted = [...tierData.annotations].sort(
        (a, b) => a.startMs - b.startMs,
      );
      const mapped = [];

      for (const ann of sorted) {
        const ts1 = `ts${tsCounter++}`;
        const ts2 = `ts${tsCounter++}`;
        timeSlots.push({ id: ts1, time: ann.startMs });
        timeSlots.push({ id: ts2, time: ann.endMs });

        const aid = `a${aidCounter++}`;
        localToAid.set(ann.localId, aid);
        parentSlots.set(ann.localId, { startTs: ts1, endTs: ts2 });
        mapped.push({ aid, ts1, ts2, value: ann.value });
      }

      tierOutput.set(tierId, {
        tierId,
        participant: tierData.participant,
        annotator: tierData.annotator || '',
        parentRef: null,
        typeRef: tierData.typeRef || ALIGNED_TYPE,
        stereotype: 'None',
        isAlignable: true,
        annotations: mapped,
      });
    }

    // Pass 2 — Subdivided time-aligned tiers (stereotype === 'Time_Subdivision').
    for (const [tierId, tierData] of this.tiers.entries()) {
      if (
        !tierData.parentRef ||
        tierData.stereotype !== 'Time_Subdivision'
      ) {
        continue;
      }

      // Group annotations by parentLocalId to preserve subdivision chaining
      const groups = new Map();
      for (const ann of tierData.annotations) {
        if (!groups.has(ann.parentLocalId)) {
          groups.set(ann.parentLocalId, []);
        }
        groups.get(ann.parentLocalId).push(ann);
      }

      const mapped = [];
      for (const [parentLocalId, group] of groups.entries()) {
        const pSlot = parentSlots.get(parentLocalId);
        group.sort((a, b) => a.startMs - b.startMs);

        const count = group.length;
        if (count === 0) continue;

        let prevTs = pSlot ? pSlot.startTs : null;
        if (!prevTs) {
          prevTs = `ts${tsCounter++}`;
          timeSlots.push({ id: prevTs, time: group[0].startMs });
        }

        for (let i = 0; i < count; i++) {
          const ann = group[i];
          const isLast = i === count - 1;

          let endTs;
          if (isLast && pSlot) {
            endTs = pSlot.endTs;
          } else {
            endTs = `ts${tsCounter++}`;
            timeSlots.push({ id: endTs, time: ann.endMs });
          }

          const aid = `a${aidCounter++}`;
          localToAid.set(ann.localId, aid);
          parentSlots.set(ann.localId, { startTs: prevTs, endTs });
          mapped.push({ aid, ts1: prevTs, ts2: endTs, value: ann.value });

          prevTs = endTs;
        }
      }

      tierOutput.set(tierId, {
        tierId,
        participant: tierData.participant,
        annotator: tierData.annotator || '',
        parentRef: tierData.parentRef,
        typeRef: tierData.typeRef || SUBDIVISION_TYPE,
        stereotype: 'Time_Subdivision',
        isAlignable: true,
        annotations: mapped,
      });
    }

    // Pass 3 — Symbolic subdivision tiers (stereotype === 'Symbolic_Subdivision').
    for (const [tierId, tierData] of this.tiers.entries()) {
      if (
        !tierData.parentRef ||
        tierData.stereotype !== 'Symbolic_Subdivision'
      ) {
        continue;
      }

      const groups = new Map();
      for (const ann of tierData.annotations) {
        if (!groups.has(ann.parentLocalId)) {
          groups.set(ann.parentLocalId, []);
        }
        groups.get(ann.parentLocalId).push(ann);
      }

      const mapped = [];
      for (const [parentLocalId, group] of groups.entries()) {
        const parentAid = localToAid.get(parentLocalId);
        if (!parentAid) continue;

        let prevAid = null;
        for (const ann of group) {
          const aid = `a${aidCounter++}`;
          localToAid.set(ann.localId, aid);
          mapped.push({
            aid,
            refAid: parentAid,
            prevAid,
            value: ann.value,
          });
          prevAid = aid;
        }
      }

      tierOutput.set(tierId, {
        tierId,
        participant: tierData.participant,
        annotator: tierData.annotator || '',
        parentRef: tierData.parentRef,
        typeRef: tierData.typeRef || SYM_SUBDIVISION_TYPE,
        stereotype: 'Symbolic_Subdivision',
        isAlignable: false,
        annotations: mapped,
      });
    }

    // Pass 4 — Dependent reference tiers (Symbolic_Association).
    for (const [tierId, tierData] of this.tiers.entries()) {
      if (
        !tierData.parentRef ||
        tierData.stereotype === 'Time_Subdivision' ||
        tierData.stereotype === 'Symbolic_Subdivision'
      ) {
        continue;
      }

      const mapped = [];
      for (const ann of tierData.annotations) {
        const refAid = localToAid.get(ann.parentLocalId);
        if (!refAid) continue;
        const aid = `a${aidCounter++}`;
        localToAid.set(ann.localId, aid);
        mapped.push({ aid, refAid, value: ann.value });
      }

      tierOutput.set(tierId, {
        tierId,
        participant: tierData.participant,
        annotator: tierData.annotator || '',
        parentRef: tierData.parentRef,
        typeRef: tierData.typeRef || DEPENDENT_TYPE,
        stereotype: 'Symbolic_Association',
        isAlignable: false,
        annotations: mapped,
      });
    }

    // Ensure timeslots are in non-decreasing order
    timeSlots.sort((a, b) => a.time - b.time);

    // Collect and disambiguate LINGUISTIC_TYPE definitions (typeRef -> stereotype)
    const linguisticTypes = new Map();
    if (this.tiers.size === 0) {
      linguisticTypes.set(ALIGNED_TYPE, 'None');
    } else {
      for (const data of tierOutput.values()) {
        let typeId = (data.typeRef || ALIGNED_TYPE).trim();
        const st =
          data.stereotype || (data.parentRef ? 'Symbolic_Association' : 'None');
        if (linguisticTypes.has(typeId) && linguisticTypes.get(typeId) !== st) {
          const suffix =
            st === 'None'
              ? 'root'
              : st.toLowerCase().replace(/_/g, '-');
          typeId = `${typeId}-${suffix}`;
          data.typeRef = typeId;
        }
        linguisticTypes.set(typeId, st);
      }
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
    xml += `<ANNOTATION_DOCUMENT AUTHOR="${escapeXml(this.author)}" DATE="${this.date}" VERSION="2.8" FORMAT="2.8" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv2.8.xsd">
`;

    // HEADER
    xml += `	<HEADER>
`;
    for (const md of this.mediaDescriptors) {
      xml += `		<MEDIA_DESCRIPTOR MEDIA_URL="${escapeXml(md.mediaUrl)}" MIME_TYPE="${escapeXml(md.mimeType)}" RELATIVE_MEDIA_URL="${escapeXml(md.relativeUrl)}" />
`;
    }
    xml += `		<PROPERTY NAME="lastUsedAnnotation">${aidCounter - 1}</PROPERTY>
`;
    xml += `	</HEADER>
`;

    // TIME_ORDER
    xml += `	<TIME_ORDER>
`;
    for (const ts of timeSlots) {
      xml += `		<TIME_SLOT TIME_SLOT_ID="${ts.id}" TIME_VALUE="${ts.time}" />
`;
    }
    xml += `	</TIME_ORDER>
`;

    // TIERS
    if (this.tiers.size === 0) {
      xml += `	<TIER TIER_ID="default" LINGUISTIC_TYPE_REF="${ALIGNED_TYPE}" />
`;
    }

    for (const tierId of this.tiers.keys()) {
      const data = tierOutput.get(tierId);
      if (!data) continue;

      const annotAttr = data.annotator
        ? ` ANNOTATOR="${escapeXml(data.annotator)}"`
        : '';
      const parentAttr = data.parentRef
        ? ` PARENT_REF="${escapeXml(data.parentRef)}"`
        : '';
      const partAttr = data.participant
        ? ` PARTICIPANT="${escapeXml(data.participant)}"`
        : '';

      if (data.annotations.length === 0) {
        xml += `	<TIER TIER_ID="${escapeXml(tierId)}"${annotAttr}${parentAttr}${partAttr} LINGUISTIC_TYPE_REF="${escapeXml(data.typeRef)}" />
`;
        continue;
      }

      xml += `	<TIER TIER_ID="${escapeXml(tierId)}"${annotAttr}${parentAttr}${partAttr} LINGUISTIC_TYPE_REF="${escapeXml(data.typeRef)}">
`;
      if (data.isAlignable) {
        for (const ann of data.annotations) {
          xml += `		<ANNOTATION>
`;
          xml += `			<ALIGNABLE_ANNOTATION ANNOTATION_ID="${ann.aid}" TIME_SLOT_REF1="${ann.ts1}" TIME_SLOT_REF2="${ann.ts2}">
`;
          xml += `				<ANNOTATION_VALUE>${escapeXml(ann.value)}</ANNOTATION_VALUE>
`;
          xml += `			</ALIGNABLE_ANNOTATION>
`;
          xml += `		</ANNOTATION>
`;
        }
      } else {
        for (const ann of data.annotations) {
          xml += `		<ANNOTATION>
`;
          const prevAttr = ann.prevAid
            ? ` PREVIOUS_ANNOTATION="${escapeXml(ann.prevAid)}"`
            : '';
          xml += `			<REF_ANNOTATION ANNOTATION_ID="${ann.aid}" ANNOTATION_REF="${ann.refAid}"${prevAttr}>
`;
          xml += `				<ANNOTATION_VALUE>${escapeXml(ann.value)}</ANNOTATION_VALUE>
`;
          xml += `			</REF_ANNOTATION>
`;
          xml += `		</ANNOTATION>
`;
        }
      }
      xml += `	</TIER>
`;
    }

    // LINGUISTIC_TYPE & CONSTRAINTS
    for (const [ltId, st] of linguisticTypes.entries()) {
      if (!st || st === 'None') {
        xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${escapeXml(ltId)}" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
`;
      } else if (st === 'Time_Subdivision') {
        xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${escapeXml(ltId)}" CONSTRAINTS="Time_Subdivision" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
`;
      } else if (st === 'Symbolic_Subdivision') {
        xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${escapeXml(ltId)}" CONSTRAINTS="Symbolic_Subdivision" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />
`;
      } else {
        xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${escapeXml(ltId)}" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />
`;
      }
    }
    xml += `	<CONSTRAINT STEREOTYPE="Time_Subdivision" DESCRIPTION="Time subdivision of parent annotation's time interval, no time gaps allowed within this interval" />
`;
    xml += `	<CONSTRAINT STEREOTYPE="Symbolic_Subdivision" DESCRIPTION="Symbolic subdivision of a parent annotation. Annotations refering to the same parent are ordered" />
`;
    xml += `	<CONSTRAINT STEREOTYPE="Symbolic_Association" DESCRIPTION="1-1 association with a parent annotation" />
`;
    xml += `	<CONSTRAINT STEREOTYPE="Included_In" DESCRIPTION="Time alignable annotations within the parent annotation's time interval, gaps are allowed" />
`;
    xml += `</ANNOTATION_DOCUMENT>
`;

    return xml;
  }
}

/**
 * Helper to build an ELAN EAF XML string from transcribed segments and optional word chunks.
 *
 * @param {Object} options
 * @param {string} [options.audioFileName='audio.wav'] Linked audio filename
 * @param {Array} [options.segments=[]] Array of segments with { start, end, text, speakerId, speaker, subTexts }
 * @param {Array} [options.chunks=[]] Array of chunks with { timestamp: [start, end], text }
 * @param {boolean} [options.includeWordTier=false] Whether to also include a word-level tier
 * @param {string} [options.mainTierTitle=''] Title prefix for main transcription root tiers (e.g. 'BIS' yields 'BIS@Speaker1')
 * @param {string} [options.transcriber=''] Transcriber / author name for main transcription root tiers
 * @param {Array} [options.speakers=[]] Array of speaker objects [{ id, name, initials, elanTierType }]
 * @param {Array} [options.subTiers=[]] Project sub-tiers [{ id, name, annotator, elanTierType, stereotype }] in the order
 *   they should appear; each becomes a dependent tier under every speaker tier,
 *   e.g. `Translation@John Doe`
 * @param {string} [options.author='EasperWeb'] Project author / transcriber name
 * @param {'Symbolic_Subdivision'|'Time_Subdivision'} [options.subdivisionStereotype='Symbolic_Subdivision'] Tier stereotype fallback for word subdivisions
 * @returns {string} XML string in .eaf format
 */
export function exportToEaf({
  audioFileName = 'audio.wav',
  segments = [],
  chunks = [],
  includeWordTier = false,
  mainTierTitle = '',
  transcriber = '',
  speakers = [],
  subTiers = [],
  author = 'EasperWeb',
  subdivisionStereotype = 'Symbolic_Subdivision',
} = {}) {
  const eaf = new ElanEaf({ author });
  eaf.addLinkedFile(audioFileName, 'audio/x-wav');

  // Track which raw sub-tiers had an explicit stereotype specified by the caller
  const explicitSubTierStereotypes = new Map();
  if (Array.isArray(subTiers)) {
    for (const rawSt of subTiers) {
      if (rawSt && typeof rawSt === 'object' && rawSt.stereotype) {
        const key = rawSt.id != null ? Number(rawSt.id) : rawSt.name;
        explicitSubTierStereotypes.set(key, String(rawSt.stereotype).trim());
      }
    }
  }

  const getWordSubTierStereotype = (st) => {
    const explicit =
      explicitSubTierStereotypes.get(st.id) ||
      explicitSubTierStereotypes.get(st.name);
    if (
      explicit === 'Time_Subdivision' ||
      explicit === 'Symbolic_Subdivision'
    ) {
      return explicit;
    }
    if (subdivisionStereotype === 'Time_Subdivision') {
      return 'Time_Subdivision';
    }
    return st.stereotype === 'Time_Subdivision'
      ? 'Time_Subdivision'
      : 'Symbolic_Subdivision';
  };

  const getSubTierTypeRef = (st) => {
    const custom = (st.elanTierType || '').trim();
    if (custom) return custom;
    if (st.type === SUB_TIER_TYPE_WORD) {
      return getWordSubTierStereotype(st) === 'Time_Subdivision'
        ? SUBDIVISION_TYPE
        : SYM_SUBDIVISION_TYPE;
    }
    return DEPENDENT_TYPE;
  };

  const mainAnnotator = (
    transcriber ||
    (author && author !== 'EasperWeb' && author !== 'Easper' ? author : '')
  ).trim();

  // Speaker map by ID (1-5), by name, initials, and variations
  const speakerMap = new Map();
  if (Array.isArray(speakers) && speakers.length > 0) {
    for (const spk of speakers) {
      if (spk && spk.id != null) {
        const idNum = Number(spk.id);
        speakerMap.set(idNum, spk);
        speakerMap.set(String(idNum), spk);
        speakerMap.set(`speaker ${idNum}`, spk);
        speakerMap.set(`speaker_${idNum}`, spk);
        speakerMap.set(`spk ${idNum}`, spk);
        speakerMap.set(`spk${idNum}`, spk);
        if (spk.name) {
          speakerMap.set(String(spk.name).trim().toLowerCase(), spk);
        }
        if (spk.initials) {
          speakerMap.set(String(spk.initials).trim().toLowerCase(), spk);
        }
      }
    }
  }

  // Order is the caller's: dependent tiers are written in the order the user
  // arranged the columns, which is the order ELAN then shows them in.
  const cleanSubTiers = normalizeSubTiers(subTiers, { sort: false });

  const cleanMainTier = (mainTierTitle || '').trim().replace(/@+$/, '');

  const getSpeakerRootTierId = (spkName) => {
    if (!cleanMainTier) return spkName;
    if (spkName.startsWith(`${cleanMainTier}@`)) return spkName;
    return `${cleanMainTier}@${spkName}`;
  };

  // ELAN convention: a dependent tier is named `<layer>@<participant>` so the same
  // layer can hang off every speaker tier without id collisions.
  const dependentTierId = (subTierName, spkName) =>
    `${subTierName}@${spkName}`;

  // Pre-create tiers for all configured speakers in the project, plus dependent
  // sub-tiers per speaker, so layers arrive in ELAN ready to type into.
  if (Array.isArray(speakers) && speakers.length > 0) {
    for (const spk of speakers) {
      const spkLabel = spk.name ? spk.name.trim() : `Speaker ${spk.id}`;
      const rootTierId = getSpeakerRootTierId(spkLabel);
      const spkTypeRef = (spk.elanTierType || '').trim() || ALIGNED_TYPE;
      eaf.addTier(rootTierId, spk.name || `Speaker ${spk.id}`, {
        typeRef: spkTypeRef,
        stereotype: 'None',
        annotator: mainAnnotator,
      });

      for (const st of cleanSubTiers) {
        const subTierAnnotator = (st.annotator || '').trim();
        const subTypeRef = getSubTierTypeRef(st);
        if (st.type === SUB_TIER_TYPE_WORD) {
          const wordStereotype = getWordSubTierStereotype(st);
          eaf.addTier(dependentTierId(st.name, spkLabel), '', {
            parentRef: rootTierId,
            typeRef: subTypeRef,
            stereotype: wordStereotype,
            annotator: subTierAnnotator,
          });
        } else {
          eaf.addTier(dependentTierId(st.name, spkLabel), '', {
            parentRef: rootTierId,
            typeRef: subTypeRef,
            stereotype: 'Symbolic_Association',
            annotator: subTierAnnotator,
          });
        }
      }
    }
  }

  if (segments && segments.length > 0) {
    for (const seg of segments) {
      const text = cleanSpeechText(seg.text || '');

      let speakerObj = null;

      // 1. Check numeric/string speakerId first
      if (seg.speakerId != null && speakerMap.has(Number(seg.speakerId))) {
        speakerObj = speakerMap.get(Number(seg.speakerId));
      }

      // 2. Check seg.speaker string against speakerMap
      if (!speakerObj && seg.speaker) {
        const rawStr = String(seg.speaker).trim().toLowerCase();
        if (speakerMap.has(rawStr)) {
          speakerObj = speakerMap.get(rawStr);
        } else {
          // Check pattern like "Speaker 1", "speaker_1", "spk 1", "1"
          const m = rawStr.match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
          if (m && speakerMap.has(Number(m[1]))) {
            speakerObj = speakerMap.get(Number(m[1]));
          }
        }
      }

      // 3. Fallback to first configured speaker if speakers are defined
      if (!speakerObj && Array.isArray(speakers) && speakers.length > 0) {
        speakerObj = speakers[0];
      }

      let spkLabel = '';
      let participant = '';
      if (speakerObj) {
        spkLabel = speakerObj.name
          ? speakerObj.name.trim()
          : `Speaker ${speakerObj.id}`;
        participant = speakerObj.name || spkLabel;
      } else if (seg.speaker) {
        spkLabel = seg.speaker.trim();
        participant = spkLabel;
      } else {
        spkLabel = 'Speaker 1';
        participant = 'Speaker 1';
      }
      const rootTierId = getSpeakerRootTierId(spkLabel);
      const spkTypeRef = (speakerObj?.elanTierType || '').trim() || ALIGNED_TYPE;

      const startMs = Math.round(seg.start * 1000);
      const endMs = Math.round(seg.end * 1000);
      if (endMs <= startMs) continue;

      const parentLocalId = eaf.addAnnotation(
        rootTierId,
        startMs,
        endMs,
        text,
        participant,
        { annotator: mainAnnotator, typeRef: spkTypeRef },
      );
      if (!parentLocalId) continue;

      for (const st of cleanSubTiers) {
        const subTierAnnotator = (st.annotator || '').trim();
        const subTypeRef = getSubTierTypeRef(st);
        if (st.type === SUB_TIER_TYPE_WORD) {
          const words = tokenizeWords(
            seg.text,
            st.splitters ?? DEFAULT_SPLITTERS,
          );
          if (words.length > 0) {
            const tags = getWordAnnotations(seg, st.id, words.length);
            const cleanTags = tags.map((t) => (t ? String(t).trim() : ''));
            const subTierId = dependentTierId(st.name, spkLabel);
            const isTimeSubdiv =
              getWordSubTierStereotype(st) === 'Time_Subdivision';

            if (isTimeSubdiv) {
              const durationMs = endMs - startMs;
              const tagItems = cleanTags.map((tagVal, idx) => {
                const mStart =
                  startMs + Math.round((idx * durationMs) / words.length);
                const mEnd =
                  idx === words.length - 1
                    ? endMs
                    : startMs +
                      Math.round(((idx + 1) * durationMs) / words.length);
                return {
                  value: tagVal,
                  startMs: mStart,
                  endMs: mEnd,
                };
              });

              eaf.addSubdividedAnnotations(
                subTierId,
                rootTierId,
                parentLocalId,
                tagItems,
                { annotator: subTierAnnotator, typeRef: subTypeRef },
              );
            } else {
              eaf.addSymbolicSubdivisionAnnotations(
                subTierId,
                rootTierId,
                parentLocalId,
                cleanTags,
                { annotator: subTierAnnotator, typeRef: subTypeRef },
              );
            }
          }
        } else {
          const subText = getSubText(seg, st.id);
          if (subText && subText.trim()) {
            eaf.addRefAnnotation(
              dependentTierId(st.name, spkLabel),
              rootTierId,
              parentLocalId,
              subText,
              { annotator: subTierAnnotator, typeRef: subTypeRef },
            );
          }
        }
      }
    }
  } else if (chunks && chunks.length > 0) {
    const fallbackSpkObj = speakers && speakers[0] ? speakers[0] : null;
    const fallbackSpk =
      fallbackSpkObj?.name ? fallbackSpkObj.name.trim() : 'Speaker 1';
    const fallbackTier = getSpeakerRootTierId(fallbackSpk);
    const fallbackParticipant = fallbackSpk;
    const fallbackTypeRef =
      (fallbackSpkObj?.elanTierType || '').trim() || ALIGNED_TYPE;
    for (const chunk of chunks) {
      const text = cleanSpeechText(chunk.text);
      if (!text) continue;
      const [startSec, endSec] = chunk.timestamp || [0, 0];
      const startMs = Math.round(startSec * 1000);
      const endMs = Math.round((endSec ?? startSec + 1) * 1000);
      eaf.addAnnotation(
        fallbackTier,
        startMs,
        endMs,
        text,
        fallbackParticipant,
        { annotator: mainAnnotator, typeRef: fallbackTypeRef },
      );
    }
  }

  if (includeWordTier && chunks && chunks.length > 0) {
    for (const chunk of chunks) {
      const text = cleanSpeechText(chunk.text);
      if (!text) continue;
      const [startSec, endSec] = chunk.timestamp || [0, 0];
      const startMs = Math.round(startSec * 1000);
      const endMs = Math.round((endSec ?? startSec + 0.3) * 1000);
      eaf.addAnnotation('words', startMs, endMs, text);
    }
  }

  return eaf.toXml();
}
