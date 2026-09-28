/**
 * Dataset Builder Reactive State.
 * Svelte 5 universal reactive module (.svelte.js).
 * Coordinates file ingestion, EAF tier selection, validation scanning,
 * linguistic reporting, and audio dataset generation.
 */

import {
  parseEaf,
  extractUniqueLetters,
  classifyUnicodeChar,
  extractUnicodeInventory,
} from '../utils/elanParser.js';
import {
  pairEafWithAudio,
  isAudioFile,
  isEafFile,
  getBaseName,
} from '../utils/datasetAudioMatcher.js';
import {
  parseNormalizationRules,
} from '../utils/normalizationRules.js';
import { analyzeTiers } from '../utils/datasetAnalyzer.js';
import { buildDatasetZip } from '../utils/datasetBuilder.js';
import { processAudioFile } from '../audio.js';

const STORAGE_KEY_RULES = 'easper_dataset_replacement_rules';
const STORAGE_KEY_LOWERCASE = 'easper_dataset_lowercase_transcripts';

const DEFAULT_REPLACEMENT_RULES = [
  { id: 'rule-hes', find: '<hes>', replace: '', enabled: true, isRegex: false },
  { id: 'rule-laughter', find: '<laughter>', replace: '', enabled: true, isRegex: false },
  { id: 'rule-cough', find: '<cough>', replace: '', enabled: false, isRegex: false },
  { id: 'rule-sigh', find: '<sigh>', replace: '', enabled: false, isRegex: false },
];

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadSavedRules() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RULES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[DatasetState] Failed to load saved replacement rules:', e);
    }
  }
  return DEFAULT_REPLACEMENT_RULES;
}

function persistRules(rules) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
    } catch (e) {
      console.warn('[DatasetState] Failed to save replacement rules:', e);
    }
  }
}

function loadSavedLowercaseOption() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOWERCASE);
      if (raw !== null) {
        return JSON.parse(raw) === true;
      }
    } catch (e) {
      console.warn('[DatasetState] Failed to load saved lowercase option:', e);
    }
  }
  return false;
}

function persistLowercaseOption(val) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_LOWERCASE, JSON.stringify(Boolean(val)));
    } catch (e) {
      console.warn('[DatasetState] Failed to save lowercase option:', e);
    }
  }
}

export const MAX_DATASET_PAIRS = 50;

class DatasetState {
  // Ingested Files
  eafFiles = $state([]); // Array of { file: File, parsed: Object }
  audioFiles = $state([]); // Array of File
  pairedFiles = $state([]); // Array of matched pair objects
  unmatchedEaf = $state([]); // Filenames of .eaf without audio
  unmatchedAudio = $state([]); // Filenames of audio without .eaf
  pairLimitNotice = $state(null); // Notice when 50-pair memory safety limit is reached

  // Persistent Text Replacement / Deletion Rules & Casing (Step 5)
  replacementRules = $state(loadSavedRules());
  lowercaseTranscripts = $state(loadSavedLowercaseOption());
  hasVisitedReplacements = $state(false);
  normalizationFile = $state(null);
  normalizationFileName = $state('');
  normalizationRules = $state([]);

  // Tier Selection Settings
  tierSelections = $state({}); // { [fileName]: { [tierId]: boolean } }
  tierFilter = $state('');
  allowedLetters = $state('');
  allowedPunctuation = $state('- . , ; : ! ? "');
  longSegmentThreshold = $state(25); // seconds
  overlapThreshold = $state(400); // ms

  // Step tabs workflow: 'ingest' | 'tiers' | 'characters' | 'reports' | 'replacements' | 'review' | 'export'
  currentTab = $state('ingest');

  // Collapsible cards state (backward compatibility)
  isSettingsExpanded = $state(true);
  isReportsExpanded = $state(true);
  isOutputExpanded = $state(true);

  setTab(tab) {
    this.currentTab = tab;
    if (tab === 'replacements' || tab === 'review' || tab === 'export') {
      this.hasVisitedReplacements = true;
    }
  }

  nextTab() {
    const order = ['ingest', 'tiers', 'characters', 'reports', 'replacements', 'review', 'export'];
    const idx = order.indexOf(this.currentTab);
    if (idx >= 0 && idx < order.length - 1) {
      this.currentTab = order[idx + 1];
      if (['replacements', 'review', 'export'].includes(this.currentTab)) {
        this.hasVisitedReplacements = true;
      }
    }
  }

  prevTab() {
    const order = ['ingest', 'tiers', 'characters', 'reports', 'replacements', 'review', 'export'];
    const idx = order.indexOf(this.currentTab);
    if (idx > 0) {
      this.currentTab = order[idx - 1];
    }
  }

  // Validation & Reports
  isChecking = $state(false);
  hasChecked = $state(false);
  validationResults = $state({
    naRecords: [],
    longRecords: [],
    overlapRecords: [],
    assessmentRecords: [],
    kpiSummary: null,
    charRecords: [],
    bigramRecords: [],
    wordRecords: [],
  });

  // Active view in reports: 'not allowed chars' | 'long segments' | 'overlaps' | 'chars' | 'bigrams' | 'words' | 'assessment'
  activeView = $state('not allowed chars');

  // Step 4 Primary Section: 'issues' | 'assessment'
  step4MainTab = $state('issues');
  lastValidatedAt = $state(null);
  lastReloadNotice = $state(null); // { message: string, type: 'success' | 'error' | 'info' }

  // Selected records for inspection / copying
  selectedNaRecord = $state(null);
  selectedLongRecord = $state(null);
  selectedOverlapRecord = $state(null);

  // Search filters inside report tables
  assessmentSearch = $state('');
  charSearch = $state('');
  bigramSearch = $state('');
  wordSearch = $state('');

  // Building & Export
  isBuilding = $state(false);
  buildProgress = $state({
    current: 0,
    total: 0,
    percent: 0,
    status: 'Ready to build dataset.',
  });
  buildSuccess = $state(null); // { zipBlob, zipUrl, filename, sizeStr, totalSegments }

  // -------------------------------------------------------------
  // File Ingestion
  // -------------------------------------------------------------

  dismissPairLimitNotice() {
    this.pairLimitNotice = null;
  }

  async ingestFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    // If already at limit and all pairs have audio, reject with a clear notice
    if (this.pairedFiles.length >= MAX_DATASET_PAIRS && this.unmatchedEaf.length === 0) {
      this.pairLimitNotice = `Maximum capacity of ${MAX_DATASET_PAIRS} pairs reached. Additional files cannot be added to prevent browser memory exhaustion and crashes. Please remove some files first.`;
      return;
    }

    const newEafs = [];
    const newAudios = [];
    let newNormFile = null;

    for (const file of fileList) {
      if (isEafFile(file)) {
        try {
          const xmlText = await file.text();
          const parsed = parseEaf(xmlText, file.name);
          newEafs.push({ file, parsed });
        } catch (err) {
          console.error(`Failed to parse EAF ${file.name}:`, err);
        }
      } else if (isAudioFile(file)) {
        newAudios.push(file);
      } else if (
        file.name.toLowerCase().endsWith('.tsv') ||
        file.name.toLowerCase().endsWith('.txt')
      ) {
        newNormFile = file;
      }
    }

    if (newNormFile) {
      await this.loadNormalizationFile(newNormFile);
    }

    // Merge with existing
    const existingEafMap = new Map(this.eafFiles.map((e) => [e.file.name, e]));
    for (const e of newEafs) {
      existingEafMap.set(e.file.name, e);
    }
    const mergedEafs = Array.from(existingEafMap.values());

    const existingAudioMap = new Map(this.audioFiles.map((a) => [a.name, a]));
    for (const a of newAudios) {
      existingAudioMap.set(a.name, a);
    }
    const mergedAudios = Array.from(existingAudioMap.values());

    // Pair EAF with Audio
    const pairingResult = pairEafWithAudio(mergedEafs, mergedAudios);

    if (pairingResult.pairs.length > MAX_DATASET_PAIRS) {
      // Prioritize pairs that have matched audio, while maintaining stable order
      const sortedPairs = [...pairingResult.pairs].sort((a, b) => {
        if (a.hasAudio === b.hasAudio) return 0;
        return b.hasAudio ? 1 : -1;
      });
      const keptPairs = sortedPairs.slice(0, MAX_DATASET_PAIRS);
      const excessCount = pairingResult.pairs.length - MAX_DATASET_PAIRS;

      const keptEafNames = new Set(keptPairs.map((p) => p.eafFile.name));
      this.eafFiles = mergedEafs.filter((e) => keptEafNames.has(e.file.name));

      const keptAudioFiles = new Set(keptPairs.map((p) => p.audioFile).filter(Boolean));
      this.audioFiles = mergedAudios.filter((a) => keptAudioFiles.has(a));

      // Re-run pairing on the trimmed lists
      const trimmedResult = pairEafWithAudio(this.eafFiles, this.audioFiles);
      this.pairedFiles = trimmedResult.pairs;
      this.unmatchedEaf = trimmedResult.unmatchedEaf;
      this.unmatchedAudio = trimmedResult.unmatchedAudio;

      this.pairLimitNotice = `The dataset has been capped at ${MAX_DATASET_PAIRS} pairs (${excessCount} excess file(s) were excluded to prevent browser memory exhaustion and crashes).`;
    } else {
      this.eafFiles = mergedEafs;
      this.audioFiles = mergedAudios;
      this.pairedFiles = pairingResult.pairs;
      this.unmatchedEaf = pairingResult.unmatchedEaf;
      this.unmatchedAudio = pairingResult.unmatchedAudio;
      if (this.pairedFiles.length < MAX_DATASET_PAIRS) {
        this.pairLimitNotice = null;
      }
    }

    // Clean up tier selections for any removed EAFs
    const validEafNames = new Set(this.eafFiles.map((e) => e.file.name));
    for (const fileName of Object.keys(this.tierSelections)) {
      if (!validEafNames.has(fileName)) {
        delete this.tierSelections[fileName];
      }
    }

    // By default do not select any tiers for newly ingested files
    this.initTierSelections();

    // Auto-extract allowed letters from all annotations
    this.autoExtractAllowedLetters();

    this.isSettingsExpanded = true;
  }

  removeEafFile(fileName) {
    this.eafFiles = this.eafFiles.filter((e) => e.file.name !== fileName);
    const newSelections = { ...this.tierSelections };
    delete newSelections[fileName];
    this.tierSelections = newSelections;
    this.recomputePairings();
    this.autoExtractAllowedLetters();
    if (this.pairedFiles.length < MAX_DATASET_PAIRS) {
      this.pairLimitNotice = null;
    }
    if (this.eafFiles.length === 0 && this.audioFiles.length === 0) {
      this.clearAll();
    }
  }

  removeAudioFile(fileName) {
    this.audioFiles = this.audioFiles.filter((a) => a.name !== fileName);
    this.recomputePairings();
    if (this.pairedFiles.length < MAX_DATASET_PAIRS) {
      this.pairLimitNotice = null;
    }
  }

  recomputePairings() {
    const result = pairEafWithAudio(this.eafFiles, this.audioFiles);
    if (result.pairs.length > MAX_DATASET_PAIRS) {
      const sortedPairs = [...result.pairs].sort((a, b) => {
        if (a.hasAudio === b.hasAudio) return 0;
        return b.hasAudio ? 1 : -1;
      });
      const keptPairs = sortedPairs.slice(0, MAX_DATASET_PAIRS);
      const keptEafNames = new Set(keptPairs.map((p) => p.eafFile.name));
      this.eafFiles = this.eafFiles.filter((e) => keptEafNames.has(e.file.name));

      const keptAudioFiles = new Set(keptPairs.map((p) => p.audioFile).filter(Boolean));
      this.audioFiles = this.audioFiles.filter((a) => keptAudioFiles.has(a));

      const trimmedResult = pairEafWithAudio(this.eafFiles, this.audioFiles);
      this.pairedFiles = trimmedResult.pairs;
      this.unmatchedEaf = trimmedResult.unmatchedEaf;
      this.unmatchedAudio = trimmedResult.unmatchedAudio;
    } else {
      this.pairedFiles = result.pairs;
      this.unmatchedEaf = result.unmatchedEaf;
      this.unmatchedAudio = result.unmatchedAudio;
    }
  }

  initTierSelections() {
    const newSelections = { ...this.tierSelections };
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      if (!newSelections[fileName]) {
        newSelections[fileName] = {};
        if (pair.parsedEaf && pair.parsedEaf.tiers) {
          for (const tier of pair.parsedEaf.tiers) {
            // By default do not select any tiers
            newSelections[fileName][tier.tierId] = false;
          }
        }
      }
    }
    this.tierSelections = newSelections;
  }

  saveReplacementRules() {
    persistRules(this.replacementRules);
  }

  addReplacementRule(find, replace = '', isRegex = false) {
    const trimmedFind = (find || '').trim();
    if (!trimmedFind) return;
    const newRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      find: trimmedFind,
      replace: replace ?? '',
      enabled: true,
      isRegex: Boolean(isRegex),
    };
    this.replacementRules = [...this.replacementRules, newRule];
    this.saveReplacementRules();
  }

  moveRule(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.replacementRules.length ||
      toIndex < 0 ||
      toIndex >= this.replacementRules.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const updated = [...this.replacementRules];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    this.replacementRules = updated;
    this.saveReplacementRules();
  }

  moveRuleUp(id) {
    const idx = this.replacementRules.findIndex((r) => r.id === id);
    if (idx > 0) {
      this.moveRule(idx, idx - 1);
    }
  }

  moveRuleDown(id) {
    const idx = this.replacementRules.findIndex((r) => r.id === id);
    if (idx >= 0 && idx < this.replacementRules.length - 1) {
      this.moveRule(idx, idx + 1);
    }
  }

  removeReplacementRule(id) {
    this.replacementRules = this.replacementRules.filter((r) => r.id !== id);
    this.saveReplacementRules();
  }

  updateReplacementRule(id, updates) {
    this.replacementRules = this.replacementRules.map((r) => {
      if (r.id === id) {
        return { ...r, ...updates };
      }
      return r;
    });
    this.saveReplacementRules();
  }

  toggleReplacementRule(id) {
    this.replacementRules = this.replacementRules.map((r) => {
      if (r.id === id) {
        return { ...r, enabled: !r.enabled };
      }
      return r;
    });
    this.saveReplacementRules();
  }

  resetDefaultRules() {
    this.replacementRules = JSON.parse(JSON.stringify(DEFAULT_REPLACEMENT_RULES));
    this.saveReplacementRules();
  }

  clearAllReplacementRules() {
    this.replacementRules = [];
    this.saveReplacementRules();
  }

  importRulesFromTsv(text) {
    if (!text || typeof text !== 'string') return 0;
    const lines = text.split(/\r?\n/);
    const newRules = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = lines[i].split('\t');
      const find = parts[0]?.trim();
      if (!find) continue;

      // Skip header line if present
      if (
        i === 0 &&
        (find.toLowerCase() === 'find' ||
          find.toLowerCase() === 'pattern' ||
          find.toLowerCase() === 'find string' ||
          find.toLowerCase() === 'find_pattern')
      ) {
        continue;
      }

      const replace = parts.length >= 2 ? parts[1] : '';
      let isRegex = false;
      if (parts.length >= 3) {
        const val = parts[2]?.trim().toLowerCase();
        isRegex = val === 'true' || val === '1' || val === 'regex' || val === 'yes';
      }

      newRules.push({
        id: `rule-imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        find,
        replace: replace || '',
        enabled: true,
        isRegex,
      });
    }

    if (newRules.length > 0) {
      const existingMap = new Map(this.replacementRules.map((r) => [r.find, r]));
      const toAdd = [];
      let count = 0;
      for (const nr of newRules) {
        if (existingMap.has(nr.find)) {
          const existing = existingMap.get(nr.find);
          existing.replace = nr.replace;
          existing.isRegex = nr.isRegex;
          existing.enabled = true;
          count++;
        } else {
          toAdd.push(nr);
          existingMap.set(nr.find, nr);
          count++;
        }
      }
      this.replacementRules = [...toAdd, ...this.replacementRules];
      this.saveReplacementRules();
      return count;
    }
    return 0;
  }

  exportRulesToTsv() {
    const header = 'find\treplace\tisRegex';
    const rows = this.replacementRules.map(
      (r) => `${r.find}\t${r.replace || ''}\t${Boolean(r.isRegex)}`,
    );
    const tsvContent = [header, ...rows].join('\n');
    const blob = new Blob([tsvContent], {
      type: 'text/tab-separated-values;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elan_replacement_rules.tsv';
    a.click();
    URL.revokeObjectURL(url);
  }

  setLowercaseTranscripts(val) {
    this.lowercaseTranscripts = Boolean(val);
    persistLowercaseOption(this.lowercaseTranscripts);
    if (this.hasChecked && this.hasAnyTierSelected()) {
      this.revalidate();
    }
  }

  getNormalizationRulesData() {
    const activeRules = (this.replacementRules || []).filter(
      (r) => r.enabled && r.find,
    );
    return activeRules.map((r) => {
      const rawPattern = r.isRegex ? r.find : escapeRegex(r.find);
      return {
        rawPattern,
        replacement: r.replace ?? '',
      };
    });
  }

  getDetectedSpecialTokens() {
    const tokenCounts = new Map();
    const tokenRegex = /(<[^>]+>|\[[^\]]+\]|\*[^*]+\*|\{[^}]+\})/g;

    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = this.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (fileTiers[tier.tierId]) {
            for (const ann of tier.annotations || []) {
              if (ann.text) {
                const matches = ann.text.match(tokenRegex);
                if (matches) {
                  for (const m of matches) {
                    tokenCounts.set(m, (tokenCounts.get(m) || 0) + 1);
                  }
                }
              }
            }
          }
        }
      }
    }

    return Array.from(tokenCounts.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count);
  }

  async loadNormalizationFile(file) {
    this.normalizationFile = file;
    this.normalizationFileName = file.name;
    try {
      const content = await file.text();
      this.importRulesFromTsv(content);
    } catch (err) {
      console.error('Error loading normalization rules:', err);
    }
  }

  clearNormalizationFile() {
    this.normalizationFile = null;
    this.normalizationFileName = '';
  }

  // -------------------------------------------------------------
  // Tier Management & Filtering
  // -------------------------------------------------------------

  autoExtractAllowedLetters() {
    const allAnnotations = [];
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = this.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (fileTiers[tier.tierId]) {
            allAnnotations.push(...tier.annotations);
          }
        }
      }
    }
    const inventory = extractUnicodeInventory(allAnnotations);
    this.allowedLetters = inventory.letters || '';

    // Auto-detect punctuation: merge any punctuation appearing in selected transcripts into allowedPunctuation
    if (inventory.punctuation) {
      const punctTokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
      const punctSet = new Set(punctTokens);
      for (const p of inventory.punctuation.split(/\s+/).filter(Boolean)) {
        punctSet.add(p);
      }
      const sortedPunct = Array.from(punctSet);
      sortedPunct.sort((a, b) => a.localeCompare(b));
      this.allowedPunctuation = sortedPunct.join(' ');
    }
  }

  selectMatchingTiers() {
    const pattern = this.tierFilter.trim().toLowerCase();
    const updated = { ...this.tierSelections };

    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      if (!updated[fileName]) updated[fileName] = {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (!pattern || tier.tierId.toLowerCase().includes(pattern)) {
            updated[fileName][tier.tierId] = true;
          }
        }
      }
    }
    this.tierSelections = updated;
    this.autoExtractAllowedLetters();
  }

  deselectMatchingTiers() {
    const pattern = this.tierFilter.trim().toLowerCase();
    const updated = { ...this.tierSelections };

    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      if (!updated[fileName]) updated[fileName] = {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (!pattern || tier.tierId.toLowerCase().includes(pattern)) {
            updated[fileName][tier.tierId] = false;
          }
        }
      }
    }
    this.tierSelections = updated;
    this.autoExtractAllowedLetters();
  }

  toggleTier(fileName, tierId) {
    const updated = { ...this.tierSelections };
    if (!updated[fileName]) updated[fileName] = {};
    updated[fileName][tierId] = !updated[fileName][tierId];
    this.tierSelections = updated;
    this.autoExtractAllowedLetters();
  }

  // Get all unique detected characters from all selected tiers with frequency counts and Unicode classification
  get detectedCharacters() {
    const charCounts = new Map();
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = this.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (fileTiers[tier.tierId]) {
            for (const ann of tier.annotations || []) {
              if (ann.text) {
                for (const ch of ann.text) {
                  if (ch.trim() !== '') {
                    charCounts.set(ch, (charCounts.get(ch) || 0) + 1);
                  }
                }
              }
            }
          }
        }
      }
    }
    const punctTokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
    const punctSet = new Set(punctTokens);
    const letterTokens = this.allowedLetters.split(/\s+/).filter(Boolean);
    const letterSet = new Set(letterTokens);

    return Array.from(charCounts.entries())
      .map(([char, count]) => {
        const isLetter = letterSet.has(char);
        const isPunct = punctSet.has(char);
        const unicodeCat = classifyUnicodeChar(char);
        return {
          char,
          count,
          hex: 'U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
          unicodeCat, // 'letter' | 'punctuation' | 'number' | 'symbol' | 'space' | 'other'
          isAllowed: isLetter || isPunct,
          isLetter,
          isPunct,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  toggleAllowedLetter(char) {
    const tokens = this.allowedLetters.split(/\s+/).filter(Boolean);
    const idx = tokens.indexOf(char);
    if (idx >= 0) {
      tokens.splice(idx, 1);
    } else {
      tokens.push(char);
      tokens.sort((a, b) => a.localeCompare(b));
    }
    this.allowedLetters = tokens.join(' ');
  }

  toggleAllowedPunctuation(char) {
    const tokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
    const idx = tokens.indexOf(char);
    if (idx >= 0) {
      tokens.splice(idx, 1);
    } else {
      tokens.push(char);
      tokens.sort((a, b) => a.localeCompare(b));
    }
    this.allowedPunctuation = tokens.join(' ');
  }

  toggleCharacter(char) {
    const cat = classifyUnicodeChar(char);
    if (cat === 'punctuation') {
      this.toggleAllowedPunctuation(char);
    } else {
      this.toggleAllowedLetter(char);
    }
  }

  makeApostropheLetter() {
    const apostrophes = ["'", '’', 'ʼ', 'ʻ'];
    const punctTokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
    const letterTokens = this.allowedLetters.split(/\s+/).filter(Boolean);
    for (const apo of apostrophes) {
      const pIdx = punctTokens.indexOf(apo);
      if (pIdx >= 0) punctTokens.splice(pIdx, 1);
      if (!letterTokens.includes(apo)) letterTokens.push(apo);
    }
    letterTokens.sort((a, b) => a.localeCompare(b));
    this.allowedPunctuation = punctTokens.join(' ');
    this.allowedLetters = letterTokens.join(' ');
  }

  makeApostrophePunctuation() {
    const apostrophes = ["'", '’', 'ʼ', 'ʻ'];
    const punctTokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
    const letterTokens = this.allowedLetters.split(/\s+/).filter(Boolean);
    for (const apo of apostrophes) {
      const lIdx = letterTokens.indexOf(apo);
      if (lIdx >= 0) letterTokens.splice(lIdx, 1);
      if (!punctTokens.includes(apo)) punctTokens.push(apo);
    }
    punctTokens.sort((a, b) => a.localeCompare(b));
    this.allowedPunctuation = punctTokens.join(' ');
    this.allowedLetters = letterTokens.join(' ');
  }

  addAllDetectedLetters() {
    const punctTokens = this.allowedPunctuation.split(/\s+/).filter(Boolean);
    const punctSet = new Set(punctTokens);
    const allChars = this.detectedCharacters
      .map((c) => c.char)
      .filter((ch) => !punctSet.has(ch));
    const merged = Array.from(new Set([...this.allowedLetters.split(/\s+/).filter(Boolean), ...allChars]));
    merged.sort((a, b) => a.localeCompare(b));
    this.allowedLetters = merged.join(' ');
  }

  clearAllowedLetters() {
    this.allowedLetters = '';
  }

  resetStandardPunctuation() {
    this.allowedPunctuation = '- . , ; : ! ? " \' ’';
  }

  // Get aggregated list of unique tier names across all files
  get uniqueTierSummary() {
    const map = new Map();
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = this.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          const tid = tier.tierId;
          const annCount = tier.annotations ? tier.annotations.length : 0;
          const isSelected = !!fileTiers[tid];

          if (!map.has(tid)) {
            map.set(tid, {
              tierId: tid,
              fileCount: 0,
              totalAnns: 0,
              selectedCount: 0,
              sampleText: tier.sampleText || '',
              linguisticType: tier.linguisticType || '',
            });
          }
          const item = map.get(tid);
          item.fileCount += 1;
          item.totalAnns += annCount;
          if (isSelected) item.selectedCount += 1;
          if (!item.sampleText && tier.sampleText) {
            item.sampleText = tier.sampleText;
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalAnns - a.totalAnns);
  }

  // Batch select or deselect all tiers with a given name
  selectTiersByName(targetTierId, select = true) {
    const updated = { ...this.tierSelections };
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      if (!updated[fileName]) updated[fileName] = {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (tier.tierId === targetTierId) {
            updated[fileName][tier.tierId] = select;
          }
        }
      }
    }
    this.tierSelections = updated;
    this.autoExtractAllowedLetters();
  }

  // Summary counts of selected target tiers & speech segments
  get totalSelectedStats() {
    let tierCount = 0;
    let annCount = 0;
    for (const pair of this.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = this.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (fileTiers[tier.tierId]) {
            tierCount += 1;
            annCount += (tier.annotations ? tier.annotations.length : 0);
          }
        }
      }
    }
    return { tierCount, annCount };
  }

  hasAnyTierSelected() {
    for (const pair of this.pairedFiles) {
      const fileTiers = this.tierSelections[pair.eafFile.name] || {};
      for (const val of Object.values(fileTiers)) {
        if (val) return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------
  // Validation & Linguistic Scanning
  // -------------------------------------------------------------

  startChecking(targetTab = 'reports') {
    if (!this.hasAnyTierSelected()) {
      alert(
        'Please select at least one tier from the loaded ELAN file(s) before running validation.'
      );
      return;
    }

    this.isChecking = true;
    this.hasChecked = false;

    // Small timeout to allow the browser to render the loading spinner
    setTimeout(() => {
      try {
        const filesData = this.pairedFiles.map((pair) => ({
          fileName: pair.eafFile.name,
          tiers: pair.parsedEaf ? pair.parsedEaf.tiers : [],
        }));

        const rulesData = this.getNormalizationRulesData();

        const rawSelectedTiers = JSON.parse(JSON.stringify(this.tierSelections));

        const results = analyzeTiers({
          filesData,
          selectedTiers: rawSelectedTiers,
          allowedLetters: this.allowedLetters,
          allowedPunctuation: this.allowedPunctuation,
          longSegmentThresholdMs: (this.longSegmentThreshold || 25) * 1000,
          overlapThresholdMs: this.overlapThreshold || 400,
          rules: rulesData,
          lowercaseTranscripts: this.lowercaseTranscripts,
        });

        this.handleAnalyzeComplete(results, targetTab);
      } catch (err) {
        console.error('[DatasetState] Analysis error:', err);
        this.isChecking = false;
        alert(`Analysis Error:\n${err.message || err}`);
      }
    }, 40);
  }

  handleAnalyzeComplete(results, targetTab = 'reports') {
    this.isChecking = false;
    this.hasChecked = true;
    this.validationResults = results;

    const now = new Date();
    this.lastValidatedAt = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Default active view to first issue found, or fallback to assessment
    if (results.naRecords && results.naRecords.length > 0) {
      this.step4MainTab = 'issues';
      this.activeView = 'not allowed chars';
      this.selectedNaRecord = results.naRecords[0];
    } else if (results.longRecords && results.longRecords.length > 0) {
      this.step4MainTab = 'issues';
      this.activeView = 'long segments';
      this.selectedLongRecord = results.longRecords[0];
    } else if (results.overlapRecords && results.overlapRecords.length > 0) {
      this.step4MainTab = 'issues';
      this.activeView = 'overlaps';
      this.selectedOverlapRecord = results.overlapRecords[0];
    } else {
      this.step4MainTab = 'assessment';
      this.activeView = 'assessment';
    }

    this.isReportsExpanded = true;
    this.isOutputExpanded = true;
    this.isSettingsExpanded = false;

    // Navigate to targetTab if provided
    if (targetTab) {
      this.setTab(targetTab);
    }
  }

  revalidate() {
    this.startChecking(this.currentTab || 'reports');
  }

  allowDisallowedCharacter(char) {
    this.toggleCharacter(char);
    this.startChecking(this.currentTab || 'reports');
  }

  async reloadEafFile(file) {
    if (!file || !isEafFile(file)) return;
    try {
      const xmlText = await file.text();
      const parsed = parseEaf(xmlText, file.name);

      const pair = this.pairedFiles.find((p) => p.eafFile.name === file.name);
      if (pair) {
        pair.eafFile = file;
        pair.parsedEaf = parsed;
      }

      const eIdx = this.eafFiles.findIndex((e) => e.file.name === file.name);
      if (eIdx >= 0) {
        this.eafFiles[eIdx] = { file, parsed };
      } else {
        this.eafFiles.push({ file, parsed });
      }

      if (!this.tierSelections[file.name]) {
        this.tierSelections[file.name] = {};
        for (const tier of parsed.tiers || []) {
          this.tierSelections[file.name][tier.tierId] = false;
        }
      }

      this.lastReloadNotice = {
        message: `Successfully reloaded "${file.name}". Re-validating...`,
        type: 'success',
      };

      this.revalidate();

      setTimeout(() => {
        if (this.lastReloadNotice?.message.includes(file.name)) {
          this.lastReloadNotice = null;
        }
      }, 6000);
    } catch (err) {
      console.error(`Failed to reload EAF ${file.name}:`, err);
      this.lastReloadNotice = {
        message: `Failed to reload "${file.name}": ${err.message || err}`,
        type: 'error',
      };
    }
  }

  async reloadMultipleEafs(fileList) {
    if (!fileList || fileList.length === 0) return;
    const validEafs = Array.from(fileList).filter(isEafFile);
    if (validEafs.length === 0) return;

    for (const file of validEafs) {
      try {
        const xmlText = await file.text();
        const parsed = parseEaf(xmlText, file.name);

        const pair = this.pairedFiles.find((p) => p.eafFile.name === file.name);
        if (pair) {
          pair.eafFile = file;
          pair.parsedEaf = parsed;
        }

        const eIdx = this.eafFiles.findIndex((e) => e.file.name === file.name);
        if (eIdx >= 0) {
          this.eafFiles[eIdx] = { file, parsed };
        } else {
          this.eafFiles.push({ file, parsed });
        }

        if (!this.tierSelections[file.name]) {
          this.tierSelections[file.name] = {};
          for (const tier of parsed.tiers || []) {
            this.tierSelections[file.name][tier.tierId] = false;
          }
        }
      } catch (err) {
        console.error(`Failed to reload EAF ${file.name}:`, err);
      }
    }

    this.lastReloadNotice = {
      message: `Reloaded ${validEafs.length} ELAN file(s). Re-validating...`,
      type: 'success',
    };

    this.revalidate();

    setTimeout(() => {
      this.lastReloadNotice = null;
    }, 6000);
  }

  // -------------------------------------------------------------
  // Audio Dataset Slicing & Export
  // -------------------------------------------------------------

  async buildTrainingDataset() {
    if (!this.hasAnyTierSelected()) {
      alert('Please select at least one tier to build the training dataset.');
      return;
    }

    // Check if any selected EAF file lacks audio
    const missingAudioPairs = this.pairedFiles.filter(
      (pair) => {
        const fileTiers = this.tierSelections[pair.eafFile.name] || {};
        const hasSelected = Object.values(fileTiers).some(Boolean);
        return hasSelected && !pair.hasAudio;
      }
    );

    if (missingAudioPairs.length > 0) {
      const names = missingAudioPairs.map((p) => p.eafFile.name).join('\n• ');
      alert(
        `Cannot build dataset because the following ELAN file(s) lack a matching audio file:\n\n• ${names}\n\nPlease load their audio files first.`
      );
      return;
    }

    this.isBuilding = true;
    this.buildSuccess = null;
    this.buildProgress = {
      current: 0,
      total: 0,
      percent: 0,
      status: 'Decoding audio recordings into 16kHz mono PCM...',
    };

    try {
      const fileItems = [];
      const pairedToProcess = this.pairedFiles.filter((pair) => {
        const fileTiers = this.tierSelections[pair.eafFile.name] || {};
        return Object.values(fileTiers).some(Boolean) && pair.hasAudio;
      });

      for (let i = 0; i < pairedToProcess.length; i++) {
        const pair = pairedToProcess[i];
        const fileName = pair.eafFile.name;
        const fileBaseName = getBaseName(fileName);

        this.buildProgress = {
          current: i,
          total: pairedToProcess.length,
          percent: Math.round((i / pairedToProcess.length) * 35),
          status: `Decoding audio for ${pair.audioFile.name} (${i + 1}/${pairedToProcess.length})...`,
        };

        // Decode audio via processAudioFile (fast 16-bit PCM parser or Web Audio fallback)
        const processed = await processAudioFile(pair.audioFile);

        // Gather all annotations from selected tiers
        const segments = [];
        const fileTiers = this.tierSelections[fileName] || {};
        if (pair.parsedEaf && pair.parsedEaf.tiers) {
          for (const tier of pair.parsedEaf.tiers) {
            if (fileTiers[tier.tierId]) {
              for (const ann of tier.annotations || []) {
                segments.push({
                  start: ann.start,
                  end: ann.end,
                  text: ann.text,
                });
              }
            }
          }
        }
        segments.sort((a, b) => a.start - b.start);

        fileItems.push({
          fileName,
          fileBaseName,
          audioSamples: processed.audioData,
          offsetMs: pair.offsetMs,
          segments,
        });
      }

      this.buildProgress = {
        current: 0,
        total: 0,
        percent: 40,
        status: 'Slicing audio clips and compressing ZIP archive...',
      };

      const rulesData = this.getNormalizationRulesData();

      const result = await buildDatasetZip({
        fileItems,
        rules: rulesData,
        lowercaseTranscripts: this.lowercaseTranscripts,
        onProgress: (prog) => {
          this.buildProgress = prog;
        },
      });

      this.handleExportComplete(result);
    } catch (err) {
      console.error('[DatasetState] Build error:', err);
      this.handleWorkerError(err.message || 'Failed to build dataset');
    }
  }

  handleExportComplete(payload) {
    this.isBuilding = false;
    const { zipBlob, totalSegments } = payload;
    const zipUrl = URL.createObjectURL(zipBlob);

    const sizeMb = (zipBlob.size / (1024 * 1024)).toFixed(2);

    this.buildSuccess = {
      zipBlob,
      zipUrl,
      filename: 'asr_training_dataset.zip',
      sizeStr: `${sizeMb} MB`,
      totalSegments,
    };

    this.buildProgress = {
      current: totalSegments,
      total: totalSegments,
      percent: 100,
      status: `Dataset built successfully! (${totalSegments} clips, ${sizeMb} MB)`,
    };

    // Trigger auto-download
    this.downloadZip();
  }

  downloadZip() {
    if (!this.buildSuccess || !this.buildSuccess.zipUrl) return;
    const a = document.createElement('a');
    a.href = this.buildSuccess.zipUrl;
    a.download = this.buildSuccess.filename || 'asr_training_dataset.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  handleWorkerError(message) {
    this.isChecking = false;
    this.isBuilding = false;
    this.buildProgress.status = `Error: ${message}`;
    alert(`Dataset Builder Error:\n${message}`);
  }

  clearAll() {
    this.eafFiles = [];
    this.audioFiles = [];
    this.pairedFiles = [];
    this.unmatchedEaf = [];
    this.unmatchedAudio = [];
    this.tierSelections = {};
    this.clearNormalizationFile();
    this.allowedLetters = '';
    this.hasChecked = false;
    this.validationResults = {
      naRecords: [],
      longRecords: [],
      overlapRecords: [],
      assessmentRecords: [],
      kpiSummary: null,
      charRecords: [],
      bigramRecords: [],
      wordRecords: [],
    };
    if (this.buildSuccess && this.buildSuccess.zipUrl) {
      URL.revokeObjectURL(this.buildSuccess.zipUrl);
    }
    this.buildSuccess = null;
    this.pairLimitNotice = null;
    this.hasVisitedReplacements = false;
    this.currentTab = 'ingest';
  }
}

export const datasetState = new DatasetState();
