/**
 * Core Hunspell Service using `hunspell-asm` (WASM).
 * Handles mounting virtual buffers, dictionary building, and spell checking.
 * Independent of UI framework for testability and portability.
 */

import { loadModule } from 'hunspell-asm';
import { buildHunspellDict, createDefaultAffContent } from '../utils/hunspellDictBuilder.js';

export class HunspellService {
  constructor() {
    this._factory = null;
    this._hunspell = null;
    this._mountedAffPath = null;
    this._mountedDicPath = null;

    this.isInitialized = false;
    this.isLoading = false;
    this.isReady = false;
    this.error = null;

    this.activeLexiconId = null;
    this.activeLexiconTitle = '';
    this.wordCount = 0;
    this.words = [];
    this.dictContent = '0\n';
    this.affContent = createDefaultAffContent();
    this.customAff = null;
    this.lastRebuiltAt = null;
    this.selectedFieldId = 'auto'; // 'auto' | 'all' | string fieldId
    this.resolvedFieldId = null;
    this.resolvedFieldName = 'Auto';
  }

  /**
   * Initializes the hunspell-asm WASM module.
   */
  async init() {
    if (this._factory || this.isLoading) return this._factory;
    this.isLoading = true;
    this.error = null;

    try {
      this._factory = await loadModule();
      this.isInitialized = true;
      return this._factory;
    } catch (err) {
      console.error('[HunspellService] Failed to initialize hunspell-asm WASM:', err);
      this.error = err?.message || 'Failed to initialize Hunspell WebAssembly engine.';
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Disposes the active Hunspell instance and unmounts virtual files.
   */
  disposeCurrent() {
    if (this._hunspell) {
      try {
        this._hunspell.dispose();
      } catch (err) {
        console.warn('[HunspellService] Error disposing hunspell instance:', err);
      }
      this._hunspell = null;
    }

    if (this._factory) {
      if (this._mountedDicPath) {
        try {
          this._factory.unmount(this._mountedDicPath);
        } catch {
          // ignore
        }
        this._mountedDicPath = null;
      }
      if (this._mountedAffPath) {
        try {
          this._factory.unmount(this._mountedAffPath);
        } catch {
          // ignore
        }
        this._mountedAffPath = null;
      }
    }

    this.isReady = false;
  }

  /**
   * Dynamically rebuilds the Hunspell dictionary from an Easper lexicon.
   *
   * @param {Object} lexicon - Easper lexicon object
   * @param {Object} [options]
   * @returns {Promise<boolean>} Success
   */
  async rebuildFromLexicon(lexicon, options = {}) {
    if (!lexicon) {
      this.disposeCurrent();
      this.activeLexiconId = null;
      this.activeLexiconTitle = '';
      this.wordCount = 0;
      this.words = [];
      this.dictContent = '0\n';
      this.lastRebuiltAt = new Date().toISOString();
      return true;
    }

    if (!this._factory) {
      await this.init();
      if (!this._factory) return false;
    }

    if (options.primaryFieldId !== undefined) {
      this.selectedFieldId = options.primaryFieldId;
    }

    const effectiveOptions = {
      ...options,
      primaryFieldId: this.selectedFieldId === 'auto' ? null : this.selectedFieldId,
    };

    const dictData = buildHunspellDict(lexicon, effectiveOptions);
    const activeAffText = this.customAff || dictData.affContent;

    try {
      this.disposeCurrent();

      const affBuffer = new TextEncoder().encode(activeAffText);
      const dicBuffer = new TextEncoder().encode(dictData.dicContent);

      this._mountedAffPath = this._factory.mountBuffer(affBuffer, `lex_${lexicon.id || 'curr'}.aff`);
      this._mountedDicPath = this._factory.mountBuffer(dicBuffer, `lex_${lexicon.id || 'curr'}.dic`);

      this._hunspell = this._factory.create(this._mountedAffPath, this._mountedDicPath);

      this.activeLexiconId = lexicon.id || null;
      this.activeLexiconTitle = lexicon.title || 'Untitled Lexicon';
      this.wordCount = dictData.wordCount;
      this.words = dictData.words;
      this.dictContent = dictData.dicContent;
      this.affContent = activeAffText;
      this.resolvedFieldId = dictData.resolvedFieldId;
      this.resolvedFieldName = dictData.resolvedFieldName;
      this.lastRebuiltAt = new Date().toISOString();
      this.isReady = true;

      return true;
    } catch (err) {
      console.error('[HunspellService] Failed to rebuild Hunspell dictionary:', err);
      this.error = `Failed to build Hunspell dictionary: ${err?.message || err}`;
      this.disposeCurrent();
      return false;
    }
  }

  /**
   * Checks whether a word is spelled correctly.
   * @param {string} word
   * @returns {boolean}
   */
  spell(word) {
    if (!word || typeof word !== 'string') return true;
    const clean = word.trim();
    if (!clean) return true;

    if (!this.isReady || !this._hunspell || this.wordCount === 0) {
      return true;
    }

    try {
      return this._hunspell.spell(clean);
    } catch (err) {
      console.warn('[HunspellService] spell check error:', err);
      return true;
    }
  }

  /**
   * Returns spelling suggestions for a misspelled word.
   * @param {string} word
   * @returns {string[]}
   */
  suggest(word) {
    if (!word || typeof word !== 'string') return [];
    const clean = word.trim();
    if (!clean || !this.isReady || !this._hunspell || this.wordCount === 0) {
      return [];
    }

    try {
      return this._hunspell.suggest(clean) || [];
    } catch (err) {
      console.warn('[HunspellService] suggest error:', err);
      return [];
    }
  }

  /**
   * Destroys factory and memory completely.
   */
  destroy() {
    this.disposeCurrent();
    this._factory = null;
    this.isInitialized = false;
  }
}

export const hunspellService = new HunspellService();
