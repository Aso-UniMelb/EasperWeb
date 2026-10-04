<script>
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { hunspellState } from '../../state/hunspellState.svelte.js';
  import { getEntryFieldValue } from '../../utils/lexiconTsv.js';
  import { parseLexicon } from '../../utils/subTiers.js';
  import { formatEntryDateTime, formatFullDateTime } from '../../utils/formatters.js';

  let activeLex = $derived(lexiconState.activeLexicon);
  let fields = $derived(activeLex?.fields || []);
  let allEntries = $derived(activeLex?.entries || []);
  let filteredEntries = $derived(lexiconState.filteredEntries);

  // Sorting state
  let sortFieldId = $state(null);
  let sortDirection = $state('asc'); // 'asc' | 'desc'

  // Selection state
  let selectedEntryIds = $state(new Set());

  // Pagination state (fixed at 500 items per page)
  const PAGE_SIZE = 500;
  let currentPage = $state(1);

  // Pre-parse controlled values map for quick lookup and datalists
  let fieldOptionsMap = $derived.by(() => {
    const map = new Map();
    for (const f of fields) {
      if (f.validValues) {
        map.set(f.id, parseLexicon(f.validValues));
      } else {
        map.set(f.id, []);
      }
    }
    return map;
  });

  // Sorted entries
  let sortedEntries = $derived.by(() => {
    const list = [...filteredEntries];
    if (!sortFieldId) return list;

    if (sortFieldId === '__updatedAt') {
      list.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      });
      return list;
    }

    const targetField = fields.find((f) => f.id === sortFieldId);
    if (!targetField) return list;

    list.sort((a, b) => {
      const valA = getEntryFieldValue(a, targetField).toLowerCase();
      const valB = getEntryFieldValue(b, targetField).toLowerCase();
      const comp = valA.localeCompare(valB, undefined, { numeric: true });
      return sortDirection === 'asc' ? comp : -comp;
    });

    return list;
  });

  // Paginated slice (fixed at 500 items per page)
  let totalPages = $derived(
    Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE)),
  );

  let paginatedEntries = $derived.by(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedEntries.slice(start, start + PAGE_SIZE);
  });

  // Reset page when search or sort changes
  $effect(() => {
    lexiconState.searchQuery;
    sortFieldId;
    sortDirection;
    currentPage = 1;
    selectedEntryIds = new Set();
  });

  function handleSort(fieldId) {
    const defaultDir = fieldId === '__updatedAt' ? 'desc' : 'asc';
    const altDir = defaultDir === 'asc' ? 'desc' : 'asc';

    if (sortFieldId === fieldId) {
      if (sortDirection === defaultDir) {
        sortDirection = altDir;
      } else {
        sortFieldId = null;
        sortDirection = 'asc';
      }
    } else {
      sortFieldId = fieldId;
      sortDirection = defaultDir;
    }
  }

  function toggleSelectAll() {
    if (selectedEntryIds.size === paginatedEntries.length && paginatedEntries.length > 0) {
      selectedEntryIds = new Set();
    } else {
      selectedEntryIds = new Set(paginatedEntries.map((e) => e.id));
    }
  }

  function toggleSelectEntry(id) {
    const updated = new Set(selectedEntryIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    selectedEntryIds = updated;
  }

  async function handleDeleteSelected() {
    if (selectedEntryIds.size === 0 || !activeLex) return;
    const count = selectedEntryIds.size;
    const confirmed = window.confirm(`Delete ${count} selected entry(ies)?`);
    if (!confirmed) return;

    await lexiconState.deleteEntries(activeLex.id, Array.from(selectedEntryIds));
    selectedEntryIds = new Set();
  }

  async function handleDeleteEntry(entry) {
    if (!activeLex) return;
    await lexiconState.deleteEntry(activeLex.id, entry.id);
  }

  async function handleAddBlankEntry() {
    if (!activeLex) return;
    if (fields.length === 0) {
      lexiconState.activeTab = 'fields';
      lexiconState.showStatus('Please configure at least one field first.');
      return;
    }
    currentPage = 1;
    await lexiconState.addBlankEntry(activeLex.id);
  }

  function handleCellInput(entry, field, val) {
    if (!activeLex) return;
    lexiconState.updateEntryField(activeLex.id, entry.id, field.id, val);
  }

  function handleCellKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  function autoResize(node) {
    function resize() {
      node.style.height = 'auto';
      if (node.scrollHeight > 28) {
        node.style.height = `${node.scrollHeight}px`;
      }
    }

    node.addEventListener('input', resize);
    node.addEventListener('focus', resize);

    return {
      destroy() {
        node.removeEventListener('input', resize);
        node.removeEventListener('focus', resize);
      },
    };
  }

  function isAllSelected() {
    return (
      paginatedEntries.length > 0 &&
      paginatedEntries.every((e) => selectedEntryIds.has(e.id))
    );
  }
</script>

<!-- Datalists for controlled vocabulary autocomplete in editable cells -->
{#each fields as field (field.id)}
  {@const items = fieldOptionsMap.get(field.id) || []}
  {#if items.length > 0}
    <datalist id="datalist-{field.id}">
      {#each items as item}
        <option value={item.value}>{item.label ? `${item.value} (${item.label})` : item.value}</option>
      {/each}
    </datalist>
  {/if}
{/each}

<div class="entries-table-container">
  <!-- Toolbar: Search, Filters, Add/Export/Import buttons -->
  <div class="entries-toolbar">
    <div class="toolbar-left">
      <!-- Search Input -->
      <div class="search-input-wrap">
        <i class="fa-solid fa-magnifying-glass search-icon"></i>
        <input
          type="text"
          class="table-search-input"
          placeholder="Search entries across all fields..."
          bind:value={lexiconState.searchQuery}
        />
        {#if lexiconState.searchQuery}
          <button
            type="button"
            class="btn-clear-search"
            onclick={() => (lexiconState.searchQuery = '')}
            title="Clear search"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        {/if}
      </div>

      <span class="entries-count-badge">
        {#if lexiconState.searchQuery}
          Showing <strong>{filteredEntries.length}</strong> of {allEntries.length} entries
        {:else}
          Total: <strong>{allEntries.length}</strong> entry{allEntries.length === 1 ? '' : 'ies'}
        {/if}
      </span>
    </div>

    <div class="toolbar-right">
      {#if selectedEntryIds.size > 0}
        <button
          type="button"
          class="btn-bulk-delete"
          onclick={handleDeleteSelected}
          title="Delete selected entries"
        >
          <i class="fa-solid fa-trash-can"></i>
          <span>Delete ({selectedEntryIds.size})</span>
        </button>
      {/if}

      <button
        type="button"
        class="btn-toolbar-action"
        onclick={() => (lexiconState.isImportTsvModalOpen = true)}
        title="Import entries from a TSV file"
      >
        <i class="fa-solid fa-file-arrow-up"></i>
        <span>Import TSV</span>
      </button>

      <button
        type="button"
        class="btn-toolbar-action"
        onclick={() => lexiconState.exportTsv()}
        disabled={allEntries.length === 0}
        title="Export this lexicon to a TSV file"
      >
        <i class="fa-solid fa-file-arrow-down"></i>
        <span>Export TSV</span>
      </button>

      <button
        type="button"
        class="btn-toolbar-action"
        onclick={() => (hunspellState.isModalOpen = true)}
        title="View, test, and export live Hunspell dictionary ({hunspellState.wordCount} words)"
      >
        <i class="fa-solid fa-spell-check"></i>
        <span>Hunspell ({hunspellState.wordCount})</span>
      </button>

      <button
        type="button"
        class="btn-add-entry-primary"
        onclick={handleAddBlankEntry}
        title="Add a new blank entry row at the top"
      >
        <i class="fa-solid fa-plus"></i>
        <span>Add Entry</span>
      </button>
    </div>
  </div>

  <!-- Table Wrap -->
  <div class="table-scroll-wrapper">
    {#if fields.length === 0}
      <div class="empty-entries-card">
        <div class="empty-icon-wrap">
          <i class="fa-solid fa-sliders"></i>
        </div>
        <h4>No fields configured</h4>
        <p>This lexicon does not have any fields yet. Configure fields and controlled values first to start adding entries.</p>
        <div class="empty-actions">
          <button
            type="button"
            class="btn-add-entry-primary"
            onclick={() => (lexiconState.activeTab = 'fields')}
          >
            <i class="fa-solid fa-plus"></i>
            <span>Configure Fields</span>
          </button>
        </div>
      </div>
    {:else if allEntries.length === 0}
      <div class="empty-entries-card">
        <div class="empty-icon-wrap">
          <i class="fa-solid fa-book-open"></i>
        </div>
        <h4>No entries in this lexicon yet</h4>
        <p>Start populating your lexicon by adding entries inline or importing from a TSV file.</p>
        <div class="empty-actions">
          <button
            type="button"
            class="btn-add-entry-primary"
            onclick={handleAddBlankEntry}
          >
            <i class="fa-solid fa-plus"></i>
            <span>Add First Entry</span>
          </button>
          <button
            type="button"
            class="btn-toolbar-action"
            onclick={() => (lexiconState.isImportTsvModalOpen = true)}
          >
            <i class="fa-solid fa-file-arrow-up"></i>
            <span>Import from TSV</span>
          </button>
        </div>
      </div>
    {:else if filteredEntries.length === 0}
      <div class="empty-entries-card">
        <i class="fa-solid fa-filter-circle-xmark empty-icon"></i>
        <h4>No matching entries found</h4>
        <p>No records match your search query "{lexiconState.searchQuery}".</p>
        <button
          type="button"
          class="btn-toolbar-action"
          onclick={() => (lexiconState.searchQuery = '')}
        >
          Clear Search
        </button>
      </div>
    {:else}
      <table class="lex-table">
        <thead>
          <tr>
            <th class="col-checkbox">
              <input
                type="checkbox"
                checked={isAllSelected()}
                onchange={toggleSelectAll}
                title="Select / deselect all visible entries"
              />
            </th>
            <th class="col-index">#</th>

            {#each fields as field (field.id)}
              <th
                class="col-field sortable"
                onclick={() => handleSort(field.id)}
                title="Sort by {field.name}"
              >
                <div class="th-content">
                  <span>{field.name}</span>
                  {#if sortFieldId === field.id}
                    <i class="fa-solid {sortDirection === 'asc' ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short'} sort-icon active"></i>
                  {:else}
                    <i class="fa-solid fa-sort sort-icon dim"></i>
                  {/if}
                </div>
              </th>
            {/each}

            <th
              class="col-updated sortable"
              onclick={() => handleSort('__updatedAt')}
              title="Sort by Last Updated / Added time"
            >
              <div class="th-content">
                <i class="fa-regular fa-clock col-time-header-icon"></i>
                <span>Updated</span>
                {#if sortFieldId === '__updatedAt'}
                  <i class="fa-solid {sortDirection === 'asc' ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short'} sort-icon active"></i>
                {:else}
                  <i class="fa-solid fa-sort sort-icon dim"></i>
                {/if}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedEntries as entry, idx (entry.id)}
            {@const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1}
            {@const isSelected = selectedEntryIds.has(entry.id)}
            <tr class="lex-row {isSelected ? 'row-selected' : ''}">
              <td class="col-checkbox">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onchange={() => toggleSelectEntry(entry.id)}
                />
              </td>
              <td class="col-index">{globalIdx}</td>

              {#each fields as field (field.id)}
                {@const cellVal = getEntryFieldValue(entry, field)}
                {@const hasControlled = (fieldOptionsMap.get(field.id) || []).length > 0}
                {@const isWideField = field.name.toLowerCase().includes('meaning') || field.name.toLowerCase().includes('etymology') || field.name.toLowerCase().includes('note') || field.name.toLowerCase().includes('def') || field.name.toLowerCase().includes('gloss')}

                <td class="col-cell {isWideField ? 'col-cell-wide' : ''}">
                  <div class="cell-editor-wrap">
                    {#if hasControlled}
                      <input
                        type="text"
                        class="cell-input"
                        list="datalist-{field.id}"
                        value={cellVal}
                        oninput={(e) => handleCellInput(entry, field, e.currentTarget.value)}
                        placeholder="—"
                        title={cellVal}
                      />
                    {:else}
                      <textarea
                        class="cell-input cell-textarea"
                        use:autoResize
                        rows="1"
                        value={cellVal}
                        oninput={(e) => handleCellInput(entry, field, e.currentTarget.value)}
                        onkeydown={handleCellKeyDown}
                        placeholder="—"
                        title={cellVal}
                      ></textarea>
                    {/if}
                  </div>
                </td>
              {/each}

              <td
                class="col-updated"
                title={formatFullDateTime(entry.updatedAt || entry.createdAt)}
              >
                <span class="time-stamp-pill">
                  {formatEntryDateTime(entry.updatedAt || entry.createdAt)}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Pagination Bar -->
  {#if sortedEntries.length > 0}
    <div class="table-pagination-bar">
      <div class="pagination-info">
        <span>Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedEntries.length)}</strong> of <strong>{sortedEntries.length}</strong> entries</span>
      </div>

      {#if totalPages > 1}
        <div class="pagination-controls">
          <button
            type="button"
            class="btn-page-nav"
            disabled={currentPage <= 1}
            onclick={() => (currentPage = Math.max(1, currentPage - 1))}
            title="Previous page"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <span class="page-indicator">
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>

          <button
            type="button"
            class="btn-page-nav"
            disabled={currentPage >= totalPages}
            onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
            title="Next page"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .entries-table-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entries-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 280px;
  }

  .search-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 380px;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .table-search-input {
    width: 100%;
    padding: 7px 30px 7px 32px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .table-search-input:focus {
    border-color: var(--primary-color, #0284c7);
  }

  .btn-clear-search {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 4px;
  }

  .entries-count-badge {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-bulk-delete {
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-bulk-delete:hover {
    background: #ef4444;
    color: #ffffff;
  }

  .btn-toolbar-action {
    padding: 6px 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-toolbar-action:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-toolbar-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-add-entry-primary {
    padding: 6px 14px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity 0.15s ease;
  }

  .btn-add-entry-primary:hover {
    opacity: 0.9;
  }

  /* Table styling */
  .table-scroll-wrapper {
    overflow-x: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-card, #ffffff);
    min-height: 240px;
  }

  .lex-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.825rem;
    text-align: left;
  }

  .lex-table th {
    background: var(--bg-table-header, #f1f5f9);
    padding: 9px 12px;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    white-space: nowrap;
    user-select: none;
  }

  .lex-table th.sortable {
    cursor: pointer;
  }

  .lex-table th.sortable:hover {
    background: var(--bg-hover, #e2e8f0);
  }

  .th-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sort-icon {
    font-size: 0.75rem;
  }

  .sort-icon.dim {
    opacity: 0.3;
  }

  .sort-icon.active {
    color: var(--primary-color, #0284c7);
  }

  .col-checkbox {
    width: 32px;
    text-align: center;
  }

  .col-index {
    width: 38px;
    color: var(--text-muted, #64748b);
    font-size: 0.75rem;
    text-align: center;
    vertical-align: top;
    padding-top: 8px;
  }

  .col-updated {
    width: 125px;
    white-space: nowrap;
    user-select: none;
    vertical-align: top;
    padding-top: 8px;
  }

  .col-time-header-icon {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .time-stamp-pill {
    display: inline-block;
    padding: 2px 7px;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-muted, #64748b);
    background: var(--bg-hover, #f1f5f9);
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
  }

  :global([data-theme='dark']) .time-stamp-pill {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }

  .lex-row {
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    transition: background 0.12s ease;
  }

  .lex-row:hover {
    background: var(--bg-hover, #f8fafc);
  }

  .lex-row.row-selected {
    background: rgba(2, 132, 199, 0.06);
  }

  .lex-table td {
    padding: 3px 6px;
    vertical-align: top;
  }

  .col-cell {
    min-width: 130px;
    vertical-align: top;
  }

  .col-cell-wide {
    min-width: 220px;
    max-width: 480px;
  }

  /* Inline Cell Editor */
  .cell-editor-wrap {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    position: relative;
    width: 100%;
  }

  .cell-input {
    width: 100%;
    min-width: 80px;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text-base, #334155);
    font-size: 0.825rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    transition: all 0.12s ease;
  }

  .cell-textarea {
    resize: vertical;
    overflow-y: hidden;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.45;
    min-height: 28px;
    field-sizing: content;
  }

  .cell-textarea:focus {
    overflow-y: auto;
  }

  .cell-input::placeholder {
    color: var(--text-muted, #cbd5e1);
  }

  .cell-input:hover {
    background: var(--bg-hover, #f8fafc);
    border-color: var(--border-color, #e2e8f0);
  }

  .cell-input:focus {
    background: var(--bg-card, #ffffff);
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }



  /* Empty state */
  .empty-entries-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    color: var(--text-muted, #64748b);
  }

  .empty-icon-wrap {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: rgba(2, 132, 199, 0.1);
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    margin-bottom: 12px;
  }

  .empty-icon {
    font-size: 2.2rem;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .empty-entries-card h4 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .empty-entries-card p {
    margin: 6px 0 16px 0;
    font-size: 0.85rem;
    max-width: 420px;
  }

  .empty-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Pagination Bar */
  .table-pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .pagination-info {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-page-nav {
    padding: 4px 8px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .btn-page-nav:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator {
    font-size: 0.8rem;
  }
</style>
