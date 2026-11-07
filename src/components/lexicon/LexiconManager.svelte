<script>
  import { onMount } from 'svelte';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { hunspellState } from '../../state/hunspellState.svelte.js';
  import { router } from '../../services/router.svelte.js';
  import {
    formatEntryDateTime,
    formatFullDateTime,
  } from '../../utils/formatters.js';

  import LexiconEntriesTable from './LexiconEntriesTable.svelte';
  import LexiconFieldsEditor from './LexiconFieldsEditor.svelte';
  import LexiconEntryModal from './LexiconEntryModal.svelte';
  import LexiconTsvImportModal from './LexiconTsvImportModal.svelte';
  import NewLexiconModal from './NewLexiconModal.svelte';
  import LexiconHunspellModal from './LexiconHunspellModal.svelte';

  // Route-derived active lexicon ID (from /lexicon/:id)
  let routeId = $derived(router.params?.id || null);
  let activeLex = $derived(
    routeId
      ? lexiconState.lexicons.find((l) => l.id === routeId) || null
      : null,
  );

  // Search & sort state for the Lexicon Manager overview
  let managerSearchQuery = $state('');
  let sortField = $state('updatedAt'); // 'title' | 'languageVariety' | 'entries' | 'fields' | 'updatedAt'
  let sortDir = $state('desc'); // 'asc' | 'desc'

  function toggleSort(field) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = field === 'title' || field === 'languageVariety' ? 'asc' : 'desc';
    }
  }

  // Edit lexicon metadata (title, language variety, description)
  let isEditingDetails = $state(false);
  let editTitle = $state('');
  let editVariety = $state('');
  let editDescription = $state('');
  let isSavingDetails = $state(false);

  onMount(async () => {
    await lexiconState.init();
  });

  // Keep lexiconState and Hunspell synced with route changes
  $effect(() => {
    if (routeId) {
      if (lexiconState.activeLexiconId !== routeId) {
        lexiconState.activeLexiconId = routeId;
        lexiconState.searchQuery = '';
        if (activeLex) {
          hunspellState.rebuildFromLexicon(activeLex);
        }
      }
    } else {
      lexiconState.activeLexiconId = null;
    }
  });

  let filteredLexicons = $derived.by(() => {
    const raw = lexiconState.lexicons || [];
    const q = managerSearchQuery.trim().toLowerCase();
    const list = q
      ? raw.filter(
          (l) =>
            (l.title && l.title.toLowerCase().includes(q)) ||
            (l.languageVariety && l.languageVariety.toLowerCase().includes(q)) ||
            (l.description && l.description.toLowerCase().includes(q)),
        )
      : [...raw];

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      } else if (sortField === 'languageVariety') {
        cmp = (a.languageVariety || '').localeCompare(
          b.languageVariety || '',
          undefined,
          { numeric: true, sensitivity: 'base' },
        );
      } else if (sortField === 'entries') {
        cmp = (a.entries?.length || 0) - (b.entries?.length || 0);
      } else if (sortField === 'fields') {
        cmp = (a.fields?.length || 0) - (b.fields?.length || 0);
      } else if (sortField === 'updatedAt') {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        cmp = timeA - timeB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  });

  function startEditingDetails() {
    if (!activeLex) return;
    editTitle = activeLex.title || '';
    editVariety = activeLex.languageVariety || '';
    editDescription = activeLex.description || '';
    isEditingDetails = true;
  }

  function cancelEditingDetails() {
    isEditingDetails = false;
  }

  async function saveDetails() {
    if (!activeLex) return;
    const cleanTitle = editTitle.trim();
    if (!cleanTitle) return;

    isSavingDetails = true;
    try {
      await lexiconState.updateLexiconInfo(activeLex.id, {
        title: cleanTitle,
        languageVariety: editVariety.trim(),
        description: editDescription.trim(),
      });
      isEditingDetails = false;
    } finally {
      isSavingDetails = false;
    }
  }

  async function handleDeleteLexicon(e, lex) {
    if (e) e.stopPropagation();
    const confirmed = window.confirm(
      `Are you sure you want to delete lexicon "${lex.title}" and its ${lex.entries?.length || 0} entries? This cannot be undone.`,
    );
    if (!confirmed) return;
    await lexiconState.deleteLexicon(lex.id);
  }

  function handleExportTsv(e, lex) {
    if (e) e.stopPropagation();
    lexiconState.exportTsv(lex.id);
  }

  function focusOnMount(node) {
    node.focus();
    node.select?.();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (isEditingDetails && e.key === 'Escape') {
      cancelEditingDetails();
    }
  }}
/>

<div class="lexicon-manager-root">
  <!-- Toast / Notification Banner -->
  {#if lexiconState.statusMessage}
    <div class="status-banner" role="status" aria-live="polite">
      <i class="fa-solid fa-circle-check banner-icon"></i>
      <span>{lexiconState.statusMessage}</span>
    </div>
  {/if}

  {#if lexiconState.isLoading}
    <div class="loading-state">
      <i class="fa-solid fa-circle-notch fa-spin loading-spinner"></i>
      <p>Loading lexicons...</p>
    </div>
  {:else if !routeId}
    <!-- ======================================================== -->
    <!-- ROUTE: /lexicon (LEXICON MANAGER OVERVIEW)                 -->
    <!-- ======================================================== -->
    <section class="starting-projects-section">
      <div class="projects-section-header">
        <div class="section-title-wrap">
          <i class="fa-solid fa-book-bookmark section-icon"></i>
          <div>
            <h2 class="section-title">
              Saved Lexicons ({filteredLexicons.length})
            </h2>
          </div>
        </div>

        <div class="projects-section-actions">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              class="search-input"
              placeholder="Search lexicons..."
              bind:value={managerSearchQuery}
            />
            {#if managerSearchQuery}
              <button
                type="button"
                class="btn-clear-search"
                aria-label="Clear search"
                onclick={() => (managerSearchQuery = '')}
              >
                <i class="fa-solid fa-circle-xmark"></i>
              </button>
            {/if}
          </div>

          <button
            type="button"
            class="btn-new-project-hero"
            onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
          >
            <i class="fa-solid fa-plus"></i>
            <span>New Lexicon</span>
          </button>
        </div>
      </div>

      {#if filteredLexicons.length === 0}
        <div class="starting-empty-state">
          <div class="empty-icon-wrap">
            <i class="fa-solid fa-book-bookmark"></i>
          </div>
          {#if managerSearchQuery}
            <h3>No matching lexicons</h3>
            <p>No lexicon found matching "{managerSearchQuery}".</p>
            <button
              type="button"
              class="btn-modal-cancel"
              onclick={() => (managerSearchQuery = '')}
              style="margin-top: 8px;"
            >
              Clear Search
            </button>
          {:else}
            <h3>No lexicons yet</h3>
            <p>Create your first lexicon to get started.</p>
            <button
              type="button"
              class="btn-new-project-hero"
              onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
              style="margin-top: 10px;"
            >
              <i class="fa-solid fa-plus"></i>
              <span>Create Lexicon</span>
            </button>
          {/if}
        </div>
      {:else}
        <div class="projects-table-wrap">
          <table class="projects-table">
            <thead>
              <tr>
                <th
                  class="col-title sortable"
                  onclick={() => toggleSort('title')}
                >
                  <div class="th-inner">
                    <span>Lexicon Title</span>
                    {#if sortField === 'title'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-lang sortable"
                  onclick={() => toggleSort('languageVariety')}
                >
                  <div class="th-inner">
                    <span>Language Variety</span>
                    {#if sortField === 'languageVariety'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-entries sortable"
                  onclick={() => toggleSort('entries')}
                >
                  <div class="th-inner">
                    <span>Entries</span>
                    {#if sortField === 'entries'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-fields sortable"
                  onclick={() => toggleSort('fields')}
                >
                  <div class="th-inner">
                    <span>Fields</span>
                    {#if sortField === 'fields'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-updated sortable"
                  onclick={() => toggleSort('updatedAt')}
                >
                  <div class="th-inner">
                    <span>Updated</span>
                    {#if sortField === 'updatedAt'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredLexicons as lex (lex.id)}
                {@const entryCount = lex.entries?.length || 0}
                {@const fieldCount = lex.fields?.length || 0}
                {@const updateTime = lex.updatedAt || lex.createdAt}
                <tr
                  class="project-row"
                  onclick={() => router.navigate(`/lexicon/${lex.id}`)}
                >
                  <td class="col-title">
                    <div class="row-title-wrap">
                      <span class="row-project-title" title={lex.title}>
                        {lex.title}
                      </span>
                    </div>
                  </td>
                  <td class="col-lang">
                    {#if lex.languageVariety}
                      <span class="card-lang-tag">
                        <i class="fa-solid fa-language"></i>
                        {lex.languageVariety}
                      </span>
                    {:else}
                      <span class="row-date-val">&mdash;</span>
                    {/if}
                  </td>
                  <td class="col-entries">
                    <span class="row-tabular-val">{entryCount}</span>
                  </td>
                  <td class="col-fields">
                    <span class="row-tabular-val">{fieldCount}</span>
                  </td>
                  <td class="col-updated">
                    <span class="row-date-val">
                      {updateTime
                        ? new Date(updateTime).toLocaleDateString()
                        : '—'}
                    </span>
                  </td>
                  <td
                    class="col-actions"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <div class="row-actions-wrap">
                      <button
                        type="button"
                        class="btn-card-action"
                        onclick={(e) => handleExportTsv(e, lex)}
                        title="Export {lex.title} to TSV"
                      >
                        <i class="fa-solid fa-download"></i>
                      </button>
                      <button
                        type="button"
                        class="btn-card-action btn-card-danger"
                        onclick={(e) => handleDeleteLexicon(e, lex)}
                        title="Delete lexicon {lex.title}"
                      >
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {:else}
    <!-- ======================================================== -->
    <!-- ROUTE: /lexicon/{id} (INDIVIDUAL LEXICON EDITOR)          -->
    <!-- ======================================================== -->
    {#if !activeLex}
      <!-- 404 Not Found for specific lexicon ID -->
      <div class="lexicon-not-found-card">
        <div class="not-found-icon-wrap">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="not-found-title">Lexicon Not Found</h3>
        <p class="not-found-desc">
          The lexicon with ID <code>{routeId}</code> could not be found or may have
          been deleted.
        </p>
        <button
          type="button"
          class="btn-hero-primary"
          onclick={() => router.navigate('/lexicon')}
        >
          <i class="fa-solid fa-arrow-left"></i>
          <span>Return to Lexicon Manager</span>
        </button>
      </div>
    {:else}
      <!-- Breadcrumb / Back Bar -->
      <div class="lexicon-breadcrumb-bar">
        <button
          type="button"
          class="btn-back-to-manager"
          onclick={() => router.navigate('/lexicon')}
          title="Back to Lexicon Manager"
        >
          <i class="fa-solid fa-arrow-left"></i>
          <span>All Lexicons</span>
        </button>

        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current-title">{activeLex.title}</span>
      </div>

      <!-- Lexicon Header Card -->
      <div class="lexicon-header-card">
        {#if isEditingDetails}
          <!-- Inline Edit Form -->
          <form
            class="edit-details-form"
            onsubmit={(e) => {
              e.preventDefault();
              saveDetails();
            }}
          >
            <div class="form-row-2col">
              <div class="form-group">
                <label for="edit-lex-title" class="form-label"
                  >Lexicon Title *</label
                >
                <input
                  id="edit-lex-title"
                  type="text"
                  class="form-input"
                  bind:value={editTitle}
                  use:focusOnMount
                  required
                />
              </div>

              <div class="form-group">
                <label for="edit-lex-lang" class="form-label"
                  >Language Variety</label
                >
                <input
                  id="edit-lex-lang"
                  type="text"
                  class="form-input"
                  placeholder="e.g. Kurmanji, Hawrami..."
                  bind:value={editVariety}
                />
              </div>
            </div>

            <div class="form-group">
              <label for="edit-lex-desc" class="form-label"
                >Description (Optional)</label
              >
              <textarea
                id="edit-lex-desc"
                class="form-textarea"
                rows="2"
                placeholder="Short description of this lexicon..."
                bind:value={editDescription}
              ></textarea>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="btn-secondary"
                onclick={cancelEditingDetails}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn-primary"
                disabled={isSavingDetails || !editTitle.trim()}
              >
                {#if isSavingDetails}
                  <i class="fa-solid fa-circle-notch fa-spin"></i>
                  <span>Saving...</span>
                {:else}
                  <i class="fa-solid fa-check"></i>
                  <span>Save Changes</span>
                {/if}
              </button>
            </div>
          </form>
        {:else}
          <!-- Display Header -->
          <div class="lex-title-row">
            <div class="title-with-badge">
              <h2 class="lexicon-active-title">{activeLex.title}</h2>
              {#if activeLex.languageVariety}
                <span class="lang-variety-tag">
                  <i class="fa-solid fa-language"></i>
                  {activeLex.languageVariety}
                </span>
              {/if}
            </div>

            <div class="header-actions-group">
              <button
                type="button"
                class="btn-edit-details"
                onclick={startEditingDetails}
                title="Edit title, language variety, or description"
              >
                <i class="fa-solid fa-pen"></i>
                <span>Edit Info</span>
              </button>

              <button
                type="button"
                class="btn-header-fields {lexiconState.activeTab === 'fields'
                  ? 'active'
                  : ''}"
                onclick={() => {
                  lexiconState.activeTab =
                    lexiconState.activeTab === 'fields' ? 'entries' : 'fields';
                }}
                title={lexiconState.activeTab === 'fields'
                  ? 'Back to Entries table'
                  : 'Configure fields and controlled values'}
              >
                <i
                  class="fa-solid {lexiconState.activeTab === 'fields'
                    ? 'fa-table'
                    : 'fa-sliders'}"
                ></i>
                <span
                  >{lexiconState.activeTab === 'fields'
                    ? 'View Entries'
                    : 'Fields & Controlled Values'}</span
                >
                <span class="btn-badge-count"
                  >{activeLex.fields?.length || 0}</span
                >
              </button>

              <button
                type="button"
                class="btn-header-hunspell"
                onclick={() => (hunspellState.isModalOpen = true)}
                title="View, test, and export dynamic Hunspell dictionary ({hunspellState.wordCount} words)"
              >
                <i class="fa-solid fa-spell-check"></i>
                <span>Hunspell Dict</span>
                <span class="btn-badge-count">{hunspellState.wordCount}</span>
              </button>

              <button
                type="button"
                class="btn-header-action text-danger"
                onclick={(e) => handleDeleteLexicon(e, activeLex)}
                title="Delete this lexicon"
              >
                <i class="fa-solid fa-trash-can"></i>
                <span>Delete</span>
              </button>
            </div>
          </div>

          {#if activeLex.description}
            <p class="lexicon-active-desc">{activeLex.description}</p>
          {/if}

          <div class="lexicon-meta-strip">
            <div class="meta-item">
              <i class="fa-solid fa-layer-group"></i>
              <span
                ><strong>{activeLex.entries?.length || 0}</strong> entries</span
              >
            </div>
            <div class="meta-divider">&bull;</div>
            <button
              type="button"
              class="meta-item-btn"
              onclick={() => {
                lexiconState.activeTab = 'fields';
              }}
              title="Configure fields"
            >
              <i class="fa-solid fa-table-list"></i>
              <span
                ><strong>{activeLex.fields?.length || 0}</strong> fields</span
              >
            </button>
            {#if activeLex.updatedAt || activeLex.createdAt}
              <div class="meta-divider">&bull;</div>
              <div
                class="meta-item muted"
                title={formatFullDateTime(
                  activeLex.updatedAt || activeLex.createdAt,
                )}
              >
                <span
                  >Updated {formatEntryDateTime(
                    activeLex.updatedAt || activeLex.createdAt,
                  )}</span
                >
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Active Tab Content (Full Width) -->
      <div class="tab-content-panel">
        {#if lexiconState.activeTab === 'entries'}
          <LexiconEntriesTable />
        {:else if lexiconState.activeTab === 'fields'}
          <LexiconFieldsEditor />
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Modals -->
  {#if lexiconState.isNewLexiconModalOpen}
    <NewLexiconModal />
  {/if}

  {#if lexiconState.isEntryModalOpen}
    <LexiconEntryModal />
  {/if}

  {#if lexiconState.isImportTsvModalOpen}
    <LexiconTsvImportModal />
  {/if}

  {#if hunspellState.isModalOpen}
    <LexiconHunspellModal />
  {/if}
</div>

<style>
  .lexicon-manager-root {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
    color: var(--text-color, #1e293b);
  }

  /* Status Banner */
  .status-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    animation: fadeIn 0.2s ease-in-out;
  }

  .banner-icon {
    font-size: 1rem;
    color: #10b981;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    color: var(--text-muted, #64748b);
    gap: 12px;
  }

  .loading-spinner {
    font-size: 2rem;
    color: var(--primary-color, #0284c7);
  }

  /* ======================================================== */
  /* MANAGER OVERVIEW VIEW STYLES                              */
  /* ======================================================== */
  .starting-projects-section {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 14px 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  :global([data-theme='dark']) .starting-projects-section {
    background: rgba(30, 41, 59, 0.5);
    border-color: #334155;
  }

  .projects-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  :global([data-theme='dark']) .projects-section-header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    font-size: 1.15rem;
    color: var(--primary-color, #0284c7);
  }

  .section-title {
    font-size: 1.12rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    margin: 0;
  }

  .projects-section-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 0.78rem;
    color: var(--text-muted, #94a3b8);
    pointer-events: none;
  }

  .search-input {
    padding: 6px 28px 6px 28px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.82rem;
    width: 170px;
    background: var(--bg-hover, #f8fafc);
    color: var(--text-heading, #0f172a);
    transition: all 0.15s ease;
  }

  .search-input:focus {
    width: 210px;
    outline: none;
    border-color: var(--primary-color, #0284c7);
    background: var(--bg-card, #ffffff);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .btn-clear-search {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 2px;
    font-size: 0.78rem;
  }

  .btn-new-project-hero {
    background: #0284c7;
    color: #ffffff;
    border: 1px solid #0369a1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .btn-new-project-hero:hover {
    background: #0369a1;
    border-color: #075985;
  }

  /* Lexicons Table */
  .projects-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-color, #e4e2dd);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
  }

  .projects-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
    text-align: left;
  }

  .projects-table th {
    background: var(--bg-table-header, #f2f0ed);
    padding: 9px 12px;
    font-weight: 600;
    font-size: 0.78rem;
    color: var(--text-heading, #0f172a);
    border-bottom: 1px solid var(--border-color, #e4e2dd);
    white-space: nowrap;
    user-select: none;
  }

  .projects-table th.sortable {
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .projects-table th.sortable:hover {
    background: var(--border-color, #e4e2dd);
  }

  :global([data-theme='dark']) .projects-table th.sortable:hover {
    background: #334155;
  }

  .th-inner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sort-icon {
    font-size: 0.72rem;
  }

  .sort-icon.dim {
    opacity: 0.35;
  }

  .sort-icon.active {
    color: var(--primary-color, #0284c7);
  }

  .project-row {
    border-bottom: 1px solid var(--border-color, #e4e2dd);
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .project-row:last-child {
    border-bottom: none;
  }

  .project-row:hover {
    background: var(--bg-hover, #f2f0ed);
  }

  .projects-table td {
    padding: 9px 12px;
    vertical-align: middle;
  }

  .col-title {
    min-width: 240px;
  }

  .col-lang {
    width: 180px;
    white-space: nowrap;
  }

  .col-entries,
  .col-fields,
  .col-updated {
    width: 120px;
    white-space: nowrap;
  }

  .col-actions {
    width: 100px;
    text-align: right;
    white-space: nowrap;
  }

  .projects-table th.col-actions {
    text-align: right;
  }

  .row-title-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .row-project-title {
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .project-row:hover .row-project-title {
    color: var(--primary-color, #0284c7);
  }

  .row-tabular-val {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--text-base, #334155);
  }

  .row-date-val {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .card-lang-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.725rem;
    font-weight: 600;
    background: #e0f2fe;
    color: #0369a1;
    padding: 2px 8px;
    border-radius: 12px;
    width: fit-content;
    border: 1px solid #bae6fd;
  }

  .row-actions-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .btn-card-action {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #94a3b8);
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    transition: all 0.12s ease;
  }

  .btn-card-action:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.05);
  }

  :global([data-theme='dark']) .btn-card-action:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-card-danger:hover {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.1) !important;
  }

  /* Empty State */
  .starting-empty-state {
    text-align: center;
    padding: 32px 16px;
    background: var(--bg-hover, #f8fafc);
    border: 2px dashed var(--border-color, #cbd5e1);
    border-radius: 8px;
    margin: 4px 0;
  }

  :global([data-theme='dark']) .starting-empty-state {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .empty-icon-wrap {
    font-size: 2rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 6px;
  }

  .starting-empty-state h3 {
    margin: 0 0 4px 0;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .starting-empty-state p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-modal-cancel {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* ======================================================== */
  /* INDIVIDUAL LEXICON VIEW STYLES                            */
  /* ======================================================== */
  .lexicon-breadcrumb-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 0;
    font-size: 0.875rem;
  }

  .btn-back-to-manager {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  .btn-back-to-manager:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .breadcrumb-separator {
    color: var(--text-muted, #94a3b8);
    font-weight: 600;
  }

  .breadcrumb-current-title {
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  /* Lexicon Header Card */
  .lexicon-header-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .lex-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }

  .title-with-badge {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .lexicon-active-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    letter-spacing: -0.01em;
  }

  .lang-variety-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    background: #e0f2fe;
    color: #0369a1;
    padding: 4px 10px;
    border-radius: 16px;
    border: 1px solid #bae6fd;
  }

  .header-actions-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .btn-edit-details {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: transparent;
    border: 1px solid var(--border-color, #e2e8f0);
    padding: 7px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-edit-details:hover {
    color: var(--primary-color, #0284c7);
    border-color: var(--primary-color, #0284c7);
    background: #f0f9ff;
  }

  .btn-header-fields {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    padding: 7px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-header-fields:hover {
    background: #e0f2fe;
    border-color: #7dd3fc;
  }

  .btn-header-fields.active {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
  }

  .btn-badge-count {
    font-size: 0.725rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: #e0f2fe;
    color: #0369a1;
  }

  .btn-header-fields.active .btn-badge-count {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
  }

  .btn-header-hunspell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.825rem;
    font-weight: 600;
    color: #7e22ce;
    background: #faf5ff;
    border: 1px solid #e9d5ff;
    padding: 7px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-header-hunspell:hover {
    background: #f3e8ff;
    border-color: #d8b4fe;
  }

  .btn-header-hunspell .btn-badge-count {
    font-size: 0.725rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: #f3e8ff;
    color: #6b21a8;
  }

  .btn-header-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.825rem;
    font-weight: 600;
    background: transparent;
    border: 1px solid var(--border-color, #e2e8f0);
    padding: 7px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted, #64748b);
    transition: all 0.15s ease;
  }

  .btn-header-action:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .btn-header-action.text-danger:hover {
    color: #ef4444;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .lexicon-active-desc {
    margin: 0 0 12px;
    font-size: 0.925rem;
    color: var(--text-muted, #64748b);
    line-height: 1.5;
  }

  .lexicon-meta-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.825rem;
    color: var(--text-muted, #64748b);
    margin-bottom: 20px;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .meta-item strong {
    color: var(--text-heading, #0f172a);
  }

  .meta-item.muted {
    font-size: 0.775rem;
  }

  .meta-divider {
    color: #cbd5e1;
  }

  /* Inline Edit Form */
  .edit-details-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    margin-bottom: 16px;
  }

  .form-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 600px) {
    .form-row-2col {
      grid-template-columns: 1fr;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text-heading, #0f172a);
    background: #ffffff;
    box-sizing: border-box;
    font-family: inherit;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #f1f5f9;
    color: var(--text-heading, #0f172a);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #e2e8f0;
  }

  .meta-item-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .meta-item-btn:hover {
    color: var(--primary-color, #0284c7);
  }

  .meta-item-btn strong {
    color: var(--text-heading, #0f172a);
  }

  /* Content Panel */
  .tab-content-panel {
    width: 100%;
  }

  /* Not Found Card */
  .lexicon-not-found-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 60px 24px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 16px;
    max-width: 600px;
    margin: 40px auto;
  }

  .not-found-icon-wrap {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    margin-bottom: 16px;
  }

  .not-found-title {
    margin: 0 0 8px;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .not-found-desc {
    margin: 0 0 20px;
    font-size: 0.9rem;
    color: var(--text-muted, #64748b);
  }

  .not-found-desc code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    color: #ef4444;
  }

  .btn-hero-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: 1px solid #0369a1;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .btn-hero-primary:hover {
    background: #0369a1;
    border-color: #075985;
  }

  /* Dark mode overrides */
  :global([data-theme='dark']) .lexicon-header-card,
  :global([data-theme='dark']) .btn-back-to-manager,
  :global([data-theme='dark']) .lexicon-not-found-card {
    background: var(--bg-card, #1e293b);
    border-color: var(--border-color, #334155);
  }

  :global([data-theme='dark']) .card-lang-tag,
  :global([data-theme='dark']) .lang-variety-tag {
    background: rgba(2, 132, 199, 0.15);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.25);
  }

  :global([data-theme='dark']) .not-found-desc code {
    background: #0f172a;
    color: #38bdf8;
  }
</style>
