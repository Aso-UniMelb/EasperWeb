<script>
  import { lexiconState } from '../../state/lexiconState.svelte.js';

  let searchQuery = $state('');

  let filteredLexicons = $derived.by(() => {
    const list = lexiconState.lexicons || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        (l.title && l.title.toLowerCase().includes(q)) ||
        (l.languageVariety && l.languageVariety.toLowerCase().includes(q)),
    );
  });

  async function handleDelete(e, lex) {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Are you sure you want to delete lexicon "${lex.title}" and its ${lex.entries?.length || 0} entries? This cannot be undone.`,
    );
    if (!confirmed) return;
    await lexiconState.deleteLexicon(lex.id);
  }
</script>

<aside class="lexicon-sidebar">
  <div class="sidebar-header">
    <div class="sidebar-title-wrap">
      <i class="fa-solid fa-book-bookmark sidebar-title-icon"></i>
      <h3 class="sidebar-title">Lexicons</h3>
      <span class="lexicons-count-bubble">{lexiconState.lexicons.length}</span>
    </div>

    <button
      type="button"
      class="btn-new-lexicon"
      onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
      title="Create a new lexicon"
    >
      <i class="fa-solid fa-plus"></i>
      <span>New</span>
    </button>
  </div>

  {#if lexiconState.lexicons.length > 2}
    <div class="sidebar-search">
      <i class="fa-solid fa-magnifying-glass search-icon"></i>
      <input
        type="text"
        class="sidebar-search-input"
        placeholder="Filter lexicons..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          type="button"
          class="btn-clear"
          onclick={() => (searchQuery = '')}
          aria-label="Clear filter"
          title="Clear filter"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      {/if}
    </div>
  {/if}

  <div class="lexicons-list">
    {#if lexiconState.lexicons.length === 0}
      <div class="empty-sidebar">
        <p>No lexicons found.</p>
        <button
          type="button"
          class="btn-create-first"
          onclick={() => (lexiconState.isNewLexiconModalOpen = true)}
        >
          <i class="fa-solid fa-plus"></i>
          <span>Create Lexicon</span>
        </button>
      </div>
    {:else if filteredLexicons.length === 0}
      <div class="empty-sidebar">
        <p>No matches for "{searchQuery}".</p>
      </div>
    {:else}
      {#each filteredLexicons as lex (lex.id)}
        {@const isActive = lexiconState.activeLexiconId === lex.id}
        {@const entryCount = lex.entries?.length || 0}
        {@const fieldCount = lex.fields?.length || 0}

        <div
          class="lexicon-nav-item {isActive ? 'active' : ''}"
          onclick={() => lexiconState.selectLexicon(lex.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') lexiconState.selectLexicon(lex.id);
          }}
        >
          <div class="item-main">
            <span class="lex-item-title">{lex.title}</span>
            {#if lex.languageVariety}
              <span class="lex-lang-badge">
                <i class="fa-solid fa-language"></i> {lex.languageVariety}
              </span>
            {/if}
          </div>

          <div class="item-meta">
            <div class="meta-badges">
              <span class="meta-tag">{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
              <span class="meta-dot">&bull;</span>
              <span class="meta-tag">{fieldCount} {fieldCount === 1 ? 'field' : 'fields'}</span>
            </div>

            <button
              type="button"
              class="btn-delete-lex"
              onclick={(e) => handleDelete(e, lex)}
              title="Delete lexicon"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .lexicon-sidebar {
    width: 300px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: fit-content;
    max-height: calc(100vh - 120px);
  }

  @media (max-width: 900px) {
    .lexicon-sidebar {
      width: 100%;
      max-height: none;
    }
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  .sidebar-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-title-icon {
    color: var(--primary-color, #0284c7);
    font-size: 1.05rem;
  }

  .sidebar-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .lexicons-count-bubble {
    font-size: 0.725rem;
    background: rgba(2, 132, 199, 0.1);
    color: var(--primary-color, #0284c7);
    padding: 2px 7px;
    border-radius: 12px;
    font-weight: 600;
  }

  .btn-new-lexicon {
    padding: 5px 10px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: opacity 0.15s ease;
  }

  .btn-new-lexicon:hover {
    opacity: 0.9;
  }

  .sidebar-search {
    position: relative;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
  }

  .sidebar-search .search-icon {
    position: absolute;
    left: 20px;
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .sidebar-search-input {
    width: 100%;
    padding: 5px 24px 5px 26px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.8rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
  }

  .sidebar-search .btn-clear {
    position: absolute;
    right: 18px;
    background: transparent;
    border: none;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px;
  }

  .lexicons-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 4px;
  }

  .lexicon-nav-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid transparent;
    background: transparent;
    transition: all 0.15s ease;
  }

  .lexicon-nav-item:hover {
    background: var(--bg-hover, #f8fafc);
  }

  .lexicon-nav-item.active {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.3);
  }

  .item-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .lex-item-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lex-lang-badge {
    font-size: 0.7rem;
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-base, #475569);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .item-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .meta-badges {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .meta-tag {
    font-size: 0.725rem;
    color: var(--text-muted, #64748b);
  }

  .meta-dot {
    font-size: 0.65rem;
    color: var(--border-dashed, #cbd5e1);
  }

  .btn-delete-lex {
    background: transparent;
    border: none;
    color: var(--text-muted, #64748b);
    padding: 3px 5px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    opacity: 0.6;
    transition: all 0.12s ease;
  }

  .lexicon-nav-item:hover .btn-delete-lex {
    opacity: 1;
  }

  .btn-delete-lex:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .empty-sidebar {
    padding: 24px 16px;
    text-align: center;
    color: var(--text-muted, #64748b);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .btn-create-first {
    padding: 6px 14px;
    border: 1px dashed var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.05);
    color: var(--primary-color, #0284c7);
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-create-first:hover {
    background: rgba(2, 132, 199, 0.1);
  }
</style>

