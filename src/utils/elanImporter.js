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
  SUB_TIER_PRESETS,
  SUB_TIER_TYPE_WORD,
  SUB_TIER_TYPE_SENTENCE,
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
    });
    rootTierToSpeakerId.set(t.tierId, nextSpeakerId);
    nextSpeakerId++;
  }

  // Ensure at least one speaker exists
  if (speakers.length === 0) {
    speakers.push({ id: 1, name: 'Speaker 1', initials: 'S1' });
  }

  // 3. Detect Sub-Tiers from Dependent Tiers & Tier Names (e.g. Translation@Speaker)
  const detectedSubTierNames = new Set();
  const subTierMap = new Map(); // subTierName.toLowerCase() -> subTierId
  const subTierAnnotatorMap = new Map(); // subTierName.toLowerCase() -> annotator
  const subTierTypeMap = new Map(); // subTierName.toLowerCase() -> 'word' | 'sentence'

  const tierMap = new Map(tiers.map((t) => [t.tierId, t]));

  // Helper to register a sub-tier name, optional annotator, and type
  const registerSubTier = (
    rawName,
    annotator = '',
    type = SUB_TIER_TYPE_SENTENCE,
  ) => {
    const clean = (rawName || '').trim();
    if (!clean) return null;
    const lower = clean.toLowerCase();
    if (subTierMap.has(lower)) {
      if (annotator?.trim() && !subTierAnnotatorMap.get(lower)) {
        subTierAnnotatorMap.set(lower, annotator.trim());
      }
      if (type === SUB_TIER_TYPE_WORD) {
        subTierTypeMap.set(lower, SUB_TIER_TYPE_WORD);
      }
      return subTierMap.get(lower);
    }
    if (detectedSubTierNames.size < MAX_SUB_TIERS) {
      const id = detectedSubTierNames.size + 1;
      detectedSubTierNames.add(clean);
      subTierMap.set(lower, id);
      subTierTypeMap.set(lower, type);
      if (annotator?.trim()) {
        subTierAnnotatorMap.set(lower, annotator.trim());
      }
      return id;
    }
    return null;
  };

  // Inspect dependent tiers for common patterns
  for (const t of dependentTiers) {
    const atMatch = t.tierId.match(/^([^@]+)@/);
    const subName = atMatch ? atMatch[1].trim() : t.tierId.trim();

    const parentTier = tierMap.get(t.parentRef);
    let type = SUB_TIER_TYPE_SENTENCE;
    if (
      t.stereotype === 'Symbolic_Subdivision' ||
      parentTier?.stereotype === 'Symbolic_Subdivision' ||
      /^(pos|morph|morphs|morphemes?|gloss|glosses|tokens?|words?)$/i.test(
        subName,
      )
    ) {
      type = SUB_TIER_TYPE_WORD;
    }

    // If t is an intermediary subdivision tier (e.g. morphs@Speaker) with child tiers,
    // don't register it as a sub-tier if child tiers already exist under it
    const hasChildren = dependentTiers.some((other) => other.parentRef === t.tierId);
    if (
      hasChildren &&
      /^(morphs?|morphemes?|words?)$/i.test(subName) &&
      t.stereotype === 'Symbolic_Subdivision'
    ) {
      continue;
    }

    registerSubTier(subName, t.annotator, type);
  }

  // If no sub-tiers were detected, check if any root tiers look like sub-tiers
  // (e.g. named "Translation", "Gloss", "Notes")
  if (detectedSubTierNames.size === 0) {
    for (const t of rootTiers) {
      const isPreset = SUB_TIER_PRESETS.some(
        (p) => p.toLowerCase() === t.tierId.trim().toLowerCase(),
      );
      if (isPreset) {
        const type = /^(pos|morph|morphs|gloss)$/i.test(t.tierId.trim())
          ? SUB_TIER_TYPE_WORD
          : SUB_TIER_TYPE_SENTENCE;
        registerSubTier(t.tierId.trim(), t.annotator, type);
      }
    }
  }

  // Build final subTiers array with annotator and type info preserved
  const subTiers = Array.from(detectedSubTierNames).map((name) => {
    const lower = name.toLowerCase();
    return {
      id: subTierMap.get(lower),
      name,
      type: subTierTypeMap.get(lower) || SUB_TIER_TYPE_SENTENCE,
      annotator: subTierAnnotatorMap.get(lower) || '',
    };
  });

  // 4. Build Tier Configuration List
  const tierConfigs = tiers.map((t) => {
    const annotationCount = t.annotations?.length || 0;
    const sampleText = t.sampleText || t.annotations?.[0]?.text || '';
    const isRoot = !t.parentRef;

    // Check if this tier name has @SubTier pattern
    const atMatch = t.tierId.match(/^([^@]+)@(.*)$/);
    const subNameCandidate = atMatch ? atMatch[1].trim() : t.tierId.trim();
    const matchedSubId = subTierMap.get(subNameCandidate.toLowerCase()) || null;

    const hasChildTiers = tiers.some((other) => other.parentRef === t.tierId);
    const isIntermediarySubdivision =
      t.stereotype === 'Symbolic_Subdivision' &&
      hasChildTiers &&
      /^(morphs?|morphemes?|words?)$/i.test(subNameCandidate);

    let role = 'ignore';
    let speakerId = 1;
    let subTierId = null;
    let included = annotationCount > 0 && !isIntermediarySubdivision;

    if (isRoot) {
      // Root tier: check if it was assigned to a speaker
      if (rootTierToSpeakerId.has(t.tierId)) {
        role = 'speaker';
        speakerId = rootTierToSpeakerId.get(t.tierId);
      } else if (matchedSubId) {
        // Root tier with a preset name like "Translation"
        role = 'subtier';
        subTierId = matchedSubId;
      } else {
        role = 'speaker';
        speakerId = 1;
      }
    } else {
      // Dependent tier: default to subtier if matched
      if (matchedSubId) {
        role = 'subtier';
        subTierId = matchedSubId;
      } else {
        // Unmatched dependent tier
        role = 'subtier';
        subTierId = subTiers[0]?.id || 1;
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
    };
  });

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
  const cleanSpeakers = Array.isArray(speakers) && speakers.length > 0
    ? speakers
    : [{ id: 1, name: 'Speaker 1', initials: 'S1' }];

  const cleanSubTiers = normalizeSubTiers(subTiers, { sort: true });

  const speakerMap = new Map();
  for (const spk of cleanSpeakers) {
    if (spk && spk.id != null) {
      speakerMap.set(Number(spk.id), spk);
    }
  }
  const defaultSpeaker = cleanSpeakers[0] || { id: 1, name: 'Speaker 1', initials: 'S1' };

  // Map tierId -> parsed tier object
  const tierDataMap = new Map();
  for (const t of eafData?.tiers || []) {
    tierDataMap.set(t.tierId, t);
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
    // Group all annotations by parentAid so we preserve exact token sequence
    if (isWordSubTier && tier.stereotype === 'Symbolic_Subdivision') {
      const byParent = new Map();
      for (const ann of tier.annotations) {
        const textVal = cleanSpeechText(ann.text);
        if (!textVal) continue;
        const pAid = ann.parentAid;
        if (!pAid) continue;
        if (!byParent.has(pAid)) byParent.set(pAid, []);
        byParent.get(pAid).push(textVal);
      }
      for (const [pAid, tokens] of byParent.entries()) {
        const seg = annIdToSegment.get(pAid);
        if (seg) {
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

