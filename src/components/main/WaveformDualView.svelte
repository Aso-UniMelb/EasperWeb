<script>
  import { appState } from '../../state/appState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { modelState } from '../../state/modelState.svelte.js';
  import { formatTimeSec } from '../../utils/formatters.js';
  import { getSpeakerColor } from '../../utils/speakers.js';
  import SegmentCard from './SegmentCard.svelte';
  import TierLegend from './TierLegend.svelte';
  import { buildColumns } from '../../utils/subTiers.js';
  import SegmentationSettingsPanel from './SegmentationSettingsPanel.svelte';
  import SpeechRecognitionSettingsPanel from './SpeechRecognitionSettingsPanel.svelte';
  import AutoTaggingSettingsPanel from './AutoTaggingSettingsPanel.svelte';
  import WaveformBoundaryMagnifier from './WaveformBoundaryMagnifier.svelte';

  let { onWorkerReset } = $props();

  let activeDrawer = $state(null); // 'segmentation' | 'recognition' | 'tagging' | null
  let waveformDualWrapperEl = $state(null);

  function toggleDrawer(name) {
    activeDrawer = activeDrawer === name ? null : name;
  }

  // Ctrl + Scroll / Cmd + Scroll to adjust vertical zoom while keeping playhead visible
  $effect(() => {
    const handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (
        waveformDualWrapperEl &&
        (waveformDualWrapperEl === e.target ||
          waveformDualWrapperEl.contains(e.target))
      ) {
        e.preventDefault();

        const currentScale = transcriptState.WAVEFORM_SCALE_PX_PER_SEC;
        let factor;
        if (Math.abs(e.deltaY) >= 50) {
          factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        } else {
          factor = Math.exp(-e.deltaY * 0.003);
        }

        let newScale = Math.round((currentScale * factor) / 5) * 5;
        if (newScale === currentScale) {
          newScale += e.deltaY < 0 ? 10 : -10;
        }

        transcriptState.setZoomLevel(newScale, true);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  });

  // Redraw visible waveform tiles when zoom, height, active segment, or interval range changes
  $effect(() => {
    if (transcriptState.waveformWrapEl) {
      const _currentH = transcriptState.waveformCalculatedHeight;
      const _tiles = transcriptState.visibleWaveformTiles;
      const _activeSeg = transcriptState.currentTranscribingSegment;
      const _rangeStart = audioState.audioRangeStart;
      const _rangeEnd = audioState.audioRangeEnd;
      const _intervalActive = audioState.isIntervalSelected;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    }
  });

  $effect(() => {
    if (
      transcriptState.waveformWrapEl &&
      typeof ResizeObserver !== 'undefined'
    ) {
      const ro = new ResizeObserver(() => {
        transcriptState.drawVerticalWaveform();
      });
      ro.observe(transcriptState.waveformWrapEl);
      return () => ro.disconnect();
    }
  });

  // Smooth 60fps animation loop during audio playback to continuously glide the playhead and auto-scroll
  let playAnimFrame = null;
  $effect(() => {
    if (transcriptState.isAudioPlaying) {
      let active = true;
      const loop = () => {
        if (!active) return;
        if (audioState.audioElement) {
          audioState.playerCurrentTime = audioState.audioElement.currentTime;
        }
        transcriptState.drawPlayheadFrame();

        // Auto-scroll waveform playhead into view during playback
        if (
          transcriptState.waveformContainerEl &&
          transcriptState.waveformState?.duration
        ) {
          const curTime = audioState.audioElement
            ? audioState.audioElement.currentTime
            : audioState.playerCurrentTime;
          const currentY =
            ((curTime - (transcriptState.waveformState.startTime || 0)) /
              transcriptState.waveformState.duration) *
            transcriptState.waveformCalculatedHeight;
          const scrollTop = transcriptState.waveformContainerEl.scrollTop;
          const clientHeight = transcriptState.waveformContainerEl.clientHeight;
          if (
            currentY < scrollTop + 30 ||
            currentY > scrollTop + clientHeight - 60
          ) {
            transcriptState.waveformContainerEl.scrollTop = Math.max(
              0,
              currentY - clientHeight / 2,
            );
          }
        }

        playAnimFrame = requestAnimationFrame(loop);
      };
      playAnimFrame = requestAnimationFrame(loop);
      return () => {
        active = false;
        if (playAnimFrame) cancelAnimationFrame(playAnimFrame);
      };
    } else {
      if (audioState.audioElement) {
        audioState.playerCurrentTime = audioState.audioElement.currentTime;
      }
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    }
  });

  // Text columns for the segment rows, in the arrangement saved on the project.
  // The legend is only worth showing once there is more than the transcription.
  let columns = $derived(
    buildColumns(projectState.activeProject?.subTiers, {
      columnOrder: projectState.activeProject?.columnOrder,
      hiddenColumns: projectState.activeProject?.hiddenColumns,
    }),
  );

  /**
   * Action to position the context menu accurately.
   * If near the bottom of the screen (or insufficient space below pointer),
   * position the context menu above the pointer.
   */
  function positionContextMenu(node) {
    function adjust() {
      if (!transcriptState.contextMenu.visible) return;
      const rect = node.getBoundingClientRect();
      const padding = 10;
      const clientX =
        transcriptState.contextMenu.clientX ?? transcriptState.contextMenu.x;
      const clientY =
        transcriptState.contextMenu.clientY ?? transcriptState.contextMenu.y;

      const spaceBelow = window.innerHeight - clientY;
      const spaceAbove = clientY;
      const shouldShowAbove =
        spaceBelow < rect.height + padding && spaceAbove > spaceBelow;

      let x = clientX;
      let y;

      if (shouldShowAbove) {
        // Show above the pointer: bottom of menu sits 4px above cursor
        y = Math.max(padding, clientY - rect.height - 4);
        node.classList.add('open-above');
        node.style.transformOrigin = 'bottom left';
      } else {
        // Show below the pointer: top of menu sits 2px below cursor
        y = Math.min(window.innerHeight - rect.height - padding, clientY + 2);
        node.classList.remove('open-above');
        node.style.transformOrigin = 'top left';
      }

      // Keep within horizontal viewport boundaries
      if (x + rect.width > window.innerWidth - padding) {
        x = Math.max(padding, window.innerWidth - rect.width - padding);
      } else {
        x = Math.max(padding, x);
      }

      node.style.left = `${Math.round(x)}px`;
      node.style.top = `${Math.round(y)}px`;
    }

    adjust();

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => adjust());
      ro.observe(node);
    }

    return {
      destroy() {
        if (ro) ro.disconnect();
      },
    };
  }
</script>

<!-- Dual-Column Layout: Fixed Header (Play, Zoom, Add Segment) + Scrollable Container -->
<div class="waveform-dual-wrapper" bind:this={waveformDualWrapperEl}>
  <div class="waveform-dual-header-bar">
    <!-- Play / Pause Button -->
    <button
      type="button"
      class="btn-waveform-play {transcriptState.isAudioPlaying
        ? 'btn-pause'
        : 'btn-play'}"
      onclick={() => transcriptState.toggleWaveformPlayback()}
      title={transcriptState.isAudioPlaying
        ? 'Pause playback'
        : 'Play from current playhead position'}
      disabled={!transcriptState.waveformState}
    >
      <i
        class="fa-solid {transcriptState.isAudioPlaying
          ? 'fa-pause'
          : 'fa-play'}"
      ></i>
      <span>{transcriptState.isAudioPlaying ? 'Pause' : 'Play'}</span>
    </button>

    <div class="header-action-divider"></div>

    <!-- Vertical Zoom Control -->
    <div
      class="waveform-zoom-control"
      title="Vertical Zoom: {transcriptState.WAVEFORM_SCALE_PX_PER_SEC}px/s ({transcriptState.waveformCalculatedHeight}px) • Ctrl + Scroll to zoom"
    >
      <i class="fa-solid fa-magnifying-glass zoom-icon"></i>
      <input
        type="range"
        min="50"
        max="1500"
        step="10"
        value={transcriptState.WAVEFORM_SCALE_PX_PER_SEC}
        oninput={(e) =>
          transcriptState.setZoomLevel(Number(e.target.value), true)}
        class="waveform-zoom-slider"
        aria-label="Vertical zoom for waveform canvas"
      />
      <span class="waveform-zoom-badge">
        {transcriptState.WAVEFORM_SCALE_PX_PER_SEC}
      </span>
    </div>

    <!-- Audio Playback Speed Control -->
    <div
      class="waveform-speed-control"
      title="Audio Playback Speed: {audioState.playbackSpeed.toFixed(
        2,
      )}x (range: 0.5x – 1.5x)"
    >
      <i class="fa-solid fa-gauge-high speed-icon"></i>
      <input
        type="range"
        min="0.5"
        max="1.5"
        step="0.05"
        bind:value={audioState.playbackSpeed}
        class="waveform-speed-slider"
        aria-label="Audio playback speed"
      />
      <span class="waveform-speed-badge">
        {audioState.playbackSpeed.toFixed(2)}x
      </span>
    </div>

    <div class="header-action-divider"></div>

    <!-- Automatic Segmentation Settings Toggle Button -->
    <button
      type="button"
      class="btn-header-tool {activeDrawer === 'segmentation'
        ? 'is-active active-segment'
        : ''}"
      onclick={() => toggleDrawer('segmentation')}
      title="Automatic segmentation settings and execution"
      aria-expanded={activeDrawer === 'segmentation'}
    >
      <i class="fa-solid fa-scissors"></i>
      <span>Auto Segmentation</span>
      <i
        class="fa-solid fa-chevron-down toggle-caret {activeDrawer ===
        'segmentation'
          ? 'open'
          : ''}"
      ></i>
    </button>

    <!-- Speech Recognition Settings Toggle Button -->
    <button
      type="button"
      class="btn-header-tool {activeDrawer === 'recognition'
        ? 'is-active active-transcribe'
        : ''}"
      onclick={() => toggleDrawer('recognition')}
      title="Speech recognition model settings and execution"
      aria-expanded={activeDrawer === 'recognition'}
    >
      <i class="fa-solid fa-brain"></i>
      <span>Speech Recognition</span>
      {#if transcriptState.emptySegmentsCount > 0}
        <span class="tool-count-badge"
          >{transcriptState.emptySegmentsCount}</span
        >
      {/if}
      <i
        class="fa-solid fa-chevron-down toggle-caret {activeDrawer ===
        'recognition'
          ? 'open'
          : ''}"
      ></i>
    </button>

    <!-- Auto Tagging Settings Toggle Button -->
    <button
      type="button"
      class="btn-header-tool {activeDrawer === 'tagging'
        ? 'is-active active-tagging'
        : ''}"
      onclick={() => toggleDrawer('tagging')}
      title="Automatically tag word-level sub-tiers from active lexicon"
      aria-expanded={activeDrawer === 'tagging'}
    >
      <i class="fa-solid fa-tags"></i>
      <span>Auto Tagging</span>
      <i
        class="fa-solid fa-chevron-down toggle-caret {activeDrawer ===
        'tagging'
          ? 'open'
          : ''}"
      ></i>
    </button>

    <div class="header-action-divider"></div>

    <!-- Writing Direction Toggle (LTR <-> RTL) -->
    <button
      type="button"
      class="btn-dir-toggle {transcriptState.textDirection === 'rtl'
        ? 'is-rtl'
        : ''}"
      onclick={() => transcriptState.toggleTextDirection()}
      title="Toggle writing direction ({transcriptState.textDirection === 'ltr'
        ? 'Current: Left-to-Right. Click to switch to Right-to-Left (RTL)'
        : 'Current: Right-to-Left. Click to switch to Left-to-Right (LTR)'})"
      aria-label="Toggle writing direction (RTL/LTR)"
    >
      <i
        class="fa-solid {transcriptState.textDirection === 'rtl'
          ? 'fa-align-right'
          : 'fa-align-left'}"
      ></i>
      <span class="dir-badge"
        >{transcriptState.textDirection.toUpperCase()}</span
      >
    </button>

    {#if appState.isProcessing}
      <div class="header-action-divider"></div>
      <span class="transcribing-live-badge">
        <i class="fa-solid fa-spinner fa-spin"></i>
        {appState.activeAction === 'segment'
          ? 'Segmenting in progress...'
          : appState.activeAction === 'diarize'
            ? 'Diarization in progress...'
            : 'Transcribing in progress...'}
      </span>
    {/if}

    {#if columns.length > 1}
      <div class="header-action-divider"></div>
      <TierLegend {columns} />
    {/if}
  </div>

  <!-- Inline Settings Panel Drawer opens above transcript-dual-container -->
  {#if activeDrawer === 'segmentation'}
    <SegmentationSettingsPanel
      onClose={() => (activeDrawer = null)}
      {onWorkerReset}
    />
  {:else if activeDrawer === 'recognition'}
    <SpeechRecognitionSettingsPanel
      onClose={() => (activeDrawer = null)}
      {onWorkerReset}
    />
  {:else if activeDrawer === 'tagging'}
    <AutoTaggingSettingsPanel
      onClose={() => (activeDrawer = null)}
    />
  {/if}

  <div
    class="transcript-dual-container"
    bind:this={transcriptState.waveformContainerEl}
    onscroll={(e) => transcriptState.handleScroll(e)}
  >
    <!-- Left Column: Vertical Waveform Visualisation -->
    <div class="waveform-sidebar-col">
      <!-- Full-size Canvas Wrapper -->
      <div
        class="waveform-canvas-wrap"
        bind:this={transcriptState.waveformWrapEl}
        style="height: {transcriptState.waveformCalculatedHeight}px; min-height: {transcriptState.waveformCalculatedHeight}px;"
        onpointerdown={(e) => transcriptState.handleWaveformPointerDown(e)}
        onpointermove={(e) => transcriptState.handleWaveformPointerMove(e)}
        onpointerup={(e) => transcriptState.handleWaveformPointerUp(e)}
        onpointercancel={(e) => transcriptState.handleWaveformPointerUp(e)}
        onmouseleave={() => transcriptState.handleWaveformMouseLeave()}
        onclick={(e) => transcriptState.handleWaveformClick(e)}
        oncontextmenu={(e) => transcriptState.handleWaveformContextMenu(e)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            transcriptState.handleWaveformClick(e);
          }
        }}
        role="button"
        tabindex="0"
        aria-label="Interactive vertical waveform timeline"
        title="Click to seek audio, drag handles to edit boundaries, or right-click to add a segment"
      >
        {#each transcriptState.visibleWaveformTiles as tile (tile.index)}
          <canvas
            class="waveform-tile-canvas"
            data-tile-index={tile.index}
            style="top: {tile.top}px; height: {tile.height}px;"
          ></canvas>
        {/each}
        {#if transcriptState.waveformHoverTime !== null}
          <div
            class="waveform-hover-tooltip"
            style="top: {Math.max(
              10,
              Math.min(
                transcriptState.waveformCalculatedHeight - 24,
                transcriptState.waveformHoverY - 12,
              ),
            )}px;"
          >
            <i class="fa-solid fa-play"></i>
            {formatTimeSec(transcriptState.waveformHoverTime)}
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Column: Gradually Appended Transcribed Segments -->
    <div
      class="segments-main-col"
      bind:this={transcriptState.segmentsContainerEl}
    >
      {#if appState.isProcessing && transcriptState.segments.length === 0}
        <!-- Live Processing Placeholder while waiting for first segment -->
        <div class="segment-loading-state">
          <div class="segment-loading-spinner">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
          </div>
          <div class="segment-loading-info">
            {#if appState.activeAction === 'segment'}
              <h4>Scanning audio...</h4>
              <p>
                Detecting speech intervals and non-speech gaps. Identified
                segments will appear here automatically with editable
                boundaries.
              </p>
            {:else}
              <h4>Detecting speech &amp; transcribing utterances...</h4>
              <p>
                Silero VAD has identified speech intervals on the timeline.
                Whisper is currently transcribing the audio; completed segments
                will appear here automatically.
              </p>
            {/if}
          </div>
        </div>
      {:else if !appState.isProcessing && transcriptState.segments.length === 0}
        <div class="segment-empty-state segment-welcome-state">
          <div class="segment-welcome-header">
            <div class="welcome-icon-badge">
              <i class="fa-solid fa-scissors"></i>
            </div>
            <div>
              <h4 class="welcome-title">Ready for Speech Segmentation</h4>
              <p class="welcome-sub">
                No speech segments created yet. You can segment your audio
                automatically with AI or create intervals manually:
              </p>
            </div>
          </div>

          <div class="segment-options-grid">
            <!-- Option 1: Automatic Segmentation -->
            <div class="segment-option-card card-auto">
              <div class="option-header">
                <span class="option-badge-icon badge-auto">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                </span>
                <span class="option-tag">Automatic</span>
              </div>
              <h5 class="option-title">Automatic Segmentation</h5>
              <p class="option-desc">
                Scan with Voice Activity Detection to detect human speech
                boundaries automatically.
              </p>
              <button
                type="button"
                class="btn-option-action btn-auto-action"
                onclick={() => transcriptState.handleSegmentOnly()}
                disabled={!audioState.selectedFile ||
                  !audioState.currentAudioUrl}
                title="Run Silero Voice Activity Detection"
              >
                <i class="fa-solid fa-bolt"></i>
                <span>Run Automatic Segmentation</span>
              </button>
            </div>

            <!-- Option 2: Manual Right-Click -->
            <div class="segment-option-card card-manual">
              <div class="option-header">
                <span class="option-badge-icon badge-manual">
                  <i class="fa-solid fa-mouse-pointer"></i>
                </span>
                <span class="option-tag tag-manual">Manual</span>
              </div>
              <h5 class="option-title">Manual Segmentation</h5>
              <p class="option-desc">
                <strong>Right-click anywhere on the waveform</strong> to create a
                new speech segment at that exact timestamp.
              </p>
              <div class="option-hint">
                <i class="fa-solid fa-arrows-left-right"></i>
                <span
                  >Drag boundary handles to fine-tune start and end times</span
                >
              </div>
            </div>
          </div>

          {#if transcriptState.hasRunVad}
            <div class="vad-threshold-notice">
              <i class="fa-solid fa-circle-info"></i>
              <span>
                Note: Previous VAD scan found no speech regions above threshold {transcriptState.vadThreshold}.
                Try lowering the Speech Threshold in VAD settings or right-click
                on the waveform to segment manually.
              </span>
            </div>
          {/if}
        </div>
      {/if}

      {#if transcriptState.segments.length > 0}
        <div
          class="segments-track-wrap"
          style="height: {transcriptState.waveformCalculatedHeight +
            140}px; min-height: {transcriptState.waveformCalculatedHeight +
            140}px;"
        >
          {#each transcriptState.segments as seg (seg.id)}
            <SegmentCard {seg} />
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if transcriptState.dragMagnifier?.active}
    <WaveformBoundaryMagnifier />
  {/if}
</div>

<!-- Waveform Right-Click Floating Context Menu -->
{#if transcriptState.contextMenu.visible}
  <div
    use:positionContextMenu
    class="waveform-context-menu {transcriptState.contextMenu.openAbove
      ? 'open-above'
      : ''}"
    style="left: {transcriptState.contextMenu.x}px; top: {transcriptState
      .contextMenu.y}px;"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') transcriptState.closeContextMenu();
    }}
  >
    <div class="context-menu-header">
      <i class="fa-solid fa-clock"></i>
      <span>Timeline {formatTimeSec(transcriptState.contextMenu.time)}</span>
    </div>
    <button
      type="button"
      class="context-menu-item"
      onclick={() => transcriptState.handleAddFromContextMenu()}
      role="menuitem"
    >
      <i class="fa-solid fa-plus"></i>
      <span
        >Add Segment at {formatTimeSec(transcriptState.contextMenu.time)}</span
      >
    </button>
    <button
      type="button"
      class="context-menu-item"
      onclick={() => transcriptState.handlePlayFromContextMenu()}
      role="menuitem"
    >
      <i class="fa-solid fa-play"></i>
      <span>Play from {formatTimeSec(transcriptState.contextMenu.time)}</span>
    </button>
    {#if transcriptState.contextMenu.targetSegment}
      <div class="context-menu-divider"></div>

      <!-- Quick Speaker Assignment in Context Menu -->
      <div class="context-menu-section-label">
        <i class="fa-solid fa-user-tag"></i>
        <span>Assign Speaker</span>
      </div>
      <div class="context-menu-speaker-row">
        {#each projectState.activeProject?.speakers || [{ id: 1, name: 'Speaker 1', initials: 'S1' }] as spk (spk.id)}
          {@const col = getSpeakerColor(spk.id)}
          {@const isAssigned =
            (Number(transcriptState.contextMenu.targetSegment.speakerId) ||
              1) === Number(spk.id)}
          <button
            type="button"
            class="context-speaker-badge {isAssigned ? 'assigned' : ''}"
            style="--spk-color: {col.primary};"
            onclick={() => {
              transcriptState.assignSegmentSpeaker(
                transcriptState.contextMenu.targetSegment.id,
                spk.id,
              );
              transcriptState.closeContextMenu();
            }}
            title="Assign {spk.name || 'Speaker ' + spk.id} ({spk.initials ||
              'S' + spk.id})"
          >
            {spk.initials || `S${spk.id}`}
          </button>
        {/each}
      </div>

      <div class="context-menu-divider"></div>
      <button
        type="button"
        class="context-menu-item item-split"
        onclick={() => transcriptState.handleSplitFromContextMenu()}
        role="menuitem"
        title="Split this segment at {formatTimeSec(
          transcriptState.contextMenu.time,
        )} and add an empty text block"
      >
        <i class="fa-solid fa-scissors"></i>
        <span>Split Here</span>
      </button>
      {#if transcriptState.contextMenu.nextSegment}
        <button
          type="button"
          class="context-menu-item item-merge"
          onclick={() => transcriptState.handleMergeWithNextFromContextMenu()}
          role="menuitem"
          title="Merge this segment with the next segment [{formatTimeSec(
            transcriptState.contextMenu.nextSegment.start,
          )} - {formatTimeSec(transcriptState.contextMenu.nextSegment.end)}]"
        >
          <i class="fa-solid fa-code-merge"></i>
          <span>Merge with the next</span>
        </button>
      {/if}

      <div class="context-menu-divider"></div>

      <!-- Multi-Model Transcription Buttons for Code-Switching -->
      <div class="context-menu-section-label">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span>Transcribe Segment</span>
      </div>

      {#if modelState.models && modelState.models.length > 0}
        {#each modelState.models as m (m.id)}
          {@const isActive = m.id === modelState.selectedModelId}
          <button
            type="button"
            class="context-menu-item item-transcribe {isActive
              ? 'is-active-model'
              : ''}"
            onclick={() => transcriptState.handleTranscribeFromContextMenu(m)}
            role="menuitem"
            disabled={appState.isProcessing}
            title="Transcribe segment using {m.title} [{formatTimeSec(
              transcriptState.contextMenu.targetSegment.start,
            )} - {formatTimeSec(
              transcriptState.contextMenu.targetSegment.end,
            )}]"
          >
            <i
              class="fa-solid {m.isPreset
                ? 'fa-wand-magic-sparkles'
                : 'fa-brain'}"
            ></i>
            <span class="context-menu-model-name">{m.title}</span>
            {#if isActive}
              <span class="context-model-active-badge">Active</span>
            {/if}
          </button>
        {/each}
      {:else}
        <button
          type="button"
          class="context-menu-item item-transcribe"
          onclick={() => transcriptState.handleTranscribeFromContextMenu()}
          role="menuitem"
          disabled={appState.isProcessing}
          title="Transcribe only this segment"
        >
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span
            >Transcribe Segment [{formatTimeSec(
              transcriptState.contextMenu.targetSegment.start,
            )} - {formatTimeSec(
              transcriptState.contextMenu.targetSegment.end,
            )}]</span
          >
        </button>
      {/if}

      <div class="context-menu-divider"></div>
      <button
        type="button"
        class="context-menu-item item-delete"
        onclick={() => transcriptState.handleDeleteFromContextMenu()}
        role="menuitem"
      >
        <i class="fa-solid fa-trash-can"></i>
        <span
          >Delete Segment [{formatTimeSec(
            transcriptState.contextMenu.targetSegment.start,
          )} - {formatTimeSec(
            transcriptState.contextMenu.targetSegment.end,
          )}]</span
        >
      </button>
    {/if}
  </div>
{/if}

<style>
  .segment-welcome-state {
    align-items: stretch;
    text-align: left;
    padding: 20px 24px;
    background: var(--bg-card, #ffffff);
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 10px;
    margin: 12px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  }

  :global([data-theme='dark']) .segment-welcome-state {
    background: rgba(30, 41, 59, 0.5);
    border-color: #334155;
  }

  .segment-welcome-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  :global([data-theme='dark']) .segment-welcome-header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .welcome-icon-badge {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: #e0f2fe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .welcome-icon-badge {
    background: rgba(2, 132, 199, 0.2);
    color: #38bdf8;
  }

  .welcome-title {
    margin: 0 0 4px 0 !important;
    font-size: 1.12rem !important;
    font-weight: 800 !important;
    color: var(--text-heading, #0f172a) !important;
  }

  .welcome-sub {
    margin: 0 !important;
    font-size: 0.88rem !important;
    color: var(--text-muted, #64748b) !important;
    max-width: none !important;
    line-height: 1.45 !important;
  }

  .segment-options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
    margin-bottom: 10px;
  }

  .segment-option-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.15s ease;
  }

  :global([data-theme='dark']) .segment-option-card {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .card-auto {
    border-color: #bae6fd;
    background: #f0f9ff;
  }

  :global([data-theme='dark']) .card-auto {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.3);
  }

  .option-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .option-badge-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
  }

  .badge-auto {
    background: #0284c7;
    color: #ffffff;
  }

  .badge-manual {
    background: #ede9fe;
    color: #7c3aed;
  }

  :global([data-theme='dark']) .badge-manual {
    background: rgba(124, 58, 237, 0.2);
    color: #c084fc;
  }

  .option-tag {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 4px;
    background: #e0f2fe;
    color: #0369a1;
  }

  :global([data-theme='dark']) .option-tag {
    background: rgba(2, 132, 199, 0.25);
    color: #38bdf8;
  }

  .tag-manual {
    background: #ede9fe;
    color: #6d28d9;
  }

  :global([data-theme='dark']) .tag-manual {
    background: rgba(124, 58, 237, 0.2);
    color: #c084fc;
  }

  .option-title {
    margin: 0;
    font-size: 0.96rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .option-desc {
    margin: 0 !important;
    font-size: 0.82rem !important;
    color: var(--text-base, #334155) !important;
    max-width: none !important;
    line-height: 1.45 !important;
    flex: 1;
  }

  .option-desc strong {
    color: var(--text-heading, #0f172a);
  }

  .btn-option-action {
    background: #0284c7;
    color: #ffffff;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s ease;
    margin-top: 6px;
  }

  .btn-option-action:hover:not(:disabled) {
    background: #0369a1;
    transform: translateY(-1px);
  }

  .btn-option-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .option-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
    color: var(--text-muted, #64748b);
    padding: 6px 8px;
    background: var(--bg-hover, #f1f5f9);
    border-radius: 4px;
    margin-top: 6px;
  }

  :global([data-theme='dark']) .option-hint {
    background: rgba(255, 255, 255, 0.04);
  }

  .vad-threshold-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    font-size: 0.78rem;
    color: #92400e;
    margin-top: 6px;
  }

  :global([data-theme='dark']) .vad-threshold-notice {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
    color: #fbbf24;
  }

  .context-menu-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
    padding: 3px 6px;
  }

  .context-menu-speaker-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px 6px 6px;
    flex-wrap: wrap;
  }

  .context-speaker-badge {
    padding: 3px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    background: var(--spk-color);
    color: #ffffff;
    border: 2px solid transparent;
    transition:
      transform 0.1s ease,
      filter 0.12s ease;
  }

  .context-speaker-badge:hover {
    transform: scale(1.06);
    filter: brightness(1.1);
  }

  .context-speaker-badge.assigned {
    border-color: #ffffff;
    box-shadow: 0 0 0 1.5px var(--spk-color);
  }

  /* Auto Segmentation & Speech Recognition Header Tool Buttons */
  .btn-header-tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    font-size: 0.77rem;
    font-weight: 700;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background-color: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-header-tool:hover:not(:disabled) {
    background-color: var(--bg-hover, #f8fafc);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-header-tool.is-active.active-segment {
    background-color: rgba(2, 132, 199, 0.12);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-header-tool.is-active.active-transcribe {
    background-color: rgba(124, 58, 237, 0.12);
    border-color: #7c3aed;
    color: #7c3aed;
  }

  .btn-header-tool.is-active.active-tagging {
    background-color: rgba(16, 185, 129, 0.12);
    border-color: #10b981;
    color: #059669;
  }

  :global([data-theme='dark']) .btn-header-tool.is-active.active-tagging {
    background-color: rgba(16, 185, 129, 0.2);
    border-color: #34d399;
    color: #34d399;
  }

  .btn-header-tool:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-caret {
    font-size: 0.65rem;
    opacity: 0.65;
    transition: transform 0.15s ease;
  }

  .toggle-caret.open {
    transform: rotate(180deg);
  }

  .tool-count-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.2);
    color: #b45309;
  }

  :global([data-theme='dark']) .btn-header-tool {
    background-color: rgba(30, 41, 59, 0.8);
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .btn-header-tool:hover:not(:disabled) {
    background-color: #334155;
    border-color: #38bdf8;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-header-tool.is-active.active-segment {
    background-color: rgba(56, 189, 248, 0.18);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-header-tool.is-active.active-transcribe {
    background-color: rgba(167, 139, 250, 0.2);
    border-color: #a78bfa;
    color: #c084fc;
  }

  :global([data-theme='dark']) .tool-count-badge {
    background: rgba(245, 158, 11, 0.25);
    color: #fbbf24;
  }
</style>
