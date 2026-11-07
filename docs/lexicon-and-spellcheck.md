# Lexicon Manager, Hunspell Spellchecking & Auto-Tagging

EasperWeb includes an integrated **Lexicon Management**, **Hunspell WebAssembly Spellchecking**, and **Word Sub-Tier Auto-Tagging** system designed for low-resource and endangered language documentation where standard browser spellcheckers lack language support.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     IndexedDB (easper_db v3)                         │
│                    Object Store: 'lexicons'                          │
└──────────────────┬────────────────────────────────┬──────────────────┘
                   │                                │
                   ▼                                ▼
┌──────────────────────────────────┐  ┌────────────────────────────────┐
│   Lexicon State & TSV Engine     │  │   Hunspell WASM Spellchecker   │
│ • src/state/lexiconState.svelte  │  │ • src/services/hunspellService │
│ • src/utils/lexiconTsv.js        │  │ • src/utils/hunspellDictBuilder│
└──────────────────┬───────────────┘  └────────────────┬───────────────┘
                   │                                   │
                   ▼                                   ▼
┌──────────────────────────────────┐  ┌────────────────────────────────┐
│    Word Sub-Tier Auto-Tagging    │  │   Real-Time Segment Checking   │
│ • src/utils/autoTagging.js       │  │ • SegmentCard.svelte           │
│ • AutoTaggingSettingsPanel.svelte│  │ • SpellcheckSettingsPanel      │
└──────────────────────────────────┘  └────────────────────────────────┘
```

---

## 2. Lexicon Management (`/lexicons`)

- **State & Storage**: Managed by [`src/state/lexiconState.svelte.js`](../src/state/lexiconState.svelte.js) and persisted in the `lexicons` object store of IndexedDB ([`src/services/db.js`](../src/services/db.js)).
- **Customizable Schema**:
  - Every lexicon guarantees a mandatory **`Headword`** field (`ensureHeadwordField`).
  - Default fields created for new lexicons (`createDefaultLexiconFields`): `Headword`, `Sense Number`, `POS` (pre-populated with Common POS controlled vocabulary), `Gloss`, `Meaning`, and `Etymology`.
  - Users can add, rename, reorder, or remove custom fields and define controlled vocabularies (`validValues`) for auto-complete in [`LexiconFieldsEditor.svelte`](../src/components/lexicon/LexiconFieldsEditor.svelte).
- **TSV Import & Export ([`src/utils/lexiconTsv.js`](../src/utils/lexiconTsv.js))**:
  - Import existing dictionaries or wordlists from Tab-Separated Values (`.tsv`) files via [`LexiconTsvImportModal.svelte`](../src/components/lexicon/LexiconTsvImportModal.svelte) with interactive column mapping and duplicate headword handling.
  - Export any lexicon back to `.tsv` for external archiving or spreadsheet editing.

---

## 3. Hunspell WebAssembly Spellchecker

- **Core Service**: [`src/services/hunspellService.js`](../src/services/hunspellService.js) & [`src/state/hunspellState.svelte.js`](../src/state/hunspellState.svelte.js)
- **Dictionary Builder**: [`src/utils/hunspellDictBuilder.js`](../src/utils/hunspellDictBuilder.js)
- **How It Works**:
  1. Compiles the active lexicon's headwords (or a selected field) into an in-memory Hunspell `.dic` wordlist and pairs it with a UTF-8 `.aff` affix configuration (`createDefaultAffContent` or custom user affix rules).
  2. Mounts the virtual `.aff` and `.dic` buffers into `hunspell-asm` (WebAssembly).
  3. Provides real-time token spellchecking (`checkWord`) and morphological/orthographic replacement suggestions (`suggest`) inside [`SegmentCard.svelte`](../src/components/main/SegmentCard.svelte).
  4. Linguists can add new words directly from a transcription segment into the active lexicon with one click, triggering an automatic dictionary rebuild.

---

## 4. Word Sub-Tier Auto-Tagging

- **Module**: [`src/utils/autoTagging.js`](../src/utils/autoTagging.js)
- **Settings UI**: [`src/components/main/AutoTaggingSettingsPanel.svelte`](../src/components/main/AutoTaggingSettingsPanel.svelte)
- **Workflow**:
  1. Link a project to an active Lexicon in Project Settings or the Auto-Tagging panel.
  2. Map each word/morpheme sub-tier (`type: 'word'`, e.g., `POS` or `Gloss`) to a target field in the lexicon (`autoTagField`).
  3. `buildLexiconLookupMap` indexes headwords (supporting both exact case and case-insensitive fallback, plus punctuation stripping via `cleanWordForLookup`) for $O(1)$ lookup across all segments.
  4. Users can choose whether to fill only empty tag slots or overwrite existing annotations across all segments or a selected time interval.

