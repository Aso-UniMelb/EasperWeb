<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { formatTimeSec2 } from '../../utils/formatters.js';
  import { getSpeakerColor } from '../../utils/speakers.js';
  import {
    scanAllSegmentsValidation,
    applySingleValidationFix,
    applyBatchValidationFix,
    isValidationActive,
  } from '../../utils/segmentValidator.js';

  let { onClose = () => {} } = $props();

  let activeCategory = $state('all'); // 'all' | 'tag' | 'punctuation' | 'acronym' | 'custom'
  let activeIssueIndex = $state(0);
  let feedbackMessage = $state('');
  let feedbackType = $state('info'); // 'info' | 'success' | 'warning'

  const validationRules = $derived(
    projectState.activeProject?.validationRules || null,
  );

  const isConfigActive = $derived(isValidationActive(validationRules));

  // Compute live summary across all segments
  const summary = $derived(
    scanAllSegmentsValidation(transcriptState.segments, validationRules),
  );

  const filteredIssues = $derived.by(() => {
    if (activeCategory === 'all') return summary.flatIssues;
    return summary.flatIssues.filter(
      (item) => (item.issue.type || 'custom') === activeCategory,
    );
  });

  // Keep active index in bounds
  $effect(() => {
    if (filteredIssues.length === 0) {
      activeIssueIndex = 0;
    } else if (activeIssueIndex >= filteredIssues.length) {
      activeIssueIndex = filteredIssues.length - 1;
    }
  });

  function focusIssueInDOM(item) {
    if (!item) return;
    transcriptState.selectSegment(item.segmentId, true);

    setTimeout(() => {
      const cardEl = document.getElementById(`segment-item-${item.segmentId}`);
      if (!cardEl) return;

      const textarea = cardEl.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        try {
          textarea.setSelectionRange(item.issue.start, item.issue.end);
        } catch (_) {}
      }
    }, 45);
  }

  function handleSelectIssue(index) {
    activeIssueIndex = index;
    const item = filteredIssues[index];
    if (item) {
      focusIssueInDOM(item);
    }
  }

  function handleNextIssue() {
    if (filteredIssues.length === 0) return;
    const nextIdx = (activeIssueIndex + 1) % filteredIssues.length;
    handleSelectIssue(nextIdx);
  }

  function handlePrevIssue() {
    if (filteredIssues.length === 0) return;
    const prevIdx =
      (activeIssueIndex - 1 + filteredIssues.length) % filteredIssues.length;
    handleSelectIssue(prevIdx);
  }

  function handleApplySingleFix(item, suggestion) {
    if (!item || suggestion == null) return;
    const seg = transcriptState.segments.find((s) => s.id === item.segmentId);
    if (!seg) return;

    transcriptState.pushUndo('Fix validation issue');
    const newText = applySingleValidationFix(
      seg.text || '',
      item.issue,
      suggestion,
    );
    transcriptState.updateSegmentText(seg.id, newText);
    projectState.saveCurrentProjectDebounced();

    feedbackMessage = `Fixed issue in segment #${item.segmentIndex}`;
    feedbackType = 'success';
    setTimeout(() => {
      if (feedbackMessage) feedbackMessage = '';
    }, 3000);
  }

  function handleBatchFix(type) {
    const { updatedSegments, fixedCount } = applyBatchValidationFix(
      transcriptState.segments,
      type,
    );

    if (fixedCount === 0) {
      feedbackMessage = 'No matching safe formatting issues to fix.';
      feedbackType = 'info';
      return;
    }

    transcriptState.pushUndo('Batch fix formatting issues');
    transcriptState.segments = updatedSegments;
    transcriptState.notifySegmentsChange();
    projectState.saveCurrentProjectDebounced();

    feedbackMessage = `Successfully fixed ${fixedCount} formatting issue(s) across segments.`;
    feedbackType = 'success';
    setTimeout(() => {
      if (feedbackMessage) feedbackMessage = '';
    }, 4000);
  }

  function openProjectSettings() {
    projectState.openProjectSettings();
  }
</script>

<div class="inline-settings-panel validation-issues-panel">
  <!-- Header Bar -->
  <div class="side-panel-header">
    <div class="side-panel-title">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span>Validation Issues</span>
      {#if summary.totalIssues > 0}
        <span class="badge-count-pill">{summary.totalIssues}</span>
      {/if}
    </div>
    <div class="side-panel-actions">
      <button
        type="button"
        class="btn-panel-header-action"
        onclick={openProjectSettings}
        title="Configure validation rules in Project Settings"
        aria-label="Settings"
      >
        <i class="fa-solid fa-gear"></i>
      </button>
      <button
        type="button"
        class="panel-close-btn"
        onclick={onClose}
        title="Close validation issues panel (Esc)"
        aria-label="Close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </div>

  <div class="panel-body">
    {#if !isConfigActive}
      <!-- State: No validation rules enabled in project -->
      <div class="validation-empty-state">
        <div class="empty-icon-wrap icon-neutral">
          <i class="fa-solid fa-sliders"></i>
        </div>
        <h4 class="empty-title">Validation is Disabled</h4>
        <p class="empty-desc">
          Validation rules (allowed markup tags, backtick apostrophe fixes,
          space cleanup, or custom regex patterns) are currently turned off for
          this project.
        </p>
        <button
          type="button"
          class="btn-open-settings"
          onclick={openProjectSettings}
        >
          <i class="fa-solid fa-gear"></i>
          <span>Configure Validation Rules</span>
        </button>
      </div>
    {:else if summary.totalIssues === 0}
      <!-- State: Clean transcript with zero issues -->
      <div class="validation-empty-state">
        <div class="empty-icon-wrap icon-success">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <h4 class="empty-title">No Validation Issues Found!</h4>
        <p class="empty-desc">
          All {transcriptState.segments.length} dialogue segments adhere to the project's
          active validation criteria.
        </p>
      </div>
    {:else}
      <!-- Summary Status Bar -->
      <div class="validation-summary-banner">
        <div class="banner-stat-row">
          <div class="banner-stat">
            <span class="stat-num">{summary.totalIssues}</span>
            <span class="stat-label"
              >Total Issue{summary.totalIssues === 1 ? '' : 's'}</span
            >
          </div>
          <div class="banner-stat-divider"></div>
          <div class="banner-stat">
            <span class="stat-num">{summary.affectedSegmentsCount}</span>
            <span class="stat-label"
              >Segment{summary.affectedSegmentsCount === 1 ? '' : 's'}</span
            >
          </div>
        </div>

        <!-- Navigation Stepper -->
        <div class="stepper-controls">
          <button
            type="button"
            class="btn-stepper"
            onclick={handlePrevIssue}
            disabled={filteredIssues.length === 0}
            title="Jump to previous issue"
            aria-label="Previous issue"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span class="stepper-index">
            {filteredIssues.length > 0 ? activeIssueIndex + 1 : 0} / {filteredIssues.length}
          </span>
          <button
            type="button"
            class="btn-stepper"
            onclick={handleNextIssue}
            disabled={filteredIssues.length === 0}
            title="Jump to next issue"
            aria-label="Next issue"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Quick Batch Fix Action (if safe fixes are available) -->
      {#if summary.categoryCounts.punctuation > 0}
        <div class="batch-fix-bar">
          <div class="batch-fix-text">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span
              >{summary.categoryCounts.punctuation} safe formatting issue(s)</span
            >
          </div>
          <button
            type="button"
            class="btn-batch-fix"
            onclick={() => handleBatchFix('all_safe')}
            title="Auto-replace all backtick apostrophes and extra spaces across segments"
          >
            Fix All Formatting
          </button>
        </div>
      {/if}

      <!-- Category Filter Tabs -->
      <div class="category-filter-tabs">
        <button
          type="button"
          class="cat-tab {activeCategory === 'all' ? 'active' : ''}"
          onclick={() => {
            activeCategory = 'all';
            activeIssueIndex = 0;
          }}
        >
          All ({summary.totalIssues})
        </button>
        {#if summary.categoryCounts.tag > 0}
          <button
            type="button"
            class="cat-tab {activeCategory === 'tag' ? 'active' : ''}"
            onclick={() => {
              activeCategory = 'tag';
              activeIssueIndex = 0;
            }}
          >
            Tags ({summary.categoryCounts.tag})
          </button>
        {/if}
        {#if summary.categoryCounts.punctuation > 0}
          <button
            type="button"
            class="cat-tab {activeCategory === 'punctuation' ? 'active' : ''}"
            onclick={() => {
              activeCategory = 'punctuation';
              activeIssueIndex = 0;
            }}
          >
            Punctuation ({summary.categoryCounts.punctuation})
          </button>
        {/if}
        {#if summary.categoryCounts.acronym > 0}
          <button
            type="button"
            class="cat-tab {activeCategory === 'acronym' ? 'active' : ''}"
            onclick={() => {
              activeCategory = 'acronym';
              activeIssueIndex = 0;
            }}
          >
            Acronyms ({summary.categoryCounts.acronym})
          </button>
        {/if}
        {#if summary.categoryCounts.custom > 0}
          <button
            type="button"
            class="cat-tab {activeCategory === 'custom' ? 'active' : ''}"
            onclick={() => {
              activeCategory = 'custom';
              activeIssueIndex = 0;
            }}
          >
            Custom ({summary.categoryCounts.custom})
          </button>
        {/if}
      </div>

      <!-- Feedback Banner -->
      {#if feedbackMessage}
        <div class="feedback-banner {feedbackType}">
          <i
            class="fa-solid {feedbackType === 'success'
              ? 'fa-circle-check'
              : 'fa-circle-info'}"
          ></i>
          <span>{feedbackMessage}</span>
        </div>
      {/if}

      <!-- Issue Cards List -->
      <div class="issues-scroll-list">
        {#each filteredIssues as item, idx (item.issueId)}
          {@const spkCol = getSpeakerColor(item.speakerId)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="issue-card {idx === activeIssueIndex ? 'is-active' : ''}"
            onclick={() => handleSelectIssue(idx)}
            role="listitem"
          >
            <div class="issue-card-header">
              <span class="seg-badge">#{item.segmentIndex}</span>
              <span
                class="speaker-pill"
                style="background-color: {spkCol.bg}; color: {spkCol.primary}; border: 1px solid {spkCol.border};"
              >
                {item.speaker}
              </span>
              <span class="time-range">
                [{formatTimeSec2(item.start)} &ndash; {formatTimeSec2(
                  item.end,
                )}]
              </span>
              <button
                type="button"
                class="btn-jump-icon"
                onclick={(e) => {
                  e.stopPropagation();
                  handleSelectIssue(idx);
                }}
                title="Scroll to segment #{item.segmentIndex}"
                aria-label="Jump to segment"
              >
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </button>
            </div>

            <div class="issue-card-body">
              <div class="issue-type-row">
                <span class="issue-kind-tag {item.issue.type || 'custom'}">
                  {item.issue.type || 'rule'}
                </span>
                <span class="issue-label">{item.issue.label}</span>
              </div>

              <div class="issue-snippet-box">
                <span class="offending-token">
                  {item.issue.text === '  ' ||
                  (item.issue.text && /^ +$/.test(item.issue.text))
                    ? `[${item.issue.text.length} spaces]`
                    : item.issue.text}
                </span>
              </div>

              {#if item.issue.suggestions && item.issue.suggestions.length > 0}
                <div class="suggestions-row">
                  <span class="sugg-prefix">Fix:</span>
                  {#each item.issue.suggestions as sugg}
                    <button
                      type="button"
                      class="btn-sugg-pill"
                      onclick={(e) => {
                        e.stopPropagation();
                        handleApplySingleFix(item, sugg);
                      }}
                      title="Apply suggestion: {sugg === ' '
                        ? 'single space'
                        : sugg}"
                    >
                      <i class="fa-solid fa-check"></i>
                      <span>{sugg === ' ' ? '1 space' : sugg}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .validation-issues-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    font-size: 0.88rem;
  }

  .side-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-hover, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    flex-shrink: 0;
  }

  .side-panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    font-size: 0.95rem;
  }

  .side-panel-title i {
    color: #f59e0b;
  }

  .badge-count-pill {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 9999px;
    background-color: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .side-panel-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-panel-header-action,
  .panel-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-panel-header-action:hover,
  .panel-close-btn:hover {
    background: var(--border-color, #e2e8f0);
    color: var(--text-heading, #0f172a);
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 10px 12px;
    gap: 8px;
  }

  /* Empty State */
  .validation-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px 16px;
    gap: 10px;
  }

  .empty-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    margin-bottom: 4px;
  }

  .empty-icon-wrap.icon-neutral {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
  }

  .empty-icon-wrap.icon-success {
    background: #ecfdf5;
    color: #10b981;
  }

  .empty-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .empty-desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    max-width: 280px;
    line-height: 1.45;
  }

  .btn-open-settings {
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 6px;
    background: var(--primary, #3b82f6);
    color: #ffffff;
    border: none;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .btn-open-settings:hover {
    opacity: 0.9;
  }

  /* Summary Banner */
  .validation-summary-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 8px 12px;
    flex-shrink: 0;
  }

  .banner-stat-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .banner-stat {
    display: flex;
    flex-direction: column;
  }

  .stat-num {
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.1;
    color: #dc2626;
  }

  .stat-label {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .banner-stat-divider {
    width: 1px;
    height: 24px;
    background-color: var(--border-color, #cbd5e1);
  }

  .stepper-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-stepper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #1e293b);
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-stepper:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    color: var(--primary, #3b82f6);
  }

  .btn-stepper:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .stepper-index {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    min-width: 44px;
    text-align: center;
  }

  /* Batch Fix Bar */
  .batch-fix-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .batch-fix-text {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #92400e;
  }

  .btn-batch-fix {
    font-size: 0.74rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    background: #d97706;
    color: #ffffff;
    border: none;
    cursor: pointer;
    transition: background-color 0.14s ease;
  }

  .btn-batch-fix:hover {
    background: #b45309;
  }

  /* Category Filter Tabs */
  .category-filter-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
    flex-shrink: 0;
    scrollbar-width: none;
  }

  .cat-tab {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 600;
    border: 1px solid transparent;
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.14s ease;
  }

  .cat-tab.active {
    background: var(--primary, #3b82f6);
    color: #ffffff;
  }

  /* Feedback Banner */
  .feedback-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .feedback-banner.success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .feedback-banner.info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }

  /* Issues Scroll List */
  .issues-scroll-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 2px;
  }

  .issue-card {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-card, #ffffff);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .issue-card:hover {
    border-color: #cbd5e1;
    background: var(--bg-hover, #f8fafc);
  }

  .issue-card.is-active {
    border-color: #f59e0b;
    box-shadow: 0 0 0 1.5px rgba(245, 158, 11, 0.35);
    background: var(--bg-hover, #fffbeb);
  }

  .issue-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
  }

  .seg-badge {
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .speaker-pill {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time-range {
    color: var(--text-muted, #64748b);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.7rem;
  }

  .btn-jump-icon {
    margin-left: auto;
    border: none;
    background: transparent;
    color: var(--text-muted, #94a3b8);
    font-size: 0.74rem;
    cursor: pointer;
    padding: 2px;
  }

  .btn-jump-icon:hover {
    color: var(--primary, #3b82f6);
  }

  .issue-card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .issue-type-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .issue-kind-tag {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 4px;
    border-radius: 3px;
    background: #f1f5f9;
    color: #475569;
  }

  .issue-kind-tag.tag {
    background: #fef3c7;
    color: #92400e;
  }

  .issue-kind-tag.punctuation {
    background: #fee2e2;
    color: #991b1b;
  }

  .issue-kind-tag.acronym {
    background: #ede9fe;
    color: #5b21b6;
  }

  .issue-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .issue-snippet-box {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
    padding: 3px 6px;
  }

  .offending-token {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    font-weight: 600;
    color: #dc2626;
    text-decoration: underline wavy #f87171 1.5px;
  }

  .suggestions-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .sugg-prefix {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    font-weight: 600;
  }

  .btn-sugg-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-sugg-pill:hover {
    background: #3b82f6;
    color: #ffffff;
    border-color: #3b82f6;
  }

  /* Dark Theme */
  :global([data-theme='dark']) .validation-issues-panel {
    background: #1e293b;
    border-color: #334155;
  }

  :global([data-theme='dark']) .side-panel-header {
    background: #0f172a;
    border-color: #334155;
  }

  :global([data-theme='dark']) .side-panel-title {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .badge-count-pill {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  :global([data-theme='dark']) .btn-panel-header-action:hover,
  :global([data-theme='dark']) .panel-close-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  :global([data-theme='dark']) .validation-summary-banner {
    background: #0f172a;
    border-color: #334155;
  }

  :global([data-theme='dark']) .stat-num {
    color: #f87171;
  }

  :global([data-theme='dark']) .banner-stat-divider {
    background-color: #334155;
  }

  :global([data-theme='dark']) .btn-stepper {
    background: #1e293b;
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .batch-fix-bar {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.35);
  }

  :global([data-theme='dark']) .batch-fix-text {
    color: #fde68a;
  }

  :global([data-theme='dark']) .cat-tab {
    background: #0f172a;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .cat-tab.active {
    background: #3b82f6;
    color: #ffffff;
  }

  :global([data-theme='dark']) .issue-card {
    background: #0f172a;
    border-color: #334155;
  }

  :global([data-theme='dark']) .issue-card:hover {
    background: #1e293b;
    border-color: #475569;
  }

  :global([data-theme='dark']) .issue-card.is-active {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  :global([data-theme='dark']) .seg-badge {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .issue-label {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .issue-snippet-box {
    background: rgba(255, 255, 255, 0.05);
  }

  :global([data-theme='dark']) .btn-sugg-pill {
    background: rgba(59, 130, 246, 0.18);
    border-color: rgba(59, 130, 246, 0.4);
    color: #93c5fd;
  }

  :global([data-theme='dark']) .btn-sugg-pill:hover {
    background: #3b82f6;
    color: #ffffff;
  }
</style>
