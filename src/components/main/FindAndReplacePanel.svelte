<script>
  import { appState } from '../../state/appState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { cleanSpeechText } from '../../utils/formatters.js';
  import {
    findAllMatches,
    replaceSingleMatch,
    replaceAllMatches,
  } from '../../utils/findAndReplace.js';

  let { onClose = () => {} } = $props();

  let findText = $state('');
  let replaceText = $state('');
  let targetTier = $state('main'); // 'main' | specific sub-tier id | 'all'
  let matchCase = $state(false);
  let wholeWord = $state(false);

  let activeMatchIndex = $state(-1);
  let feedbackMessage = $state('');
  let feedbackType = $state('info'); // 'info' | 'success' | 'warning' | 'error'
  let lastReplaceStats = $state(null);

  const mainTierTitle = $derived(
    projectState.activeProject?.mainTierTitle || 'Main Transcription',
  );

  const sentenceSubTiers = $derived(
    (projectState.activeProject?.subTiers || []).filter(
      (t) => t && t.type !== 'word' && t.type !== 'morpheme',
    ),
  );

  const hasSentenceSubTiers = $derived(sentenceSubTiers.length > 0);

  // Derived matching results based on current search criteria and reactive segments
  const searchResults = $derived(
    findAllMatches({
      segments: transcriptState.segments,
      findText,
      targetTier,
      subTiers: projectState.activeProject?.subTiers || [],
      matchCase,
      wholeWord,
      mainTierTitle,
    }),
  );

  const matches = $derived(searchResults.matches);
  const totalMatches = $derived(searchResults.totalMatches);
  const matchingSegmentsCount = $derived(searchResults.matchingSegmentsCount);

  // Keep activeMatchIndex in bounds when matches array changes
  $effect(() => {
    if (matches.length === 0) {
      activeMatchIndex = -1;
    } else if (activeMatchIndex >= matches.length) {
      activeMatchIndex = matches.length - 1;
    }
  });

  // Clear feedback when user changes the find text
  $effect(() => {
    if (findText) {
      feedbackMessage = '';
      lastReplaceStats = null;
    }
  });

  function focusMatchInDOM(match) {
    if (!match) return;

    transcriptState.selectSegment(match.segmentId, true);

    setTimeout(() => {
      const cardEl = document.getElementById(`segment-item-${match.segmentId}`);
      if (!cardEl) return;

      const textarea =
        cardEl.querySelector(`textarea[data-tier="${match.tierKey}"]`) ||
        cardEl.querySelector('textarea');

      if (textarea) {
        textarea.focus();
        try {
          textarea.setSelectionRange(match.index, match.index + match.length);
        } catch (_) {}
      }
    }, 45);
  }

  function handleFindNext() {
    if (!findText.trim()) {
      feedbackType = 'warning';
      feedbackMessage = 'Please enter text to find.';
      return;
    }

    if (matches.length === 0) {
      feedbackType = 'info';
      feedbackMessage = `No matches found for "${findText}".`;
      return;
    }

    if (activeMatchIndex === -1) {
      // Find the first match that is at or after current selected segment
      const currentSegId = transcriptState.selectedSegmentId;
      const nextIdx = matches.findIndex((m) => m.segmentId >= currentSegId);
      activeMatchIndex = nextIdx >= 0 ? nextIdx : 0;
    } else {
      activeMatchIndex = (activeMatchIndex + 1) % matches.length;
    }

    const currentMatch = matches[activeMatchIndex];
    focusMatchInDOM(currentMatch);
    feedbackMessage = '';
  }

  function handleFindPrev() {
    if (!findText.trim() || matches.length === 0) return;

    if (activeMatchIndex <= 0) {
      activeMatchIndex = matches.length - 1;
    } else {
      activeMatchIndex = activeMatchIndex - 1;
    }

    const currentMatch = matches[activeMatchIndex];
    focusMatchInDOM(currentMatch);
    feedbackMessage = '';
  }

  function handleReplaceThis() {
    if (!findText.trim()) {
      feedbackType = 'warning';
      feedbackMessage = 'Please enter text to find.';
      return;
    }

    if (matches.length === 0) {
      feedbackType = 'info';
      feedbackMessage = 'No matches found to replace.';
      return;
    }

    // If no match is currently highlighted, target the first/next one
    if (activeMatchIndex < 0 || activeMatchIndex >= matches.length) {
      activeMatchIndex = 0;
    }

    const currentMatch = matches[activeMatchIndex];
    if (!currentMatch) return;

    // Push undo before applying change
    transcriptState.pushUndo('Replace text');

    const { updatedSegments, success, newText } = replaceSingleMatch({
      segments: transcriptState.segments,
      match: currentMatch,
      replaceText,
    });

    if (success) {
      transcriptState.segments = updatedSegments;

      if (currentMatch.tierKey === 'main') {
        transcriptState.transcript = transcriptState.segments
          .map((s) => cleanSpeechText(s.text))
          .filter(Boolean)
          .join(' ');
      }

      if (transcriptState.fullResult) {
        transcriptState.fullResult.text = transcriptState.transcript;
        transcriptState.fullResult.segments = transcriptState.segments;
        if (transcriptState.fullResult.output) {
          transcriptState.fullResult.output.text = transcriptState.transcript;
          transcriptState.fullResult.output.segments = transcriptState.segments;
        }
      }

      transcriptState.notifySegmentsChange();
      projectState.saveCurrentProjectDebounced();

      feedbackType = 'success';
      feedbackMessage = 'Replaced 1 occurrence.';

      // Advance to next match if any exist
      setTimeout(() => {
        if (matches.length > 0) {
          // Clamp active index
          if (activeMatchIndex >= matches.length) {
            activeMatchIndex = 0;
          }
          const nextMatch = matches[activeMatchIndex];
          if (nextMatch) {
            focusMatchInDOM(nextMatch);
          }
        } else {
          activeMatchIndex = -1;
        }
      }, 30);
    } else {
      feedbackType = 'warning';
      feedbackMessage = 'Could not replace occurrence (content may have changed).';
    }
  }

  function handleReplaceAll() {
    if (!findText.trim()) {
      feedbackType = 'warning';
      feedbackMessage = 'Please enter text to find.';
      return;
    }

    if (totalMatches === 0) {
      feedbackType = 'info';
      feedbackMessage = 'No matches found to replace.';
      return;
    }

    // Push undo snapshot onto undo stack as requested
    transcriptState.pushUndo('Find & Replace All');

    const result = replaceAllMatches({
      segments: transcriptState.segments,
      findText,
      replaceText,
      targetTier,
      subTiers: projectState.activeProject?.subTiers || [],
      matchCase,
      wholeWord,
      mainTierTitle,
    });

    if (result.totalReplaced > 0) {
      transcriptState.segments = result.updatedSegments;
      transcriptState.transcript = transcriptState.segments
        .map((s) => cleanSpeechText(s.text))
        .filter(Boolean)
        .join(' ');

      if (transcriptState.fullResult) {
        transcriptState.fullResult.text = transcriptState.transcript;
        transcriptState.fullResult.segments = transcriptState.segments;
        if (transcriptState.fullResult.output) {
          transcriptState.fullResult.output.text = transcriptState.transcript;
          transcriptState.fullResult.output.segments = transcriptState.segments;
        }
      }

      transcriptState.notifySegmentsChange();
      projectState.saveCurrentProjectDebounced();

      lastReplaceStats = {
        replaced: result.totalReplaced,
        segments: result.modifiedSegmentsCount,
      };

      feedbackType = 'success';
      feedbackMessage = `Replaced ${result.totalReplaced} occurrence${result.totalReplaced === 1 ? '' : 's'} across ${result.modifiedSegmentsCount} segment${result.modifiedSegmentsCount === 1 ? '' : 's'}. (Undo with Ctrl+Z)`;
      appState.statusMessage = feedbackMessage;
      activeMatchIndex = -1;
    } else {
      feedbackType = 'warning';
      feedbackMessage = 'No matching occurrences found to replace.';
    }
  }

  function handleFindKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handleFindPrev();
      } else {
        handleFindNext();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleReplaceKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) {
        handleReplaceAll();
      } else {
        handleReplaceThis();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<div class="inline-settings-panel find-replace-panel">
  <div class="side-panel-header">
    <div class="side-panel-title">
      <i class="fa-solid fa-arrow-right-arrow-left"></i>
      <span>Find & Replace</span>
    </div>
    <button
      type="button"
      class="panel-close-btn"
      onclick={onClose}
      title="Close find and replace panel (Esc)"
      aria-label="Close"
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <div class="panel-body">
    <div class="find-replace-row">
      <!-- 1. Find What Input -->
      <div class="input-field-group find-input-group">
        <div class="field-label-row">
          <label for="fr-find-input" class="field-label">Find What</label>
          <div class="options-toggles">
            <button
              type="button"
              class="btn-option-toggle {matchCase ? 'active' : ''}"
              onclick={() => (matchCase = !matchCase)}
              title="Match Case ({matchCase ? 'Active' : 'Case-insensitive'})"
              aria-label="Match case"
            >
              Aa
            </button>
            <button
              type="button"
              class="btn-option-toggle {wholeWord ? 'active' : ''}"
              onclick={() => (wholeWord = !wholeWord)}
              title="Match Whole Word ({wholeWord ? 'Active' : 'Partial match allowed'})"
              aria-label="Match whole word"
            >
              \b
            </button>
          </div>
        </div>

        <div class="input-with-clear">
          <i class="fa-solid fa-magnifying-glass input-prefix-icon"></i>
          <input
            id="fr-find-input"
            type="text"
            class="fr-text-input"
            placeholder="Text to find..."
            bind:value={findText}
            onkeydown={handleFindKeyDown}
            autocomplete="off"
            spellcheck="false"
          />
          {#if findText}
            <button
              type="button"
              class="btn-clear-text"
              onclick={() => {
                findText = '';
                activeMatchIndex = -1;
              }}
              title="Clear find text"
              aria-label="Clear"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          {/if}
        </div>
      </div>

      <!-- 2. Replace With Input -->
      <div class="input-field-group replace-input-group">
        <div class="field-label-row">
          <label for="fr-replace-input" class="field-label">Replace With</label>
        </div>

        <div class="input-with-clear">
          <i class="fa-solid fa-arrow-right-arrow-left input-prefix-icon"></i>
          <input
            id="fr-replace-input"
            type="text"
            class="fr-text-input"
            placeholder="Replacement text..."
            bind:value={replaceText}
            onkeydown={handleReplaceKeyDown}
            autocomplete="off"
            spellcheck="false"
          />
          {#if replaceText}
            <button
              type="button"
              class="btn-clear-text"
              onclick={() => (replaceText = '')}
              title="Clear replacement text"
              aria-label="Clear"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          {/if}
        </div>
      </div>

      <!-- 3. Target Tier Selector -->
      <div class="input-field-group tier-select-group">
        <div class="field-label-row">
          <label for="fr-tier-select" class="field-label">Target Tier</label>
        </div>

        <select
          id="fr-tier-select"
          class="fr-select-input"
          bind:value={targetTier}
          title="Select which transcription tier or sentence sub-tier to search"
        >
          <option value="main">
            {mainTierTitle} (Main)
          </option>
          {#if hasSentenceSubTiers}
            {#each sentenceSubTiers as tier (tier.id)}
              <option value={String(tier.id)}>
                {tier.name} (Sub-tier #{tier.id})
              </option>
            {/each}
            <option value="all">
              All Sentence Tiers (Main + Sub-tiers)
            </option>
          {/if}
        </select>
      </div>

      <!-- 4. Stats Badge & Actions Cluster -->
      <div class="action-container">
        <div class="status-box">
          {#if !findText.trim()}
            <span class="status-chip chip-neutral">
              <i class="fa-solid fa-i-cursor"></i>
              <span>Enter search text</span>
            </span>
          {:else if totalMatches === 0}
            <span class="status-chip chip-warning">
              <i class="fa-solid fa-circle-exclamation"></i>
              <span>No matches</span>
            </span>
          {:else}
            <span class="status-chip chip-success">
              <i class="fa-solid fa-check"></i>
              <span>
                {#if activeMatchIndex >= 0}
                  <strong>{activeMatchIndex + 1}</strong> of {totalMatches}
                {:else}
                  <strong>{totalMatches}</strong> match{totalMatches === 1 ? '' : 'es'}
                {/if}
                ({matchingSegmentsCount} seg{matchingSegmentsCount === 1 ? '' : 's'})
              </span>
            </span>
          {/if}
        </div>

        <div class="actions-cluster">
          <button
            type="button"
            class="btn-action-tool btn-find-next"
            onclick={handleFindNext}
            disabled={!findText.trim() || totalMatches === 0}
            title="Find next matching occurrence (Enter)"
          >
            <i class="fa-solid fa-chevron-down"></i>
            <span>Find Next</span>
          </button>

          <button
            type="button"
            class="btn-action-tool btn-replace-this"
            onclick={handleReplaceThis}
            disabled={!findText.trim() || totalMatches === 0}
            title="Replace current occurrence and advance"
          >
            <i class="fa-solid fa-check"></i>
            <span>Replace This</span>
          </button>

          <button
            type="button"
            class="btn-action-tool btn-replace-all"
            onclick={handleReplaceAll}
            disabled={!findText.trim() || totalMatches === 0}
            title="Replace all matching occurrences across chosen tiers (Undo with Ctrl+Z)"
          >
            <i class="fa-solid fa-arrows-rotate"></i>
            <span>Replace All</span>
          </button>

          <button
            type="button"
            class="panel-close-btn"
            onclick={onClose}
            title="Close find and replace panel (Esc)"
            aria-label="Close"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Feedback / Results Notice Bar -->
  {#if feedbackMessage}
    <div class="panel-alert alert-{feedbackType}">
      <div class="alert-content">
        <i
          class="fa-solid {feedbackType === 'success'
            ? 'fa-circle-check'
            : feedbackType === 'error'
              ? 'fa-circle-xmark'
              : feedbackType === 'warning'
                ? 'fa-triangle-exclamation'
                : 'fa-circle-info'}"
        ></i>
        <span>{feedbackMessage}</span>
      </div>

      {#if lastReplaceStats}
        <div class="stats-pills">
          <span class="stats-pill pill-replaced">
            Replaced: {lastReplaceStats.replaced}
          </span>
          <span class="stats-pill pill-segments">
            Segments: {lastReplaceStats.segments}
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .inline-settings-panel.find-replace-panel {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    border-bottom: 2px solid #f59e0b;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    margin: 0;
    animation: slideDown 0.16s ease-out;
    z-index: 10;
  }

  :global([data-theme='dark']) .inline-settings-panel.find-replace-panel {
    background: #0f172a;
    border-color: #334155;
    border-bottom-color: #fbbf24;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-body {
    padding: 8px 12px;
  }

  .find-replace-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .input-field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
  }

  .find-input-group {
    flex: 1.2 1 180px;
    max-width: 260px;
  }

  .replace-input-group {
    flex: 1.2 1 180px;
    max-width: 260px;
  }

  .tier-select-group {
    flex: 1 1 150px;
    max-width: 210px;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 18px;
  }

  .field-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    margin: 0;
    white-space: nowrap;
  }

  .options-toggles {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .btn-option-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    padding: 0;
    font-size: 0.65rem;
    font-weight: 800;
    font-family: inherit;
    border-radius: 3px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-muted, #64748b);
    cursor: pointer;
    line-height: 1;
    transition: all 0.12s ease;
  }

  .btn-option-toggle:hover {
    border-color: #f59e0b;
    color: #d97706;
  }

  .btn-option-toggle.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: #f59e0b;
    color: #d97706;
  }

  :global([data-theme='dark']) .btn-option-toggle {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .btn-option-toggle.active {
    background: rgba(245, 158, 11, 0.25);
    border-color: #fbbf24;
    color: #fbbf24;
  }

  .input-with-clear {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-prefix-icon {
    position: absolute;
    left: 8px;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    pointer-events: none;
  }

  .fr-text-input {
    width: 100%;
    height: 30px;
    padding: 0 24px 0 26px;
    font-size: 0.78rem;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background-color: var(--bg-card, #ffffff);
    color: var(--text-color, #0f172a);
    transition: all 0.14s ease;
  }

  .fr-text-input:focus {
    border-color: #f59e0b;
    outline: none;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
  }

  :global([data-theme='dark']) .fr-text-input {
    background-color: #1e293b;
    border-color: #334155;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .fr-text-input:focus {
    border-color: #fbbf24;
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.25);
  }

  .btn-clear-text {
    position: absolute;
    right: 5px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.68rem;
    padding: 0;
  }

  .btn-clear-text:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.06);
  }

  :global([data-theme='dark']) .btn-clear-text:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .fr-select-input {
    height: 30px;
    padding: 0 8px;
    font-size: 0.76rem;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background-color: var(--bg-card, #ffffff);
    color: var(--text-color, #0f172a);
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .fr-select-input:focus {
    border-color: #f59e0b;
    outline: none;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
  }

  :global([data-theme='dark']) .fr-select-input {
    background-color: #1e293b;
    border-color: #334155;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .fr-select-input:focus {
    border-color: #fbbf24;
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.25);
  }

  .action-container {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .status-box {
    display: flex;
    align-items: center;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.73rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .chip-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.25);
  }

  .chip-success {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .chip-warning {
    background: rgba(245, 158, 11, 0.12);
    color: #d97706;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  :global([data-theme='dark']) .chip-neutral {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.25);
  }

  :global([data-theme='dark']) .chip-success {
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.3);
  }

  :global([data-theme='dark']) .chip-warning {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.3);
  }

  .actions-cluster {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-action-tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-color, #334155);
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
  }

  .btn-action-tool:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
  }

  .btn-action-tool:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-find-next:hover:not(:disabled) {
    background: rgba(2, 132, 199, 0.08);
    border-color: #0284c7;
    color: #0284c7;
  }

  .btn-replace-this:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.08);
    border-color: #10b981;
    color: #059669;
  }

  .btn-replace-all {
    background: #f59e0b;
    border-color: #d97706;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(245, 158, 11, 0.3);
  }

  .btn-replace-all:hover:not(:disabled) {
    background: #d97706;
    border-color: #b45309;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
  }

  :global([data-theme='dark']) .btn-action-tool {
    background: #1e293b;
    border-color: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-find-next:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-replace-this:hover:not(:disabled) {
    background: rgba(52, 211, 153, 0.15);
    border-color: #34d399;
    color: #34d399;
  }

  :global([data-theme='dark']) .btn-replace-all {
    background: #d97706;
    border-color: #f59e0b;
    color: #ffffff;
  }

  :global([data-theme='dark']) .btn-replace-all:hover:not(:disabled) {
    background: #f59e0b;
  }

  .panel-close-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted, #64748b);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.12s ease;
  }

  .panel-close-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .panel-alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 12px;
    font-size: 0.74rem;
    border-top: 1px solid var(--border-color, #cbd5e1);
    flex-wrap: wrap;
  }

  .alert-content {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 500;
  }

  .alert-success {
    background: #ecfdf5;
    color: #065f46;
  }

  .alert-warning {
    background: #fffbeb;
    color: #92400e;
  }

  .alert-info {
    background: #f0f9ff;
    color: #075985;
  }

  :global([data-theme='dark']) .alert-success {
    background: rgba(6, 95, 70, 0.25);
    color: #6ee7b7;
    border-top-color: #065f46;
  }

  :global([data-theme='dark']) .alert-warning {
    background: rgba(146, 64, 14, 0.25);
    color: #fde68a;
    border-top-color: #92400e;
  }

  :global([data-theme='dark']) .alert-info {
    background: rgba(7, 89, 133, 0.25);
    color: #7dd3fc;
    border-top-color: #075985;
  }

  .stats-pills {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stats-pill {
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .pill-replaced {
    background: rgba(16, 185, 129, 0.2);
    color: #047857;
  }

  .pill-segments {
    background: rgba(2, 132, 199, 0.18);
    color: #0369a1;
  }

  :global([data-theme='dark']) .pill-replaced {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  :global([data-theme='dark']) .pill-segments {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  .side-panel-header {
    display: none;
  }

  @media (min-width: 1081px) {
    .inline-settings-panel.find-replace-panel {
      height: 100%;
      border-radius: 10px;
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      border-left: 3px solid #f59e0b;
      animation: none;
      overflow: hidden;
    }

    :global([data-theme='dark']) .inline-settings-panel.find-replace-panel {
      border-bottom-color: #334155;
      border-left-color: #fbbf24;
    }

    .side-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      background: var(--bg-card, #ffffff);
      flex-shrink: 0;
    }

    :global([data-theme='dark']) .side-panel-header {
      background: #1e293b;
      border-bottom-color: #334155;
    }

    .side-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }

    .side-panel-title i {
      color: #f59e0b;
    }

    :global([data-theme='dark']) .side-panel-title i {
      color: #fbbf24;
    }

    .panel-body {
      padding: 14px;
      overflow-y: auto;
      flex: 1 1 auto;
    }

    .find-replace-row {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }

    .find-input-group,
    .replace-input-group,
    .tier-select-group {
      max-width: 100%;
      width: 100%;
      flex: none;
    }

    .fr-select-input {
      width: 100%;
    }

    .action-container {
      flex-direction: column;
      align-items: stretch;
      margin-left: 0;
      width: 100%;
      padding-top: 10px;
      border-top: 1px solid var(--border-color, #e2e8f0);
    }

    :global([data-theme='dark']) .action-container {
      border-top-color: #334155;
    }

    .actions-cluster {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .btn-replace-all {
      grid-column: 1 / -1;
    }

    .btn-action-tool {
      width: 100%;
      justify-content: center;
    }

    .actions-cluster .panel-close-btn {
      display: none;
    }
  }
</style>

