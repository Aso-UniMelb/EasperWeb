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

  // Search filter for the Lexicon Manager overview
  let managerSearchQuery = $state('');

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
    const list = lexiconState.lexicons || [];
    const q = managerSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        (l.title && l.title.toLowerCase().includes(q)) ||
        (l.languageVariety && l.languageVariety.toLowerCase().includes(q)) ||
        (l.description && l.description.toLowerCase().includes(q)),
    );
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
    {#if lexiconState.lexicons.length === 0}
      <!-- Zero State Hero Card -->
      <div class="zero-state-hero">
        <div class="hero-icon-badge">
          <i class="fa-solid fa-book-bookmark"></i>
        </div>
        <h2 class="hero-title">Lexicon Management</h2>
        <p class="hero-desc">
          Create and organize linguistic dictionaries. Define custom grammatical
          &amp; semantic fields with controlled value sets and import/export via
          TSV.
        </p>

        <div class="hero-actions">
          <button
            type="button"
            class="btn-hero-primary"
            onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
          >
            <i class="fa-solid fa-plus"></i>
            <span>Create New Lexicon</span>
          </button>
        </div>

        <div class="hero-feature-pills">
          <div class="feature-pill">
            <i class="fa-solid fa-table-columns"></i>
            <span>Custom Fields &amp; Controlled Values</span>
          </div>
          <div class="feature-pill">
            <i class="fa-solid fa-file-import"></i>
            <span>TSV Import &amp; Export</span>
          </div>
          <div class="feature-pill">
            <i class="fa-solid fa-database"></i>
            <span>IndexedDB Local Storage</span>
          </div>
        </div>
      </div>
    {:else}
      <!-- Manager View Header -->
      <div class="manager-view-header">
        <div class="manager-header-left">
          <div class="manager-icon-badge">
            <i class="fa-solid fa-book-bookmark"></i>
          </div>
          <div>
            <h2 class="manager-title">Lexicon Manager</h2>
            <p class="manager-subtitle">
              Manage linguistic dictionaries, wordlists, and controlled
              vocabularies.
            </p>
          </div>
        </div>

        <button
          type="button"
          class="btn-hero-primary"
          onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
          title="Create a new lexicon"
        >
          <i class="fa-solid fa-plus"></i>
          <span>New Lexicon</span>
        </button>
      </div>

      <!-- Manager Toolbar: Search & Counters -->
      <div class="manager-toolbar">
        <div class="manager-search-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="manager-search-input"
            placeholder="Search lexicons by title, language variety, or description..."
            bind:value={managerSearchQuery}
          />
          {#if managerSearchQuery}
            <button
              type="button"
              class="btn-clear-search"
              onclick={() => (managerSearchQuery = '')}
              aria-label="Clear filter"
              title="Clear filter"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          {/if}
        </div>

        <div class="manager-count-badge">
          {#if managerSearchQuery}
            Showing <strong>{filteredLexicons.length}</strong> of {lexiconState
              .lexicons.length} lexicons
          {:else}
            Total: <strong>{lexiconState.lexicons.length}</strong>
            lexicon{lexiconState.lexicons.length === 1 ? '' : 's'}
          {/if}
        </div>
      </div>

      <!-- Lexicons Grid / Cards -->
      {#if filteredLexicons.length === 0}
        <div class="no-matches-card">
          <i class="fa-solid fa-filter-circle-xmark empty-icon"></i>
          <h4>No matching lexicons found</h4>
          <p>No lexicons match "{managerSearchQuery}".</p>
          <button
            type="button"
            class="btn-secondary"
            onclick={() => (managerSearchQuery = '')}
          >
            Clear Search Filter
          </button>
        </div>
      {:else}
        <div class="lexicons-grid">
          {#each filteredLexicons as lex (lex.id)}
            {@const entryCount = lex.entries?.length || 0}
            {@const fieldCount = lex.fields?.length || 0}
            {@const updateTime = lex.updatedAt || lex.createdAt}

            <div
              class="lexicon-card"
              role="button"
              tabindex="0"
              onclick={() => router.navigate(`/lexicon/${lex.id}`)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.navigate(`/lexicon/${lex.id}`);
                }
              }}
              title="Open lexicon {lex.title}"
            >
              <div class="card-top-row">
                <div class="card-title-group">
                  <h3 class="card-lex-title">{lex.title}</h3>
                  {#if lex.languageVariety}
                    <span class="card-lang-tag">
                      <i class="fa-solid fa-language"></i>
                      {lex.languageVariety}
                    </span>
                  {/if}
                </div>

                <div class="card-top-actions">
                  <button
                    type="button"
                    class="btn-card-icon"
                    onclick={(e) => handleExportTsv(e, lex)}
                    title="Export {lex.title} to TSV"
                  >
                    <i class="fa-solid fa-file-arrow-down"></i>
                  </button>

                  <button
                    type="button"
                    class="btn-card-icon text-danger"
                    onclick={(e) => handleDeleteLexicon(e, lex)}
                    title="Delete lexicon {lex.title}"
                  >
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>

              {#if lex.description}
                <p class="card-description">{lex.description}</p>
              {:else}
                <p class="card-description text-placeholder">
                  No description provided.
                </p>
              {/if}

              <div class="card-metrics-row">
                <span class="metric-pill">
                  <i class="fa-solid fa-spell-check"></i>
                  <strong>{entryCount}</strong>
                  {entryCount === 1 ? 'entry' : 'entries'}
                </span>

                <span class="metric-pill">
                  <i class="fa-solid fa-table-columns"></i>
                  <strong>{fieldCount}</strong>
                  {fieldCount === 1 ? 'field' : 'fields'}
                </span>

                {#if updateTime}
                  <span
                    class="metric-pill update-time-pill"
                    title={formatFullDateTime(updateTime)}
                  >
                    <i class="fa-regular fa-clock"></i>
                    {formatEntryDateTime(updateTime)}
                  </span>
                {/if}
              </div>

              <div class="card-footer-action">
                <span class="btn-open-link">
                  <span>Open Lexicon</span>
                  <i class="fa-solid fa-arrow-right"></i>
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
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
  .manager-view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .manager-header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .manager-icon-badge {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
    flex-shrink: 0;
  }

  .manager-title {
    margin: 0 0 4px;
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    letter-spacing: -0.01em;
  }

  .manager-subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted, #64748b);
  }

  /* Manager Toolbar */
  .manager-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .manager-search-wrap {
    position: relative;
    flex: 1;
    min-width: 260px;
    max-width: 520px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
    pointer-events: none;
  }

  .manager-search-input {
    width: 100%;
    padding: 9px 34px 9px 36px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    font-size: 0.85rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .manager-search-input:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .btn-clear-search {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .btn-clear-search:hover {
    color: var(--text-heading, #0f172a);
  }

  .manager-count-badge {
    font-size: 0.825rem;
    color: var(--text-muted, #64748b);
  }

  /* Lexicons Grid & Cards */
  .lexicons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
  }

  .lexicon-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.18s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    position: relative;
    user-select: none;
  }

  .lexicon-card:hover {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 8px 22px rgba(2, 132, 199, 0.12);
    transform: translateY(-2px);
  }

  .card-top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .card-title-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .card-lex-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    word-break: break-word;
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

  .card-top-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-card-icon {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.12s ease;
  }

  .btn-card-icon:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .btn-card-icon.text-danger:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .card-description {
    font-size: 0.825rem;
    color: var(--text-muted, #64748b);
    line-height: 1.45;
    margin: 0 0 14px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-description.text-placeholder {
    font-style: italic;
    opacity: 0.65;
  }

  .card-metrics-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    margin-bottom: 12px;
  }

  .metric-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    padding: 3px 8px;
    border-radius: 6px;
    color: var(--text-muted, #64748b);
  }

  .metric-pill strong {
    color: var(--text-heading, #0f172a);
  }

  .update-time-pill {
    font-variant-numeric: tabular-nums;
  }

  .card-footer-action {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--border-color, #f1f5f9);
    padding-top: 10px;
    margin-top: 2px;
  }

  .btn-open-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
  }

  .lexicon-card:hover .btn-open-link {
    color: #0369a1;
  }

  .lexicon-card:hover .btn-open-link i {
    transform: translateX(4px);
    transition: transform 0.15s ease;
  }

  .no-matches-card {
    padding: 48px 24px;
    text-align: center;
    background: var(--bg-card, #ffffff);
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 12px;
    color: var(--text-muted, #64748b);
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 8px;
    opacity: 0.4;
  }

  .no-matches-card h4 {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .no-matches-card p {
    margin: 0 0 16px;
    font-size: 0.85rem;
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

  /* Hero Styles */
  .zero-state-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 60px 24px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 16px;
    max-width: 800px;
    margin: 20px auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  }

  .hero-icon-badge {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin-bottom: 20px;
    box-shadow: 0 8px 16px rgba(2, 132, 199, 0.25);
  }

  .hero-title {
    font-size: 1.85rem;
    font-weight: 800;
    margin: 0 0 12px;
    color: var(--text-heading, #0f172a);
    letter-spacing: -0.02em;
  }

  .hero-desc {
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-muted, #64748b);
    max-width: 620px;
    margin: 0 0 28px;
  }

  .not-found-desc code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    color: #0f172a;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 36px;
  }

  .btn-hero-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
    transition: all 0.15s ease;
  }

  .btn-hero-primary:hover {
    background: #0369a1;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(2, 132, 199, 0.35);
  }

  .hero-feature-pills {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .feature-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.825rem;
    font-weight: 500;
    color: var(--text-muted, #64748b);
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    padding: 6px 12px;
    border-radius: 20px;
  }

  .feature-pill i {
    color: var(--primary-color, #0284c7);
  }

  /* Dark mode overrides */
  :global([data-theme='dark']) .manager-view-header,
  :global([data-theme='dark']) .lexicon-card,
  :global([data-theme='dark']) .lexicon-header-card,
  :global([data-theme='dark']) .btn-back-to-manager,
  :global([data-theme='dark']) .zero-state-hero,
  :global([data-theme='dark']) .lexicon-not-found-card,
  :global([data-theme='dark']) .no-matches-card {
    background: var(--bg-card, #1e293b);
    border-color: var(--border-color, #334155);
  }

  :global([data-theme='dark']) .card-lang-tag,
  :global([data-theme='dark']) .lang-variety-tag {
    background: rgba(2, 132, 199, 0.15);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.25);
  }

  :global([data-theme='dark']) .metric-pill {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global([data-theme='dark']) .not-found-desc code {
    background: #0f172a;
    color: #38bdf8;
  }
</style>
