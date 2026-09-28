<script>
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { autoResize } from '../../utils/actions.js';
  import { formatTimeSec } from '../../utils/formatters.js';
  import {
    getSpeakerClass,
    getSpeakerColor,
    getSpeakerInitials,
  } from '../../utils/speakers.js';
  import { buildColumns, getSubText } from '../../utils/subTiers.js';

  let { seg } = $props();

  let isSelected = $derived(transcriptState.selectedSegmentId === seg.id);
  let isPlaying = $derived(
    transcriptState.activePlayingSegmentId === seg.id &&
      transcriptState.isAudioPlaying,
  );
  let isHovered = $derived(transcriptState.activeHoverSegmentId === seg.id);
  let isTranscribing = $derived(
    transcriptState.currentTranscribingSegment &&
      (transcriptState.currentTranscribingSegment.id === seg.id ||
        (Math.abs(
          transcriptState.currentTranscribingSegment.start - seg.start,
        ) < 0.05 &&
          Math.abs(transcriptState.currentTranscribingSegment.end - seg.end) <
            0.05)),
  );

  let isSpeakerPickerOpen = $state(false);

  // Sub-tiers are a project-level setting; each adds one text column to every
  // segment. Order and visibility are arranged from the legend in the header bar.
  let columns = $derived(
    buildColumns(projectState.activeProject?.subTiers, {
      columnOrder: projectState.activeProject?.columnOrder,
      hiddenColumns: projectState.activeProject?.hiddenColumns,
    }),
  );

  let visibleColumns = $derived(columns.filter((c) => !c.hidden));

  // The transcription keeps a little more room than the dependent columns, which
  // usually hold shorter glosses or translations.
  let columnTemplate = $derived(
    visibleColumns.map((c) => (c.isMain ? '1.3fr' : '1fr')).join(' ') || '1fr',
  );

  let projectSpeakers = $derived(
    projectState.activeProject?.speakers || [
      { id: 1, name: 'Speaker 1', initials: 'S1' },
    ],
  );

  let activeSpeakerId = $derived(Number(seg.speakerId) || 1);
  let speakerColor = $derived(getSpeakerColor(activeSpeakerId));

  // Find matching configured speaker in project to get custom initials if configured
  let configuredSpeaker = $derived(
    projectSpeakers.find((s) => Number(s.id) === activeSpeakerId) || null,
  );

  let speakerInitials = $derived(
    configuredSpeaker &&
      configuredSpeaker.initials &&
      configuredSpeaker.initials.trim()
      ? configuredSpeaker.initials.trim().slice(0, 3).toUpperCase()
      : getSpeakerInitials(seg, activeSpeakerId),
  );

  /**
   * Tab moves to the same column of the next segment rather than across the row, so
   * that working down a translation column is one keystroke per segment.
   */
  function handleTextareaKeyDown(e, tierKey = 'main') {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        transcriptState.navigateToSegment(seg.id, -1, false, tierKey);
      } else {
        // Only the main tier auto-plays on advance; when glossing you are reading,
        // not re-listening to every segment.
        transcriptState.navigateToSegment(
          seg.id,
          1,
          tierKey === 'main',
          tierKey,
        );
      }
      return;
    }
    e.stopPropagation();
  }

  function handleSelectSpeaker(e, spkId) {
    e.stopPropagation();
    transcriptState.assignSegmentSpeaker(seg.id, spkId);
    isSpeakerPickerOpen = false;
  }

  function toggleSpeakerPicker(e) {
    e.stopPropagation();
    isSpeakerPickerOpen = !isSpeakerPickerOpen;
  }
</script>

<div
  id="segment-item-{seg.id}"
  class="segment-card {getSpeakerClass(
    seg.speakerId || seg.speaker,
  )} {isSelected ? 'segment-card-selected' : ''} {isPlaying
    ? 'segment-card-active'
    : ''} {isHovered ? 'segment-card-hover' : ''} {isTranscribing
    ? 'segment-card-transcribing'
    : ''}"
  style="top: {transcriptState.getSegmentTop(
    seg.start,
  )}px; --card-speaker-color: {speakerColor.primary};"
  onclick={() => {
    isSpeakerPickerOpen = false;
    transcriptState.selectSegment(seg.id, false);
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      transcriptState.selectSegment(seg.id, false);
    }
  }}
  onmouseenter={() => (transcriptState.activeHoverSegmentId = seg.id)}
  onmouseleave={() => {
    transcriptState.activeHoverSegmentId = null;
    isSpeakerPickerOpen = false;
  }}
  role="button"
  tabindex="0"
  aria-label="Speech segment"
  title="{seg.speaker || 'Speaker ' + activeSpeakerId} ({formatTimeSec(
    seg.start,
  )} - {formatTimeSec(seg.end)})"
>
  <!-- Speaker Initials Badge on Left Boundary -->
  <div class="segment-speaker-wrapper">
    <button
      type="button"
      class="segment-speaker-badge"
      style="background: {speakerColor.primary}; color: #ffffff;"
      onclick={toggleSpeakerPicker}
      title="Click to change speaker (Speaker #{activeSpeakerId}: {seg.speaker ||
        'Speaker ' + activeSpeakerId})"
      aria-label="Change speaker"
    >
      <span>{speakerInitials}</span>
      <i class="fa-solid fa-chevron-down spk-caret"></i>
    </button>

    {#if isSpeakerPickerOpen}
      <div
        class="speaker-picker-popover"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => {
          if (e.key === 'Escape') isSpeakerPickerOpen = false;
        }}
        role="menu"
        tabindex="-1"
      >
        <div class="speaker-picker-title">Assign Speaker</div>
        {#each projectSpeakers as spk (spk.id)}
          {@const col = getSpeakerColor(spk.id)}
          <button
            type="button"
            class="speaker-picker-option {activeSpeakerId === Number(spk.id)
              ? 'active'
              : ''}"
            onclick={(e) => handleSelectSpeaker(e, spk.id)}
            role="menuitem"
          >
            <span class="speaker-picker-dot" style="background: {col.primary};">
              {spk.initials || `S${spk.id}`}
            </span>
            <span class="speaker-picker-name"
              >{spk.name || `Speaker ${spk.id}`}</span
            >
            {#if activeSpeakerId === Number(spk.id)}
              <i
                class="fa-solid fa-check check-icon"
                style="color: {col.primary};"
              ></i>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <button
    type="button"
    class="btn-segment-play {isPlaying ? 'playing' : ''}"
    onclick={(e) => {
      e.stopPropagation();
      transcriptState.playSegmentAudio(seg);
    }}
    title={isPlaying
      ? 'Pause segment'
      : `Play segment (${formatTimeSec(seg.start)} - ${formatTimeSec(seg.end)})`}
    aria-label={isPlaying ? 'Pause segment' : 'Play segment'}
  >
    <i
      class="fa-solid {isTranscribing
        ? 'fa-circle-notch fa-spin'
        : isPlaying
          ? 'fa-pause'
          : 'fa-play'}"
    ></i>
  </button>

  <div class="segment-content" style="grid-template-columns: {columnTemplate};">
    {#each visibleColumns as col (col.key)}
      {#if col.isMain}
        <textarea
          use:autoResize
          class="segment-text-input"
          data-tier="main"
          dir={transcriptState.textDirection}
          bind:value={seg.text}
          onfocus={() => transcriptState.selectSegment(seg.id, false)}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => handleTextareaKeyDown(e, 'main')}
          oninput={(e) =>
            transcriptState.updateSegmentText(seg.id, e.target.value)}
          placeholder={isTranscribing ? 'Transcribing...' : '...'}
          rows="1"
          aria-label="Transcribed utterance text"
          title="Transcription (Tab: next segment & play, Shift+Tab: previous)"
        ></textarea>
      {:else}
        <textarea
          use:autoResize
          class="segment-text-input segment-subtier-input"
          data-tier={col.key}
          dir={transcriptState.textDirection}
          value={getSubText(seg, col.key)}
          onfocus={() => transcriptState.selectSegment(seg.id, false)}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => handleTextareaKeyDown(e, col.key)}
          oninput={(e) =>
            transcriptState.updateSegmentSubText(
              seg.id,
              col.key,
              e.target.value,
            )}
          placeholder={col.name}
          rows="1"
          aria-label="{col.name} for this utterance"
          title="{col.name} (Tab: next segment in this column)"
        ></textarea>
      {/if}
    {/each}
  </div>
</div>

<style>
  .segment-speaker-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .segment-speaker-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    border-radius: 4px;
    border: none;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    line-height: 1.1;
    letter-spacing: 0.02em;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    transition:
      transform 0.1s ease,
      filter 0.15s ease;
  }

  .segment-speaker-badge:hover {
    filter: brightness(1.1);
    transform: scale(1.04);
  }

  .spk-caret {
    font-size: 0.55rem;
    opacity: 0.85;
  }

  .speaker-picker-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.18),
      0 8px 10px -6px rgba(0, 0, 0, 0.1);
    padding: 5px;
    min-width: 170px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: popIn 0.12s ease-out;
  }

  :global([data-theme='dark']) .speaker-picker-popover {
    background: #1e293b;
    border-color: #334155;
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .speaker-picker-title {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #64748b);
    padding: 3px 6px 4px 6px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    margin-bottom: 2px;
  }

  :global([data-theme='dark']) .speaker-picker-title {
    border-color: #334155;
  }

  .speaker-picker-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .speaker-picker-option:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  :global([data-theme='dark']) .speaker-picker-option:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .speaker-picker-option.active {
    background: var(--bg-hover, #f1f5f9);
    font-weight: 700;
  }

  .speaker-picker-dot {
    width: 20px;
    height: 18px;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 0.64rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .speaker-picker-name {
    flex: 1;
    font-size: 0.78rem;
    color: var(--text-color, #334155);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global([data-theme='dark']) .speaker-picker-name {
    color: #f1f5f9;
  }

  .check-icon {
    font-size: 0.72rem;
  }

  /* Dependent-tier columns read as secondary to the transcription they annotate */
  .segment-subtier-input {
    font-style: italic;
    color: var(--text-muted, #475569);
    background: rgba(148, 163, 184, 0.07);
    border-left: 2px solid var(--border-color, #e2e8f0);
  }

  .segment-subtier-input:focus {
    font-style: normal;
    color: var(--text-color, #0f172a);
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .segment-subtier-input {
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.04);
    border-left-color: #334155;
  }

  :global([data-theme='dark']) .segment-subtier-input:focus {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.07);
  }
</style>
