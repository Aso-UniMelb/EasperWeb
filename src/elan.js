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

import { normalizeSubTiers, getSubText } from './utils/subTiers.js';

function cleanSpeechText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[BLANK_AUDIO\]/g, '')
    .trim();
}

export const ALIGNED_TYPE = 'default-lt';
export const DEPENDENT_TYPE = 'dependent-lt';

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
    { parentRef = null, typeRef = ALIGNED_TYPE } = {},
  ) {
    if (!this.tiers.has(tierId)) {
      this.tiers.set(tierId, {
        participant,
        parentRef,
        typeRef,
        annotations: [],
      });
      return;
    }
    const tier = this.tiers.get(tierId);
    if (participant && !tier.participant) tier.participant = participant;
    if (parentRef && !tier.parentRef) tier.parentRef = parentRef;
  }

  /**
   * Adds a time-aligned annotation and returns a local handle, which dependent
   * annotations pass to `addRefAnnotation` to attach themselves to this one.
   * Returns null when the interval is unusable.
   *
   * @returns {string|null} local handle
   */
  addAnnotation(tierId, startMs, endMs, value = '', participant = '') {
    const textVal = cleanSpeechText(value || '');
    this.addTier(tierId, participant);
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
   * Adds a dependent (ELAN "referring") annotation on a child tier, tied one-to-one
   * to a parent annotation. This is what makes a translation or gloss line show up
   * underneath its utterance in ELAN rather than as an unrelated tier.
   *
   * @param {string} tierId Child tier id
   * @param {string} parentTierId Tier the child hangs off
   * @param {string|null} parentLocalId Handle returned by addAnnotation
   * @param {string} value
   */
  addRefAnnotation(tierId, parentTierId, parentLocalId, value = '') {
    if (!parentLocalId) return null;
    const textVal = cleanSpeechText(value || '');
    if (!textVal) return null; // An empty dependent annotation carries no information
    this.addTier(tierId, '', {
      parentRef: parentTierId,
      typeRef: DEPENDENT_TYPE,
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
    const alignedOut = new Map(); // tierId -> { participant, annotations: [{aid, ts1, ts2, value}] }
    const dependentOut = new Map(); // tierId -> { parentRef, annotations: [{aid, refAid, value}] }
    const localToAid = new Map();

    // Pass 1 — time-aligned tiers. Annotation ids must exist before any dependent
    // annotation can point at them, so these are always resolved first.
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
        mapped.push({ aid, ts1, ts2, value: ann.value });
      }

      alignedOut.set(tierId, {
        participant: tierData.participant,
        annotations: mapped,
      });
    }

    // Pass 2 — dependent tiers, resolved against the ids just assigned. A child whose
    // parent annotation was dropped (zero-length interval) is dropped with it, rather
    // than written as a dangling ANNOTATION_REF that ELAN would refuse to open.
    for (const [tierId, tierData] of this.tiers.entries()) {
      if (!tierData.parentRef) continue;
      const mapped = [];
      for (const ann of tierData.annotations) {
        const refAid = localToAid.get(ann.parentLocalId);
        if (!refAid) continue;
        mapped.push({ aid: `a${aidCounter++}`, refAid, value: ann.value });
      }
      dependentOut.set(tierId, {
        parentRef: tierData.parentRef,
        annotations: mapped,
      });
    }

    // Ensure timeslots are in non-decreasing order
    timeSlots.sort((a, b) => a.time - b.time);

    const hasDependentTiers = dependentOut.size > 0;

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

    for (const [tierId, data] of alignedOut.entries()) {
      const partAttr = data.participant
        ? ` PARTICIPANT="${escapeXml(data.participant)}"`
        : '';
      xml += `	<TIER TIER_ID="${escapeXml(tierId)}"${partAttr} LINGUISTIC_TYPE_REF="${ALIGNED_TYPE}">
`;
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
      xml += `	</TIER>
`;
    }

    // Dependent tiers come after their parents so that PARENT_REF always resolves
    for (const [tierId, data] of dependentOut.entries()) {
      xml += `	<TIER TIER_ID="${escapeXml(tierId)}" PARENT_REF="${escapeXml(data.parentRef)}" LINGUISTIC_TYPE_REF="${DEPENDENT_TYPE}">
`;
      for (const ann of data.annotations) {
        xml += `		<ANNOTATION>
`;
        xml += `			<REF_ANNOTATION ANNOTATION_ID="${ann.aid}" ANNOTATION_REF="${ann.refAid}">
`;
        xml += `				<ANNOTATION_VALUE>${escapeXml(ann.value)}</ANNOTATION_VALUE>
`;
        xml += `			</REF_ANNOTATION>
`;
        xml += `		</ANNOTATION>
`;
      }
      xml += `	</TIER>
`;
    }

    // LINGUISTIC_TYPE & CONSTRAINTS
    xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${ALIGNED_TYPE}" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
`;
    if (hasDependentTiers) {
      // Symbolic_Association: exactly one child annotation per parent annotation,
      // which is what a translation or gloss line is.
      xml += `	<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="${DEPENDENT_TYPE}" CONSTRAINTS="Symbolic_Association" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />
`;
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
 * @param {Array} [options.speakers=[]] Array of speaker objects [{ id, name, initials }]
 * @param {Array} [options.subTiers=[]] Project sub-tiers [{ id, name }] in the order
 *   they should appear; each becomes a dependent tier under every speaker tier,
 *   e.g. `Translation@John Doe`
 * @param {string} [options.author='EasperWeb'] Project author / transcriber name
 * @returns {string} XML string in .eaf format
 */
export function exportToEaf({
  audioFileName = 'audio.wav',
  segments = [],
  chunks = [],
  includeWordTier = false,
  speakers = [],
  subTiers = [],
  author = 'EasperWeb',
} = {}) {
  const eaf = new ElanEaf({ author });
  eaf.addLinkedFile(audioFileName, 'audio/x-wav');

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

  // ELAN convention: a dependent tier is named `<layer>@<participant>` so the same
  // layer can hang off every speaker tier without id collisions.
  const dependentTierId = (subTierName, speakerTierId) =>
    `${subTierName}@${speakerTierId}`;

  // Pre-create tiers for all configured speakers in the project, plus one dependent
  // tier per speaker for each sub-tier, so that layers a user has defined but not yet
  // filled in still arrive in ELAN ready to type into.
  if (Array.isArray(speakers) && speakers.length > 0) {
    for (const spk of speakers) {
      const tierId = spk.name ? spk.name.trim() : `Speaker ${spk.id}`;
      eaf.addTier(tierId, spk.name || `Speaker ${spk.id}`);
      for (const st of cleanSubTiers) {
        eaf.addTier(dependentTierId(st.name, tierId), '', {
          parentRef: tierId,
          typeRef: DEPENDENT_TYPE,
        });
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

      let tierName = '';
      let participant = '';
      if (speakerObj) {
        tierName = speakerObj.name
          ? speakerObj.name.trim()
          : `Speaker ${speakerObj.id}`;
        participant = speakerObj.name || tierName;
      } else if (seg.speaker) {
        tierName = seg.speaker.trim();
        participant = tierName;
      } else {
        tierName = 'Speaker 1';
        participant = 'Speaker 1';
      }

      const startMs = Math.round(seg.start * 1000);
      const endMs = Math.round(seg.end * 1000);
      const parentLocalId = eaf.addAnnotation(
        tierName,
        startMs,
        endMs,
        text,
        participant,
      );

      for (const st of cleanSubTiers) {
        const subText = getSubText(seg, st.id);
        if (!subText.trim()) continue;
        eaf.addRefAnnotation(
          dependentTierId(st.name, tierName),
          tierName,
          parentLocalId,
          subText,
        );
      }
    }
  } else if (chunks && chunks.length > 0) {
    const fallbackTier =
      speakers && speakers[0]?.name ? speakers[0].name.trim() : 'Speaker 1';
    const fallbackParticipant =
      speakers && speakers[0]?.name ? speakers[0].name.trim() : 'Speaker 1';
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
