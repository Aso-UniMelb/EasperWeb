<script>
  import { appState } from '../../state/appState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { formatTimeSec, formatTimeSec1 } from '../../utils/formatters.js';

  /**
   * Start/end picker for the portion of the recording to work on.
   *
   * One track with two handles, driven by pointer capture. The previous version
   * stacked two native <input type="range"> on top of each other and swapped their
   * z-index from a pointermove handler to guess which thumb the user meant — which
   * made handles hard to grab, and impossible once they sat close together. Here a
   * press anywhere on the track grabs whichever handle is nearer and drags it, so
   * there is nothing to aim at.
   */

  const MIN_GAP = 0.5; // seconds; matches the clamping in audioState

  let trackEl = $state(null);
  let dragging = $state(null); // 'start' | 'end' | null

  const duration = $derived(audioState.totalAudioDuration || 0);
  const disabled = $derived(appState.isProcessing || duration <= 0);
  const selectedLength = $derived(
    Math.max(0, audioState.audioRangeEnd - audioState.audioRangeStart),
  );

  const pct = (t) =>
    duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0;

  function timeFromPointer(e) {
    if (!trackEl || duration <= 0) return 0;
    const r = trackEl.getBoundingClientRect();
    if (!r.width) return 0;
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return Number((ratio * duration).toFixed(1));
  }

  function setHandle(which, t) {
    if (which === 'start') {
      audioState.audioRangeStart = Math.max(
        0,
        Math.min(t, Number((audioState.audioRangeEnd - MIN_GAP).toFixed(1))),
      );
    } else {
      audioState.audioRangeEnd = Math.min(
        duration,
        Math.max(t, Number((audioState.audioRangeStart + MIN_GAP).toFixed(1))),
      );
    }
  }

  function nearerHandle(t) {
    return Math.abs(t - audioState.audioRangeStart) <=
      Math.abs(t - audioState.audioRangeEnd)
      ? 'start'
      : 'end';
  }

  function onTrackPointerDown(e) {
    if (disabled) return;
    const t = timeFromPointer(e);
    const which = nearerHandle(t);
    dragging = which;
    setHandle(which, t);
    try {
      trackEl.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  }

  function onTrackPointerMove(e) {
    if (!dragging) return;
    setHandle(dragging, timeFromPointer(e));
  }

  function onTrackPointerUp(e) {
    if (!dragging) return;
    dragging = null;
    try {
      trackEl.releasePointerCapture(e.pointerId);
    } catch {}
  }

  function onHandleKeydown(which, e) {
    if (disabled) return;
    const current =
      which === 'start' ? audioState.audioRangeStart : audioState.audioRangeEnd;
    const step = e.shiftKey ? 1 : 0.1;
    let next = null;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
      next = current + step;
    else if (e.key === 'PageDown') next = current - 5;
    else if (e.key === 'PageUp') next = current + 5;
    else if (e.key === 'Home') next = which === 'start' ? 0 : MIN_GAP;
    else if (e.key === 'End')
      next = which === 'start' ? duration - MIN_GAP : duration;
    else return;

    e.preventDefault();
    setHandle(which, Number(next.toFixed(1)));
  }
</script>

<div class="ip" class:is-disabled={disabled}>
  <!-- Track -->
  <div
    class="ip-track"
    class:is-dragging={dragging !== null}
    bind:this={trackEl}
    onpointerdown={onTrackPointerDown}
    onpointermove={onTrackPointerMove}
    onpointerup={onTrackPointerUp}
    onpointercancel={onTrackPointerUp}
    role="group"
    aria-label="Portion of the recording to work on"
  >
    <div class="ip-rail"></div>
    <div
      class="ip-band"
      style="left: {pct(audioState.audioRangeStart)}%; width: {Math.max(
        0,
        pct(audioState.audioRangeEnd) - pct(audioState.audioRangeStart),
      )}%;"
    ></div>

    {#if audioState.playerCurrentTime > 0 && duration > 0}
      <div
        class="ip-playhead"
        style="left: {pct(audioState.playerCurrentTime)}%;"
        title="Playing at {formatTimeSec1(audioState.playerCurrentTime)}"
      ></div>
    {/if}

    <button
      type="button"
      class="ip-handle"
      class:is-grabbed={dragging === 'start'}
      style="left: {pct(audioState.audioRangeStart)}%;"
      onkeydown={(e) => onHandleKeydown('start', e)}
      {disabled}
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label="Start of the selection"
      aria-valuemin="0"
      aria-valuemax={duration}
      aria-valuenow={audioState.audioRangeStart}
      aria-valuetext="{formatTimeSec1(
        audioState.audioRangeStart,
      )} of {formatTimeSec1(duration)}"
    ></button>

    <button
      type="button"
      class="ip-handle"
      class:is-grabbed={dragging === 'end'}
      style="left: {pct(audioState.audioRangeEnd)}%;"
      onkeydown={(e) => onHandleKeydown('end', e)}
      {disabled}
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label="End of the selection"
      aria-valuemin="0"
      aria-valuemax={duration}
      aria-valuenow={audioState.audioRangeEnd}
      aria-valuetext="{formatTimeSec1(
        audioState.audioRangeEnd,
      )} of {formatTimeSec1(duration)}"
    ></button>
  </div>

  <!-- Scale: where the selection sits, and how much of the recording it covers -->
  <div class="ip-scale">
    <span class="ip-edge">{formatTimeSec(0)}</span>
    <span class="ip-summary" class:is-partial={audioState.isIntervalSelected}>
      {#if audioState.isIntervalSelected}
        {selectedLength.toFixed(1)}s selected
      {:else}
        whole recording
      {/if}
    </span>
    <span class="ip-edge">{formatTimeSec(duration)}</span>
  </div>

  <!-- Numeric entry, with a shortcut to take the current playback position -->
  <div class="ip-fields">
    <div class="ip-field">
      <label class="ip-field-label" for="ip-start">Start</label>
      <div class="input-wrap">
        <input
          id="ip-start"
          type="number"
          min="0"
          max={Math.max(0, audioState.audioRangeEnd - MIN_GAP)}
          step="0.1"
          value={Number(audioState.audioRangeStart).toFixed(1)}
          oninput={(e) => audioState.handleStartInput(e)}
          {disabled}
          aria-label="Start time in seconds"
        />
        <span class="ip-unit">s</span>
        <button
          type="button"
          class="btn-icon-sm"
          onclick={() => audioState.setStartToCurrent()}
          disabled={disabled || !audioState.audioElement}
          title="Set the start to where playback has reached"
          aria-label="Set start from the playback position"
        >
          <i class="fa-solid fa-crosshairs"></i>
        </button>
      </div>
      {#if duration >= 60}
        <span class="ip-alt">{formatTimeSec1(audioState.audioRangeStart)}</span>
      {/if}
    </div>

    <div class="ip-field">
      <label class="ip-field-label" for="ip-end">End</label>
      <div class="input-wrap">
        <input
          id="ip-end"
          type="number"
          min={audioState.audioRangeStart + MIN_GAP}
          max={duration > 0 ? duration : 99999}
          step="0.1"
          value={Number(audioState.audioRangeEnd).toFixed(1)}
          oninput={(e) => audioState.handleEndInput(e)}
          {disabled}
          aria-label="End time in seconds"
        />
        <span class="ip-unit">s</span>
        <button
          type="button"
          class="btn-icon-sm"
          onclick={() => audioState.setEndToCurrent()}
          disabled={disabled || !audioState.audioElement}
          title="Set the end to where playback has reached"
          aria-label="Set end from the playback position"
        >
          <i class="fa-solid fa-crosshairs"></i>
        </button>
      </div>
      {#if duration >= 60}
        <span class="ip-alt">{formatTimeSec1(audioState.audioRangeEnd)}</span>
      {/if}
    </div>
  </div>

  <div class="ip-actions">
    <button
      type="button"
      class="btn-pill"
      class:is-active={audioState.isPlayingInterval}
      onclick={() => audioState.togglePlayInterval()}
      {disabled}
      title="Play only the selected portion"
    >
      <i
        class="fa-solid {audioState.isPlayingInterval ? 'fa-pause' : 'fa-play'}"
      ></i>
      <span>{audioState.isPlayingInterval ? 'Pause' : 'Play selection'}</span>
    </button>

    {#if audioState.isIntervalSelected}
      <button
        type="button"
        class="btn-pill btn-pill-quiet"
        onclick={() => audioState.resetInterval()}
        {disabled}
        title="Select the whole recording again"
      >
        <i class="fa-solid fa-rotate-left"></i>
        <span>Whole</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .ip {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }

  .ip.is-disabled {
    opacity: 0.6;
  }

  /* ------------------------------------------------------------------ Track */
  .ip-track {
    position: relative;
    height: 20px;
    /* Generous hit area: the press lands on the track, not on a tiny thumb */
    margin: 2px 8px 0;
    cursor: ew-resize;
    touch-action: none;
  }

  .ip-rail,
  .ip-band {
    position: absolute;
    top: 50%;
    height: 6px;
    transform: translateY(-50%);
    border-radius: 3px;
    pointer-events: none;
  }

  .ip-rail {
    left: 0;
    right: 0;
    background: var(--bg-muted, #e2e8f0);
  }

  :global([data-theme='dark']) .ip-rail {
    background: #334155;
  }

  .ip-band {
    background: linear-gradient(90deg, #0284c7, #0ea5e9);
  }

  :global([data-theme='dark']) .ip-band {
    background: linear-gradient(90deg, #0369a1, #38bdf8);
  }

  .ip-playhead {
    position: absolute;
    top: 1px;
    bottom: 1px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: #ef4444;
    pointer-events: none;
    z-index: 2;
  }

  .ip-handle {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    margin-left: -8px;
    transform: translateY(-50%);
    padding: 0;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: #0284c7;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
    cursor: grab;
    z-index: 3;
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease;
  }

  .ip-handle:hover:not(:disabled) {
    transform: translateY(-50%) scale(1.15);
  }

  .ip-handle:focus-visible {
    outline: 2px solid #0ea5e9;
    outline-offset: 2px;
  }

  .ip-handle.is-grabbed {
    cursor: grabbing;
    transform: translateY(-50%) scale(1.2);
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.5);
  }

  .ip-handle:disabled {
    cursor: not-allowed;
  }

  :global([data-theme='dark']) .ip-handle {
    border-color: #0f172a;
    background: #38bdf8;
  }

  .ip-track.is-dragging {
    cursor: grabbing;
  }

  /* ------------------------------------------------------------------ Scale */
  .ip-scale {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
  }

  .ip-edge {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    flex-shrink: 0;
  }

  .ip-summary {
    font-weight: 650;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ip-summary.is-partial {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .ip-summary.is-partial {
    color: #7dd3fc;
  }

  /* ----------------------------------------------------------------- Fields */
  .ip-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .ip-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .ip-field-label {
    font-size: 0.67rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted, #64748b);
  }

  .ip-unit {
    font-size: 0.68rem;
    color: var(--text-muted, #94a3b8);
    flex-shrink: 0;
  }

  .ip-alt {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.65rem;
    color: var(--text-muted, #94a3b8);
  }

  /* ---------------------------------------------------------------- Actions */
  .ip-actions {
    display: flex;
    gap: 6px;
  }

  /* .btn-pill (app.css) needs flex:1 here so the two action buttons share the row */
  .ip-actions .btn-pill {
    flex: 1;
    min-width: 0;
  }

  /* Very narrow panels: stack the two fields */
  @container (max-width: 240px) {
    .ip-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
