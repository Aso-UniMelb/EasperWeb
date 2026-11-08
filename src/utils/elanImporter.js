/**
 * ELAN (.eaf) Tier Importer & Segment Mapping Engine.
 *
 * Resolves the mapping between arbitrary ELAN XML tiers and Easper's data model:
 * - Up to 5 Speakers (Speaker 1 to 5 with distinct color themes)
 * - Main Speech Utterance column (segment.text)
 * - Up to 3 Sub-Tiers (segment.subTexts[subTierId])
 *
 * Supports exact parent-child linking via REF_ANNOTATION, as well as time-overlap
 * matching for independent time-aligned layers.
 */

import {
  MAX_SUB_TIERS,
  SUB_TIER_TYPE_WORD,
  SUB_TIER_TYPE_SENTENCE,
  ELAN_STEREOTYPE_SYM_ASSOC,
  ELAN_STEREOTYPE_SYM_SUBDIV,
  ELAN_STEREOTYPE_TIME_SUBDIV,
  normalizeSubTiers,
} from './subTiers.js';
import { getSpeakerInitials } from './speakers.js';

function cleanSpeechText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[BLANK_AUDIO\]/g, '')
    .trim();
}

/**
 * Analyzes parsed EAF data and returns an intelligent default configuration
 * for speakers, sub-tiers, and tier role assignments.
 *
 * @param {Object} eafData - Result of parseEaf(xmlString, fileName)
 * @returns {{
 *   suggestedTitle: string,
 *   suggestedTranscriber: string,
 *   speakers: Array<{ id: number, name: string, initials: string }>,
 *   subTiers: Array<{ id: number, name: string }>,
 *   tierConfigs: Array<{
 *     tierId: string,
 *     participant: string,
 *     parentRef: string|null,
 *     linguisticType: string,
 *     annotationCount: number,
 *     sampleText: string,
 *     included: boolean,
 *     role: 'speaker' | 'subtier' | 'ignore',
 *     speakerId: number,
 *     subTierId: number|null
 *   }>
 * }}
 */
export function detectTierDefaults(eafData) {
  const tiers = eafData?.tiers || [];
  const baseName = (eafData?.fileName || 'ELAN Project').replace(/\.[^/.]+$/, '');
  const suggestedTitle = baseName;

  // 1. Separate root tiers from dependent tiers
  const rootTiers = [];
  const dependentTiers = [];

  for (const t of tiers) {
    if (!t.parentRef) {
      rootTiers.push(t);
    } else {
      dependentTiers.push(t);
    }
  }

  // Detect transcriber from root tiers' ANNOTATOR attribute or document author
  const rootTierAnnotator =
    rootTiers.find((t) => t.annotator?.trim())?.annotator?.trim();
  const suggestedTranscriber = rootTierAnnotator || eafData?.author || '';

  // Detect main tier title prefix (e.g. "BIS" from "BIS@Speaker1")
  let suggestedMainTierTitle = '';
  for (const t of rootTiers) {
    const atMatch = t.tierId.match(/^([^@]+)@/);
    if (atMatch) {
      suggestedMainTierTitle = atMatch[1].trim();
      break;
    }
  }

  // 2. Derive Speakers from Root Tiers (up to 5)
  const speakers = [];
  const rootTierToSpeakerId = new Map();

  let nextSpeakerId = 1;
  for (const t of rootTiers) {
    if (nextSpeakerId > 5) break;

    // If tierId is like "BIS@Speaker1", strip the prefix if participant is empty
    let rawName = t.participant?.trim();
    if (!rawName) {
      const atMatch = t.tierId.match(/^([^@]+)@(.*)$/);
      rawName =
        atMatch && atMatch[2].trim() ? atMatch[2].trim() : t.tierId.trim();
    }
    if (!rawName) {
      rawName = `Speaker ${nextSpeakerId}`;
    }
    const initials = getSpeakerInitials(rawName, nextSpeakerId);

    speakers.push({
      id: nextSpeakerId,
      name: rawName,
      initials,
      elanTierType: (t.linguisticType || '').trim(),
    });
    rootTierToSpeakerId.set(t.tierId, nextSpeakerId);
    nextSpeakerId++;
  }

  // Ensure at least one speaker exists
  if (speakers.length === 0) {
    speakers.push({ id: 1, name: 'Speaker 1', initials: 'S1', elanTierType: '' });
  }

  // 3. Detect Sub-Tiers from Dependent Tiers & Tier Names (e.g. Translation@Speaker)
  const detectedSubTierNames = new Set();
  const subTierMap = new Map(); // subTierName.toLowerCase() -> subTierId
  const subTierAnnotatorMap = new Map(); // subTierName.toLowerCase() -> annotator
  const subTierTypeMap = new Map(); // subTierName.toLowerCase() -> 'word' | 'sentence'
  const subTierStereotypeMap = new Map(); // subTierName.toLowerCase() -> stereotype
  const subTierElanTypeMap = new Map(); // subTierName.toLowerCase() -> linguisticType

  const tierMap = new Map(tiers.map((t) => [t.tierId, t]));

  // Helper to register a sub-tier name, optional annotator, type, stereotype, and ELAN tier type
  const registerSubTier = (
    rawName,
    annotator = '',
    type = SUB_TIER_TYPE_SENTENCE,
    stereotype = ELAN_STEREOTYPE_SYM_ASSOC,
    elanTierType = '',
  ) => {
    const clean = (rawName || '').trim();
    if (!clean) return null;
    const lower = clean.toLowerCase();
    if (subTierMap.has(lower)) {
      if (annotator?.trim() && !subTierAnnotatorMap.get(lower)) {
        subTierAnnotatorMap.set(lower, annotator.trim());
      }
      if (elanTierType?.trim() && !subTierElanTypeMap.get(lower)) {
        subTierElanTypeMap.set(lower, elanTierType.trim());
      }
      if (type === SUB_TIER_TYPE_WORD) {
        subTierTypeMap.set(lower, SUB_TIER_TYPE_WORD);
        subTierStereotypeMap.set(
          lower,
          stereotype === ELAN_STEREOTYPE_TIME_SUBDIV
            ? ELAN_STEREOTYPE_TIME_SUBDIV
            : ELAN_STEREOTYPE_SYM_SUBDIV,
        );
      }
      return subTierMap.get(lower);
    }
    if (detectedSubTierNames.size < MAX_SUB_TIERS) {
      const id = detectedSubTierNames.size + 1;
      detectedSubTierNames.add(clean);
      subTierMap.set(lower, id);
      subTierTypeMap.set(lower, type);
      subTierStereotypeMap.set(
        lower,
        type === SUB_TIER_TYPE_WORD
          ? stereotype === ELAN_STEREOTYPE_TIME_SUBDIV
            ? ELAN_STEREOTYPE_TIME_SUBDIV
            : ELAN_STEREOTYPE_SYM_SUBDIV
          : ELAN_STEREOTYPE_SYM_ASSOC,
      );
      if (annotator?.trim()) {
        subTierAnnotatorMap.set(lower, annotator.trim());
      }
      if (elanTierType?.trim()) {
        subTierElanTypeMap.set(lower, elanTierType.trim());
      }
      return id;
    }
    return null;
  };

  const isSubdivisionStereotype = (stereotype) =>
    stereotype === 'Symbolic_Subdivision' || stereotype === 'Time_Subdivision';

  // Identify intermediary subdivision tiers (subdivision tiers that have child tiers hanging off them)
  const intermediaryTierIds = new Set();
  const intermediarySubNames = new Set();
  for (const t of dependentTiers) {
    if (
      isSubdivisionStereotype(t.stereotype) &&
      dependentTiers.some((other) => other.parentRef === t.tierId)
    ) {
      intermediaryTierIds.add(t.tierId);
      const atMatch = t.tierId.match(/^([^@]+)@/);
      const subName = (atMatch ? atMatch[1].trim() : t.tierId.trim()).toLowerCase();
      if (subName) {
        intermediarySubNames.add(subName);
      }
    }
  }

  // Inspect dependent tiers based strictly on ELAN stereotypes (never tier names)
  for (const t of dependentTiers) {
    const atMatch = t.tierId.match(/^([^@]+)@/);
    const subName = atMatch ? atMatch[1].trim() : t.tierId.trim();

    // If t is an intermediary subdivision tier with child tiers,
    // don't register it as a sub-tier
    if (
      intermediaryTierIds.has(t.tierId) ||
      (isSubdivisionStereotype(t.stereotype) &&
        intermediarySubNames.has(subName.toLowerCase()))
    ) {
      continue;
    }

    const parentTier = tierMap.get(t.parentRef);
    let type = SUB_TIER_TYPE_SENTENCE;
    let effectiveStereotype = ELAN_STEREOTYPE_SYM_ASSOC;
    if (isSubdivisionStereotype(t.stereotype)) {
      type = SUB_TIER_TYPE_WORD;
      effectiveStereotype = t.stereotype;
    } else if (isSubdivisionStereotype(parentTier?.stereotype)) {
      type = SUB_TIER_TYPE_WORD;
      effectiveStereotype = parentTier.stereotype;
    }

    registerSubTier(
      subName,
      t.annotator,
      type,
      effectiveStereotype,
      t.linguisticType,
    );
  }

  // Build final subTiers array with annotator, type, stereotype, and elanTierType info preserved
  const subTiers = Array.from(detectedSubTierNames).map((name) => {
    const lower = name.toLowerCase();
    const type = subTierTypeMap.get(lower) || SUB_TIER_TYPE_SENTENCE;
    return {
      id: subTierMap.get(lower),
      name,
      type,
      stereotype:
        subTierStereotypeMap.get(lower) ||
        (type === SUB_TIER_TYPE_WORD
          ? ELAN_STEREOTYPE_SYM_SUBDIV
          : ELAN_STEREOTYPE_SYM_ASSOC),
      elanTierType: subTierElanTypeMap.get(lower) || '',
      annotator: subTierAnnotatorMap.get(lower) || '',
    };
  });

  // 4. Build Tier Configuration List
  const unsortedTierConfigs = tiers.map((t) => {
    const annotationCount = t.annotations?.length || 0;
    const sampleText = t.sampleText || t.annotations?.[0]?.text || '';
    const isRoot = !t.parentRef;

    // Check if this tier name has @SubTier pattern
    const atMatch = t.tierId.match(/^([^@]+)@(.*)$/);
    const subNameCandidate = atMatch ? atMatch[1].trim() : t.tierId.trim();
    const matchedSubId = subTierMap.get(subNameCandidate.toLowerCase()) || null;

    const isIntermediarySubdivision =
      intermediaryTierIds.has(t.tierId) ||
      (isSubdivisionStereotype(t.stereotype) &&
        intermediarySubNames.has(subNameCandidate.toLowerCase()));

    let role = 'ignore';
    let speakerId = 1;
    let subTierId = null;
    let included = false;
    let skipReason = '';

    if (isRoot) {
      // Root tier: check if it was assigned to a speaker
      if (rootTierToSpeakerId.has(t.tierId)) {
        role = 'speaker';
        speakerId = rootTierToSpeakerId.get(t.tierId);
        included = true;
      } else {
        role = 'ignore';
        included = false;
        skipReason = 'Max 5 speakers reached';
      }
    } else if (isIntermediarySubdivision) {
      role = 'ignore';
      subTierId = null;
      included = false;
      skipReason = 'Intermediary subdivision tier';
    } else {
      // Dependent tier: default to subtier if matched
      if (matchedSubId) {
        role = 'subtier';
        subTierId = matchedSubId;
        included = true;
      } else {
        role = 'ignore';
        subTierId = null;
        included = false;
        skipReason = `Max ${MAX_SUB_TIERS} sub-tiers reached`;
      }
    }

    return {
      tierId: t.tierId,
      participant: t.participant || '',
      annotator: t.annotator || '',
      parentRef: t.parentRef || null,
      linguisticType: t.linguisticType || '',
      stereotype: t.stereotype || '',
      isTimeAlignable: t.isTimeAlignable ?? !t.parentRef,
      annotationCount,
      sampleText,
      included,
      role,
      speakerId,
      subTierId,
      skipReason,
    };
  });

  // 5. Sort tierConfigs hierarchically so dependent tiers appear directly below their parent tier
  const configById = new Map(unsortedTierConfigs.map((tc) => [tc.tierId, tc]));
  const childrenByParent = new Map();
  const rootConfigs = [];

  for (const tc of unsortedTierConfigs) {
    if (tc.parentRef && configById.has(tc.parentRef)) {
      if (!childrenByParent.has(tc.parentRef)) {
        childrenByParent.set(tc.parentRef, []);
      }
      childrenByParent.get(tc.parentRef).push(tc);
    } else {
      rootConfigs.push(tc);
    }
  }

  const tierConfigs = [];
  const visitedIds = new Set();

  const visitTier = (tc) => {
    if (!tc || visitedIds.has(tc.tierId)) return;
    visitedIds.add(tc.tierId);
    tierConfigs.push(tc);
    const children = childrenByParent.get(tc.tierId) || [];
    for (const child of children) {
      visitTier(child);
    }
  };

  for (const rootTc of rootConfigs) {
    visitTier(rootTc);
  }
  for (const tc of unsortedTierConfigs) {
    if (!visitedIds.has(tc.tierId)) {
      visitTier(tc);
    }
  }

  return {
    suggestedTitle,
    suggestedTranscriber,
    suggestedMainTierTitle,
    speakers,
    subTiers,
    tierConfigs,
  };
}

/**
 * Compiles parsed ELAN data into an Easper dialogue project according to
 * the user's tier mappings and speaker configurations.
 *
 * @param {Object} options
 * @param {Object} options.eafData - Result of parseEaf
 * @param {Array<Object>} options.tierConfigs - Array of configured tiers
 * @param {Array<Object>} options.speakers - Project speakers [{ id, name, initials }]
 * @param {Array<Object>} options.subTiers - Project sub-tiers [{ id, name }]
 * @returns {{
 *   segments: Array<Object>,
 *   transcript: string,
 *   speakers: Array<Object>,
 *   subTiers: Array<Object>
 * }}
 */
export function compileElanToProject({
  eafData,
  tierConfigs = [],
  speakers = [],
  subTiers = [],
}) {
  const cleanSpeakers = (
    Array.isArray(speakers) && speakers.length > 0
      ? speakers
      : [{ id: 1, name: 'Speaker 1', initials: 'S1', elanTierType: '' }]
  ).map((spk) => ({
    ...spk,
    elanTierType: spk?.elanTierType != null ? String(spk.elanTierType).trim() : '',
  }));

  const cleanSubTiers = normalizeSubTiers(subTiers, { sort: true });

  const speakerMap = new Map();
  for (const spk of cleanSpeakers) {
    if (spk && spk.id != null) {
      speakerMap.set(Number(spk.id), spk);
    }
  }
  const defaultSpeaker = cleanSpeakers[0] || {
    id: 1,
    name: 'Speaker 1',
    initials: 'S1',
    elanTierType: '',
  };

  // Map tierId -> parsed tier object
  const tierDataMap = new Map();
  for (const t of eafData?.tiers || []) {
    tierDataMap.set(t.tierId, t);
  }

  // Ensure each speaker preserves its mapped ELAN tier's linguisticType if not explicitly set
  for (const spk of cleanSpeakers) {
    if (!spk.elanTierType) {
      const mappedSpkCfg = tierConfigs.find(
        (cfg) =>
          cfg.included &&
          cfg.role === 'speaker' &&
          Number(cfg.speakerId) === Number(spk.id),
      );
      if (mappedSpkCfg) {
        const tier = tierDataMap.get(mappedSpkCfg.tierId);
        const lType = (
          mappedSpkCfg.linguisticType ||
          tier?.linguisticType ||
          ''
        ).trim();
        if (lType) {
          spk.elanTierType = lType;
        }
      }
    }
  }

  const isSubdivisionStereotype = (stereotype) =>
    stereotype === 'Symbolic_Subdivision' || stereotype === 'Time_Subdivision';

  // Ensure each sub-tier's type, stereotype, and elanTierType reflect its mapped ELAN tiers
  for (const st of cleanSubTiers) {
    const mappedConfigs = tierConfigs.filter(
      (cfg) =>
        cfg.included &&
        cfg.role === 'subtier' &&
        String(cfg.subTierId) === String(st.id),
    );
    if (mappedConfigs.length > 0) {
      let detectedSubdivStereotype = null;
      let detectedElanTierType = '';

      for (const cfg of mappedConfigs) {
        const tier = tierDataMap.get(cfg.tierId);
        if (!tier) continue;
        if (!detectedElanTierType) {
          detectedElanTierType = (
            cfg.linguisticType ||
            tier.linguisticType ||
            ''
          ).trim();
        }
        const parentTier = tier.parentRef
          ? tierDataMap.get(tier.parentRef)
          : null;
        if (isSubdivisionStereotype(tier.stereotype)) {
          detectedSubdivStereotype = tier.stereotype;
        } else if (isSubdivisionStereotype(parentTier?.stereotype)) {
          detectedSubdivStereotype = parentTier.stereotype;
        }
      }

      if (detectedSubdivStereotype) {
        st.type = SUB_TIER_TYPE_WORD;
        st.stereotype = detectedSubdivStereotype;
      } else {
        st.type = SUB_TIER_TYPE_SENTENCE;
        st.stereotype = ELAN_STEREOTYPE_SYM_ASSOC;
      }

      if (!st.elanTierType && detectedElanTierType) {
        st.elanTierType = detectedElanTierType;
      }
    }
  }

  // Map all annotations across all tiers by ID for hierarchy resolution
  const allAnnMap = new Map();
  for (const t of eafData?.tiers || []) {
    for (const ann of t.annotations || []) {
      if (ann && ann.id) {
        allAnnMap.set(ann.id, {
          ...ann,
          tierId: t.tierId,
          stereotype: t.stereotype || '',
        });
      }
    }
  }

  // Helper to walk up parentAid chain (e.g. POS tag -> Word token -> Utterance segment)
  const resolveSegmentForAnnotation = (ann) => {
    if (!ann) return null;
    // 1. Direct parent is a segment
    if (ann.parentAid && annIdToSegment.has(ann.parentAid)) {
      return {
        segment: annIdToSegment.get(ann.parentAid),
        isDirectChild: true,
        subdivisionTokenIndex: -1,
        totalTokens: 0,
      };
    }

    // 2. Walk up parentAid chain (e.g. POS -> Word -> Utterance)
    let curr = ann;
    const visited = new Set();
    while (curr && curr.parentAid && !visited.has(curr.id)) {
      visited.add(curr.id);
      const parent = allAnnMap.get(curr.parentAid);
      if (!parent) break;
      if (annIdToSegment.has(parent.parentAid)) {
        const seg = annIdToSegment.get(parent.parentAid);
        const parentTier = tierDataMap.get(parent.tierId);
        const siblings = parentTier
          ? (parentTier.annotations || []).filter(
              (a) => a.parentAid === parent.parentAid,
            )
          : [];
        const tokenIndex = siblings.findIndex((a) => a.id === parent.id);
        return {
          segment: seg,
          isDirectChild: false,
          subdivisionTokenIndex: tokenIndex >= 0 ? tokenIndex : 0,
          totalTokens: siblings.length,
        };
      }
      curr = parent;
    }
    return null;
  };

  // 1. Process Speaker Utterance Tiers into Segments
  const rawSegments = [];
  const annIdToSegment = new Map();

  for (const cfg of tierConfigs) {
    if (!cfg.included || cfg.role !== 'speaker') continue;

    const tier = tierDataMap.get(cfg.tierId);
    if (!tier || !Array.isArray(tier.annotations)) continue;

    const spk = speakerMap.get(Number(cfg.speakerId)) || defaultSpeaker;

    for (const ann of tier.annotations) {
      const startSec = Math.max(0, (ann.start || 0) / 1000);
      let endSec = Math.max(0, (ann.end || 0) / 1000);
      if (endSec <= startSec) endSec = startSec + 0.1;

      const text = cleanSpeechText(ann.text);

      const seg = {
        id: 0,
        start: Number(startSec.toFixed(3)),
        end: Number(endSec.toFixed(3)),
        text,
        speakerId: Number(spk.id),
        speaker: spk.name || `Speaker ${spk.id}`,
        subTexts: {},
        _elanId: ann.id,
        _tierId: cfg.tierId,
      };

      rawSegments.push(seg);
      if (ann.id) {
        annIdToSegment.set(ann.id, seg);
      }
    }
  }

  // 2. Process Sub-Tier Annotations (exact parent link & time-overlap fallback)
  for (const cfg of tierConfigs) {
    if (!cfg.included || cfg.role !== 'subtier' || !cfg.subTierId) continue;

    const subTierIdStr = String(cfg.subTierId);
    const tier = tierDataMap.get(cfg.tierId);
    if (!tier || !Array.isArray(tier.annotations)) continue;

    const targetSubTier = cleanSubTiers.find(
      (st) => String(st.id) === subTierIdStr,
    );
    const isWordSubTier = targetSubTier?.type === SUB_TIER_TYPE_WORD;

    // Direct Symbolic_Subdivision on a word sub-tier:
    // Group all annotations by parentAid so we preserve exact token sequence (including empty tags)
    if (isWordSubTier && tier.stereotype === 'Symbolic_Subdivision') {
      const byParent = new Map();
      for (const ann of tier.annotations) {
        const textVal = cleanSpeechText(ann.text);
        const pAid = ann.parentAid;
        if (!pAid) continue;
        if (!byParent.has(pAid)) byParent.set(pAid, []);
        byParent.get(pAid).push(textVal);
      }
      for (const [pAid, tokens] of byParent.entries()) {
        const seg = annIdToSegment.get(pAid);
        if (seg && tokens.some(Boolean)) {
          seg.subTexts[subTierIdStr] = tokens;
        }
      }
      continue;
    }

    // Direct Time_Subdivision on a word sub-tier:
    // Match time-aligned subdivided annotations to their parent segment in chronological order
    if (isWordSubTier && tier.stereotype === 'Time_Subdivision') {
      const bySeg = new Map();
      for (const ann of tier.annotations) {
        const textVal = cleanSpeechText(ann.text);
        const annStart = (ann.start || 0) / 1000;
        const annEnd = (ann.end || 0) / 1000;

        let bestOverlap = 0;
        let bestCandidate = null;
        for (const seg of rawSegments) {
          if (tier.parentRef && seg._tierId !== tier.parentRef) continue;
          const overlap = Math.max(
            0,
            Math.min(seg.end, annEnd) - Math.max(seg.start, annStart),
          );
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestCandidate = seg;
          }
        }
        if (bestCandidate) {
          if (!bySeg.has(bestCandidate)) bySeg.set(bestCandidate, []);
          bySeg.get(bestCandidate).push(textVal);
        }
      }
      for (const [seg, tokens] of bySeg.entries()) {
        if (tokens.some(Boolean)) {
          seg.subTexts[subTierIdStr] = tokens;
        }
      }
      continue;
    }

    for (const ann of tier.annotations) {
      const subText = cleanSpeechText(ann.text);
      if (!subText) continue;

      let matchedSeg = null;
      let tokenIndex = -1;
      let totalTokens = 0;

      // Method 1: Hierarchy traversal via resolveSegmentForAnnotation
      const resolved = resolveSegmentForAnnotation(ann);
      if (resolved) {
        matchedSeg = resolved.segment;
        tokenIndex = resolved.subdivisionTokenIndex;
        totalTokens = resolved.totalTokens;
      }

      // Method 2: Time-overlap fallback (for independent or time-subdivided sub-tiers)
      if (!matchedSeg && rawSegments.length > 0) {
        const annStart = (ann.start || 0) / 1000;
        const annEnd = (ann.end || 0) / 1000;

        let bestOverlap = 0;
        let bestCandidate = null;

        for (const seg of rawSegments) {
          const overlap = Math.max(
            0,
            Math.min(seg.end, annEnd) - Math.max(seg.start, annStart),
          );
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestCandidate = seg;
          }
        }

        if (bestOverlap > 0) {
          matchedSeg = bestCandidate;
        }
      }

      if (matchedSeg) {
        if (isWordSubTier && tokenIndex >= 0) {
          if (!Array.isArray(matchedSeg.subTexts[subTierIdStr])) {
            const initialLen = Math.max(totalTokens || 0, tokenIndex + 1);
            matchedSeg.subTexts[subTierIdStr] = Array(initialLen).fill('');
          }
          while (matchedSeg.subTexts[subTierIdStr].length <= tokenIndex) {
            matchedSeg.subTexts[subTierIdStr].push('');
          }
          matchedSeg.subTexts[subTierIdStr][tokenIndex] = subText;
        } else {
          const existing = matchedSeg.subTexts[subTierIdStr];
          matchedSeg.subTexts[subTierIdStr] = existing
            ? `${existing} ${subText}`.trim()
            : subText;
        }
      }
    }
  }

  // 3. Sort chronologically and assign clean sequential IDs
  rawSegments.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  const finalSegments = rawSegments.map((seg, idx) => {
    const { _elanId, _tierId, ...cleanSeg } = seg;
    return {
      ...cleanSeg,
      id: idx + 1,
    };
  });

  // 4. Generate full transcript text
  const transcript = finalSegments
    .map((s) => s.text)
    .filter(Boolean)
    .join('\n');

  return {
    segments: finalSegments,
    transcript,
    speakers: cleanSpeakers,
    subTiers: cleanSubTiers,
  };
}

