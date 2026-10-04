<script>
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { tokenizeWords, getWordAnnotations } from '../../utils/subTiers.js';

  let { seg, col, textDirection = 'ltr' } = $props();

  let words = $derived(tokenizeWords(seg.text, col.splitters));
  let annotations = $derived(getWordAnnotations(seg, col.key, words.length));

  let activeWordIndex = $state(null);
  let activeSuggestionIndex = $state(0);
  let blurTimer = null;

  let currentVal = $derived(
    activeWordIndex !== null && annotations[activeWordIndex] != null
      ? String(annotations[activeWordIndex]).trim()
      : '',
  );

  function getItemVal(item) {
    if (!item) return '';
    return typeof item === 'object' ? String(item.value || '') : String(item);
  }

  function getItemLabel(item) {
    if (!item || typeof item !== 'object') return '';
    return String(item.label || '');
  }

  let filteredSuggestions = $derived.by(() => {
    if (activeWordIndex === null || !col.lexicon || col.lexicon.length === 0) {
      return [];
    }
    const q = currentVal.toLowerCase();
    if (!q) {
      return col.lexicon.slice(0, 16);
    }
    const starts = [];
    const contains = [];
    for (const item of col.lexicon) {
      const val = getItemVal(item).toLowerCase();
      if (val === q) continue; // exact match already typed
      if (val.startsWith(q)) {
        starts.push(item);
      } else if (val.includes(q)) {
        contains.push(item);
      }
    }
    return [...starts, ...contains].slice(0, 16);
  });

  let validLexiconSet = $derived.by(() => {
    if (!col.lexicon || col.lexicon.length === 0) return null;
    const set = new Set();
    for (const item of col.lexicon) {
      const v = getItemVal(item).toLowerCase();
      if (v) set.add(v);
    }
    return set;
  });

  function isInvalidTag(val) {
    if (!val || !validLexiconSet) return false;
    const trimmed = String(val).trim().toLowerCase();
    if (!trimmed) return false;
    return !validLexiconSet.has(trimmed);
  }

  function handleFocus(idx) {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    activeWordIndex = idx;
    activeSuggestionIndex = 0;
    transcriptState.selectSegment(seg.id, false);
  }

  function handleBlur(idx) {
    blurTimer = setTimeout(() => {
      if (activeWordIndex === idx) {
        activeWordIndex = null;
      }
    }, 160);
  }

  function handleInput(idx, value) {
    transcriptState.updateSegmentWordAnnotation(seg.id, col.key, idx, value);
    activeSuggestionIndex = 0;
  }

  function applySuggestion(idx, suggestion) {
    const tag = getItemVal(suggestion);
    transcriptState.updateSegmentWordAnnotation(seg.id, col.key, idx, tag);
    activeWordIndex = null;
    // Focus next word if available
    focusWordInput(idx + 1);
  }

  function focusWordInput(idx) {
    if (idx >= 0 && idx < words.length) {
      const nextEl = document.getElementById(
        `word-annot-${seg.id}-${col.key}-${idx}`,
      );
      if (nextEl) {
        nextEl.focus();
        nextEl.select();
      }
    }
  }

  function handleKeyDown(e, idx) {
    const hasDropdown =
      activeWordIndex === idx && filteredSuggestions.length > 0;

    if (e.key === 'ArrowDown') {
      if (hasDropdown) {
        e.preventDefault();
        e.stopPropagation();
        activeSuggestionIndex =
          (activeSuggestionIndex + 1) % filteredSuggestions.length;
        return;
      }
    }

    if (e.key === 'ArrowUp') {
      if (hasDropdown) {
        e.preventDefault();
        e.stopPropagation();
        activeSuggestionIndex =
          (activeSuggestionIndex - 1 + filteredSuggestions.length) %
          filteredSuggestions.length;
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (hasDropdown && filteredSuggestions[activeSuggestionIndex]) {
        applySuggestion(idx, filteredSuggestions[activeSuggestionIndex]);
      } else {
        activeWordIndex = null;
        if (idx < words.length - 1) {
          focusWordInput(idx + 1);
        } else {
          transcriptState.navigateToSegment(seg.id, 1, false, col.key);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      activeWordIndex = null;
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      activeWordIndex = null;
      if (e.shiftKey) {
        if (idx > 0) {
          focusWordInput(idx - 1);
        } else {
          transcriptState.navigateToSegment(seg.id, -1, false, col.key);
        }
      } else {
        if (idx < words.length - 1) {
          focusWordInput(idx + 1);
        } else {
          transcriptState.navigateToSegment(seg.id, 1, false, col.key);
        }
      }
      return;
    }

    e.stopPropagation();
  }
</script>

<div
  class="word-subtier-column"
  dir={textDirection}
  role="region"
  aria-label="{col.name} word annotations"
>
  {#if words.length === 0}
    <div class="word-subtier-empty" title="Type words in transcription first">
      <span class="empty-bullet">&bull;</span>
      <span class="empty-text">No words to annotate</span>
    </div>
  {:else}
    <div class="word-annotations-list">
      {#each words as word, idx (idx)}
        {@const val = annotations[idx] || ''}
        {@const isWarning = isInvalidTag(val)}
        <div class="word-annotation-item">
          <label
            for="word-annot-{seg.id}-{col.key}-{idx}"
            class="word-annotation-label"
            title="Word {idx + 1}: {word}"
          >
            {word}
          </label>
          <div class="word-annotation-box">
            <div class="word-annotation-input-wrapper">
              <textarea
                id="word-annot-{seg.id}-{col.key}-{idx}"
                data-tier={col.key}
                data-word-idx={idx}
                rows="1"
                spellcheck="false"
                class="word-annotation-textarea {isWarning ? 'is-warning' : ''}"
                placeholder={col.lexicon && col.lexicon.length > 0
                  ? 'tag'
                  : '...'}
                value={val}
                onfocus={() => handleFocus(idx)}
                onblur={() => handleBlur(idx)}
                oninput={(e) => handleInput(idx, e.target.value)}
                onkeydown={(e) => handleKeyDown(e, idx)}
                onclick={(e) => e.stopPropagation()}
                aria-label="{col.name} for {word}"
                title={isWarning
                  ? `Warning: "${val}" is not in the valid lexicon for ${col.name}`
                  : `${col.name} for ${word}`}
              ></textarea>

              {#if activeWordIndex === idx && filteredSuggestions.length > 0}
                <div class="word-autocomplete-dropdown" role="listbox">
                  <div class="autocomplete-header">
                    <span>{col.name} Lexicon</span>
                    <span class="suggestions-count">
                      {filteredSuggestions.length}
                    </span>
                  </div>
                  {#each filteredSuggestions as suggestion, sIdx}
                    {@const sVal = getItemVal(suggestion)}
                    {@const sLabel = getItemLabel(suggestion)}
                    <button
                      type="button"
                      class="word-autocomplete-item {sIdx ===
                      activeSuggestionIndex
                        ? 'active'
                        : ''}"
                      onmousedown={(e) => {
                        e.preventDefault();
                        applySuggestion(idx, suggestion);
                      }}
                      role="option"
                      aria-selected={sIdx === activeSuggestionIndex}
                    >
                      <span class="suggestion-tag">{sVal}</span>
                      {#if sLabel}
                        <span class="suggestion-label">{sLabel}</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .word-subtier-column {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .word-subtier-empty {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    font-size: 0.72rem;
    font-style: italic;
    color: var(--text-muted, #94a3b8);
    opacity: 0.85;
  }

  .empty-bullet {
    font-size: 0.9rem;
    line-height: 1;
  }

  .word-annotations-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    column-gap: 8px;
    row-gap: 6px;
    align-items: flex-start;
    width: 100%;
    padding: 2px 0;
  }

  .word-annotation-item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    min-width: 50px;
    max-width: 70px;
  }

  .word-annotation-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-color, #334155);
    white-space: nowrap;
    overflow: visible;
    text-overflow: ellipsis;
    user-select: none;
    cursor: default;
    line-height: 1.3;
    text-align: left;
    max-width: 100%;
    padding: 0 2px;
  }

  :global([dir='rtl']) .word-annotation-label {
    text-align: right;
  }

  :global([data-theme='dark']) .word-annotation-label {
    color: #cbd5e1;
  }

  .word-annotation-box {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .word-annotation-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .word-annotation-textarea {
    width: 100%;
    min-width: 64px;
    height: 22px;
    min-height: 22px;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.4;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: rgba(148, 163, 184, 0.08);
    color: var(--text-color, #0f172a);
    resize: none;
    outline: none;
    transition: all 0.12s ease;
    overflow: hidden;
    white-space: nowrap;
  }

  .word-annotation-textarea:hover {
    border-color: #94a3b8;
    background: rgba(255, 255, 255, 0.9);
  }

  .word-annotation-textarea:focus {
    background: #ffffff;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.18);
  }

  :global([data-theme='dark']) .word-annotation-textarea {
    background: rgba(255, 255, 255, 0.04);
    border-color: #334155;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .word-annotation-textarea:hover {
    border-color: #475569;
    background: rgba(255, 255, 255, 0.08);
  }

  :global([data-theme='dark']) .word-annotation-textarea:focus {
    background: #0f172a;
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22);
  }

  /* Warning highlight for values not in the valid lexicon */
  .word-annotation-textarea.is-warning {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
    color: #b45309;
  }

  .word-annotation-textarea.is-warning:hover {
    border-color: #d97706;
    background: rgba(245, 158, 11, 0.18);
  }

  .word-annotation-textarea.is-warning:focus {
    background: #ffffff;
    border-color: #d97706;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.28);
    color: #b45309;
  }

  :global([data-theme='dark']) .word-annotation-textarea.is-warning {
    border-color: rgba(245, 158, 11, 0.65);
    background: rgba(245, 158, 11, 0.14);
    color: #fbbf24;
  }

  :global([data-theme='dark']) .word-annotation-textarea.is-warning:hover {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.22);
  }

  :global([data-theme='dark']) .word-annotation-textarea.is-warning:focus {
    background: #0f172a;
    border-color: #fbbf24;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
    color: #fbbf24;
  }

  .word-autocomplete-dropdown {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    min-width: 140px;
    max-width: 220px;
    max-height: 170px;
    overflow-y: auto;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.15),
      0 4px 6px -4px rgba(0, 0, 0, 0.1);
    z-index: 150;
    display: flex;
    flex-direction: column;
    padding: 3px;
    animation: dropDownPop 0.1s ease-out;
  }

  :global([data-theme='dark']) .word-autocomplete-dropdown {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.5);
  }

  :global([dir='rtl']) .word-autocomplete-dropdown {
    left: auto;
    right: 0;
  }

  @keyframes dropDownPop {
    from {
      opacity: 0;
      transform: translateY(-3px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .autocomplete-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 3px 6px;
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #64748b);
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    margin-bottom: 2px;
  }

  :global([data-theme='dark']) .autocomplete-header {
    border-color: #334155;
    color: #94a3b8;
  }

  .suggestions-count {
    background: rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 0 4px;
    font-size: 0.6rem;
  }

  .word-autocomplete-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.1s ease,
      color 0.1s ease;
  }

  :global([data-theme='dark']) .word-autocomplete-item {
    color: #cbd5e1;
  }

  .word-autocomplete-item:hover,
  .word-autocomplete-item.active {
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
    font-weight: 700;
  }

  :global([data-theme='dark']) .word-autocomplete-item:hover,
  :global([data-theme='dark']) .word-autocomplete-item.active {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }

  .suggestion-tag {
    font-size: 0.78rem;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    color: var(--primary-color, #0284c7);
    white-space: nowrap;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .suggestion-tag {
    color: #38bdf8;
  }

  .suggestion-label {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global([data-theme='dark']) .suggestion-label {
    color: #94a3b8;
  }

  .word-autocomplete-item.active .suggestion-label,
  .word-autocomplete-item:hover .suggestion-label {
    color: var(--text-color, #0f172a);
  }

  :global([data-theme='dark']) .word-autocomplete-item.active .suggestion-label,
  :global([data-theme='dark']) .word-autocomplete-item:hover .suggestion-label {
    color: #f1f5f9;
  }
</style>
