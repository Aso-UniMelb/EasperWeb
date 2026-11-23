/**
 * Shared Lazy Cache for Tag Suggestion Indexes.
 * Builds one TagSuggestionIndex per tokenised sub-tier on demand when the user
 * focuses a token input, avoiding per-SegmentCard recomputation.
 */

import { projectState } from './projectState.svelte.js';
import { transcriptState } from './transcriptState.svelte.js';
import { lexiconState } from './lexiconState.svelte.js';
import {
  buildTagSuggestionIndex,
  getRankedTagSuggestions,
} from '../utils/tagSuggestions.js';

class TagSuggestionState {
  // Plain JS cache map (non-reactive to avoid unnecessary render loops):
  // tierKey -> { fingerprint: string, index: Object }
  #cache = new Map();

  #computeFingerprint(tier, activeLexicon) {
    const activeProjId = projectState.activeProjectId || '';
    const segs = transcriptState.segments || [];
    const projs = projectState.projects || [];
    const lexId = activeLexicon?.id || '';
    const lexUpdated = activeLexicon?.updatedAt || activeLexicon?.entries?.length || 0;
    const tierKey = String(tier?.key ?? tier?.id ?? '');
    const tierLexLen = Array.isArray(tier?.lexicon) ? tier.lexicon.length : 0;

    // Lightweight content signature across current segments' subTexts for this tier
    let annSig = segs.length;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const sub = s?.subTexts?.[tierKey];
      if (Array.isArray(sub)) {
        for (let j = 0; j < sub.length; j++) {
          if (sub[j]) annSig = (annSig * 31 + sub[j].length + j) | 0;
        }
      } else if (typeof sub === 'string' && sub.length > 0) {
        annSig = (annSig * 31 + sub.length) | 0;
      }
    }

    // Other projects signature
    let otherSig = projs.length;
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (p && p.id !== activeProjId) {
        otherSig = (otherSig * 31 + (p.segments?.length || 0)) | 0;
      }
    }

    return `${activeProjId}|${tierKey}|${tier?.name || ''}|${tier?.lexiconField || ''}|${tierLexLen}|${lexId}:${lexUpdated}|${annSig}|${otherSig}`;
  }

  /**
   * Returns a cached or freshly built TagSuggestionIndex for the given tier.
   * @param {Object} tier
   * @returns {Object|null}
   */
  getIndexForTier(tier) {
    if (!tier) return null;
    const activeLexId = projectState.activeProject?.lexiconId || null;
    const activeLexicon = activeLexId
      ? lexiconState.lexicons?.find((l) => l.id === activeLexId) || null
      : null;

    const tierKey = String(tier.key ?? tier.id ?? '');
    const fingerprint = this.#computeFingerprint(tier, activeLexicon);
    const cached = this.#cache.get(tierKey);
    if (cached && cached.fingerprint === fingerprint) {
      return cached.index;
    }

    const index = buildTagSuggestionIndex({
      tier,
      currentSegments: transcriptState.segments || [],
      currentSpeakers: projectState.activeProject?.speakers || [],
      otherProjects: projectState.projects || [],
      activeProjectId: projectState.activeProjectId || null,
      lexicon: activeLexicon,
      lexiconField: tier.lexiconField || null,
      includeCurrentProject: true,
      includeOtherProjects: true,
      includeLexicon: true,
    });

    this.#cache.set(tierKey, { fingerprint, index });
    return index;
  }

  /**
   * Queries ranked suggestions for a specific word cell in a segment.
   */
  getSuggestions({
    tier,
    words,
    annotations,
    wordIndex,
    query = '',
    limit = 16,
  }) {
    const index = this.getIndexForTier(tier);
    if (!index) return [];

    const word = words[wordIndex] || '';
    const prevWord = wordIndex > 0 ? words[wordIndex - 1] || '' : '';
    const nextWord = wordIndex < words.length - 1 ? words[wordIndex + 1] || '' : '';
    const prevTag = wordIndex > 0 ? annotations[wordIndex - 1] || '' : '';
    const prev2Tag = wordIndex > 1 ? annotations[wordIndex - 2] || '' : '';
    const nextTag =
      wordIndex < words.length - 1 ? annotations[wordIndex + 1] || '' : '';
    const currentTag = annotations[wordIndex] || '';

    return getRankedTagSuggestions(
      index,
      {
        word,
        prevWord,
        nextWord,
        prevTag,
        prev2Tag,
        nextTag,
        currentTag,
        isFirst: wordIndex === 0,
        isSecond: wordIndex === 1,
        isLast: wordIndex === words.length - 1,
      },
      {
        query,
        limit,
        useContext: true,
        useFuzzy: true,
        includeAllowedFallback: true,
        excludeExactQueryMatch: true,
      },
    );
  }

  invalidateAll() {
    this.#cache.clear();
  }
}

export const tagSuggestionState = new TagSuggestionState();
