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
  import {
    buildColumns,
    getSubText,
    SUB_TIER_TYPE_WORD,
  } from '../../utils/subTiers.js';
  import WordSubTierEditor from './WordSubTierEditor.svelte';
  import { hunspellState } from '../../state/hunspellState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { extractWordsFromText } from '../../utils/hunspellDictBuilder.js';

  let { seg } = $props();

  let isSelected = $derived(transcriptState.selectedSegmentId === seg.id);
  let isPlaying = $derived(
    (transcriptState.activePlayingSegmentId === seg.id ||
      transcriptState.activeSnippetPlayId === seg.id) &&
      transcriptState.isAudioPlaying,
  );
  let isLooping = $derived(
    isPlaying && transcriptState.activeLoopSegmentId === seg.id,
  );
  let isPlayingOnce = $derived(isPlaying && !isLooping);
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
  let cellEl = $state(null);
  let textareaEl = $state(null);
  let activeSpellMenu = $state(null); // { word, start, end, x, y, suggestions }

  const isLexiconSelected = $derived(
    Boolean(projectState.activeProject?.lexiconId),
  );

  const hasSpellcheck = $derived(
    Boolean(hunspellState.isReady && isLexiconSelected),
  );

  // Tokenize text into words and delimiters, identifying unrecognized words
  const spellTokens = $derived.by(() => {
    if (!hasSpellcheck || !seg.text) return [];

    // Track Hunspell dictionary changes reactively so re-scan happens automatically
    const _rebuiltAt = hunspellState.lastRebuiltAt;
    const _wordCount = hunspellState.wordCount;
    const _lexId = hunspellState.activeLexiconId;

    const regex = /([\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*)/gu;
    const parts = seg.text.split(regex);
    const tokens = [];

    for (const part of parts) {
      if (!part) continue;
      const isWord = /[\p{L}\p{N}]/u.test(part);
      if (isWord) {
        const isMisspelled = !hunspellState.spell(part);
        tokens.push({ text: part, isMisspelled, isWord: true });
      } else {
        tokens.push({ text: part, isMisspelled: false, isWord: false });
      }
    }
    return tokens;
  });

  const hasMisspelledWords = $derived(
    spellTokens.some((t) => t.isMisspelled),
  );

  function getWordAtOffset(text, offset) {
    if (!text || offset < 0 || offset > text.length) return null;

    let pos = offset;
    const isWordChar = (ch) => ch && /[\p{L}\p{N}_\-']/u.test(ch);

    if (!isWordChar(text[pos]) && pos > 0 && isWordChar(text[pos - 1])) {
      pos = pos - 1;
    }

    if (!isWordChar(text[pos])) return null;

    let start = pos;
    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }

    let end = pos;
    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    const rawWord = text.slice(start, end);
    const cleaned = rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!cleaned) return null;

    const wordStart = start + rawWord.indexOf(cleaned);
    const wordEnd = wordStart + cleaned.length;

    return {
      word: cleaned,
      start: wordStart,
      end: wordEnd,
    };
  }

  function handleWordClickAtCaret(caretPos, mouseEvent) {
    if (!hasSpellcheck || !seg.text) {
      activeSpellMenu = null;
      return false;
    }

    const wordInfo = getWordAtOffset(seg.text, caretPos);
    if (!wordInfo) {
      activeSpellMenu = null;
      return false;
    }

    if (!hunspellState.spell(wordInfo.word)) {
      const suggestions = hunspellState.suggest(wordInfo.word).slice(0, 5);

      let x = 12;
      let y = 32;
      if (cellEl && mouseEvent) {
        const rect = cellEl.getBoundingClientRect();
        x = Math.max(8, Math.min(rect.width - 220, mouseEvent.clientX - rect.left));
        y = mouseEvent.clientY - rect.top + 16;
      }

      activeSpellMenu = {
        word: wordInfo.word,
        start: wordInfo.start,
        end: wordInfo.end,
        x,
        y,
        suggestions,
      };
      return true;
    } else {
      activeSpellMenu = null;
      return false;
    }
  }

  function handleTextareaClick(e) {
    e.stopPropagation();
    const caretPos = e.target.selectionStart;
    handleWordClickAtCaret(caretPos, e);
  }

  function handleTextareaContextMenu(e) {
    const caretPos = e.target.selectionStart;
    const handled = handleWordClickAtCaret(caretPos, e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleApplySuggestion(suggestion) {
    if (!activeSpellMenu) return;
    const { start, end } = activeSpellMenu;
    const oldText = seg.text || '';
    const newText = oldText.slice(0, start) + suggestion + oldText.slice(end);
    transcriptState.updateSegmentText(seg.id, newText);
    projectState.saveCurrentProjectDebounced();
    activeSpellMenu = null;

    if (textareaEl) {
      textareaEl.focus();
      const newPos = start + suggestion.length;
      textareaEl.setSelectionRange(newPos, newPos);
    }
  }

  async function handleAddActiveToLexicon() {
    if (!activeSpellMenu) return;
    const word = activeSpellMenu.word;
    const lexId = projectState.activeProject?.lexiconId;
    activeSpellMenu = null;

    if (lexId && word) {
      await lexiconState.addHeadwordToLexicon(lexId, word);
      await projectState.syncProjectLexiconToHunspell(lexId);
      // Trigger instant reactivity across transcript segments
      transcriptState.segments = [...transcriptState.segments];
    }
  }

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
    class="btn-segment-play {isPlayingOnce ? 'playing' : ''}"
    onclick={(e) => {
      e.stopPropagation();
      transcriptState.playSegmentAudio(seg, false);
    }}
    title={isPlayingOnce
      ? 'Pause segment'
      : `Play segment (${formatTimeSec(seg.start)} - ${formatTimeSec(seg.end)})`}
    aria-label={isPlayingOnce ? 'Pause segment' : 'Play segment'}
  >
    <i
      class="fa-solid {isTranscribing
        ? 'fa-circle-notch fa-spin'
        : isPlayingOnce
          ? 'fa-pause'
          : 'fa-play'}"
    ></i>
  </button>

  <button
    type="button"
    class="btn-segment-loop {isLooping ? 'looping' : ''}"
    onclick={(e) => {
      e.stopPropagation();
      transcriptState.playSegmentAudio(seg, true);
    }}
    title={isLooping
      ? 'Stop loop playback'
      : `Loop segment (${formatTimeSec(seg.start)} - ${formatTimeSec(seg.end)})`}
    aria-label={isLooping ? 'Stop loop playback' : 'Loop segment'}
  >
    <i class="fa-solid fa-repeat"></i>
  </button>

  <div class="segment-content" style="grid-template-columns: {columnTemplate};">
    {#each visibleColumns as col (col.key)}
      {#if col.isMain}
        <div class="main-tier-cell" bind:this={cellEl}>
          {#if hasSpellcheck && hasMisspelledWords}
            <div
              class="spell-backdrop"
              aria-hidden="true"
              dir={transcriptState.textDirection}
            >
              {#each spellTokens as tok}
                {#if tok.isMisspelled}
                  <mark class="spell-wavy-underline">{tok.text}</mark>
                {:else}
                  <span>{tok.text}</span>
                {/if}
              {/each}
            </div>
          {/if}

          <textarea
            bind:this={textareaEl}
            use:autoResize
            class="segment-text-input"
            data-tier="main"
            dir={transcriptState.textDirection}
            bind:value={seg.text}
            spellcheck={isLexiconSelected ? 'false' : 'true'}
            onfocus={() => transcriptState.selectSegment(seg.id, false)}
            onclick={handleTextareaClick}
            oncontextmenu={handleTextareaContextMenu}
            onkeydown={(e) => handleTextareaKeyDown(e, 'main')}
            oninput={(e) => {
              transcriptState.updateSegmentText(seg.id, e.target.value);
              if (activeSpellMenu) activeSpellMenu = null;
            }}
            placeholder={isTranscribing ? 'Transcribing...' : '...'}
            rows="1"
            aria-label="Transcribed utterance text"
          ></textarea>

          {#if activeSpellMenu}
            <div
              class="spell-menu-scrim"
              onclick={(e) => {
                e.stopPropagation();
                activeSpellMenu = null;
              }}
              role="presentation"
            ></div>

            <div
              class="spell-suggestion-menu"
              style="left: {activeSpellMenu.x}px; top: {activeSpellMenu.y}px;"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => {
                if (e.key === 'Escape') activeSpellMenu = null;
              }}
              role="menu"
              tabindex="-1"
            >
              <div class="spell-menu-header">
                <span class="spell-menu-typo">"{activeSpellMenu.word}"</span>
                <button
                  type="button"
                  class="spell-menu-close"
                  onclick={() => (activeSpellMenu = null)}
                  title="Close suggestions"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              {#if activeSpellMenu.suggestions && activeSpellMenu.suggestions.length > 0}
                <div class="spell-menu-section-title">Suggestions</div>
                <div class="spell-menu-suggestions-list">
                  {#each activeSpellMenu.suggestions as sugg}
                    <button
                      type="button"
                      class="spell-menu-item suggestion-item"
                      onclick={() => handleApplySuggestion(sugg)}
                      role="menuitem"
                    >
                      <i class="fa-solid fa-check sugg-icon"></i>
                      <span>{sugg}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="spell-menu-empty">No suggestions found</div>
              {/if}

              <div class="spell-menu-divider"></div>

              <button
                type="button"
                class="spell-menu-item add-item"
                onclick={handleAddActiveToLexicon}
                role="menuitem"
              >
                <i class="fa-solid fa-plus add-icon"></i>
                <span>Add "{activeSpellMenu.word}" to Lexicon</span>
              </button>
            </div>
          {/if}
        </div>
      {:else if col.type === SUB_TIER_TYPE_WORD}
        <WordSubTierEditor
          {seg}
          {col}
          textDirection={transcriptState.textDirection}
        />
      {:else}
        <textarea
          use:autoResize
          class="segment-text-input segment-subtier-input"
          data-tier={col.key}
          dir={transcriptState.textDirection}
          value={getSubText(seg, col.key)}
          spellcheck={isLexiconSelected ? 'false' : 'true'}
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

  /* Spellchecking in SegmentCard */
  .main-tier-cell {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .spell-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 500;
    line-height: 1.4;
    padding: 2px 6px;
    margin: 0;
    border: 1px solid transparent;
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
    color: transparent;
    background: transparent;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    z-index: 3;
    text-align: inherit;
    direction: inherit;
  }

  @media (max-width: 900px) {
    .spell-backdrop {
      font-size: 0.82rem;
      padding: 2px 4px;
      line-height: 1.35;
    }
  }

  @media (max-width: 600px) {
    .spell-backdrop {
      font-size: 0.78rem;
      padding: 1px 2px;
      line-height: 1.3;
    }
  }

  .spell-wavy-underline {
    background: transparent;
    color: transparent;
    text-decoration: underline wavy #ef4444 1.5px;
    text-underline-offset: 3px;
  }

  :global([data-theme='dark']) .spell-wavy-underline {
    text-decoration-color: #f87171;
  }

  /* Transparent scrim for dismissing context menu on click-outside */
  .spell-menu-scrim {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 99;
    background: transparent;
    cursor: default;
  }

  /* Popover Context Menu */
  .spell-suggestion-menu {
    position: absolute;
    z-index: 100;
    min-width: 180px;
    max-width: 250px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.16);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    animation: menuFadeIn 0.12s ease-out;
  }

  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global([data-theme='dark']) .spell-suggestion-menu {
    background: #1e293b;
    border-color: #475569;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  }

  .spell-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 6px 5px 6px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .spell-menu-header {
    border-bottom-color: #334155;
  }

  .spell-menu-typo {
    font-size: 0.78rem;
    font-weight: 700;
    color: #ef4444;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-decoration: underline wavy #ef4444 1px;
  }

  :global([data-theme='dark']) .spell-menu-typo {
    color: #f87171;
  }

  .spell-menu-close {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .spell-menu-close:hover {
    color: #0f172a;
    background: rgba(0, 0, 0, 0.06);
  }

  :global([data-theme='dark']) .spell-menu-close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .spell-menu-section-title {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #64748b);
    padding: 4px 6px 2px 6px;
  }

  .spell-menu-suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 130px;
    overflow-y: auto;
  }

  .spell-menu-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    text-align: left;
    background: transparent;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .suggestion-item {
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .suggestion-item {
    color: #f1f5f9;
  }

  .suggestion-item:hover {
    background: #f0f9ff;
    color: #0284c7;
  }

  :global([data-theme='dark']) .suggestion-item:hover {
    background: #082f49;
    color: #38bdf8;
  }

  .sugg-icon {
    font-size: 0.7rem;
    color: #0284c7;
    opacity: 0.75;
  }

  .spell-menu-empty {
    font-size: 0.72rem;
    font-style: italic;
    color: var(--text-muted, #94a3b8);
    padding: 5px 8px;
  }

  .spell-menu-divider {
    height: 1px;
    background: var(--border-color, #e2e8f0);
    margin: 3px 0;
  }

  :global([data-theme='dark']) .spell-menu-divider {
    background: #334155;
  }

  .add-item {
    color: #ea580c;
  }

  :global([data-theme='dark']) .add-item {
    color: #fb923c;
  }

  .add-item:hover {
    background: #fff7ed;
  }

  :global([data-theme='dark']) .add-item:hover {
    background: rgba(234, 88, 12, 0.15);
  }

  .add-icon {
    font-size: 0.7rem;
  }
</style>
