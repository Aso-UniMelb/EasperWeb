<script>
  import { appState } from '../../state/appState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import IntervalPicker from './IntervalPicker.svelte';

  let { onClose = () => {}, onWorkerReset } = $props();

  const speakerCount = $derived(
    Number(transcriptState.diarizationSpeakerCount) || 1,
  );
  const multiSpeaker = $derived(speakerCount > 1);

  $effect(() => {
    if (transcriptState.diarizationSpeakerCount === 'auto') {
      transcriptState.diarizationSpeakerCount = 2;
    }
  });

  const detectOverlap = $derived(
    transcriptState.diarizationModel === 'pyannote',
  );

  function toggleDetectOverlap(e) {
    transcriptState.diarizationModel = e.currentTarget.checked
      ? 'pyannote'
      : 'campplus';
  }

  const separationLabels = {
    1: 'Low',
    2: 'Relaxed',
    3: 'Balanced',
    4: 'High',
    5: 'Maximum',
  };

  const separationLevel = $derived.by(() => {
    const t = Number(transcriptState.diarizationThreshold);
    if (t >= 0.15) return 1;
    if (t >= 0.12) return 2;
    if (t >= 0.09) return 3;
    if (t >= 0.07) return 4;
    return 5;
  });

  const separationHint = $derived(
    separationLevel <= 2
      ? 'tolerates vocal variation (whispers, shouts, intonation shifts)'
      : separationLevel === 3
        ? 'balanced voice separation for typical dialogue'
        : 'separates subtle differences (similar pitch, relatives)',
  );

  function handleSeparationChange(e) {
    const lvl = Number(e.currentTarget.value);
    const map = { 1: 0.16, 2: 0.13, 3: 0.1, 4: 0.08, 5: 0.06 };
    transcriptState.diarizationThreshold = map[lvl] ?? 0.1;
  }

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

  let openHelpKeys = $state({});

  function toggleItemHelp(key) {
    openHelpKeys[key] = !openHelpKeys[key];
  }

  function confirmAndDiarize() {
    const count = transcriptState.segments.length;
    const confirmed = window.confirm(
      `Separate speakers across ${count} existing segment${count === 1 ? '' : 's'}?\n\nThis will reassign speaker labels (and may split multi-speaker turns) across your transcript, and automated results may not always work as desired. Continue?`,
    );
    if (!confirmed) return;
    transcriptState.handleDiarizeSegments();
  }

  function confirmAndTrimVad() {
    const count = audioState.isIntervalSelected
      ? segmentsInIntervalCount
      : transcriptState.segments.length;
    const scopeLabel = audioState.isIntervalSelected
      ? `${count} segment${count === 1 ? '' : 's'} in the selected range`
      : `all ${count} segment${count === 1 ? '' : 's'}`;
    const confirmed = window.confirm(
      `Trim silence boundaries on ${scopeLabel}?\n\nThis will modify the start and end times of existing segments and may sometimes clip quiet speech or alter boundaries unexpectedly. Continue?`,
    );
    if (!confirmed) return;
    transcriptState.handleTrimSegmentsWithVad();
  }
</script>

<div class="inline-settings-panel segmentation-panel">
  <div class="side-panel-header">
    <div class="side-panel-title">
      <i class="fa-solid fa-scissors"></i>
      <span>Auto Segmentation</span>
    </div>
    <div class="side-panel-header-actions">
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

  <!-- Panel Body -->
  <div class="panel-body">
    <!-- Settings Grid -->
    <div class="settings-grid">
      <!-- 1) Range -->
      {#if audioState.totalAudioDuration > 0}
        <div class="settings-col">
          <div class="col-head">
            <span>Range</span>
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
          <div class="setting-row">
            <IntervalPicker />
          </div>
        </div>
      {/if}

      <!-- 2) Speaker Separation -->
      <div class="settings-col">
        <div class="col-head">
          <span>Speaker Separation</span>
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-diar-speakers"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('speakers');
              }}
              title="Click to show/hide help"
            >
              Expected speakers
            </label>
            <select
              id="inline-diar-speakers"
              class="setting-select setting-select-inline"
              bind:value={transcriptState.diarizationSpeakerCount}
              disabled={appState.isProcessing}
            >
              <option value={1}>1 speaker</option>
              <option value={2}>2 speakers</option>
              <option value={3}>3 speakers</option>
              <option value={4}>4 speakers</option>
              <option value={5}>5 speakers</option>
            </select>
          </div>
          {#if openHelpKeys.speakers}
            <p class="setting-help">
              {#if multiSpeaker}
                Separates speech into {speakerCount} participant tracks.
              {:else}
                All speech assigned to Speaker 1. Select 2 or more to enable
                speaker separation.
              {/if}
            </p>
          {/if}
        </div>

        {#if multiSpeaker}
          <!-- Overlap detection toggle -->
          <div class="setting-row">
            <div class="setting-inline-row">
              <div class="setting-checkbox-label">
                <input
                  id="inline-diar-overlap"
                  type="checkbox"
                  checked={detectOverlap}
                  onchange={toggleDetectOverlap}
                  disabled={appState.isProcessing}
                  class="setting-checkbox"
                />
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <label
                  for="inline-diar-overlap"
                  onclick={(e) => {
                    e.preventDefault();
                    toggleItemHelp('overlap');
                  }}
                  title="Click to show/hide help"
                >
                  Detect overlapping speech
                </label>
              </div>
            </div>
            {#if openHelpKeys.overlap}
              <p class="setting-help">
                Identifies simultaneous speech when participants talk over each
                other, creating parallel overlapping tiers.
              </p>
            {/if}
          </div>

          <!-- Separation sensitivity slider -->
          <div class="setting-row">
            <div class="setting-inline-row">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <label
                for="inline-diar-separation"
                onclick={(e) => {
                  e.preventDefault();
                  toggleItemHelp('separation');
                }}
                title="Click to show/hide help"
              >
                Separation sensitivity
              </label>
              <div class="setting-control-right">
                <span class="setting-val"
                  >{separationLabels[separationLevel] || 'Balanced'}</span
                >
                <input
                  id="inline-diar-separation"
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={separationLevel}
                  oninput={handleSeparationChange}
                  disabled={appState.isProcessing}
                  class="setting-slider"
                  title="Separation sensitivity: {separationHint}"
                />
              </div>
            </div>
            {#if openHelpKeys.separation}
              <p class="setting-help">
                Increase sensitivity if speakers sound similar and get merged
                into one person; decrease sensitivity if one speaker with varied
                pitch gets split into multiple people.
              </p>
            {/if}
          </div>

          <!-- Progressive Disclosure: Advanced Acoustic Settings -->
          <details class="diar-advanced-details">
            <summary class="diar-advanced-summary">
              <i class="fa-solid fa-sliders"></i>
              <span>Advanced acoustic parameters</span>
            </summary>
            <div class="diar-advanced-content">
              <div class="setting-row">
                <div class="setting-inline-row">
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <label
                    for="inline-diar-model-adv"
                    onclick={(e) => {
                      e.preventDefault();
                      toggleItemHelp('diarModel');
                    }}
                    title="Click to show/hide help"
                  >
                    Diarization engine
                  </label>
                  <select
                    id="inline-diar-model-adv"
                    class="setting-select setting-select-inline"
                    bind:value={transcriptState.diarizationModel}
                    disabled={appState.isProcessing}
                  >
                    <option value="campplus">CAM++ (Fast Turn-Level)</option>
                    <option value="pyannote">PyAnnote + CAM++ (Overlaps)</option
                    >
                  </select>
                </div>
                {#if openHelpKeys.diarModel}
                  <p class="setting-help">
                    <strong>CAM++</strong> assigns one speaker per turn quickly.
                    <strong>PyAnnote + CAM++</strong> adds frame-level segmentation
                    to detect overlapping speakers.
                  </p>
                {/if}
              </div>

              <div class="setting-row">
                <div class="setting-inline-row">
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <label
                    for="inline-diar-raw-thresh"
                    onclick={(e) => {
                      e.preventDefault();
                      toggleItemHelp('diarThresh');
                    }}
                    title="Click to show/hide help"
                  >
                    Clustering distance
                  </label>
                  <div class="setting-control-right">
                    <span class="setting-val"
                      >{Number(transcriptState.diarizationThreshold).toFixed(
                        2,
                      )}</span
                    >
                    <input
                      id="inline-diar-raw-thresh"
                      type="range"
                      min="0.04"
                      max="0.25"
                      step="0.01"
                      bind:value={transcriptState.diarizationThreshold}
                      disabled={appState.isProcessing}
                      class="setting-slider"
                    />
                  </div>
                </div>
                {#if openHelpKeys.diarThresh}
                  <p class="setting-help">
                    Cosine distance threshold for grouping voice embeddings.
                    Lower values split similar voices more aggressively; higher
                    values merge them.
                  </p>
                {/if}
              </div>

              {#if transcriptState.diarizationModel === 'pyannote'}
                <div class="setting-row">
                  <div class="setting-inline-row">
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <label
                      for="inline-pyannote-raw-thresh"
                      onclick={(e) => {
                        e.preventDefault();
                        toggleItemHelp('pyannoteThresh');
                      }}
                      title="Click to show/hide help"
                    >
                      Speech activation
                    </label>
                    <div class="setting-control-right">
                      <span class="setting-val"
                        >{Number(transcriptState.pyannoteThreshold).toFixed(
                          2,
                        )}</span
                      >
                      <input
                        id="inline-pyannote-raw-thresh"
                        type="range"
                        min="0.20"
                        max="0.80"
                        step="0.05"
                        bind:value={transcriptState.pyannoteThreshold}
                        disabled={appState.isProcessing}
                        class="setting-slider"
                      />
                    </div>
                  </div>
                  {#if openHelpKeys.pyannoteThresh}
                    <p class="setting-help">
                      Frame-level probability threshold for speaker activity.
                      Lower values detect quieter overlapping voices; higher
                      values reduce false overlap triggers.
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          </details>
        {/if}

        {#if multiSpeaker && transcriptState.segments.length > 0}
          <div class="setting-row" style="margin-top: 2px;">
            <div class="setting-inline-row">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <label
                for="btn-diarize-action"
                onclick={(e) => {
                  e.preventDefault();
                  toggleItemHelp('diarizeAction');
                }}
                title="Click to show/hide help"
              >
                Separate speakers in transcript
              </label>
              <div class="setting-control-right">
                <button
                  id="btn-diarize-action"
                  type="button"
                  class="btn-diarize-action"
                  onclick={confirmAndDiarize}
                  disabled={appState.isProcessing ||
                    transcriptState.isDiarizing}
                  title="Identify and assign speakers on already segmented utterances"
                >
                  {#if transcriptState.isDiarizing}
                    <span>Running...</span>
                  {:else}
                    <span>Run</span>
                  {/if}
                </button>
              </div>
            </div>
            {#if openHelpKeys.diarizeAction}
              <p class="setting-help">
                Re-runs speaker identification on existing segments without
                re-running full VAD segmentation.
              </p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 3) Listening & Sensitivity -->
      <div class="settings-col">
        <div class="col-head">
          <span>Listening &amp; Sensitivity</span>
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-thresh"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('vadThresh');
              }}
              title="Click to show/hide help"
            >
              Speech threshold
            </label>
            <div class="setting-control-right">
              <span class="setting-val"
                >{Number(transcriptState.vadThreshold).toFixed(2)}</span
              >
              <input
                id="inline-vad-thresh"
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                bind:value={transcriptState.vadThreshold}
                disabled={appState.isProcessing}
                class="setting-slider"
                title="Sensitivity: {sensitivityHint}"
              />
            </div>
          </div>
          {#if openHelpKeys.vadThresh}
            <p class="setting-help">
              Sensitivity: <strong>{sensitivityHint}</strong>. Lower threshold
              if quiet or distant speech is being missed; raise it if background
              noise is falsely detected.
            </p>
          {/if}
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-silence"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('vadSilence');
              }}
              title="Click to show/hide help"
            >
              Pause to end utterance
            </label>
            <div class="setting-control-right">
              <span class="setting-val"
                >{transcriptState.vadMinSilenceMs} ms</span
              >
              <input
                id="inline-vad-silence"
                type="range"
                min="100"
                max="1000"
                step="50"
                bind:value={transcriptState.vadMinSilenceMs}
                disabled={appState.isProcessing}
                class="setting-slider"
              />
            </div>
          </div>
          {#if openHelpKeys.vadSilence}
            <p class="setting-help">
              Silence longer than this marks a new segment. Shorter values
              produce more, smaller segments.
            </p>
          {/if}
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-pad"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('vadPad');
              }}
              title="Click to show/hide help"
            >
              Edge padding
            </label>
            <div class="setting-control-right">
              <span class="setting-val"
                >{transcriptState.vadSpeechPadMs} ms</span
              >
              <input
                id="inline-vad-pad"
                type="range"
                min="20"
                max="200"
                step="10"
                bind:value={transcriptState.vadSpeechPadMs}
                disabled={appState.isProcessing}
                class="setting-slider"
              />
            </div>
          </div>
          {#if openHelpKeys.vadPad}
            <p class="setting-help">
              Extra audio preserved before and after each segment to prevent
              clipping word boundaries.
            </p>
          {/if}
        </div>
      </div>

      <!-- 4) Segment Tidying -->
      <div class="settings-col">
        <div class="col-head">
          <span>Segment Tidying</span>
        </div>

        {#if transcriptState.segments.length > 0}
          <div class="setting-row" style="margin-top: 2px;">
            <div class="setting-inline-row">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <label
                for="btn-trim-vad-action"
                onclick={(e) => {
                  e.preventDefault();
                  toggleItemHelp('trimAction');
                }}
                title="Click to show/hide help"
              >
                {audioState.isIntervalSelected
                  ? `Trim in selection (${segmentsInIntervalCount})`
                  : 'Trim in segments'}
              </label>
              <div class="setting-control-right">
                <button
                  id="btn-trim-vad-action"
                  type="button"
                  class="btn-trim-vad-action"
                  onclick={confirmAndTrimVad}
                  disabled={appState.isProcessing ||
                    transcriptState.isTrimmingVad ||
                    !hasAudio}
                  title="Tighten existing segment start and end boundaries using Silero VAD without deleting or merging segments"
                >
                  {#if transcriptState.isTrimmingVad}
                    <span>Running...</span>
                  {:else}
                    <span>Run</span>
                  {/if}
                </button>
              </div>
            </div>
            {#if openHelpKeys.trimAction}
              <p class="setting-help">
                Tightens start/end boundaries of existing segments to remove
                leading and trailing silence while preserving all text,
                speakers, and sub-tiers.
              </p>
            {/if}
          </div>
        {/if}
        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-min-seg"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('minSeg');
              }}
              title="Click to show/hide help"
            >
              Drop shorter than
            </label>
            <div class="setting-control-right">
              <span class="setting-val"
                >{Number(transcriptState.vadMinSegmentS).toFixed(1)} s</span
              >
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
            </div>
          </div>
          {#if openHelpKeys.minSeg}
            <p class="setting-help">
              Discards brief noise spikes below this duration.
            </p>
          {/if}
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-min-sil"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('minSil');
              }}
              title="Click to show/hide help"
            >
              Join closer than
            </label>
            <div class="setting-control-right">
              <span class="setting-val"
                >{Number(transcriptState.vadMinSilenceS).toFixed(1)} s</span
              >
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
            </div>
          </div>
          {#if openHelpKeys.minSil}
            <p class="setting-help">
              Adjacent segments closer than this duration are automatically
              merged into one.
            </p>
          {/if}
        </div>

        <div class="setting-row">
          <div class="setting-inline-row">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label
              for="inline-vad-max-seg"
              onclick={(e) => {
                e.preventDefault();
                toggleItemHelp('maxSeg');
              }}
              title="Click to show/hide help"
            >
              Split longer than
            </label>
            <div class="setting-control-right">
              <span class="setting-val">{transcriptState.vadMaxSegmentS} s</span
              >
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
            </div>
          </div>
          {#if openHelpKeys.maxSeg}
            <p class="setting-help">
              Caps maximum segment length so utterances fit cleanly into
              transcription model context windows.
            </p>
          {/if}
        </div>
      </div>

      <!-- Main Action Section at end of main panel -->
      <div class="panel-action-bar">
        <div class="footer-status">
          {#if !hasAudio}
            <span class="status-badge status-warning">
              Load an audio file to run segmentation
            </span>
          {:else if audioState.isIntervalSelected}
            <span class="status-badge status-info">
              Selection active: {audioState.audioRangeStart.toFixed(1)}s &ndash; {audioState.audioRangeEnd.toFixed(
                1,
              )}s ({Math.max(
                0,
                audioState.audioRangeEnd - audioState.audioRangeStart,
              ).toFixed(1)}s)
            </span>
          {:else}
            <span class="status-badge status-neutral">
              Target: Full recording ({audioState.totalAudioDuration.toFixed(
                1,
              )}s)
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
              {segmentsInIntervalCount} to replace
            </span>
          {/if}
        </div>

        <div class="footer-actions">
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

          {#if appState.isProcessing && (appState.activeAction === 'segment' || appState.activeAction === 'vad_trim')}
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
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    display: flex;
    flex-direction: column;
    margin: 0;
    animation: slideDown 0.16s ease-out;
    z-index: 10;
    overflow: hidden;
  }

  :global([data-theme='dark']) .inline-settings-panel {
    background: #0f172a;
    border-color: #334155;
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

  .panel-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  :global([data-theme='dark']) .panel-tool-btn {
    background: #0f172a;
    border-color: #475569;
    color: #94a3b8;
  }

  .panel-tool-btn:hover {
    color: var(--primary-color, #0284c7);
    border-color: var(--primary-color, #0284c7);
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .panel-tool-btn:hover {
    color: #38bdf8;
    border-color: #38bdf8;
    background: #334155;
  }

  .panel-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.14s ease;
  }

  .panel-close-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .panel-close-btn {
    color: #94a3b8;
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  @media (max-width: 900px) {
    .settings-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  .settings-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 8px 10px;
  }

  :global([data-theme='dark']) .settings-col {
    background: #1e293b;
    border-color: #334155;
  }

  .col-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted, #64748b);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .col-head {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-inline-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 22px;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-color, #1e293b);
  }

  :global([data-theme='dark']) .setting-inline-row {
    color: #e2e8f0;
  }

  .setting-inline-row label {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: help;
  }

  .setting-inline-row label:hover {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .setting-inline-row label:hover {
    color: #38bdf8;
  }

  .setting-control-right {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .setting-val {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
    min-width: 58px;
    text-align: right;
  }

  :global([data-theme='dark']) .setting-val {
    color: #38bdf8;
  }

  .setting-slider {
    width: 80px;
    flex-shrink: 0;
    accent-color: var(--primary-color, #0284c7);
    cursor: pointer;
    height: 5px;
    margin: 0;
  }

  .setting-help {
    margin: 1px 0 0;
    font-size: 0.68rem;
    line-height: 1.3;
    color: var(--text-muted, #64748b);
  }

  .setting-select {
    width: 100%;
    padding: 3px 6px;
    font-size: 0.76rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
  }

  .setting-select-inline {
    width: auto;
    max-width: 185px;
    flex: 0 1 185px;
  }

  :global([data-theme='dark']) .setting-select {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  .setting-checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-color, #1e293b);
    user-select: none;
  }

  :global([data-theme='dark']) .setting-checkbox-label {
    color: #e2e8f0;
  }

  .setting-checkbox {
    cursor: pointer;
    accent-color: var(--primary-color, #0284c7);
    width: 14px;
    height: 14px;
    margin: 0;
  }

  .diar-advanced-details {
    margin-top: 4px;
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 5px;
    padding: 4px 6px;
    background: rgba(0, 0, 0, 0.015);
  }

  :global([data-theme='dark']) .diar-advanced-details {
    border-color: #334155;
    background: rgba(255, 255, 255, 0.02);
  }

  .diar-advanced-summary {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.69rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    user-select: none;
    padding: 2px 0;
  }

  .diar-advanced-summary:hover {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .diar-advanced-summary:hover {
    color: #38bdf8;
  }

  .diar-advanced-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .diar-advanced-content {
    border-top-color: #334155;
  }

  .btn-diarize-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 3px 10px;
    font-size: 0.74rem;
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

  .btn-diarize-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global([data-theme='dark']) .btn-diarize-action {
    background: rgba(124, 58, 237, 0.2);
    border-color: rgba(124, 58, 237, 0.35);
    color: #c084fc;
  }

  .btn-trim-vad-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 3px 10px;
    font-size: 0.74rem;
    font-weight: 600;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-trim-vad-action:hover:not(:disabled) {
    background: #d1fae5;
    color: #065f46;
  }

  .btn-trim-vad-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global([data-theme='dark']) .btn-trim-vad-action {
    background: rgba(16, 185, 129, 0.18);
    border-color: rgba(16, 185, 129, 0.35);
    color: #34d399;
  }

  .btn-reset-interval {
    margin-left: auto;
    background: transparent;
    border: none;
    font-size: 0.69rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
    color: var(--primary-color, #0284c7);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .panel-action-bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #cbd5e1);
    background: transparent;
  }

  :global([data-theme='dark']) .panel-action-bar {
    background: transparent;
    border-top-color: #334155;
  }

  .footer-status {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    padding: 2px 6px;
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
    padding: 6px 14px;
    font-size: 0.8rem;
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
    padding: 6px 12px;
    font-size: 0.8rem;
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
    padding: 6px 12px;
    font-size: 0.76rem;
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

  .side-panel-header {
    display: none;
  }

  @media (min-width: 1081px) {
    .inline-settings-panel {
      height: 100%;
      max-height: 100%;
      min-height: 0;
      border-radius: 8px;
      border: 1px solid var(--border-color, #cbd5e1);
      overflow: hidden;
    }

    :global([data-theme='dark']) .inline-settings-panel {
      border-color: #334155;
    }

    .side-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      min-height: 44px;
      box-sizing: border-box;
      background: var(--bg-card, #ffffff);
      border-bottom: 1px solid var(--border-color, #cbd5e1);
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
      font-size: 0.86rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }

    :global([data-theme='dark']) .side-panel-title {
      color: #f8fafc;
    }

    .side-panel-title i {
      color: var(--primary-color, #0284c7);
    }

    :global([data-theme='dark']) .side-panel-title i {
      color: #38bdf8;
    }

    .side-panel-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .panel-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 10px 12px;
      gap: 8px;
    }

    .settings-grid {
      grid-template-columns: 1fr;
      gap: 8px;
      align-content: start;
    }

    .panel-action-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      margin-top: 4px;
      padding-top: 10px;
    }

    .footer-actions {
      width: 100%;
    }

    .footer-actions .panel-tool-btn,
    .footer-actions .panel-close-btn {
      display: none;
    }

    .footer-actions .btn-run-action {
      flex: 1;
      justify-content: center;
    }
  }
</style>
