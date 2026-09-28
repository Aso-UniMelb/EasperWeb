/**
 * Dataset Linguistic Analysis & Validation Module.
 * Pure JavaScript analyzer computing:
 * - Disallowed characters
 * - Long segments (>25s)
 * - Speaker overlaps (>400ms)
 * - Character frequencies & Unicode points
 * - Bigram frequencies
 * - Word vocabulary frequencies
 * - Assessment metrics (Tokens, Types, TyTo, ToTy per file and whole dataset)
 */

import { formatTimeSec, formatDurationHms } from './formatters.js';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function msToMinSec(milliseconds) {
  return formatTimeSec(milliseconds / 1000);
}

function msToHhMmSs(milliseconds) {
  return formatDurationHms(milliseconds / 1000);
}

export function analyzeTiers({
  filesData = [],
  selectedTiers = {},
  allowedLetters = '',
  allowedPunctuation = '',
  longSegmentThresholdMs = 25000,
  overlapThresholdMs = 400,
  rules = [],
  lowercaseTranscripts = false,
}) {
  const letters = allowedLetters || '';
  const punct = allowedPunctuation || '';
  const allowedSet = new Set(
    Array.from(letters).concat(Array.from(punct), [' '])
  );

  const delimitersRegex = new RegExp(
    '[' + escapeRegex(punct + ' \t\n\r()[\\]{}<>/\\\\+=~`@#$%^&*|«»“”"\'`_—–') + ']+',
    'u'
  );

  // Compiled normalization rules
  const compiledRules = (rules || []).map((r) => ({
    pattern: new RegExp(r.rawPattern, 'g'),
    replacement: r.replacement,
  }));

  const globalCharCounts = new Map();
  const globalBigramCounts = new Map();
  const globalWordCounts = new Map();
  const globalWordFileMap = new Map(); // lower-cased word -> Set of fileNames

  const naRecords = [];
  const longRecords = [];
  const overlapRecords = [];
  const assessmentRecords = [];
  const fileStatsList = [];

  for (const fileData of filesData) {
    const { fileName, tiers } = fileData;
    const fileSelected = selectedTiers[fileName] || {};

    const fileNotAllowed = new Map();
    const fileNaTiers = new Map();
    const fileNaSamples = new Map();
    const fileLongSegments = [];
    const allFileAnnotations = [];

    let fileTokens = 0;
    const fileWordSet = new Set();
    let fileTotalDurationMs = 0;
    let fileSegmentsCount = 0;

    for (const tier of tiers) {
      if (!fileSelected[tier.tierId]) continue;

      for (const ann of tier.annotations || []) {
        let text = ann.text || ann.value || '';
        if (compiledRules.length > 0) {
          for (const rule of compiledRules) {
            text = text.replace(rule.pattern, rule.replacement);
          }
        }
        if (lowercaseTranscripts) {
          text = text.toLowerCase();
        }
        text = text.trim();
        if (!text) continue;

        const dur = Math.max(0, ann.end - ann.start);
        fileTotalDurationMs += dur;
        fileSegmentsCount++;

        const annRecord = {
          tier: tier.tierId,
          start: ann.start,
          end: ann.end,
          text,
        };
        allFileAnnotations.push(annRecord);

        // Global character frequencies
        for (const c of text) {
          if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
            globalCharCounts.set(c, (globalCharCounts.get(c) || 0) + 1);
          }
        }

        // Global bigrams
        for (let j = 0; j < text.length - 1; j++) {
          const bg = text.substring(j, j + 2);
          if (
            !bg.includes(' ') &&
            !bg.includes('\t') &&
            !bg.includes('\n') &&
            !bg.includes('\r')
          ) {
            globalBigramCounts.set(bg, (globalBigramCounts.get(bg) || 0) + 1);
          }
        }

        // Global words
        const rawTokens = text.split(delimitersRegex);
        for (const raw of rawTokens) {
          const cleaned = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
          if (cleaned.length === 0) continue;

          fileTokens++;
          fileWordSet.add(cleaned);
          globalWordCounts.set(cleaned, (globalWordCounts.get(cleaned) || 0) + 1);
          if (!globalWordFileMap.has(cleaned)) {
            globalWordFileMap.set(cleaned, new Set());
          }
          globalWordFileMap.get(cleaned).add(fileName);
        }

        // Disallowed chars check
        for (const char of text) {
          if (!allowedSet.has(char)) {
            fileNotAllowed.set(char, (fileNotAllowed.get(char) || 0) + 1);
            if (!fileNaTiers.has(char)) {
              fileNaTiers.set(char, new Set());
            }
            fileNaTiers.get(char).add(tier.tierId);
            if (!fileNaSamples.has(char)) {
              fileNaSamples.set(char, text);
            }
          }
        }

        // Long segments check
        if (dur > longSegmentThresholdMs) {
          fileLongSegments.push({
            tier: tier.tierId,
            start: ann.start,
            end: ann.end,
            dur,
            text,
          });
        }
      }
    }

    // Compile Disallowed for file
    const sortedFileNa = Array.from(fileNotAllowed.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    for (const [char, count] of sortedFileNa) {
      naRecords.push({
        file: fileName,
        char,
        hex: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        count,
        tiers: Array.from(fileNaTiers.get(char) || []).sort().join(', '),
        sample: fileNaSamples.get(char) || '',
      });
    }

    // Compile Long Segments for file
    for (const item of fileLongSegments) {
      longRecords.push({
        file: fileName,
        tier: item.tier,
        startMs: item.start,
        endMs: item.end,
        start: msToHhMmSs(item.start),
        end: msToHhMmSs(item.end),
        dur: `${(item.dur / 1000).toFixed(1)}s`,
        preview: item.text.length > 40 ? `${item.text.slice(0, 40)}...` : item.text,
        fullText: item.text,
      });
    }

    // Check Speaker Overlaps (> overlapThresholdMs between different tiers)
    allFileAnnotations.sort((a, b) => a.start - b.start);
    for (let i = 0; i < allFileAnnotations.length; i++) {
      for (let j = i + 1; j < allFileAnnotations.length; j++) {
        const seg1 = allFileAnnotations[i];
        const seg2 = allFileAnnotations[j];

        if (seg2.start >= seg1.end) break; // Chronologically sorted, no further overlaps for seg1

        if (seg1.tier !== seg2.tier) {
          const overlapStart = Math.max(seg1.start, seg2.start);
          const overlapEnd = Math.min(seg1.end, seg2.end);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          if (overlap > overlapThresholdMs) {
            overlapRecords.push({
              file: fileName,
              tier1: seg1.tier,
              time1: `${msToHhMmSs(seg1.start)}-${msToHhMmSs(seg1.end)}`,
              text1: seg1.text,
              tier2: seg2.tier,
              time2: `${msToHhMmSs(seg2.start)}-${msToHhMmSs(seg2.end)}`,
              text2: seg2.text,
              dur: `${(overlap / 1000).toFixed(1)}s`,
              overlapStartMs: overlapStart,
              overlapEndMs: overlapEnd,
              overlapStart: msToHhMmSs(overlapStart),
            });
          }
        }
      }
    }

    fileStatsList.push({
      fileName,
      fileSegmentsCount,
      fileTotalDurationMs,
      fileTokens,
      fileWordSet,
    });
  }

  // Aggregate Dataset-wide Metrics
  const totalDsSegments = fileStatsList.reduce(
    (acc, r) => acc + r.fileSegmentsCount,
    0
  );
  const totalDsDurationMs = fileStatsList.reduce(
    (acc, r) => acc + r.fileTotalDurationMs,
    0
  );
  const totalDsDurationSec = totalDsDurationMs / 1000.0;
  let totalDsTokens = 0;
  for (const val of globalWordCounts.values()) {
    totalDsTokens += val;
  }
  const totalDsTypes = globalWordCounts.size;
  const totalDsTyTo = totalDsTokens > 0 ? totalDsTypes / totalDsTokens : 0.0;
  const totalDsToTy =
    totalDsTypes > 0 && totalDsDurationSec > 0
      ? totalDsTokens / (totalDsTypes * totalDsDurationSec)
      : 0.0;

  // Compile Assessment Records per file
  for (let i = 0; i < fileStatsList.length; i++) {
    const f = fileStatsList[i];
    const durationSec = f.fileTotalDurationMs / 1000.0;
    const countTokens = f.fileTokens;
    const countTypes = f.fileWordSet.size;
    const tyto = countTokens > 0 ? countTypes / countTokens : 0.0;
    const toty =
      countTypes > 0 && durationSec > 0
        ? countTokens / (countTypes * durationSec)
        : 0.0;
    const durationShare =
      totalDsDurationSec > 0 ? (durationSec / totalDsDurationSec) * 100 : 0;
    const tokenShare =
      totalDsTokens > 0 ? (countTokens / totalDsTokens) * 100 : 0;

    let uniqueWords = 0;
    for (const w of f.fileWordSet) {
      if (globalWordFileMap.get(w)?.size === 1) uniqueWords++;
    }

    // Role in speech model training
    let trainingRole = 'Core Contributor';
    let trainingBadge = 'role-core';
    let trainingScore = 65;
    let trainingReason = 'Consistent acoustic recording and standard vocabulary.';

    if (durationSec === 0 && countTokens === 0) {
      trainingRole = 'No Speech Selected';
      trainingBadge = 'role-none';
      trainingScore = 0;
      trainingReason = 'No active speech tiers selected for this file.';
    } else if (durationSec < 15 && countTokens < 20) {
      trainingRole = 'Minor Clip';
      trainingBadge = 'role-minor';
      trainingScore = 20;
      trainingReason = 'Brief audio clip (<15s) with minimal training impact.';
    } else if (
      uniqueWords >= 8 ||
      (countTypes >= 12 && uniqueWords / countTypes >= 0.3)
    ) {
      trainingRole = 'Key Lexicon Driver';
      trainingBadge = 'role-lexicon';
      trainingScore = 88;
      trainingReason = `Introduces ${uniqueWords} unique word(s) not found in any other file.`;
    } else if (
      durationShare >= 25 ||
      (fileStatsList.length > 2 &&
        durationShare >= (100 / fileStatsList.length) * 1.5)
    ) {
      trainingRole = 'Major Speech Source';
      trainingBadge = 'role-speech';
      trainingScore = 92;
      trainingReason = `Supplies ${durationShare.toFixed(1)}% of all training speech audio (${msToMinSec(f.fileTotalDurationMs)}).`;
    } else if (tyto >= 0.65 && countTokens >= 25) {
      trainingRole = 'High Lexical Diversity';
      trainingBadge = 'role-diversity';
      trainingScore = 80;
      trainingReason = `High TyTo Ratio (${tyto.toFixed(2)}) with diverse word sequences.`;
    }

    assessmentRecords.push({
      rank: i + 1,
      file: f.fileName,
      segments: f.fileSegmentsCount,
      duration: msToMinSec(f.fileTotalDurationMs),
      durationSec,
      durationShare: durationShare.toFixed(1),
      tokens: countTokens,
      tokenShare: tokenShare.toFixed(1),
      types: countTypes,
      uniqueWords,
      tyto: tyto.toFixed(4),
      toty: toty.toFixed(4),
      ttr: tyto.toFixed(4),
      nttr: toty.toFixed(4),
      trainingRole,
      trainingBadge,
      trainingScore,
      trainingReason,
      isSummary: false,
    });
  }



  const kpiSummary = {
    totalFiles: fileStatsList.length,
    totalSegments: totalDsSegments,
    totalDurationMs: totalDsDurationMs,
    totalDurationSec: totalDsDurationSec,
    totalDurationFormatted: msToHhMmSs(totalDsDurationMs),
    totalTokens: totalDsTokens,
    totalWords: totalDsTokens,
    totalTypes: totalDsTypes,
    totalVocab: totalDsTypes,
    overallTyTo: totalDsTyTo.toFixed(4),
    overallToTy: totalDsToTy.toFixed(4),
    overallTtr: totalDsTyTo.toFixed(4),
    overallTTR: totalDsTyTo,
    overallNttr: totalDsToTy.toFixed(4),
    lowercaseTranscripts: Boolean(lowercaseTranscripts),
  };

  // Compile Characters
  let totalChars = 0;
  for (const c of globalCharCounts.values()) totalChars += c;
  totalChars = totalChars || 1;

  const charRecords = [];
  const sortedChars = Array.from(globalCharCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  for (let rank = 1; rank <= sortedChars.length; rank++) {
    const [char, count] = sortedChars[rank - 1];
    const pct = ((count / totalChars) * 100).toFixed(2) + '%';
    charRecords.push({
      rank,
      char,
      hex: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      count,
      pct,
    });
  }

  // Compile Bigrams
  let totalBigrams = 0;
  for (const c of globalBigramCounts.values()) totalBigrams += c;
  totalBigrams = totalBigrams || 1;

  const bigramRecords = [];
  const sortedBigrams = Array.from(globalBigramCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  for (let rank = 1; rank <= sortedBigrams.length; rank++) {
    const [bigram, count] = sortedBigrams[rank - 1];
    const pct = ((count / totalBigrams) * 100).toFixed(2) + '%';
    const hex = Array.from(bigram)
      .map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      .join(' ');
    bigramRecords.push({
      rank,
      bigram,
      hex,
      count,
      pct,
    });
  }

  // Compile Words
  let totalWords = 0;
  for (const c of globalWordCounts.values()) totalWords += c;
  totalWords = totalWords || 1;

  const wordRecords = [];
  const sortedWords = Array.from(globalWordCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  for (let rank = 1; rank <= sortedWords.length; rank++) {
    const [word, count] = sortedWords[rank - 1];
    const pct = ((count / totalWords) * 100).toFixed(2) + '%';
    wordRecords.push({
      rank,
      word,
      count,
      pct,
      len: word.length,
    });
  }

  return {
    naRecords,
    longRecords,
    overlapRecords,
    assessmentRecords,
    kpiSummary,
    charRecords,
    bigramRecords,
    wordRecords,
  };
}

