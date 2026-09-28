<script>
  import { appState } from '../../state/appState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import IntervalPicker from './IntervalPicker.svelte';

  let { onClose = () => {}, onWorkerReset } = $props();

  const speakerCount = $derived(
    Number(transcriptState.diarizationSpeakerCount),
  );
  const multiSpeaker = $derived(speakerCount > 1);

  const sensitivityHint = $derived(
    transcriptState.vadThreshold <= 0.35
      ? 'picks up quiet speech'
      : transcriptState.vadThreshold <= 0.55
        ? 'balanced'
        : 'only clear speech',
  );

  const hasAudio = $derived(
    Boolean(audioState.selectedFile || audioState.currentAudioUrl),
  );

  const segmentsInIntervalCount = $derived(
    audioState.isIntervalSelected
      ? transcriptState.segments.filter(
          (s) =>
            (s.end ?? 0) > audioState.audioRangeStart + 0.05 &&
            (s.start ?? 0) < audioState.audioRangeEnd - 0.05,
        ).length
      : 0,
  );
</script>

<div class="inline-settings-panel segmentation-panel">
  <!-- Header Bar -->
  <div class="panel-header">
    <div class="panel-title-area">
      <div class="panel-icon-wrap icon-scissors">
        <i class="fa-solid fa-scissors"></i>
      </div>
      <div>
        <h4 class="panel-title">Automatic Segmentation</h4>
        <span class="panel-subtitle">Silero VAD &bull; Utterance Detection</span
        >
      </div>
    </div>

    <div class="panel-actions">
      <button
        type="button"
        class="panel-tool-btn {appState.showHelpText ? 'active' : ''}"
        onclick={() => appState.toggleHelpText()}
        title={appState.showHelpText
          ? 'Hide descriptive help text'
          : 'Show descriptive help text'}
        aria-pressed={appState.showHelpText}
      >
        <i class="fa-regular fa-circle-question"></i>
        <span>Help</span>
      </button>

      <button
        type="button"
        class="panel-tool-btn"
        onclick={() => transcriptState.resetVadDiarizationDefaults()}
        disabled={appState.isProcessing}
        title="Reset segmentation settings to defaults"
      >
        <i class="fa-solid fa-rotate-left"></i>
        <span>Reset</span>
      </button>

      <button
        type="button"
        class="panel-close-btn"
        onclick={onClose}
        title="Close settings panel"
        aria-label="Close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </div>

  <!-- Settings Grid: 3-column responsive layout -->
  <div class="panel-body">
    <!-- Col 1: Detection & Sensitivity -->
    <div class="settings-col">
      <div class="col-head">
        <i class="fa-solid fa-microphone"></i>
        <span>Listening &amp; Sensitivity</span>
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-thresh">Speech threshold</label>
          <span class="setting-val"
            >{Number(transcriptState.vadThreshold).toFixed(2)}</span
          >
        </div>
        <input
          id="inline-vad-thresh"
          type="range"
          min="0.2"
          max="0.8"
          step="0.05"
          bind:value={transcriptState.vadThreshold}
          disabled={appState.isProcessing}
          class="setting-slider"
        />
        <div class="slider-hint">
          <span>Sensitivity: <strong>{sensitivityHint}</strong></span>
        </div>
        {#if appState.showHelpText}
          <p class="setting-help">
            Lower threshold if quiet or distant speech is being missed; raise it
            if background noise is falsely detected.
          </p>
        {/if}
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-silence">Pause needed to end utterance</label>
          <span class="setting-val">{transcriptState.vadMinSilenceMs} ms</span>
        </div>
        <input
          id="inline-vad-silence"
          type="range"
          min="100"
          max="1000"
          step="50"
          bind:value={transcriptState.vadMinSilenceMs}
          disabled={appState.isProcessing || multiSpeaker}
          class="setting-slider"
        />
        {#if appState.showHelpText}
          <p class="setting-help">
            Silence longer than this marks a new segment. Shorter values produce
            more, smaller segments.
          </p>
        {/if}
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-pad">Edge padding</label>
          <span class="setting-val">{transcriptState.vadSpeechPadMs} ms</span>
        </div>
        <input
          id="inline-vad-pad"
          type="range"
          min="20"
          max="200"
          step="10"
          bind:value={transcriptState.vadSpeechPadMs}
          disabled={appState.isProcessing || multiSpeaker}
          class="setting-slider"
        />
        {#if appState.showHelpText}
          <p class="setting-help">
            Extra audio preserved before and after each segment to prevent
            clipping word boundaries.
          </p>
        {/if}
      </div>
    </div>

    <!-- Col 2: Segment Boundaries & Tidying -->
    <div class="settings-col">
      <div class="col-head">
        <i class="fa-solid fa-broom"></i>
        <span>Segment Tidying</span>
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-min-seg">Drop segments shorter than</label>
          <span class="setting-val"
            >{Number(transcriptState.vadMinSegmentS).toFixed(1)} s</span
          >
        </div>
        <input
          id="inline-vad-min-seg"
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          bind:value={transcriptState.vadMinSegmentS}
          disabled={appState.isProcessing}
          class="setting-slider"
        />
        {#if appState.showHelpText}
          <p class="setting-help">
            Discards brief noise spikes below this duration.
          </p>
        {/if}
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-min-sil">Join segments closer than</label>
          <span class="setting-val"
            >{Number(transcriptState.vadMinSilenceS).toFixed(1)} s</span
          >
        </div>
        <input
          id="inline-vad-min-sil"
          type="range"
          min="0.2"
          max="2.0"
          step="0.1"
          bind:value={transcriptState.vadMinSilenceS}
          disabled={appState.isProcessing}
          class="setting-slider"
        />
        {#if appState.showHelpText}
          <p class="setting-help">
            Adjacent segments closer than this duration are automatically merged
            into one.
          </p>
        {/if}
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-vad-max-seg">Split segments longer than</label>
          <span class="setting-val">{transcriptState.vadMaxSegmentS} s</span>
        </div>
        <input
          id="inline-vad-max-seg"
          type="range"
          min="10"
          max="30"
          step="5"
          bind:value={transcriptState.vadMaxSegmentS}
          disabled={appState.isProcessing}
          class="setting-slider"
        />
        {#if appState.showHelpText}
          <p class="setting-help">
            Caps maximum segment length so utterances fit cleanly into
            transcription model context windows.
          </p>
        {/if}
      </div>
    </div>

    <!-- Col 3: Speakers & Portion -->
    <div class="settings-col">
      <div class="col-head">
        <i class="fa-solid fa-users"></i>
        <span>Speakers &amp; Audio Range</span>
      </div>

      <div class="setting-row">
        <div class="setting-label-row">
          <label for="inline-diar-speakers">Voices in recording</label>
        </div>
        <select
          id="inline-diar-speakers"
          class="setting-select"
          bind:value={transcriptState.diarizationSpeakerCount}
          disabled={appState.isProcessing}
        >
          <option value={1}>1 speaker</option>
          <option value={2}>2 speakers</option>
          <option value={3}>3 speakers</option>
          <option value={4}>4 speakers</option>
          <option value={5}>5 speakers</option>
        </select>
        {#if appState.showHelpText}
          <p class="setting-help">
            {#if multiSpeaker}
              Easper clusters voices using CAM++ neural embeddings into {speakerCount}
              speaker tracks.
            {:else}
              Utterances assigned to Speaker 1. Select 2+ to enable speaker
              separation.
            {/if}
          </p>
        {/if}
      </div>

      {#if multiSpeaker && transcriptState.segments.length > 0}
        <div class="setting-row" style="margin-top: 6px;">
          <button
            type="button"
            class="btn-diarize-action"
            onclick={() => transcriptState.handleDiarizeSegments()}
            disabled={appState.isProcessing || transcriptState.isDiarizing}
            title="Sort speakers on already segmented utterances without re-cutting audio"
          >
            {#if transcriptState.isDiarizing}
              <i class="fa-solid fa-spinner fa-spin"></i>
              <span
                >Diarizing {transcriptState.segments.length} segments...</span
              >
            {:else}
              <i class="fa-solid fa-people-arrows"></i>
              <span>Diarize existing segments</span>
            {/if}
          </button>
        </div>
      {/if}

      <!-- Interval Picker in Segmentation Panel -->
      {#if audioState.totalAudioDuration > 0}
        <div class="setting-row portion-box">
          <div class="setting-label-row">
            <span class="portion-label">
              <i class="fa-solid fa-clock"></i> Portion to segment
            </span>
            {#if audioState.isIntervalSelected}
              <button
                type="button"
                class="btn-reset-interval"
                onclick={() => audioState.resetInterval()}
                title="Use entire audio recording"
              >
                Reset to full
              </button>
            {/if}
          </div>
          <IntervalPicker />
        </div>
      {/if}
    </div>
  </div>

  <!-- Action Bar / Footer -->
  <div class="panel-footer">
    <div class="footer-status">
      {#if !hasAudio}
        <span class="status-badge status-warning">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Load an audio file to run segmentation
        </span>
      {:else if audioState.isIntervalSelected}
        <span class="status-badge status-info">
          <i class="fa-solid fa-crop-simple"></i>
          Selection active: {audioState.audioRangeStart.toFixed(1)}s &ndash; {audioState.audioRangeEnd.toFixed(
            1,
          )}s ({Math.max(
            0,
            audioState.audioRangeEnd - audioState.audioRangeStart,
          ).toFixed(1)}s)
        </span>
      {:else}
        <span class="status-badge status-neutral">
          <i class="fa-solid fa-wave-square"></i>
          Target: Full recording ({audioState.totalAudioDuration.toFixed(1)}s)
        </span>
      {/if}

      {#if transcriptState.segments.length > 0}
        <span class="status-badge status-pill">
          {transcriptState.segments.length} segment{transcriptState.segments
            .length === 1
            ? ''
            : 's'}
        </span>
      {/if}

      {#if segmentsInIntervalCount > 0}
        <span
          class="status-badge status-warning"
          title="{segmentsInIntervalCount} existing segment(s) in this interval will be replaced upon confirmation"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          {segmentsInIntervalCount} to replace
        </span>
      {/if}
    </div>

    <div class="footer-actions">
      {#if appState.isProcessing && appState.activeAction === 'segment'}
        <button
          type="button"
          class="btn-stop-action"
          onclick={() => transcriptState.stopTranscription(onWorkerReset)}
          title="Stop segmentation process"
        >
          <i class="fa-solid fa-stop"></i>
          <span>Stop</span>
        </button>
      {/if}

      <button
        type="button"
        class="btn-run-action btn-run-segment"
        onclick={() => transcriptState.handleSegmentOnly()}
        disabled={appState.isProcessing || !hasAudio}
        title="Run Silero Voice Activity Detection"
      >
        {#if appState.isProcessing && appState.activeAction === 'segment'}
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Segmenting Audio...</span>
        {:else if audioState.isIntervalSelected}
          <i class="fa-solid fa-scissors"></i>
          <span>Segment Selection</span>
        {:else}
          <i class="fa-solid fa-scissors"></i>
          <span>Run Automatic Segmentation</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Messages / Progress Alerts if any -->
  {#if appState.errorMessage}
    <div class="panel-alert alert-danger">
      <i class="fa-solid fa-circle-xmark"></i>
      <span>{appState.errorMessage}</span>
    </div>
  {/if}
</div>

<style>
  .inline-settings-panel {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-bottom: 2px solid var(--primary-color, #0284c7);
    border-radius: 8px 8px 0 0;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    margin: 0;
    animation: slideDown 0.16s ease-out;
    z-index: 10;
  }

  :global([data-theme='dark']) .inline-settings-panel {
    background: #1e293b;
    border-color: #334155;
    border-bottom-color: #38bdf8;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-muted, #f8fafc);
  }

  :global([data-theme='dark']) .panel-header {
    background: rgba(15, 23, 42, 0.45);
    border-bottom-color: #334155;
  }

  .panel-title-area {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .panel-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    font-size: 0.92rem;
  }

  .icon-scissors {
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .icon-scissors {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }

  .panel-title {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
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
    gap: 6px;
  }

  .panel-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  :global([data-theme='dark']) .panel-tool-btn {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
  }

  .panel-tool-btn:hover {
    color: var(--primary-color, #0284c7);
    border-color: var(--primary-color, #0284c7);
  }

  .panel-tool-btn.active {
    background: rgba(2, 132, 199, 0.1);
    color: var(--primary-color, #0284c7);
    border-color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .panel-tool-btn.active {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .panel-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.14s ease;
  }

  .panel-close-btn:hover {
    background: rgba(0, 0, 0, 0.07);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .panel-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 14px;
  }

  @media (max-width: 900px) {
    .panel-body {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .settings-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 10px 12px;
  }

  :global([data-theme='dark']) .settings-col {
    background: rgba(15, 23, 42, 0.35);
    border-color: #334155;
  }

  .col-head {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.77rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted, #64748b);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .col-head {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .col-head i {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .col-head i {
    color: #38bdf8;
  }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .setting-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-color, #1e293b);
  }

  :global([data-theme='dark']) .setting-label-row {
    color: #e2e8f0;
  }

  .setting-val {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .setting-val {
    color: #38bdf8;
  }

  .setting-slider {
    width: 100%;
    accent-color: var(--primary-color, #0284c7);
    cursor: pointer;
    height: 5px;
  }

  .slider-hint {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    display: flex;
    justify-content: flex-end;
  }

  .setting-help {
    margin: 2px 0 0;
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--text-muted, #64748b);
  }

  .setting-select {
    width: 100%;
    padding: 5px 8px;
    font-size: 0.79rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .setting-select {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  .btn-diarize-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 0.76rem;
    font-weight: 600;
    background: #ede9fe;
    border: 1px solid #ddd6fe;
    color: #7c3aed;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-diarize-action:hover:not(:disabled) {
    background: #ddd6fe;
    color: #6d28d9;
  }

  :global([data-theme='dark']) .btn-diarize-action {
    background: rgba(124, 58, 237, 0.2);
    border-color: rgba(124, 58, 237, 0.35);
    color: #c084fc;
  }

  .portion-box {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px dashed var(--border-color, #cbd5e1);
  }

  :global([data-theme='dark']) .portion-box {
    border-top-color: #334155;
  }

  .portion-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
  }

  .btn-reset-interval {
    background: transparent;
    border: none;
    font-size: 0.69rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 14px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-muted, #f8fafc);
  }

  :global([data-theme='dark']) .panel-footer {
    background: rgba(15, 23, 42, 0.45);
    border-top-color: #334155;
  }

  .footer-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.74rem;
    padding: 3px 7px;
    border-radius: 4px;
    font-weight: 600;
  }

  .status-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: var(--text-muted, #64748b);
  }

  .status-info {
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
  }

  .status-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #b45309;
  }

  :global([data-theme='dark']) .status-warning {
    color: #fbbf24;
  }

  .status-pill {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
    font-weight: 700;
  }

  :global([data-theme='dark']) .status-pill {
    color: #34d399;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-run-action {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 16px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #ffffff;
    background: #0284c7;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 4px rgba(2, 132, 199, 0.3);
  }

  .btn-run-action:hover:not(:disabled) {
    background: #0369a1;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4);
  }

  .btn-run-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  .btn-stop-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #ffffff;
    background: #ef4444;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-stop-action:hover {
    background: #dc2626;
  }

  .panel-alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    border-top: 1px solid transparent;
  }

  .alert-danger {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
    border-top-color: rgba(239, 68, 68, 0.2);
  }

  :global([data-theme='dark']) .alert-danger {
    color: #f87171;
  }
</style>
