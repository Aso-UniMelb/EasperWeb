<script>
  import { appState } from '../../state/appState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { hunspellState } from '../../state/hunspellState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { extractWordsFromText } from '../../utils/hunspellDictBuilder.js';

  let { onClose = () => {} } = $props();

  let searchQuery = $state('');
  let isAddingAll = $state(false);
  let addingWord = $state(null);

  const currentLexiconId = $derived(projectState.activeProject?.lexiconId || '');
  const activeLexicon = $derived(
    lexiconState.lexicons.find((l) => l.id === currentLexiconId) || null,
  );

  // Scan all segments in project for spelling errors
  const scanResults = $derived.by(() => {
    if (!hunspellState.isReady || !currentLexiconId) {
      return { totalMisspelledCount: 0, uniqueWords: [], affectedSegmentIndices: new Set() };
    }

    const map = new Map();
    const segments = transcriptState.segments || [];
    const affectedSegmentIndices = new Set();
    let totalMisspelledCount = 0;

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      if (!seg || !seg.text) continue;

      const words = extractWordsFromText(seg.text);
      for (const w of words) {
        if (!hunspellState.spell(w)) {
          totalMisspelledCount++;
          affectedSegmentIndices.add(idx);
          const key = w.toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              word: w,
              count: 1,
              segmentIndices: [idx],
              suggestions: hunspellState.suggest(w).slice(0, 4),
            });
          } else {
            const item = map.get(key);
            item.count++;
            if (!item.segmentIndices.includes(idx)) {
              item.segmentIndices.push(idx);
            }
          }
        }
      }
    }

    const uniqueWords = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return { totalMisspelledCount, uniqueWords, affectedSegmentIndices };
  });

  const filteredWords = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scanResults.uniqueWords;
    return scanResults.uniqueWords.filter((item) =>
      item.word.toLowerCase().includes(q),
    );
  });

  async function handleLexiconChange(e) {
    const newId = e.target.value;
    if (projectState.activeProject) {
      await projectState.setProjectLexicon(projectState.activeProject.id, newId || null);
    }
  }

  async function handleReindex() {
    if (activeLexicon) {
      await hunspellState.rebuildFromLexicon(activeLexicon);
      appState.statusMessage = 'Hunspell dictionary re-indexed.';
    }
  }

  async function handleAddWord(word) {
    if (!currentLexiconId) return;
    addingWord = word;
    try {
      await lexiconState.addHeadwordToLexicon(currentLexiconId, word);
    } catch (err) {
      console.error('Failed to add word to lexicon:', err);
    } finally {
      addingWord = null;
    }
  }

  async function handleAddAllWords() {
    if (!currentLexiconId || isAddingAll) return;
    isAddingAll = true;
    try {
      const words = scanResults.uniqueWords.map((u) => u.word);
      for (const w of words) {
        await lexiconState.addHeadwordToLexicon(currentLexiconId, w);
      }
      appState.statusMessage = `Added ${words.length} headwords to ${activeLexicon?.name || 'lexicon'}.`;
    } catch (err) {
      console.error('Failed to add all words:', err);
    } finally {
      isAddingAll = false;
    }
  }

  function handleJumpToSegment(segmentIndex) {
    transcriptState.activeSegmentIndex = segmentIndex;
    const cardEl = document.getElementById(`segment-card-${segmentIndex}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardEl.classList.add('flash-highlight');
      setTimeout(() => cardEl.classList.remove('flash-highlight'), 1200);
    }
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function handleReplaceSuggestion(segIndex, oldWord, newWord) {
    const seg = transcriptState.segments?.[segIndex];
    if (!seg || !seg.text) return;
    const escaped = escapeRegExp(oldWord);
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})([^\\p{L}\\p{N}]|$)`, 'gu');
    const newText = seg.text.replace(regex, `$1${newWord}$3`);
    transcriptState.updateSegmentText(segIndex, newText);
    projectState.saveCurrentProjectDebounced();
  }
</script>

<div class="inline-settings-panel spellcheck-panel">
  <!-- Header Bar -->
  <div class="panel-header">
    <div class="panel-title-area">
      <div class="panel-icon-wrap icon-spellcheck">
        <i class="fa-solid fa-spell-check"></i>
      </div>
      <div>
        <h4 class="panel-title">Spellchecking &amp; Lexicon</h4>
        <span class="panel-subtitle">Hunspell Engine &bull; Dynamic Headwords</span>
      </div>
    </div>

    <div class="panel-actions">
      <button
        type="button"
        class="panel-tool-btn"
        onclick={() => (lexiconState.isModalOpen = true)}
        title="Open Lexicon Manager in full dialog"
      >
        <i class="fa-solid fa-book-bookmark"></i>
        <span>Manage Lexicons</span>
      </button>

      <button
        type="button"
        class="panel-tool-btn {appState.showHelpText ? 'active' : ''}"
        onclick={() => appState.toggleHelpText()}
        title={appState.showHelpText ? 'Hide help tips' : 'Show help tips'}
        aria-pressed={appState.showHelpText}
      >
        <i class="fa-regular fa-circle-question"></i>
        <span>Help</span>
      </button>

      <button
        type="button"
        class="panel-close-btn"
        onclick={onClose}
        title="Close spellcheck drawer"
        aria-label="Close spellcheck drawer"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </div>

  {#if appState.showHelpText}
    <div class="panel-help-banner">
      <i class="fa-solid fa-circle-info"></i>
      <span>
        Select an Easper lexicon to automatically validate spelling against its <strong>Headword</strong> column.
        Flagged words can be clicked to adopt suggestions or added to your lexicon with a single click.
      </span>
    </div>
  {/if}

  <!-- Quick Lexicon Switcher Bar -->
  <div class="lexicon-control-bar">
    <div class="lexicon-select-group">
      <label for="drawer-lexicon-select" class="control-label">
        <i class="fa-solid fa-book"></i> Active Project Lexicon:
      </label>
      <select
        id="drawer-lexicon-select"
        class="lexicon-picker-select"
        value={currentLexiconId}
        onchange={handleLexiconChange}
      >
        <option value="">None (Spellchecking Disabled)</option>
        {#each lexiconState.lexicons as lex (lex.id)}
          <option value={lex.id}>
            {lex.name || 'Untitled Lexicon'} ({lex.entries?.length || 0} entries)
          </option>
        {/each}
      </select>
    </div>

    {#if activeLexicon}
      <div class="lexicon-status-pills">
        <span class="status-pill status-ready" title="Dictionary loaded">
          <i class="fa-solid fa-circle-check"></i>
          <span>{hunspellState.wordCount} headwords indexed</span>
        </span>

        {#if hunspellState.isLoading}
          <span class="status-pill status-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Rebuilding...</span>
          </span>
        {/if}

        <button
          type="button"
          class="btn-reindex"
          onclick={handleReindex}
          disabled={hunspellState.isLoading}
          title="Re-read headwords and compile dictionary"
        >
          <i class="fa-solid fa-arrows-rotate {hunspellState.isLoading ? 'fa-spin' : ''}"></i>
          <span>Re-index</span>
        </button>
      </div>
    {:else}
      <div class="lexicon-status-pills">
        <span class="status-pill status-off">
          <i class="fa-solid fa-power-off"></i>
          <span>Spellcheck Inactive</span>
        </span>
      </div>
    {/if}
  </div>

  <!-- Main Body Content -->
  <div class="panel-body">
    {#if !currentLexiconId}
      <!-- Disabled state callout -->
      <div class="empty-spellcheck-state">
        <div class="empty-icon-wrap">
          <i class="fa-solid fa-spell-check"></i>
        </div>
        <h5>Spellchecking is not active for this project</h5>
        <p>
          Select an existing lexicon from the dropdown above or create one in the Lexicon Manager
          to begin checking transcript dialogue.
        </p>
        <button
          type="button"
          class="btn-enable-lexicon"
          onclick={() => {
            if (lexiconState.lexicons.length > 0) {
              projectState.setProjectLexicon(
                projectState.activeProject.id,
                lexiconState.lexicons[0].id,
              );
            } else {
              lexiconState.isModalOpen = true;
            }
          }}
        >
          <i class="fa-solid fa-bolt"></i>
          <span>{lexiconState.lexicons.length > 0 ? `Use "${lexiconState.lexicons[0].name}"` : 'Open Lexicon Manager'}</span>
        </button>
      </div>
    {:else}
      <!-- Active Spellcheck Summary Cards -->
      <div class="spellcheck-summary-grid">
        <div class="summary-metric-card {scanResults.totalMisspelledCount > 0 ? 'metric-flagged' : 'metric-clean'}">
          <div class="metric-icon">
            <i class="fa-solid {scanResults.totalMisspelledCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
          </div>
          <div class="metric-info">
            <span class="metric-value">{scanResults.uniqueWords.length}</span>
            <span class="metric-label">Unrecognized Words</span>
          </div>
        </div>

        <div class="summary-metric-card">
          <div class="metric-icon">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <div class="metric-info">
            <span class="metric-value">{scanResults.totalMisspelledCount}</span>
            <span class="metric-label">Total Occurrences</span>
          </div>
        </div>

        <div class="summary-metric-card">
          <div class="metric-icon">
            <i class="fa-solid fa-comments"></i>
          </div>
          <div class="metric-info">
            <span class="metric-value">{scanResults.affectedSegmentIndices.size} / {transcriptState.segments?.length || 0}</span>
            <span class="metric-label">Segments Flagged</span>
          </div>
        </div>

        <div class="summary-metric-card">
          <div class="metric-icon">
            <i class="fa-solid fa-book-open"></i>
          </div>
          <div class="metric-info">
            <span class="metric-value">{hunspellState.wordCount}</span>
            <span class="metric-label">Lexicon Headwords</span>
          </div>
        </div>
      </div>

      <!-- Unrecognized Words Table / Actions -->
      {#if scanResults.uniqueWords.length === 0}
        <div class="all-clean-banner">
          <i class="fa-solid fa-circle-check"></i>
          <div>
            <strong>All words recognized!</strong>
            <span>Every word in your transcription segments matches the current lexicon.</span>
          </div>
        </div>
      {:else}
        <div class="unrecognized-section-header">
          <div class="search-filter-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder="Filter unrecognized words..."
              bind:value={searchQuery}
              class="search-input"
            />
            {#if searchQuery}
              <button
                type="button"
                class="btn-clear-search"
                onclick={() => (searchQuery = '')}
                title="Clear filter"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            {/if}
          </div>

          <div class="section-batch-actions">
            <span class="count-tag">
              Showing {filteredWords.length} of {scanResults.uniqueWords.length} words
            </span>
            <button
              type="button"
              class="btn-add-all"
              onclick={handleAddAllWords}
              disabled={isAddingAll}
              title="Add all unrecognized words to the active lexicon as headwords"
            >
              <i class="fa-solid fa-plus-circle {isAddingAll ? 'fa-spin' : ''}"></i>
              <span>{isAddingAll ? 'Adding Words...' : `Add All (${scanResults.uniqueWords.length}) to Lexicon`}</span>
            </button>
          </div>
        </div>

        <div class="unrecognized-table-wrap">
          <table class="unrecognized-table">
            <thead>
              <tr>
                <th style="width: 22%;">Unrecognized Word</th>
                <th style="width: 10%; text-align: center;">Count</th>
                <th style="width: 38%;">Hunspell Suggestions</th>
                <th style="width: 30%; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredWords as item (item.word)}
                <tr>
                  <td>
                    <span class="flagged-word-pill">
                      <i class="fa-solid fa-spell-check flagged-dot"></i>
                      <strong class="flagged-text">{item.word}</strong>
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="count-badge">{item.count}</span>
                  </td>
                  <td>
                    {#if item.suggestions.length > 0}
                      <div class="suggestions-chips">
                        {#each item.suggestions as sugg}
                          <button
                            type="button"
                            class="suggestion-chip"
                            onclick={() => handleReplaceSuggestion(item.segmentIndices[0], item.word, sugg)}
                            title="Replace in first flagged segment (#{item.segmentIndices[0] + 1}) with '{sugg}'"
                          >
                            <span>{sugg}</span>
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <span class="no-suggestions-hint">No suggestions</span>
                    {/if}
                  </td>
                  <td style="text-align: right;">
                    <div class="action-buttons-cell">
                      <button
                        type="button"
                        class="btn-table-action btn-jump"
                        onclick={() => handleJumpToSegment(item.segmentIndices[0])}
                        title="Jump to segment #{item.segmentIndices[0] + 1}"
                      >
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        <span>Seg #{item.segmentIndices[0] + 1}</span>
                      </button>

                      <button
                        type="button"
                        class="btn-table-action btn-add-word"
                        onclick={() => handleAddWord(item.word)}
                        disabled={addingWord === item.word}
                        title="Add '{item.word}' to {activeLexicon?.name || 'lexicon'}"
                      >
                        <i class="fa-solid fa-plus {addingWord === item.word ? 'fa-spin' : ''}"></i>
                        <span>+ Add</span>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .inline-settings-panel {
    background: var(--bg-card, #ffffff);
    border-bottom: 2px solid var(--border-color, #e2e8f0);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    z-index: 20;
    transition: all 0.2s ease;
  }

  :global([data-theme='dark']) .inline-settings-panel {
    background: #0f172a;
    border-bottom-color: #334155;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: rgba(0, 0, 0, 0.015);
  }

  :global([data-theme='dark']) .panel-header {
    border-bottom-color: #1e293b;
    background: rgba(255, 255, 255, 0.01);
  }

  .panel-title-area {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .panel-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 1rem;
  }

  .icon-spellcheck {
    background: rgba(234, 88, 12, 0.12);
    color: #ea580c;
  }

  :global([data-theme='dark']) .icon-spellcheck {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  .panel-title {
    font-size: 0.92rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-heading, #0f172a);
    line-height: 1.2;
  }

  .panel-subtitle {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: var(--bg-input, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme='dark']) .panel-tool-btn {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
  }

  .panel-tool-btn:hover {
    color: #ea580c;
    border-color: #ea580c;
  }

  .panel-tool-btn.active {
    background: rgba(234, 88, 12, 0.1);
    color: #ea580c;
    border-color: #ea580c;
  }

  .panel-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.95rem;
  }

  .panel-close-btn:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .panel-help-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 18px;
    font-size: 0.78rem;
    color: #0369a1;
    background: #f0f9ff;
    border-bottom: 1px solid #bae6fd;
  }

  :global([data-theme='dark']) .panel-help-banner {
    color: #7dd3fc;
    background: #082f49;
    border-bottom-color: #0c4a6e;
  }

  /* Lexicon Control Bar */
  .lexicon-control-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 18px;
    background: var(--bg-app, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .lexicon-control-bar {
    background: #111827;
    border-bottom-color: #1e293b;
  }

  .lexicon-select-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .control-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .lexicon-picker-select {
    padding: 6px 12px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    min-width: 240px;
    cursor: pointer;
  }

  :global([data-theme='dark']) .lexicon-picker-select {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .lexicon-status-pills {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 20px;
  }

  .status-ready {
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
  }

  :global([data-theme='dark']) .status-ready {
    background: rgba(5, 150, 105, 0.2);
    color: #34d399;
    border-color: #065f46;
  }

  .status-loading {
    background: #fffbeb;
    color: #d97706;
    border: 1px solid #fde68a;
  }

  .status-off {
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #cbd5e1;
  }

  :global([data-theme='dark']) .status-off {
    background: #1e293b;
    color: #94a3b8;
    border-color: #334155;
  }

  .btn-reindex {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  :global([data-theme='dark']) .btn-reindex {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .btn-reindex:hover:not(:disabled) {
    border-color: #ea580c;
    color: #ea580c;
  }

  /* Panel Body */
  .panel-body {
    padding: 16px 18px;
    max-height: 480px;
    overflow-y: auto;
  }

  /* Empty State */
  .empty-spellcheck-state {
    text-align: center;
    padding: 30px 20px;
    max-width: 480px;
    margin: 0 auto;
  }

  .empty-icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #ffedd5;
    color: #ea580c;
    font-size: 1.5rem;
    margin-bottom: 12px;
  }

  :global([data-theme='dark']) .empty-icon-wrap {
    background: rgba(234, 88, 12, 0.2);
    color: #fb923c;
  }

  .empty-spellcheck-state h5 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 6px 0;
    color: var(--text-heading, #0f172a);
  }

  .empty-spellcheck-state p {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    margin: 0 0 16px 0;
    line-height: 1.45;
  }

  .btn-enable-lexicon {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 18px;
    font-size: 0.84rem;
    font-weight: 700;
    color: #ffffff;
    background: #ea580c;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(234, 88, 12, 0.3);
    transition: all 0.15s ease;
  }

  .btn-enable-lexicon:hover {
    background: #c2410c;
    transform: translateY(-1px);
  }

  /* Metric Cards */
  .spellcheck-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .summary-metric-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
  }

  :global([data-theme='dark']) .summary-metric-card {
    background: #1e293b;
    border-color: #334155;
  }

  .metric-flagged {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  :global([data-theme='dark']) .metric-flagged {
    background: rgba(239, 68, 68, 0.15);
    border-color: #7f1d1d;
  }

  .metric-flagged .metric-icon {
    color: #dc2626;
  }

  .metric-clean {
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  :global([data-theme='dark']) .metric-clean {
    background: rgba(5, 150, 105, 0.15);
    border-color: #065f46;
  }

  .metric-clean .metric-icon {
    color: #059669;
  }

  .metric-icon {
    font-size: 1.3rem;
    color: #64748b;
  }

  .metric-info {
    display: flex;
    flex-direction: column;
  }

  .metric-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    line-height: 1.15;
  }

  .metric-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
  }

  /* All Clean Banner */
  .all-clean-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 8px;
    color: #065f46;
    font-size: 0.85rem;
  }

  :global([data-theme='dark']) .all-clean-banner {
    background: rgba(5, 150, 105, 0.15);
    border-color: #065f46;
    color: #6ee7b7;
  }

  .all-clean-banner i {
    font-size: 1.4rem;
    color: #059669;
  }

  /* Unrecognized Section Header */
  .unrecognized-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 10px;
  }

  .search-filter-box {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 240px;
  }

  .search-filter-box i.fa-magnifying-glass {
    position: absolute;
    left: 10px;
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
  }

  .search-input {
    width: 100%;
    padding: 6px 30px 6px 30px;
    font-size: 0.8rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .search-input {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .btn-clear-search {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .section-batch-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .count-tag {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .btn-add-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #ffffff;
    background: #ea580c;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-add-all:hover:not(:disabled) {
    background: #c2410c;
  }

  .btn-add-all:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Table styling */
  .unrecognized-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .unrecognized-table-wrap {
    background: #0f172a;
    border-color: #334155;
  }

  .unrecognized-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .unrecognized-table th {
    padding: 8px 12px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #64748b);
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .unrecognized-table th {
    background: rgba(255, 255, 255, 0.02);
    border-bottom-color: #334155;
  }

  .unrecognized-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    vertical-align: middle;
  }

  :global([data-theme='dark']) .unrecognized-table td {
    border-bottom-color: #1e293b;
  }

  .unrecognized-table tr:last-child td {
    border-bottom: none;
  }

  .flagged-word-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .flagged-dot {
    color: #dc2626;
    font-size: 0.78rem;
  }

  .flagged-text {
    color: #dc2626;
    text-decoration: underline wavy #f87171;
    font-size: 0.84rem;
  }

  :global([data-theme='dark']) .flagged-text {
    color: #f87171;
  }

  .count-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 12px;
    background: #f1f5f9;
    color: #475569;
    font-weight: 700;
    font-size: 0.72rem;
  }

  :global([data-theme='dark']) .count-badge {
    background: #334155;
    color: #cbd5e1;
  }

  .suggestions-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .suggestion-chip {
    padding: 2px 8px;
    font-size: 0.74rem;
    font-weight: 600;
    color: #0369a1;
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  :global([data-theme='dark']) .suggestion-chip {
    background: #082f49;
    border-color: #0284c7;
    color: #38bdf8;
  }

  .suggestion-chip:hover {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }

  .no-suggestions-hint {
    font-size: 0.72rem;
    font-style: italic;
    color: var(--text-muted, #94a3b8);
  }

  .action-buttons-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-table-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
    border: 1px solid transparent;
  }

  .btn-jump {
    background: var(--bg-card, #ffffff);
    color: var(--text-muted, #64748b);
    border-color: var(--border-color, #cbd5e1);
  }

  :global([data-theme='dark']) .btn-jump {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
  }

  .btn-jump:hover {
    color: var(--text-heading, #0f172a);
    border-color: #94a3b8;
  }

  .btn-add-word {
    background: #fff7ed;
    color: #ea580c;
    border-color: #fed7aa;
  }

  :global([data-theme='dark']) .btn-add-word {
    background: rgba(234, 88, 12, 0.15);
    color: #fb923c;
    border-color: #7c2d12;
  }

  .btn-add-word:hover:not(:disabled) {
    background: #ea580c;
    color: #ffffff;
    border-color: #ea580c;
  }

  .btn-add-word:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Flash highlight animation for jumped segment */
  :global(.flash-highlight) {
    outline: 2px solid #ea580c !important;
    box-shadow: 0 0 12px rgba(234, 88, 12, 0.4) !important;
    transition: all 0.3s ease;
  }
</style>
