/**
 * Reactive Svelte 5 Hunspell State for EasperWeb.
 * Bridges `hunspellService` with reactive UI bindings ($state).
 */

import { hunspellService } from '../services/hunspellService.js';
import { createDefaultAffContent } from '../utils/hunspellDictBuilder.js';

class HunspellState {
  // Reactive status
  isInitialized = $state(false);
  isLoading = $state(false);
  isReady = $state(false);
  error = $state(null);

  // Active dictionary metadata
  activeLexiconId = $state(null);
  activeLexiconTitle = $state('');
  wordCount = $state(0);
  words = $state([]);
  dictContent = $state('0\n');
  affContent = $state(createDefaultAffContent());
  customAff = $state(null);
  lastRebuiltAt = $state(null);
  selectedFieldId = $state('auto');
  resolvedFieldId = $state(null);
  resolvedFieldName = $state('Auto');

  // UI Modal & Tester state
  isModalOpen = $state(false);
  testWord = $state('');
  testResult = $state(null); // { word, isCorrect, suggestions }

  _rebuildTimer = null;

  async init() {
    if (this.isInitialized || this.isLoading) return;
    this.isLoading = true;
    try {
      await hunspellService.init();
      this.isInitialized = true;
      this.error = null;
    } catch (err) {
      this.error = err?.message || 'Failed to initialize Hunspell engine.';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Syncs reactive state from hunspellService.
   */
  _syncFromService() {
    this.isInitialized = hunspellService.isInitialized;
    this.isLoading = hunspellService.isLoading;
    this.isReady = hunspellService.isReady;
    this.error = hunspellService.error;
    this.activeLexiconId = hunspellService.activeLexiconId;
    this.activeLexiconTitle = hunspellService.activeLexiconTitle;
    this.wordCount = hunspellService.wordCount;
    this.words = hunspellService.words;
    this.dictContent = hunspellService.dictContent;
    this.affContent = hunspellService.affContent;
    this.customAff = hunspellService.customAff;
    this.lastRebuiltAt = hunspellService.lastRebuiltAt;
    this.selectedFieldId = hunspellService.selectedFieldId;
    this.resolvedFieldId = hunspellService.resolvedFieldId;
    this.resolvedFieldName = hunspellService.resolvedFieldName;

    if (this.testWord) {
      this.runTest(this.testWord);
    }
  }

  /**
   * Changes the primary word extraction field and triggers rebuild.
   * @param {string} fieldId - 'auto' | 'all' | specific field id
   * @param {Object} lexicon
   */
  async setSourceField(fieldId, lexicon) {
    this.selectedFieldId = fieldId;
    await this.rebuildFromLexicon(lexicon, { primaryFieldId: fieldId });
  }

  /**
   * Rebuilds Hunspell dictionary from a lexicon object.
   * @param {Object} lexicon
   * @param {Object} [options]
   */
  async rebuildFromLexicon(lexicon, options = {}) {
    this.isLoading = true;
    try {
      await hunspellService.rebuildFromLexicon(lexicon, options);
    } catch (err) {
      console.warn('[HunspellState] Rebuild from lexicon error:', err);
      this.error = err?.message || 'Failed to build Hunspell dictionary.';
    } finally {
      this.isLoading = false;
      this._syncFromService();
    }
  }

  /**
   * Schedules debounced rebuild (e.g. while typing in table cells).
   * @param {Object} lexicon
   * @param {number} [delay=350]
   */
  scheduleRebuild(lexicon, delay = 350) {
    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
    }
    this._rebuildTimer = setTimeout(async () => {
      await this.rebuildFromLexicon(lexicon);
      this._rebuildTimer = null;
    }, delay);
  }

  /**
   * Spell check a word.
   * @param {string} word
   * @returns {boolean}
   */
  spell(word) {
    return hunspellService.spell(word);
  }

  /**
   * Get suggestions for a word.
   * @param {string} word
   * @returns {string[]}
   */
  suggest(word) {
    return hunspellService.suggest(word);
  }

  /**
   * Interactive tester.
   * @param {string} word
   */
  runTest(word) {
    this.testWord = word;
    if (!word || !word.trim()) {
      this.testResult = null;
      return;
    }
    const clean = word.trim();
    const isCorrect = this.spell(clean);
    const suggestions = isCorrect ? [] : this.suggest(clean);
    this.testResult = {
      word: clean,
      isCorrect,
      suggestions,
    };
  }

  /**
   * Export generated .dic file.
   * @param {string} [filename]
   */
  exportDic(filename = null) {
    const name =
      filename ||
      `${(this.activeLexiconTitle || 'easper_lexicon').replace(/\s+/g, '_').toLowerCase()}.dic`;
    const blob = new Blob([this.dictContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export .aff file.
   * @param {string} [filename]
   */
  exportAff(filename = null) {
    const name =
      filename ||
      `${(this.activeLexiconTitle || 'easper_lexicon').replace(/\s+/g, '_').toLowerCase()}.aff`;
    const blob = new Blob([this.affContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Set custom affix rules and rebuild.
   * @param {string} content
   * @param {Object} [lexicon]
   */
  async setCustomAff(content, lexicon = null) {
    hunspellService.customAff = content;
    if (lexicon) {
      await this.rebuildFromLexicon(lexicon);
    } else {
      this._syncFromService();
    }
  }

  /**
   * Reset affix to default.
   * @param {Object} [lexicon]
   */
  async resetAffToDefault(lexicon = null) {
    hunspellService.customAff = null;
    if (lexicon) {
      await this.rebuildFromLexicon(lexicon);
    } else {
      this._syncFromService();
    }
  }
}

export const hunspellState = new HunspellState();
