/**
 * Universal Lexicon Management State for Svelte 5.
 * Manages lexicons, their configurable fields, valid values / controlled vocabularies,
 * entries, and TSV import/export backed by IndexedDB.
 */

import {
  getAllLexicons,
  getLexicon,
  saveLexicon,
  deleteLexicon as dbDeleteLexicon,
} from '../services/db.js';
import {
  generateId,
  exportLexiconToTsv,
  importTsvToLexicon,
  downloadTsvFile,
  getEntryFieldValue,
  setEntryFieldValue,
} from '../utils/lexiconTsv.js';
import {
  COMMON_POS_LEXICON,
  formatLexicon,
  parseLexicon,
} from '../utils/subTiers.js';
import { router } from '../services/router.svelte.js';
import { hunspellState } from './hunspellState.svelte.js';

/**
 * Creates default initial fields for a newly created lexicon.
 */
export function createDefaultLexiconFields() {
  return [
    {
      id: generateId('field'),
      name: 'Headword',
      validValues: '',
    },
    {
      id: generateId('field'),
      name: 'Sense Number',
      validValues: '',
    },
    {
      id: generateId('field'),
      name: 'POS',
      validValues: formatLexicon(COMMON_POS_LEXICON),
    },
    {
      id: generateId('field'),
      name: 'Gloss',
      validValues: '',
    },
    {
      id: generateId('field'),
      name: 'Meaning',
      validValues: '',
    },
    {
      id: generateId('field'),
      name: 'Etymology',
      validValues: '',
    },
  ];
}

/**
 * Ensures that the mandatory 'Headword' field is always present in a lexicon.
 * If missing, it is automatically prepended.
 * @param {Array} fields
 * @returns {Array}
 */
export function ensureHeadwordField(fields) {
  const list = Array.isArray(fields) ? [...fields] : [];
  const headwordIdx = list.findIndex(
    (f) => (f.name || '').trim().toLowerCase() === 'headword'
  );
  if (headwordIdx === -1) {
    list.unshift({
      id: generateId('field'),
      name: 'Headword',
      validValues: '',
    });
  } else {
    // Preserve exact standard capitalization
    list[headwordIdx] = { ...list[headwordIdx], name: 'Headword' };
  }
  return list;
}

class LexiconState {
  lexicons = $state([]);
  activeLexiconId = $state(null);
  isLoading = $state(false);
  isInitialized = $state(false);
  statusMessage = $state('');

  // UI View state
  activeTab = $state('entries'); // 'entries' | 'fields'
  searchQuery = $state('');

  // Modals state
  isNewLexiconModalOpen = $state(false);
  isEntryModalOpen = $state(false);
  editingEntry = $state(null); // null for create, entry object for edit
  isImportTsvModalOpen = $state(false);

  // Derived: Current active lexicon
  activeLexicon = $derived.by(() => {
    if (!this.activeLexiconId) return null;
    return this.lexicons.find((l) => l.id === this.activeLexiconId) || null;
  });

  // Derived: Filtered entries based on searchQuery
  filteredEntries = $derived.by(() => {
    const lex = this.activeLexicon;
    if (!lex || !lex.entries) return [];
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return lex.entries;

    const fields = lex.fields || [];
    return lex.entries.filter((entry) => {
      return fields.some((field) => {
        const val = getEntryFieldValue(entry, field);
        return val.toLowerCase().includes(q);
      });
    });
  });

  /**
   * Initializes the lexicon store by loading saved lexicons from IndexedDB.
   */
  async init() {
    if (this.isInitialized || this.isLoading) return;
    this.isLoading = true;
    try {
      const saved = await getAllLexicons();
      this.lexicons = (saved || []).map((lex) => {
        const defaultTime = lex.updatedAt || lex.createdAt || new Date().toISOString();
        const entries = (lex.entries || []).map((e) => ({
          ...e,
          createdAt: e.createdAt || defaultTime,
          updatedAt: e.updatedAt || e.createdAt || defaultTime,
        }));
        return {
          ...lex,
          fields: ensureHeadwordField(lex.fields),
          entries,
        };
      });

      // Check if route has an ID param
      if (router.params?.id && this.lexicons.some((l) => l.id === router.params.id)) {
        this.activeLexiconId = router.params.id;
      } else {
        this.activeLexiconId = null;
      }

      if (this.activeLexicon) {
        hunspellState.rebuildFromLexicon(this.activeLexicon);
      }
      this.isInitialized = true;
    } catch (err) {
      console.error('[LexiconState] Failed to initialize lexicons:', err);
      this.statusMessage = 'Could not load lexicons from storage.';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Sets the active lexicon and navigates to its route.
   * @param {string} id
   */
  selectLexicon(id) {
    this.activeLexiconId = id;
    this.searchQuery = '';
    this.activeTab = 'entries';
    const target = this.lexicons.find((l) => l.id === id);
    if (target) {
      hunspellState.rebuildFromLexicon(target);
    }
    router.navigate(`/lexicon/${id}`);
  }

  /**
   * Creates a new lexicon and persists it.
   * @param {Object} data
   * @param {string} data.title
   * @param {string} data.languageVariety
   * @param {string} [data.description]
   * @param {Array} [data.fields]
   * @returns {Promise<Object>}
   */
  async createLexicon({ title, languageVariety, description = '', fields = null }) {
    const id = generateId('lexicon');
    const now = new Date().toISOString();

    const rawFields = Array.isArray(fields) ? fields : createDefaultLexiconFields();

    const newLexicon = {
      id,
      title: title?.trim() || 'Untitled Lexicon',
      languageVariety: languageVariety?.trim() || '',
      description: description?.trim() || '',
      fields: ensureHeadwordField(rawFields),
      entries: [],
      createdAt: now,
      updatedAt: now,
    };

    const saved = await saveLexicon(newLexicon);
    this.lexicons = [saved, ...this.lexicons];
    this.activeLexiconId = saved.id;
    this.isNewLexiconModalOpen = false;
    this.showStatus(`Created lexicon "${saved.title}"`);
    router.navigate(`/lexicon/${saved.id}`);
    return saved;
  }

  /**
   * Updates basic information of a lexicon (title, languageVariety, description).
   * @param {string} id
   * @param {Object} updates
   */
  async updateLexiconInfo(id, updates) {
    const index = this.lexicons.findIndex((l) => l.id === id);
    if (index === -1) return;

    const lex = { ...this.lexicons[index], ...updates, updatedAt: new Date().toISOString() };
    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    this.showStatus('Lexicon updated.');
  }

  /**
   * Deletes a lexicon.
   * @param {string} id
   */
  async deleteLexicon(id) {
    const target = this.lexicons.find((l) => l.id === id);
    const title = target?.title || 'Lexicon';

    await dbDeleteLexicon(id);
    this.lexicons = this.lexicons.filter((l) => l.id !== id);

    if (this.activeLexiconId === id) {
      this.activeLexiconId = null;
      hunspellState.rebuildFromLexicon(null);
      if (router.currentRoute === 'lexicons') {
        router.navigate('/lexicon');
      }
    }

    this.showStatus(`Deleted "${title}".`);
  }

  // ==========================================
  // Field Operations
  // ==========================================

  /**
   * Adds a new field to the specified lexicon.
   * @param {string} lexiconId
   * @param {Object} fieldData
   * @param {string} fieldData.name
   * @param {string} [fieldData.validValues]
   */
  async addField(lexiconId, { name, validValues = '' }) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const fields = [...(lex.fields || [])];

    const cleanName = name.trim() || 'New Field';
    if (cleanName.toLowerCase() === 'headword') {
      const existing = (lex.fields || []).some(
        (f) => (f.name || '').trim().toLowerCase() === 'headword'
      );
      if (existing) {
        this.showStatus('The "Headword" field already exists.');
        return null;
      }
    }

    const newField = {
      id: generateId('field'),
      name: cleanName,
      validValues: validValues.trim(),
    };

    fields.push(newField);
    lex.fields = fields;
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    this.showStatus(`Added field "${newField.name}".`);
    return newField;
  }

  /**
   * Updates an existing field in a lexicon.
   * Headword field name is immutable.
   * @param {string} lexiconId
   * @param {string} fieldId
   * @param {Object} updates
   */
  async updateField(lexiconId, fieldId, updates) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const targetField = (lex.fields || []).find((f) => f.id === fieldId);
    const isHeadword = (targetField?.name || '').trim().toLowerCase() === 'headword';

    const cleanUpdates = { ...updates };
    if (isHeadword && cleanUpdates.name !== undefined) {
      // Headword name cannot be changed
      cleanUpdates.name = 'Headword';
    }

    const fields = (lex.fields || []).map((f) => {
      if (f.id === fieldId) {
        return { ...f, ...cleanUpdates };
      }
      return f;
    });

    lex.fields = fields;
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
  }

  /**
   * Removes a field from a lexicon.
   * Headword field is mandatory and cannot be removed.
   * @param {string} lexiconId
   * @param {string} fieldId
   */
  async removeField(lexiconId, fieldId) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const fieldToRemove = lex.fields?.find((f) => f.id === fieldId);
    const fieldName = fieldToRemove?.name || 'Field';

    if (fieldName.trim().toLowerCase() === 'headword') {
      this.showStatus('The "Headword" field is mandatory and cannot be removed.');
      return;
    }

    lex.fields = (lex.fields || []).filter((f) => f.id !== fieldId);
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    this.showStatus(`Removed field "${fieldName}".`);
  }

  /**
   * Reorders fields in a lexicon.
   * @param {string} lexiconId
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  async reorderFields(lexiconId, fromIndex, toIndex) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const fields = [...(lex.fields || [])];

    if (
      fromIndex < 0 ||
      fromIndex >= fields.length ||
      toIndex < 0 ||
      toIndex >= fields.length
    ) {
      return;
    }

    const [moved] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, moved);

    lex.fields = fields;
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
  }

  // ==========================================
  // Entry Operations
  // ==========================================

  /**
   * Adds a new entry to a lexicon.
   * @param {string} lexiconId
   * @param {Object} fieldsData - Map of fieldId to value string
   */
  async addEntry(lexiconId, fieldsData) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const now = new Date().toISOString();

    const newEntry = {
      id: generateId('entry'),
      fields: { ...fieldsData },
      createdAt: now,
      updatedAt: now,
    };

    lex.entries = [newEntry, ...(lex.entries || [])];
    lex.updatedAt = now;

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId || hunspellState.activeLexiconId === lexiconId) {
      await hunspellState.rebuildFromLexicon(saved);
    }
    return newEntry;
  }

  /**
   * Adds a headword to a lexicon as a new entry.
   * If the word is already in the lexicon, returns true without duplicating.
   * Rebuilds Hunspell dictionary so spellchecking immediately recognizes the new word.
   * @param {string} lexiconId
   * @param {string} headword
   * @returns {Promise<boolean>}
   */
  async addHeadwordToLexicon(lexiconId, headword) {
    const cleanWord = (headword || '').trim();
    if (!cleanWord) return false;

    if (!this.lexicons || this.lexicons.length === 0) {
      await this.init();
    }

    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return false;

    const lex = this.lexicons[index];
    const headwordField = (lex.fields || []).find(
      (f) => (f.name || '').trim().toLowerCase() === 'headword'
    );
    if (!headwordField) return false;

    // Check if word already exists in entries
    const exists = (lex.entries || []).some((e) => {
      const val = getEntryFieldValue(e, headwordField);
      return val.trim().toLowerCase() === cleanWord.toLowerCase();
    });

    if (exists) {
      await hunspellState.rebuildFromLexicon(lex);
      return true;
    }

    const fieldsData = { [headwordField.id]: cleanWord };
    await this.addEntry(lexiconId, fieldsData);
    const updatedLex = this.lexicons.find((l) => l.id === lexiconId) || lex;
    await hunspellState.rebuildFromLexicon(updatedLex);
    this.showStatus(`Added "${cleanWord}" to ${updatedLex.title || updatedLex.name || 'lexicon'}.`);
    return true;
  }

  /**
   * Adds a new blank entry to the active or specified lexicon.
   * @param {string} [lexiconId]
   * @returns {Promise<Object>}
   */
  async addBlankEntry(lexiconId = null) {
    const id = lexiconId || this.activeLexiconId;
    const index = this.lexicons.findIndex((l) => l.id === id);
    if (index === -1) return null;

    const lex = this.lexicons[index];
    const fields = lex.fields || [];
    const fieldsData = {};
    for (const f of fields) {
      fieldsData[f.id] = '';
    }

    const newEntry = await this.addEntry(id, fieldsData);
    this.searchQuery = '';
    return newEntry;
  }

  /**
   * Updates a single field value on an entry immediately in memory
   * and debounces saving to IndexedDB.
   * @param {string} lexiconId
   * @param {string} entryId
   * @param {string} fieldId
   * @param {string} value
   */
  updateEntryField(lexiconId, entryId, fieldId, value) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = this.lexicons[index];
    const entry = (lex.entries || []).find((e) => e.id === entryId);
    if (!entry) return;

    if (!entry.fields) entry.fields = {};
    entry.fields[fieldId] = value;
    entry.updatedAt = new Date().toISOString();
    lex.updatedAt = entry.updatedAt;

    if (this.activeLexiconId === lexiconId || hunspellState.activeLexiconId === lexiconId) {
      hunspellState.scheduleRebuild(lex, 350);
    }

    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
    }
    this._autoSaveTimer = setTimeout(async () => {
      try {
        await saveLexicon(this.lexicons[index]);
      } catch (err) {
        console.error('Failed to auto-save entry field:', err);
      }
    }, 400);
  }

  /**
   * Updates an entry in a lexicon.
   * @param {string} lexiconId
   * @param {string} entryId
   * @param {Object} fieldsData
   */
  async updateEntry(lexiconId, entryId, fieldsData) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    const now = new Date().toISOString();

    lex.entries = (lex.entries || []).map((e) => {
      if (e.id === entryId) {
        return {
          ...e,
          fields: { ...fieldsData },
          updatedAt: now,
        };
      }
      return e;
    });

    lex.updatedAt = now;
    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId || hunspellState.activeLexiconId === lexiconId) {
      hunspellState.rebuildFromLexicon(saved);
    }
  }

  /**
   * Deletes a single entry from a lexicon.
   * @param {string} lexiconId
   * @param {string} entryId
   */
  async deleteEntry(lexiconId, entryId) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    lex.entries = (lex.entries || []).filter((e) => e.id !== entryId);
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId || hunspellState.activeLexiconId === lexiconId) {
      hunspellState.rebuildFromLexicon(saved);
    }
  }

  /**
   * Deletes multiple entries by IDs.
   * @param {string} lexiconId
   * @param {string[]} entryIds
   */
  async deleteEntries(lexiconId, entryIds) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const idSet = new Set(entryIds);
    const lex = { ...this.lexicons[index] };
    lex.entries = (lex.entries || []).filter((e) => !idSet.has(e.id));
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId) {
      hunspellState.rebuildFromLexicon(saved);
    }
    this.showStatus(`Deleted ${entryIds.length} entries.`);
  }

  /**
   * Clears all entries from a lexicon.
   * @param {string} lexiconId
   */
  async clearAllEntries(lexiconId) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) return;

    const lex = { ...this.lexicons[index] };
    lex.entries = [];
    lex.updatedAt = new Date().toISOString();

    const saved = await saveLexicon(lex);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId) {
      hunspellState.rebuildFromLexicon(saved);
    }
    this.showStatus('All entries cleared.');
  }

  // ==========================================
  // TSV Import & Export
  // ==========================================

  /**
   * Exports the active or specified lexicon to TSV format and initiates download.
   * @param {string} [lexiconId]
   */
  exportTsv(lexiconId = null) {
    const id = lexiconId || this.activeLexiconId;
    const lex = this.lexicons.find((l) => l.id === id);
    if (!lex) {
      this.showStatus('No lexicon selected to export.');
      return;
    }

    const tsvContent = exportLexiconToTsv(lex);
    const filename = `${lex.title || 'lexicon'}_${lex.languageVariety || 'data'}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    downloadTsvFile(filename, tsvContent);
    this.showStatus(`Exported ${lex.entries?.length || 0} entries to TSV.`);
  }

  /**
   * Imports TSV text into a lexicon.
   * @param {string} lexiconId
   * @param {string} tsvText
   * @param {Object} options
   */
  async importTsv(lexiconId, tsvText, options = {}) {
    const index = this.lexicons.findIndex((l) => l.id === lexiconId);
    if (index === -1) throw new Error('Target lexicon not found.');

    const currentLex = this.lexicons[index];
    const { updatedLexicon, importedCount, createdFieldsCount } =
      importTsvToLexicon(currentLex, tsvText, options);

    const saved = await saveLexicon(updatedLexicon);
    this.lexicons[index] = saved;
    if (this.activeLexiconId === lexiconId) {
      hunspellState.rebuildFromLexicon(saved);
    }

    this.showStatus(
      `Imported ${importedCount} entries` +
        (createdFieldsCount > 0 ? ` and created ${createdFieldsCount} new fields.` : '.'),
    );

    return { importedCount, createdFieldsCount };
  }

  /**
   * Opens the Entry Modal to create or edit an entry.
   * @param {Object|null} entry
   */
  openEntryModal(entry = null) {
    this.editingEntry = entry ? JSON.parse(JSON.stringify(entry)) : null;
    this.isEntryModalOpen = true;
  }

  closeEntryModal() {
    this.isEntryModalOpen = false;
    this.editingEntry = null;
  }

  /**
   * Displays a temporary notification status message.
   * @param {string} msg
   */
  showStatus(msg) {
    this.statusMessage = msg;
    setTimeout(() => {
      if (this.statusMessage === msg) {
        this.statusMessage = '';
      }
    }, 4000);
  }
}

export const lexiconState = new LexiconState();
