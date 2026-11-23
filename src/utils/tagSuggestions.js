/**
 * Context-Aware, Frequency-Ranked, and SymSpell Fuzzy Tag Suggestion Engine.
 *
 * Combines:
 *  1. In-project word->tag frequency and n-gram context (prev2Tag, prevTag, nextTag, prevWord, nextWord)
 *  2. Cross-project word->tag frequency and n-gram context (matching tokenised sub-tiers by name)
 *  3. Active Lexicon Manager entries (indexing ALL senses per headword, not just the first)
 *  4. Fast SymSpell 1-delete index for Damerau-Levenshtein distance <= 1 fuzzy lookup on unknown words
 *  5. Sub-tier Allowed Tags (col.lexicon) ranked by context + global frequency
 */

import { tokenizeWords, getWordAnnotations } from './subTiers.js';
import { isNoteTierSegment } from './speakers.js';
import { getEntryFieldValue } from './lexiconTsv.js';
import {
  cleanWordForLookup,
  getLexiconHeadwordField,
  resolveLexiconField,
} from './autoTagging.js';

const MIN_FUZZY_WORD_LEN = 3;

/**
 * Normalizes a raw token for lookup/indexing (strips edge punctuation, lowercases).
 * @param {string} rawWord
 * @returns {string}
 */
export function normalizeLookupWord(rawWord) {
  if (!rawWord) return '';
  const cleaned = cleanWordForLookup(String(rawWord));
  return (cleaned || String(rawWord).trim()).toLowerCase();
}

/**
 * Checks whether two strings are within Damerau-Levenshtein distance 1
 * (1 insertion, 1 deletion, 1 substitution, or 1 adjacent character transposition).
 * Runs in O(L) with zero matrix allocation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isDamerauDistanceOne(a, b) {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  const diff = la - lb;
  if (diff > 1 || diff < -1) return false;

  if (diff === 0) {
    // Equal length: either 1 substitution or 1 adjacent transposition
    let firstDiff = -1;
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs === 1) {
          firstDiff = i;
        } else if (diffs === 2) {
          // Allow adjacent swap at firstDiff and firstDiff + 1
          if (
            i === firstDiff + 1 &&
            a[firstDiff] === b[i] &&
            a[i] === b[firstDiff]
          ) {
            continue;
          }
          return false;
        } else {
          return false;
        }
      }
    }
    return diffs === 1 || diffs === 2;
  }

  // Length differs by 1: 1 insertion or 1 deletion
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

/**
 * Builds a SymSpell 1-delete index over a set of normalized words.
 * Only indexes words of length >= MIN_FUZZY_WORD_LEN.
 *
 * @param {Iterable<string>} words
 * @returns {{ vocab: Set<string>, deleteMap: Map<string, string[]> }}
 */
export function buildSymSpellIndex(words) {
  const vocab = new Set();
  const deleteMap = new Map();

  for (const w of words) {
    if (!w || w.length < MIN_FUZZY_WORD_LEN) continue;
    if (vocab.has(w)) continue;
    vocab.add(w);

    for (let i = 0; i < w.length; i++) {
      const del = w.slice(0, i) + w.slice(i + 1);
      let bucket = deleteMap.get(del);
      if (!bucket) {
        bucket = [];
        deleteMap.set(del, bucket);
      }
      bucket.push(w);
    }
  }

  return { vocab, deleteMap };
}

/**
 * Finds all vocabulary words at Damerau-Levenshtein distance 1 from `query`
 * in O(L) hash lookups using the SymSpell 1-delete index.
 *
 * @param {{ vocab: Set<string>, deleteMap: Map<string, string[]> }} symSpell
 * @param {string} query - Already normalized lowercase word
 * @returns {string[]}
 */
export function findSymSpellDistanceOne(symSpell, query) {
  if (!symSpell || !query || query.length < MIN_FUZZY_WORD_LEN) return [];

  const { vocab, deleteMap } = symSpell;
  const results = new Set();

  // 1. Insertions from query (candidates that delete to query -> candidate.length === query.length + 1)
  const longerCandidates = deleteMap.get(query);
  if (longerCandidates) {
    for (const cand of longerCandidates) {
      if (cand !== query) results.add(cand);
    }
  }

  // 2. Deletions & Substitutions via 1-deletes of query
  for (let i = 0; i < query.length; i++) {
    const del = query.slice(0, i) + query.slice(i + 1);

    // 2a. Deletion: del itself is a known word (candidate.length === query.length - 1)
    if (del.length >= MIN_FUZZY_WORD_LEN && vocab.has(del)) {
      results.add(del);
    }

    // 2b. Substitution: candidate shares the same 1-delete (candidate.length === query.length)
    const sameDelCandidates = deleteMap.get(del);
    if (sameDelCandidates) {
      for (const cand of sameDelCandidates) {
        if (cand !== query && cand.length === query.length && !results.has(cand)) {
          if (isDamerauDistanceOne(query, cand)) {
            results.add(cand);
          }
        }
      }
    }
  }

  // 3. Adjacent character transpositions (Damerau-Levenshtein distance 1)
  for (let i = 0; i < query.length - 1; i++) {
    if (query[i] === query[i + 1]) continue;
    const swapped =
      query.slice(0, i) + query[i + 1] + query[i] + query.slice(i + 2);
    if (vocab.has(swapped)) {
      results.add(swapped);
    }
  }

  return Array.from(results);
}

function incNested(outerMap, key, innerKey, amount = 1) {
  if (!key || !innerKey) return;
  let inner = outerMap.get(key);
  if (!inner) {
    inner = new Map();
    outerMap.set(key, inner);
  }
  inner.set(innerKey, (inner.get(innerKey) || 0) + amount);
}

function getNestedTotal(outerMap, key) {
  const inner = outerMap.get(key);
  if (!inner) return 0;
  let sum = 0;
  for (const v of inner.values()) sum += v;
  return sum;
}

/**
 * Extracts normalized value/label from an Allowed Tags item.
 */
function parseAllowedItem(item) {
  if (!item) return { value: '', label: '' };
  if (typeof item === 'object') {
    return {
      value: String(item.value || '').trim(),
      label: String(item.label || '').trim(),
    };
  }
  return { value: String(item).trim(), label: '' };
}

/**
 * Builds a complete TagSuggestionIndex for a given tokenised sub-tier.
 *
 * @param {Object} params
 * @param {Object} params.tier - Target sub-tier ({ id, key, name, splitters, lexicon, lexiconField })
 * @param {Array<Object>} [params.currentSegments=[]]
 * @param {Array<Object>} [params.currentSpeakers=[]]
 * @param {Array<Object>} [params.otherProjects=[]]
 * @param {string|null} [params.activeProjectId=null]
 * @param {Object|null} [params.lexicon=null] - Active Lexicon Manager object
 * @param {string|null} [params.lexiconField=null] - Override field name or ID
 * @param {boolean} [params.includeCurrentProject=true]
 * @param {boolean} [params.includeOtherProjects=true]
 * @param {boolean} [params.includeLexicon=true]
 * @returns {Object} TagSuggestionIndex
 */
export function buildTagSuggestionIndex({
  tier,
  currentSegments = [],
  currentSpeakers = [],
  otherProjects = [],
  activeProjectId = null,
  lexicon = null,
  lexiconField = null,
  includeCurrentProject = true,
  includeOtherProjects = true,
  includeLexicon = true,
} = {}) {
  const wordTagStats = new Map(); // normWord -> Map<tag, { currentCount, otherCount, totalCount }>
  const lexiconWordTags = new Map(); // normWord -> Set<tag>
  const tagCounts = new Map(); // tag -> total count
  const prevTagCounts = new Map(); // prevTag -> Map<tag, count>
  const prev2TagCounts = new Map(); // `${prev2Tag}\0${prevTag}` -> Map<tag, count>
  const nextTagCounts = new Map(); // nextTag -> Map<tag, count>
  const prevWordTagCounts = new Map(); // prevWord -> Map<tag, count>
  const nextWordTagCounts = new Map(); // nextWord -> Map<tag, count>
  const allowedTags = []; // Array<{ value, label, lower }>
  const allowedTagsByLower = new Map();

  // 1. Index Allowed Tags (tier.lexicon)
  if (tier && Array.isArray(tier.lexicon)) {
    for (const rawItem of tier.lexicon) {
      const parsed = parseAllowedItem(rawItem);
      if (!parsed.value) continue;
      const lower = parsed.value.toLowerCase();
      if (!allowedTagsByLower.has(lower)) {
        const entry = { value: parsed.value, label: parsed.label, lower };
        allowedTags.push(entry);
        allowedTagsByLower.set(lower, entry);
      }
    }
  }

  const tierKey = tier?.key != null ? String(tier.key) : String(tier?.id ?? '');
  const tierNameLower = (tier?.name || '').trim().toLowerCase();

  const indexSegmentsForTier = (segments, speakers, targetTierKey, splitters, isCurrent) => {
    if (!Array.isArray(segments) || !targetTierKey) return;
    // Slight weight preference for current project over other projects
    const ctxWeight = isCurrent ? 1 : 0.65;

    for (const seg of segments) {
      if (!seg || !seg.text || isNoteTierSegment(seg, speakers)) continue;
      const rawWords = tokenizeWords(seg.text, splitters);
      if (rawWords.length === 0) continue;

      const annotations = getWordAnnotations(seg, targetTierKey, rawWords.length);
      const normWords = rawWords.map((w) => normalizeLookupWord(w));
      const tags = annotations.map((a) => (a != null ? String(a).trim() : ''));

      for (let i = 0; i < rawWords.length; i++) {
        const tag = tags[i];
        if (!tag) continue;

        const w = normWords[i];
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + ctxWeight);

        if (w) {
          let tagMap = wordTagStats.get(w);
          if (!tagMap) {
            tagMap = new Map();
            wordTagStats.set(w, tagMap);
          }
          let stat = tagMap.get(tag);
          if (!stat) {
            stat = { currentCount: 0, otherCount: 0, totalCount: 0 };
            tagMap.set(tag, stat);
          }
          if (isCurrent) {
            stat.currentCount += 1;
          } else {
            stat.otherCount += 1;
          }
          stat.totalCount += 1;
        }

        const prevTag = i > 0 ? tags[i - 1] : '^';
        const prev2Tag = i > 1 ? tags[i - 2] : '^';
        const nextTag = i < rawWords.length - 1 ? tags[i + 1] : '$';
        const prevWord = i > 0 ? normWords[i - 1] : '^';
        const nextWord = i < rawWords.length - 1 ? normWords[i + 1] : '$';

        if (prevTag) {
          incNested(prevTagCounts, prevTag, tag, ctxWeight);
          if (prev2Tag) {
            incNested(prev2TagCounts, `${prev2Tag}\0${prevTag}`, tag, ctxWeight);
          }
        }
        if (nextTag) {
          incNested(nextTagCounts, nextTag, tag, ctxWeight);
        }
        if (prevWord) {
          incNested(prevWordTagCounts, prevWord, tag, ctxWeight);
        }
        if (nextWord) {
          incNested(nextWordTagCounts, nextWord, tag, ctxWeight);
        }
      }
    }
  };

  // 2. Index current project segments
  if (includeCurrentProject && tier) {
    indexSegmentsForTier(
      currentSegments,
      currentSpeakers,
      tierKey,
      tier.splitters,
      true,
    );
  }

  // 3. Index other saved projects (cross-project memory matching tokenised sub-tiers by name)
  let otherProjectsMatchedCount = 0;
  if (includeOtherProjects && tierNameLower && Array.isArray(otherProjects)) {
    for (const proj of otherProjects) {
      if (!proj || proj.id === activeProjectId) continue;
      if (!Array.isArray(proj.segments) || proj.segments.length === 0) continue;
      const subTiers = Array.isArray(proj.subTiers) ? proj.subTiers : [];
      const matchingTiers = subTiers.filter(
        (st) =>
          (st.type === 'word' || st.type === 'morpheme') &&
          (st.name || '').trim().toLowerCase() === tierNameLower,
      );
      if (matchingTiers.length === 0) continue;

      otherProjectsMatchedCount++;
      for (const mTier of matchingTiers) {
        indexSegmentsForTier(
          proj.segments,
          proj.speakers || [],
          String(mTier.id),
          mTier.splitters,
          false,
        );
      }
    }
  }

  // 4. Index Active Lexicon Manager entries (ALL senses per headword)
  let resolvedLexField = null;
  if (includeLexicon && lexicon && Array.isArray(lexicon.entries)) {
    const fieldCandidate = lexiconField || tier?.lexiconField || tier?.name;
    resolvedLexField = resolveLexiconField(lexicon, fieldCandidate);
    const headwordField = getLexiconHeadwordField(lexicon);

    if (resolvedLexField && headwordField) {
      for (const entry of lexicon.entries) {
        const hwRaw = getEntryFieldValue(entry, headwordField).trim();
        const val = getEntryFieldValue(entry, resolvedLexField).trim();
        if (!hwRaw || !val) continue;

        const hwNorm = normalizeLookupWord(hwRaw);
        if (!hwNorm) continue;

        let set = lexiconWordTags.get(hwNorm);
        if (!set) {
          set = new Set();
          lexiconWordTags.set(hwNorm, set);
        }
        set.add(val);
      }
    }
  }

  // 5. Build SymSpell 1-delete index over all known words (project + cross-project + lexicon)
  const allVocabWords = new Set();
  for (const w of wordTagStats.keys()) allVocabWords.add(w);
  for (const w of lexiconWordTags.keys()) allVocabWords.add(w);
  const symSpell = buildSymSpellIndex(allVocabWords);

  let totalTagOccurrences = 0;
  for (const c of tagCounts.values()) totalTagOccurrences += c;

  return {
    tierKey,
    tierName: tier?.name || '',
    wordTagStats,
    lexiconWordTags,
    tagCounts,
    totalTagOccurrences,
    prevTagCounts,
    prev2TagCounts,
    nextTagCounts,
    prevWordTagCounts,
    nextWordTagCounts,
    allowedTags,
    allowedTagsByLower,
    symSpell,
    resolvedLexField,
    otherProjectsMatchedCount,
    vocabSize: allVocabWords.size,
  };
}

/**
 * Computes contextual transition probability score for candidate `tag`
 * given surrounding tags and words.
 */
function computeContextScore(index, tag, ctx) {
  let score = 0;
  let hasStrongContext = false;

  if (ctx.prevTag) {
    // Trigram: (prev2Tag, prevTag) -> tag
    if (ctx.prev2Tag) {
      const triKey = `${ctx.prev2Tag}\0${ctx.prevTag}`;
      const triTotal = getNestedTotal(index.prev2TagCounts, triKey);
      if (triTotal > 0) {
        const triCount = index.prev2TagCounts.get(triKey)?.get(tag) || 0;
        if (triCount > 0) {
          score += 2.6 * (triCount / (triTotal + 1));
          hasStrongContext = true;
        }
      }
    }

    // Bigram: prevTag -> tag
    const biTotal = getNestedTotal(index.prevTagCounts, ctx.prevTag);
    if (biTotal > 0) {
      const biCount = index.prevTagCounts.get(ctx.prevTag)?.get(tag) || 0;
      if (biCount > 0) {
        score += 2.0 * (biCount / (biTotal + 1));
        hasStrongContext = true;
      }
    }
  }

  // Right-context bigram: tag -> nextTag
  if (ctx.nextTag) {
    const nextTotal = getNestedTotal(index.nextTagCounts, ctx.nextTag);
    if (nextTotal > 0) {
      const nextCount = index.nextTagCounts.get(ctx.nextTag)?.get(tag) || 0;
      if (nextCount > 0) {
        score += 1.8 * (nextCount / (nextTotal + 1));
        hasStrongContext = true;
      }
    }
  }

  // Lexical context: prevWord -> tag and nextWord -> tag
  if (ctx.prevWord) {
    const pwTotal = getNestedTotal(index.prevWordTagCounts, ctx.prevWord);
    if (pwTotal > 0) {
      const pwCount = index.prevWordTagCounts.get(ctx.prevWord)?.get(tag) || 0;
      if (pwCount > 0) {
        score += 1.6 * (pwCount / (pwTotal + 1));
        hasStrongContext = true;
      }
    }
  }

  if (ctx.nextWord) {
    const nwTotal = getNestedTotal(index.nextWordTagCounts, ctx.nextWord);
    if (nwTotal > 0) {
      const nwCount = index.nextWordTagCounts.get(ctx.nextWord)?.get(tag) || 0;
      if (nwCount > 0) {
        score += 1.4 * (nwCount / (nwTotal + 1));
        hasStrongContext = true;
      }
    }
  }

  return { score, hasStrongContext };
}

/**
 * Returns ranked tag suggestions for a token given its surrounding context.
 *
 * @param {Object} index - Built by buildTagSuggestionIndex
 * @param {Object} context
 * @param {string} context.word - Current token text
 * @param {string} [context.prevWord='']
 * @param {string} [context.nextWord='']
 * @param {string} [context.prevTag='']
 * @param {string} [context.prev2Tag='']
 * @param {string} [context.nextTag='']
 * @param {string} [context.currentTag=''] - Existing tag in this cell (subtracted from self-count)
 * @param {Object} [options]
 * @param {string} [options.query=''] - User's typed filter string
 * @param {number} [options.limit=16]
 * @param {boolean} [options.useContext=true]
 * @param {boolean} [options.useFuzzy=true]
 * @param {boolean} [options.includeAllowedFallback=true]
 * @param {boolean} [options.excludeExactQueryMatch=true]
 * @returns {Array<{
 *   value: string,
 *   label: string,
 *   score: number,
 *   count: number,
 *   source: 'exact' | 'lexicon' | 'fuzzy' | 'context' | 'allowed',
 *   fuzzyMatch: string | null,
 *   hasContextBoost: boolean,
 *   inLexicon: boolean
 * }>}
 */
export function getRankedTagSuggestions(
  index,
  context = {},
  {
    query = '',
    limit = 16,
    useContext = true,
    useFuzzy = true,
    includeAllowedFallback = true,
    excludeExactQueryMatch = true,
  } = {},
) {
  if (!index) return [];

  const normWord = normalizeLookupWord(context.word || '');
  const ctx = {
    prevWord: context.prevWord ? normalizeLookupWord(context.prevWord) : '^',
    nextWord: context.nextWord ? normalizeLookupWord(context.nextWord) : '$',
    prevTag: (context.prevTag || '').trim() || (context.isFirst ? '^' : ''),
    prev2Tag: (context.prev2Tag || '').trim() || (context.isSecond ? '^' : ''),
    nextTag: (context.nextTag || '').trim() || (context.isLast ? '$' : ''),
  };
  const selfTag = (context.currentTag || '').trim();

  // Map tagValue -> candidate accumulator
  const candidates = new Map();

  const ensureCandidate = (tagVal) => {
    let c = candidates.get(tagVal);
    if (!c) {
      const allowedEntry = index.allowedTagsByLower.get(tagVal.toLowerCase());
      c = {
        value: tagVal,
        label: allowedEntry?.label || '',
        score: 0,
        count: 0,
        source: 'allowed',
        fuzzyMatch: null,
        fuzzyBestWeight: -1,
        hasContextBoost: false,
        inLexicon: false,
        isExactWordMatch: false,
      };
      candidates.set(tagVal, c);
    }
    return c;
  };

  let hasExactEvidence = false;

  // 1. Exact word matches in project / cross-project history
  if (normWord) {
    const exactTagMap = index.wordTagStats.get(normWord);
    if (exactTagMap) {
      for (const [tag, stat] of exactTagMap.entries()) {
        // Subtract 1 if this exact cell already holds `tag` so it doesn't self-reinforce
        const adjCurrent =
          selfTag && tag === selfTag
            ? Math.max(0, stat.currentCount - 1)
            : stat.currentCount;
        const adjTotal = adjCurrent + stat.otherCount;
        if (adjTotal <= 0) continue;

        hasExactEvidence = true;
        const c = ensureCandidate(tag);
        c.count = adjTotal;
        c.isExactWordMatch = true;
        c.source = 'exact';
        // Strong base score + diminishing returns on frequency; slight preference for current project
        const weightedFreq = adjCurrent + stat.otherCount * 0.7;
        c.score += 10.0 + Math.log1p(weightedFreq) * 2.5;
      }
    }

    // 2. Exact headword matches in Active Lexicon (all senses)
    const lexTags = index.lexiconWordTags.get(normWord);
    if (lexTags && lexTags.size > 0) {
      hasExactEvidence = true;
      for (const tag of lexTags) {
        const c = ensureCandidate(tag);
        c.inLexicon = true;
        if (!c.isExactWordMatch) {
          c.source = 'lexicon';
          c.score += 9.5;
        } else {
          // Both in project history and in Lexicon -> extra confidence boost
          c.score += 2.0;
        }
      }
    }

    // 3. SymSpell Fuzzy Matches (Damerau-Levenshtein distance 1) for unknown words
    if (useFuzzy && !hasExactEvidence && normWord.length >= MIN_FUZZY_WORD_LEN) {
      const neighbors = findSymSpellDistanceOne(index.symSpell, normWord);
      for (const neighbor of neighbors) {
        const nTagMap = index.wordTagStats.get(neighbor);
        if (nTagMap) {
          for (const [tag, stat] of nTagMap.entries()) {
            const c = ensureCandidate(tag);
            const weight = stat.currentCount + stat.otherCount * 0.7;
            if (!c.isExactWordMatch && !c.inLexicon) {
              c.source = 'fuzzy';
            }
            if (weight > c.fuzzyBestWeight) {
              c.fuzzyBestWeight = weight;
              c.fuzzyMatch = neighbor;
            }
            c.count = Math.max(c.count, stat.totalCount);
            c.score += 5.5 + Math.log1p(weight) * 1.6;
          }
        }

        const nLexTags = index.lexiconWordTags.get(neighbor);
        if (nLexTags) {
          for (const tag of nLexTags) {
            const c = ensureCandidate(tag);
            if (!c.isExactWordMatch && !c.inLexicon) {
              c.source = 'fuzzy';
            }
            if (c.fuzzyBestWeight < 0.5) {
              c.fuzzyBestWeight = 0.5;
              c.fuzzyMatch = neighbor;
            }
            c.score += 5.0;
          }
        }
      }
    }
  }

  // 4. Context candidates (tags seen in this tag/word context even if unseen for this word)
  if (useContext) {
    const contextCandidateTags = new Set();
    const collectFrom = (map, key) => {
      const inner = map.get(key);
      if (!inner) return;
      for (const t of inner.keys()) contextCandidateTags.add(t);
    };
    if (ctx.prevTag) {
      collectFrom(index.prevTagCounts, ctx.prevTag);
      if (ctx.prev2Tag) {
        collectFrom(index.prev2TagCounts, `${ctx.prev2Tag}\0${ctx.prevTag}`);
      }
    }
    if (ctx.nextTag) collectFrom(index.nextTagCounts, ctx.nextTag);
    if (ctx.prevWord) collectFrom(index.prevWordTagCounts, ctx.prevWord);
    if (ctx.nextWord) collectFrom(index.nextWordTagCounts, ctx.nextWord);

    for (const tag of contextCandidateTags) {
      const c = ensureCandidate(tag);
      if (c.source === 'allowed') {
        c.source = 'context';
      }
    }
  }

  // 5. Include Allowed Tags (tier.lexicon) and top global tags as fallback
  if (includeAllowedFallback) {
    for (const item of index.allowedTags) {
      ensureCandidate(item.value);
    }
    // For open-class tiers with no Allowed Tags, also surface frequent tags in the tier
    if (index.allowedTags.length === 0 && candidates.size < limit) {
      const topGlobal = Array.from(index.tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
      for (const [tag] of topGlobal) {
        ensureCandidate(tag);
      }
    }
  }

  // 6. Apply contextual boost & global frequency tie-breaker to every candidate
  const totalGlobal = Math.max(1, index.totalTagOccurrences);
  for (const c of candidates.values()) {
    if (useContext) {
      const { score: ctxScore, hasStrongContext } = computeContextScore(
        index,
        c.value,
        ctx,
      );
      if (ctxScore > 0) {
        c.score += ctxScore;
        c.hasContextBoost = hasStrongContext;
      }
    }

    // Small global frequency prior so common tags naturally outrank rare ones
    const globalCount = index.tagCounts.get(c.value) || 0;
    if (globalCount > 0) {
      c.score += 0.6 * (globalCount / totalGlobal) + 0.15 * Math.log1p(globalCount);
    }
  }

  // 7. Filter by typed query (if any) and sort by match tier + score
  const q = String(query || '').trim().toLowerCase();
  let list = Array.from(candidates.values());

  if (q) {
    list = list.filter((c) => {
      const lower = c.value.toLowerCase();
      if (excludeExactQueryMatch && lower === q) return false;
      if (lower.includes(q)) return true;
      if (c.label && c.label.toLowerCase().includes(q)) return true;
      return false;
    });

    list.sort((a, b) => {
      const aStarts = a.value.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.value.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      if (b.score !== a.score) return b.score - a.score;
      return a.value.localeCompare(b.value);
    });
  } else {
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.value.localeCompare(b.value);
    });
  }

  return list.slice(0, limit);
}
