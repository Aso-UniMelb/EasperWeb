<script>
  import { appState } from '../../state/appState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { autoTagSegments } from '../../utils/autoTagging.js';

  let { onClose = () => {} } = $props();

  // Ensure lexicons are initialized
  $effect(() => {
    if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
      lexiconState.init();
    }
  });

  const activeLexiconId = $derived(
    projectState.activeProject?.lexiconId || null,
  );

  const activeLexicon = $derived(
    lexiconState.lexicons?.find((l) => l.id === activeLexiconId) || null,
  );

  const hasLexicon = $derived(Boolean(activeLexicon));
  const lexiconEntriesCount = $derived(activeLexicon?.entries?.length || 0);

  const wordSubTiers = $derived(
    (projectState.activeProject?.subTiers || []).filter(
      (t) => t.type === 'word' || t.type === 'morpheme',
    ),
  );

  const hasWordSubTiers = $derived(wordSubTiers.length > 0);

  let selectedTierId = $state(null);
  let selectedFieldName = $state('');
  let overwriteExisting = $state(false);
  let isTagging = $state(false);
  let lastTagStats = $state(null);
  let tagFeedbackMessage = $state('');
  let tagFeedbackType = $state('info'); // 'success' | 'warning' | 'error' | 'info'

  // Sync selected tier
  $effect(() => {
    if (wordSubTiers.length > 0) {
      if (
        selectedTierId === null ||
        !wordSubTiers.some((t) => Number(t.id) === Number(selectedTierId))
      ) {
        selectedTierId = wordSubTiers[0].id;
      }
    } else {
      selectedTierId = null;
    }
  });

  const selectedTier = $derived(
    wordSubTiers.find((t) => Number(t.id) === Number(selectedTierId)) ||
      wordSubTiers[0] ||
      null,
  );

  const availableFields = $derived(
    activeLexicon?.fields
      ? activeLexicon.fields.filter(
          (f) => (f.name || '').trim().toLowerCase() !== 'headword',
        )
      : [],
  );

  // Sync selected field when tier or availableFields changes
  $effect(() => {
    if (!selectedTier || availableFields.length === 0) {
      selectedFieldName = '';
      return;
    }

    // 1. If tier already has lexiconField configured and it exists in fields
    if (
      selectedTier.lexiconField &&
      availableFields.some(
        (f) =>
          f.name.toLowerCase() === selectedTier.lexiconField.toLowerCase() ||
          f.id === selectedTier.lexiconField,
      )
    ) {
      const match = availableFields.find(
        (f) =>
          f.name.toLowerCase() === selectedTier.lexiconField.toLowerCase() ||
          f.id === selectedTier.lexiconField,
      );
      selectedFieldName = match.name;
      return;
    }

    // 2. If tier name matches a field name (e.g. "POS" -> "POS", "Gloss" -> "Gloss")
    const tierNameLower = (selectedTier.name || '').toLowerCase();
    const nameMatch = availableFields.find(
      (f) => (f.name || '').toLowerCase() === tierNameLower,
    );
    if (nameMatch) {
      selectedFieldName = nameMatch.name;
      return;
    }

    // 3. Fallback to existing selectedFieldName if valid, or first available field
    if (
      !selectedFieldName ||
      !availableFields.some((f) => f.name === selectedFieldName)
    ) {
      selectedFieldName = availableFields[0].name;
    }
  });

  const segmentsCount = $derived(transcriptState.segments.length);
  const selectedSegmentId = $derived(transcriptState.selectedSegmentId);
  const selectedSegment = $derived(
    transcriptState.segments.find((s) => s.id === selectedSegmentId) || null,
  );

  async function handleAutoTag(onlySelectedSegment = false) {
    if (!activeLexicon) {
      tagFeedbackType = 'error';
      tagFeedbackMessage = 'No active lexicon selected for this project.';
      return;
    }

    if (!selectedTier) {
      tagFeedbackType = 'error';
      tagFeedbackMessage = 'Please select a target word-level sub-tier.';
      return;
    }

    if (!selectedFieldName) {
      tagFeedbackType = 'error';
      tagFeedbackMessage =
        'Please select a field in the lexicon to grab tags from.';
      return;
    }

    isTagging = true;
    tagFeedbackMessage = '';

    const targetSegments =
      onlySelectedSegment && selectedSegment
        ? [selectedSegment]
        : transcriptState.segments;

    try {
      const result = autoTagSegments({
        segments: targetSegments,
        tier: selectedTier,
        lexicon: activeLexicon,
        targetFieldNameOrId: selectedFieldName,
        overwrite: overwriteExisting,
        caseInsensitive: true,
        stripPunctuation: true,
      });

      if (!result.success) {
        tagFeedbackType = 'error';
        tagFeedbackMessage = result.error || 'Failed to auto tag words.';
        isTagging = false;
        return;
      }

      if (onlySelectedSegment && selectedSegment) {
        const updated = result.updatedSegments[0];
        const idx = transcriptState.segments.findIndex(
          (s) => s.id === updated.id,
        );
        if (idx !== -1) {
          transcriptState.segments[idx] = { ...updated };
          transcriptState.segments = [...transcriptState.segments];
        }
      } else {
        transcriptState.segments = result.updatedSegments.map((s) => ({
          ...s,
        }));
      }

      if (transcriptState.fullResult?.segments) {
        transcriptState.fullResult.segments = transcriptState.segments;
      }

      // Notify and persist changes
      transcriptState.notifySegmentsChange();

      // If user selected a field different from current tier.lexiconField, update project settings
      if (
        selectedTier &&
        projectState.activeProject &&
        selectedTier.lexiconField !== selectedFieldName
      ) {
        const curSubTiers = projectState.activeProject.subTiers || [];
        const updatedSubTiers = curSubTiers.map((t) =>
          Number(t.id) === Number(selectedTier.id)
            ? { ...t, lexiconField: selectedFieldName }
            : t,
        );
        projectState
          .updateProjectSettings(projectState.activeProject.id, {
            subTiers: updatedSubTiers,
          })
          .catch(() => {});
      }

      lastTagStats = result.stats;

      if (result.stats.newlyTaggedCount > 0) {
        tagFeedbackType = 'success';
        tagFeedbackMessage = `Successfully tagged ${result.stats.newlyTaggedCount} word${result.stats.newlyTaggedCount === 1 ? '' : 's'} in ${result.stats.modifiedSegmentsCount} segment${result.stats.modifiedSegmentsCount === 1 ? '' : 's'}.`;
        appState.statusMessage = tagFeedbackMessage;
      } else if (result.stats.alreadyTaggedCount > 0 && !overwriteExisting) {
        tagFeedbackType = 'info';
        tagFeedbackMessage = `All words in the ${onlySelectedSegment ? 'selected segment' : 'segments'} already had tags. Change mode to "Overwrite All Tags" to replace existing tags.`;
      } else {
        tagFeedbackType = 'warning';
        tagFeedbackMessage = `No matching words were found in field "${selectedFieldName}" of lexicon "${activeLexicon.title}".`;
      }
    } catch (err) {
      console.error('[AutoTagging] Tagging failed:', err);
      tagFeedbackType = 'error';
      tagFeedbackMessage = `Auto Tagging failed: ${err.message || err}`;
    } finally {
      isTagging = false;
    }
  }
</script>

<div class="inline-settings-panel tagging-panel">
  <!-- Panel Body -->
  <div class="panel-body">
    {#if !hasLexicon}
      <div class="empty-state-panel">
        <div class="empty-state-info">
          <i class="fa-solid fa-book-open empty-icon"></i>
          <div>
            <h5 class="empty-title">No Active Lexicon Configured</h5>
            <p class="empty-desc">
              To automatically grab tags (like POS or gloss) for words, link an
              Active Lexicon in Project Settings.
            </p>
          </div>
        </div>

        <div class="empty-state-actions">
          <button
            type="button"
            class="panel-tool-btn btn-settings-prominent"
            onclick={() => (projectState.isProjectSettingsOpen = true)}
            title="Open Project Settings to configure an active lexicon"
          >
            <i class="fa-solid fa-sliders"></i>
            <span>Project Settings</span>
          </button>

          <button
            type="button"
            class="panel-close-btn"
            onclick={onClose}
            title="Close auto tagging panel"
            aria-label="Close"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    {:else if !hasWordSubTiers}
      <div class="empty-state-panel">
        <div class="empty-state-info">
          <i class="fa-solid fa-layer-group empty-icon"></i>
          <div>
            <h5 class="empty-title">No Word-Level Sub-tiers Found</h5>
            <p class="empty-desc">
              Auto Tagging operates on word/morpheme-level sub-tiers (e.g. POS
              or Gloss). Add one in Project Settings.
            </p>
          </div>
        </div>

        <div class="empty-state-actions">
          <button
            type="button"
            class="panel-tool-btn btn-settings-prominent"
            onclick={() => (projectState.isProjectSettingsOpen = true)}
            title="Open Project Settings to add a word-level sub-tier"
          >
            <i class="fa-solid fa-plus"></i>
            <span>Add Word Sub-tier</span>
          </button>

          <button
            type="button"
            class="panel-close-btn"
            onclick={onClose}
            title="Close auto tagging panel"
            aria-label="Close"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    {:else}
      <div class="tagging-row">
        <!-- 1. Target Sub-tier Selection -->
        <div class="tier-select-container">
          <div class="field-label-row">
            <label for="auto-tag-tier-select" class="field-label"
              >Target Sub-tier</label
            >
            <span class="subtier-badge">#{selectedTier?.id || 1}</span>
          </div>

          <select
            id="auto-tag-tier-select"
            class="tagging-select-input"
            bind:value={selectedTierId}
            disabled={isTagging}
            title="Select which word-level sub-tier to tag"
          >
            {#each wordSubTiers as tier (tier.id)}
              <option value={tier.id}>
                {tier.name} (Sub-tier #{tier.id})
              </option>
            {/each}
          </select>
        </div>

        <!-- 2. Active Lexicon & Source Field Selection -->
        <div class="lexfield-select-container">
          <div class="field-label-row">
            <label for="auto-tag-field-select" class="field-label"
              >Lexicon Source Field</label
            >
            <span
              class="lex-badge"
              title="Active Lexicon: {activeLexicon.title ||
                activeLexicon.name ||
                'Untitled'}"
            >
              <i class="fa-solid fa-book-bookmark"></i>
              {activeLexicon.title || activeLexicon.name || 'Lexicon'} ({lexiconEntriesCount}
              entries)
            </span>
          </div>

          <select
            id="auto-tag-field-select"
            class="tagging-select-input"
            bind:value={selectedFieldName}
            disabled={isTagging || availableFields.length === 0}
            title="Select the field in the active lexicon to grab values from"
          >
            {#if availableFields.length === 0}
              <option value="">No custom fields in lexicon</option>
            {:else}
              {#each availableFields as f (f.id)}
                <option value={f.name}>
                  {f.name}
                </option>
              {/each}
            {/if}
          </select>
        </div>

        <!-- 3. Overwrite Mode Selection -->
        <div class="mode-select-container">
          <div class="field-label-row">
            <label for="auto-tag-mode-select" class="field-label">Mode</label>
          </div>

          <select
            id="auto-tag-mode-select"
            class="tagging-select-input mode-select"
            value={overwriteExisting ? 'overwrite' : 'empty'}
            onchange={(e) =>
              (overwriteExisting = e.target.value === 'overwrite')}
            disabled={isTagging}
            title="Choose whether to fill untagged words only or overwrite existing tags"
          >
            <option value="empty">Fill Untagged Only</option>
            <option value="overwrite">Overwrite All Tags</option>
          </select>
        </div>

        <!-- 4. Action & Live Status -->
        <div class="action-container">
          <div class="status-box">
            {#if segmentsCount === 0}
              <span class="status-chip chip-neutral">
                <i class="fa-solid fa-circle-info"></i>
                <span>No segments in project</span>
              </span>
            {:else if lexiconEntriesCount === 0}
              <span class="status-chip chip-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>Lexicon has 0 entries</span>
              </span>
            {:else if lastTagStats}
              <span class="status-chip chip-success">
                <i class="fa-solid fa-circle-check"></i>
                <span
                  >Tagged <strong>{lastTagStats.newlyTaggedCount}</strong> words</span
                >
              </span>
            {:else}
              <span class="status-chip chip-info">
                <i class="fa-solid fa-tags"></i>
                <span
                  >Ready &bull; {segmentsCount} segment{segmentsCount === 1
                    ? ''
                    : 's'}</span
                >
              </span>
            {/if}
          </div>

          <div class="actions-cluster">
            <button
              type="button"
              class="btn-run-action"
              onclick={() => handleAutoTag(false)}
              disabled={isTagging ||
                segmentsCount === 0 ||
                lexiconEntriesCount === 0 ||
                !selectedFieldName}
              title="Auto tag words in all segments from the lexicon"
            >
              {#if isTagging}
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Tagging...</span>
              {:else}
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Auto Tag All ({segmentsCount})</span>
              {/if}
            </button>

            {#if selectedSegmentId}
              <button
                type="button"
                class="btn-run-single"
                onclick={() => handleAutoTag(true)}
                disabled={isTagging ||
                  lexiconEntriesCount === 0 ||
                  !selectedFieldName}
                title="Auto tag words in the selected segment only"
              >
                <i class="fa-solid fa-tag"></i>
                <span>Tag Selected</span>
              </button>
            {/if}

            <button
              type="button"
              class="panel-close-btn"
              onclick={onClose}
              title="Close auto tagging panel"
              aria-label="Close"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Messages / Summary Bar -->
  {#if tagFeedbackMessage}
    <div class="panel-alert alert-{tagFeedbackType}">
      <div class="alert-content">
        <i
          class="fa-solid {tagFeedbackType === 'success'
            ? 'fa-circle-check'
            : tagFeedbackType === 'error'
              ? 'fa-circle-xmark'
              : tagFeedbackType === 'warning'
                ? 'fa-triangle-exclamation'
                : 'fa-circle-info'}"
        ></i>
        <span>{tagFeedbackMessage}</span>
      </div>

      {#if lastTagStats}
        <div class="stats-pills">
          <span class="stats-pill pill-total">
            Total: {lastTagStats.totalWords}
          </span>
          <span class="stats-pill pill-tagged">
            Tagged: {lastTagStats.newlyTaggedCount}
          </span>
          {#if lastTagStats.alreadyTaggedCount > 0}
            <span class="stats-pill pill-skipped">
              Kept: {lastTagStats.alreadyTaggedCount}
            </span>
          {/if}
          {#if lastTagStats.unmatchedCount > 0}
            <span class="stats-pill pill-unmatched">
              Unmatched: {lastTagStats.unmatchedCount}
            </span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .inline-settings-panel {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    border-bottom: 2px solid #10b981;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    margin: 0;
    animation: slideDown 0.16s ease-out;
    z-index: 10;
  }

  :global([data-theme='dark']) .inline-settings-panel {
    background: #0f172a;
    border-color: #334155;
    border-bottom-color: #34d399;
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

  .empty-state-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 2px 0;
  }

  .empty-state-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .empty-icon {
    font-size: 1.3rem;
    color: #10b981;
    opacity: 0.85;
  }

  :global([data-theme='dark']) .empty-icon {
    color: #34d399;
  }

  .empty-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .empty-desc {
    margin: 2px 0 0;
    font-size: 0.74rem;
    color: var(--text-muted, #64748b);
  }

  .empty-state-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-settings-prominent {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #10b981;
    color: #ffffff;
    border: 1px solid #059669;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3);
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
  }

  .btn-settings-prominent:hover {
    background: #059669;
    border-color: #047857;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
  }

  :global([data-theme='dark']) .btn-settings-prominent {
    background: #059669;
    border-color: #10b981;
  }

  :global([data-theme='dark']) .btn-settings-prominent:hover {
    background: #10b981;
  }

  .tagging-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .tier-select-container,
  .lexfield-select-container,
  .mode-select-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
  }

  .tier-select-container {
    flex: 1 1 170px;
    max-width: 220px;
  }

  .lexfield-select-container {
    flex: 1.2 1 200px;
    max-width: 260px;
  }

  .mode-select-container {
    flex: 0.8 1 140px;
    max-width: 170px;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .field-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    margin: 0;
    white-space: nowrap;
  }

  .subtier-badge {
    font-size: 0.65rem;
    font-weight: 700;
    background: rgba(16, 185, 129, 0.14);
    color: #059669;
    padding: 1px 5px;
    border-radius: 4px;
  }

  :global([data-theme='dark']) .subtier-badge {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .lex-badge {
    font-size: 0.65rem;
    font-weight: 600;
    color: #059669;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .lex-badge {
    color: #34d399;
  }

  .tagging-select-input {
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

  .tagging-select-input:focus {
    border-color: #10b981;
    outline: none;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  :global([data-theme='dark']) .tagging-select-input {
    background-color: #1e293b;
    border-color: #334155;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .tagging-select-input:focus {
    border-color: #34d399;
    box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.25);
  }

  .action-container {
    display: flex;
    align-items: center;
    gap: 12px;
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
    padding: 4px 9px;
    border-radius: 6px;
    font-size: 0.73rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .chip-info {
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
    border: 1px solid rgba(2, 132, 199, 0.25);
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

  .chip-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.25);
  }

  :global([data-theme='dark']) .chip-info {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.3);
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

  .btn-run-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 13px;
    font-size: 0.77rem;
    font-weight: 700;
    border-radius: 6px;
    background: #10b981;
    color: #ffffff;
    border: 1px solid #059669;
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3);
  }

  .btn-run-action:hover:not(:disabled) {
    background: #059669;
    border-color: #047857;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
  }

  .btn-run-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global([data-theme='dark']) .btn-run-action {
    background: #059669;
    border-color: #10b981;
  }

  :global([data-theme='dark']) .btn-run-action:hover:not(:disabled) {
    background: #10b981;
  }

  .btn-run-single {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-color, #334155);
    border: 1px solid var(--border-color, #cbd5e1);
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
  }

  .btn-run-single:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.08);
    border-color: #10b981;
    color: #059669;
  }

  :global([data-theme='dark']) .btn-run-single {
    background: #1e293b;
    border-color: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-run-single:hover:not(:disabled) {
    background: rgba(52, 211, 153, 0.15);
    border-color: #34d399;
    color: #34d399;
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

  :global([data-theme='dark']) .alert-success {
    background: rgba(16, 185, 129, 0.15);
    color: #6ee7b7;
  }

  .alert-warning {
    background: #fffbeb;
    color: #92400e;
  }

  :global([data-theme='dark']) .alert-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fde68a;
  }

  .alert-error {
    background: #fef2f2;
    color: #991b1b;
  }

  :global([data-theme='dark']) .alert-error {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }

  .alert-info {
    background: #f0f9ff;
    color: #0369a1;
  }

  :global([data-theme='dark']) .alert-info {
    background: rgba(2, 132, 199, 0.15);
    color: #7dd3fc;
  }

  .stats-pills {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .stats-pill {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.06);
  }

  .pill-tagged {
    background: rgba(16, 185, 129, 0.2);
    color: #065f46;
  }

  :global([data-theme='dark']) .pill-tagged {
    background: rgba(52, 211, 153, 0.25);
    color: #a7f3d0;
  }

  .pill-skipped {
    background: rgba(100, 116, 139, 0.15);
    color: #475569;
  }

  :global([data-theme='dark']) .pill-skipped {
    background: rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
  }

  .pill-unmatched {
    background: rgba(245, 158, 11, 0.18);
    color: #92400e;
  }

  :global([data-theme='dark']) .pill-unmatched {
    background: rgba(251, 191, 36, 0.2);
    color: #fde68a;
  }
</style>
