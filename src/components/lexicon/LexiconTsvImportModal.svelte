<script>
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { parseTsv } from '../../utils/lexiconTsv.js';

  let activeLex = $derived(lexiconState.activeLexicon);
  let fields = $derived(activeLex?.fields || []);

  let inputMethod = $state('file'); // 'file' | 'paste'
  let rawText = $state('');
  let fileName = $state('');
  let importMode = $state('append'); // 'append' | 'replace'
  let createMissingFields = $state(true);

  let isImporting = $state(false);
  let errorMessage = $state('');
  let fileInputEl = $state(null);

  // Parsed preview
  let parsedPreview = $derived.by(() => {
    if (!rawText.trim()) return null;
    try {
      const { headers, rows } = parseTsv(rawText);
      if (headers.length === 0) return null;

      // Determine matching for each header
      const headerMatches = headers.map((h) => {
        const clean = h.trim().toLowerCase();
        const matched = fields.find((f) => f.name.trim().toLowerCase() === clean);
        return {
          header: h,
          matchedField: matched || null,
          willCreate: !matched && createMissingFields,
        };
      });

      return {
        headers,
        headerMatches,
        rows: rows.slice(0, 5),
        totalRows: rows.length,
      };
    } catch (err) {
      return null;
    }
  });

  function handleClose() {
    lexiconState.isImportTsvModalOpen = false;
    rawText = '';
    fileName = '';
    errorMessage = '';
  }

  function handleFileSelected(e) {
    errorMessage = '';
    const file = e.target.files?.[0];
    if (!file) return;

    fileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      rawText = String(event.target?.result || '');
    };
    reader.onerror = () => {
      errorMessage = 'Failed to read file.';
    };
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    errorMessage = '';
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    fileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      rawText = String(event.target?.result || '');
    };
    reader.onerror = () => {
      errorMessage = 'Failed to read file.';
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!activeLex) return;
    if (!rawText.trim()) {
      errorMessage = 'Please provide TSV content by selecting a file or pasting text.';
      return;
    }

    isImporting = true;
    errorMessage = '';

    try {
      await lexiconState.importTsv(activeLex.id, rawText, {
        mode: importMode,
        createMissingFields,
      });
      handleClose();
    } catch (err) {
      console.error('Import failed:', err);
      errorMessage = err.message || 'Failed to import TSV.';
    } finally {
      isImporting = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if lexiconState.isImportTsvModalOpen && activeLex}
  <div class="modal-backdrop" onclick={handleClose} role="presentation"></div>

  <div class="tsv-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="tsv-modal-title">
    <div class="tsv-modal-header">
      <div class="tsv-modal-title-wrap">
        <div class="tsv-modal-icon">
          <i class="fa-solid fa-file-arrow-up"></i>
        </div>
        <div>
          <h2 id="tsv-modal-title" class="tsv-modal-title">Import Lexicon from TSV</h2>
          <p class="tsv-modal-sub">
            Target lexicon: <strong>{activeLex.title}</strong> ({activeLex.entries?.length || 0} existing entries)
          </p>
        </div>
      </div>
      <button type="button" class="btn-close" onclick={handleClose} aria-label="Close dialog">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <div class="tsv-modal-body">
      {#if errorMessage}
        <div class="alert-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <!-- Method Switcher: Upload File or Paste Text -->
      <div class="method-tabs">
        <button
          type="button"
          class="method-tab {inputMethod === 'file' ? 'active' : ''}"
          onclick={() => (inputMethod = 'file')}
        >
          <i class="fa-solid fa-upload"></i>
          <span>Upload File (.tsv, .txt)</span>
        </button>
        <button
          type="button"
          class="method-tab {inputMethod === 'paste' ? 'active' : ''}"
          onclick={() => (inputMethod = 'paste')}
        >
          <i class="fa-solid fa-paste"></i>
          <span>Paste TSV Text</span>
        </button>
      </div>

      {#if inputMethod === 'file'}
        <div
          class="dropzone"
          ondragover={(e) => e.preventDefault()}
          ondrop={handleDrop}
          onclick={() => fileInputEl?.click()}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputEl?.click();
          }}
        >
          <input
            bind:this={fileInputEl}
            type="file"
            accept=".tsv,.tab,.txt,.csv"
            class="hidden-file-input"
            onchange={handleFileSelected}
          />
          <i class="fa-solid fa-cloud-arrow-up dropzone-icon"></i>
          {#if fileName}
            <span class="file-name-text">
              <i class="fa-solid fa-file-lines"></i> {fileName}
            </span>
            <span class="dropzone-sub">Click or drag another file to replace</span>
          {:else}
            <span class="dropzone-text">Click to choose a .tsv or .txt file, or drag and drop here</span>
            <span class="dropzone-sub">Standard Tab-Separated Values format with headers in first row</span>
          {/if}
        </div>
      {:else}
        <div class="paste-area-wrap">
          <label for="tsv-paste-input" class="paste-label">Paste Tab-Separated Content:</label>
          <textarea
            id="tsv-paste-input"
            class="form-input paste-textarea"
            rows="5"
            placeholder="Headword&#9;POS&#9;Gloss&#9;Meaning&#10;buk&#9;n&#9;book&#9;a written or printed work&#10;rit&#9;v&#9;read&#9;to read text"
            bind:value={rawText}
          ></textarea>
        </div>
      {/if}

      <!-- Options -->
      <div class="import-options-card">
        <span class="options-title">Import Options:</span>
        <div class="options-row">
          <label class="radio-label">
            <input type="radio" name="tsv-mode" value="append" bind:group={importMode} />
            <span>Append to existing entries ({activeLex.entries?.length || 0})</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="tsv-mode" value="replace" bind:group={importMode} />
            <span class="danger-option">Replace all existing entries</span>
          </label>
        </div>

        <div class="options-row">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={createMissingFields} />
            <span>Automatically create new fields for unmatched column headers</span>
          </label>
        </div>
      </div>

      <!-- Preview Section -->
      {#if parsedPreview}
        <div class="preview-section">
          <div class="preview-header">
            <span class="preview-title">
              <i class="fa-solid fa-eye"></i>
              Data Preview ({parsedPreview.totalRows} rows, {parsedPreview.headers.length} columns)
            </span>
          </div>

          <!-- Column Matching Tags -->
          <div class="column-mappings-list">
            {#each parsedPreview.headerMatches as match}
              <div class="mapping-badge {match.matchedField ? 'matched' : (match.willCreate ? 'new-field' : 'ignored')}">
                <span class="header-name">{match.header}</span>
                <i class="fa-solid fa-arrow-right mapping-arrow"></i>
                {#if match.matchedField}
                  <span class="match-target">Field: {match.matchedField.name}</span>
                {:else if match.willCreate}
                  <span class="match-target new-target">+ New Field</span>
                {:else}
                  <span class="match-target ignored-target">Ignored</span>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Sample Table Preview -->
          <div class="preview-table-wrap">
            <table class="preview-table">
              <thead>
                <tr>
                  {#each parsedPreview.headers as header}
                    <th>{header}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each parsedPreview.rows as row}
                  <tr>
                    {#each parsedPreview.headers as _, idx}
                      <td>{row[idx] || ''}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>

    <div class="tsv-modal-footer">
      <button type="button" class="btn-cancel" onclick={handleClose} disabled={isImporting}>
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary"
        disabled={isImporting || !rawText.trim() || !parsedPreview}
        onclick={handleImport}
      >
        {#if isImporting}
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <span>Importing...</span>
        {:else}
          <i class="fa-solid fa-file-arrow-up"></i>
          <span>Import {parsedPreview?.totalRows || 0} Entries</span>
        {/if}
      </button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(2px);
    z-index: 1000;
  }

  .tsv-modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 94%;
    max-width: 760px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
    z-index: 1001;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .tsv-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  .tsv-modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tsv-modal-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
  }

  .tsv-modal-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .tsv-modal-sub {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .tsv-modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .method-tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    padding-bottom: 8px;
  }

  .method-tab {
    padding: 6px 14px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted, #64748b);
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .method-tab:hover {
    color: var(--text-heading, #0f172a);
    background: var(--bg-hover, #f1f5f9);
  }

  .method-tab.active {
    background: var(--bg-hover, #f1f5f9);
    color: var(--primary-color, #0284c7);
    border-color: var(--border-color, #cbd5e1);
    font-weight: 600;
  }

  .dropzone {
    border: 2px dashed var(--border-dashed, #cbd5e1);
    border-radius: 8px;
    padding: 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    background: var(--bg-dropzone, #f8fafc);
    transition: all 0.15s ease;
  }

  .dropzone:hover {
    border-color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.04);
  }

  .hidden-file-input {
    display: none;
  }

  .dropzone-icon {
    font-size: 2rem;
    color: var(--primary-color, #0284c7);
    margin-bottom: 4px;
  }

  .file-name-text {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dropzone-text {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-base, #334155);
  }

  .dropzone-sub {
    font-size: 0.775rem;
    color: var(--text-muted, #64748b);
  }

  .paste-area-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .paste-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .paste-textarea {
    font-family: monospace;
    font-size: 0.825rem;
    white-space: pre;
    overflow-x: auto;
  }

  .form-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
  }

  .import-options-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .options-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .options-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .radio-label, .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.825rem;
    color: var(--text-base, #334155);
    cursor: pointer;
  }

  .danger-option {
    color: #ef4444;
  }

  /* Preview */
  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .column-mappings-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mapping-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.725rem;
    border: 1px solid var(--border-color, #e2e8f0);
  }

  .mapping-badge.matched {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
    color: #16a34a;
  }

  .mapping-badge.new-field {
    background: rgba(2, 132, 199, 0.1);
    border-color: rgba(2, 132, 199, 0.3);
    color: var(--primary-color, #0284c7);
  }

  .mapping-badge.ignored {
    background: rgba(148, 163, 184, 0.1);
    border-color: rgba(148, 163, 184, 0.3);
    color: var(--text-muted, #64748b);
  }

  .header-name {
    font-weight: 600;
  }

  .mapping-arrow {
    font-size: 0.65rem;
    opacity: 0.7;
  }

  .preview-table-wrap {
    max-height: 180px;
    overflow: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.775rem;
  }

  .preview-table th {
    background: var(--bg-hover, #f1f5f9);
    padding: 6px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    position: sticky;
    top: 0;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .preview-table td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    color: var(--text-base, #334155);
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tsv-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .btn-cancel {
    padding: 8px 16px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: transparent;
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .btn-primary {
    padding: 8px 18px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

