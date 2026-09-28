<script>
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { formatTimeSec1 } from '../../utils/formatters.js';

  const modal = $derived(transcriptState.segmentWarningModal);
  const isOpen = $derived(modal.isOpen);

  const duration = $derived(
    Math.max(0, modal.intervalEnd - modal.intervalStart),
  );

  function handleKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      transcriptState.closeSegmentModal();
    } else if (e.key === 'Enter') {
      transcriptState.confirmSegmentModal();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) transcriptState.closeSegmentModal();
    }}
    role="presentation"
  >
    <div
      class="modal-dialog segment-warning-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="segment-warning-title"
    >
      <!-- Header -->
      <div class="modal-header segment-warning-header">
        <div class="modal-title">
          <i class="fa-solid fa-triangle-exclamation warning-icon"></i>
          <span id="segment-warning-title">
            {#if modal.isInterval}
              Replace Segments in Selected Interval?
            {:else}
              Replace All Existing Segments?
            {/if}
          </span>
        </div>
        <button
          type="button"
          class="btn-modal-close"
          onclick={() => transcriptState.closeSegmentModal()}
          title="Cancel"
          aria-label="Cancel"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body segment-warning-body">
        {#if modal.isInterval}
          <div class="interval-badge-banner">
            <i class="fa-solid fa-clock"></i>
            <span>
              Target Interval:
              <strong
                >{formatTimeSec1(modal.intervalStart)} &ndash; {formatTimeSec1(
                  modal.intervalEnd,
                )}</strong
              >
              ({duration.toFixed(1)}s)
            </span>
          </div>

          <div class="warning-alert-card">
            <div class="warning-alert-icon">
              <i class="fa-solid fa-scissors"></i>
            </div>
            <div class="warning-alert-content">
              <p class="warning-primary-msg">
                There {modal.affectedCount === 1 ? 'is' : 'are'}
                <strong class="count-highlight">{modal.affectedCount}</strong>
                existing speech segment{modal.affectedCount === 1 ? '' : 's'}
                within the selected interval.
              </p>
              <p class="warning-secondary-msg">
                Proceeding will <strong
                  >delete only these {modal.affectedCount} segment{modal.affectedCount ===
                  1
                    ? ''
                    : 's'}</strong
                >
                in this interval and replace them with newly detected speech boundaries.
              </p>
            </div>
          </div>

          {#if modal.preservedCount > 0}
            <div class="preserved-info-card">
              <i class="fa-solid fa-shield-halved preserved-icon"></i>
              <div class="preserved-content">
                <strong
                  >{modal.preservedCount} segment{modal.preservedCount === 1
                    ? ''
                    : 's'} outside this interval will be kept</strong
                >
                <p>
                  All existing segments outside the selected portion will remain
                  untouched, visible on the waveform, and fully editable.
                </p>
              </div>
            </div>
          {/if}
        {:else}
          <div class="warning-alert-card">
            <div class="warning-alert-icon">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div class="warning-alert-content">
              <p class="warning-primary-msg">
                There {modal.affectedCount === 1 ? 'is' : 'are'}
                <strong class="count-highlight">{modal.affectedCount}</strong>
                existing segment{modal.affectedCount === 1 ? '' : 's'} in the recording.
              </p>
              <p class="warning-secondary-msg">
                Running automatic segmentation on the entire recording will
                delete and replace all existing segments with newly detected
                speech boundaries.
              </p>
            </div>
          </div>
        {/if}

        <p class="action-confirmation-prompt">
          Do you want to proceed with automatic segmentation?
        </p>
      </div>

      <!-- Footer -->
      <div class="modal-footer segment-warning-footer">
        <button
          type="button"
          class="btn-secondary"
          onclick={() => transcriptState.closeSegmentModal()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-confirm-proceed"
          onclick={() => transcriptState.confirmSegmentModal()}
        >
          <i class="fa-solid fa-scissors"></i>
          <span>Proceed with Segmentation</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .segment-warning-dialog {
    max-width: 520px;
    border-top: 4px solid #f59e0b;
  }

  .segment-warning-header {
    background: #fffbeb;
    border-bottom: 1px solid #fef3c7;
  }

  .warning-icon {
    color: #d97706;
    font-size: 1.15rem;
  }

  .segment-warning-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: #334155;
  }

  .interval-badge-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f1f5f9;
    border-radius: 6px;
    font-size: 0.88rem;
    color: #475569;
    border: 1px solid #e2e8f0;
  }

  .interval-badge-banner i {
    color: #0284c7;
  }

  .interval-badge-banner strong {
    color: #0f172a;
  }

  .warning-alert-card {
    display: flex;
    gap: 12px;
    padding: 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
  }

  .warning-alert-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #fef3c7;
    color: #d97706;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .warning-alert-content {
    flex: 1;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .warning-primary-msg {
    margin: 0 0 6px 0;
    color: #92400e;
  }

  .count-highlight {
    color: #b45309;
    font-size: 1rem;
  }

  .warning-secondary-msg {
    margin: 0;
    color: #78350f;
    font-size: 0.85rem;
  }

  .preserved-info-card {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    font-size: 0.86rem;
    line-height: 1.4;
  }

  .preserved-icon {
    color: #16a34a;
    font-size: 1.15rem;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .preserved-content strong {
    color: #15803d;
    display: block;
    margin-bottom: 2px;
  }

  .preserved-content p {
    margin: 0;
    color: #166534;
    font-size: 0.82rem;
  }

  .action-confirmation-prompt {
    margin: 4px 0 0 0;
    font-weight: 600;
    font-size: 0.92rem;
    color: #1e293b;
  }

  .segment-warning-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .btn-secondary {
    padding: 8px 16px;
    border-radius: 6px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #475569;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary:hover {
    background: #f1f5f9;
    color: #1e293b;
    border-color: #94a3b8;
  }

  .btn-confirm-proceed {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 6px;
    background: #d97706;
    border: 1px solid #b45309;
    color: #ffffff;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .btn-confirm-proceed:hover {
    background: #b45309;
  }
</style>
