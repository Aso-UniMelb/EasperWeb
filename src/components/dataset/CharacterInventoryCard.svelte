<script>
  import { datasetState } from '../../state/datasetState.svelte.js';

  let loadedCount = $derived(datasetState.pairedFiles.length);
  let stats = $derived(datasetState.totalSelectedStats);
  let detectedChars = $derived(datasetState.detectedCharacters);

  let allowedLetterTokens = $derived(
    datasetState.allowedLetters.split(/\s+/).filter(Boolean),
  );
  let allowedPunctTokens = $derived(
    datasetState.allowedPunctuation.split(/\s+/).filter(Boolean),
  );

  // Palette filtering & search: 'all' | 'letters' | 'punctuation' | 'numbers_symbols' | 'disallowed'
  let charFilterTab = $state('all');
  let charSearch = $state('');

  let lettersList = $derived(
    detectedChars.filter((c) => c.unicodeCat === 'letter'),
  );
  let punctList = $derived(
    detectedChars.filter((c) => c.unicodeCat === 'punctuation'),
  );
  let numSymList = $derived(
    detectedChars.filter((c) =>
      ['number', 'symbol', 'other'].includes(c.unicodeCat),
    ),
  );
  let disallowedChars = $derived(detectedChars.filter((c) => !c.isAllowed));
  let allowedChars = $derived(detectedChars.filter((c) => c.isAllowed));

  // Apostrophe detection & status in target tiers
  let apostropheFound = $derived(
    detectedChars.some((c) => ["'", '’', 'ʼ', 'ʻ'].includes(c.char)),
  );
  let isApostropheLetter = $derived(
    allowedLetterTokens.some((t) => ["'", '’', 'ʼ', 'ʻ'].includes(t)),
  );

  let displayedChars = $derived.by(() => {
    let list = detectedChars;
    if (charFilterTab === 'letters') {
      list = lettersList;
    } else if (charFilterTab === 'punctuation') {
      list = punctList;
    } else if (charFilterTab === 'numbers_symbols') {
      list = numSymList;
    } else if (charFilterTab === 'disallowed') {
      list = disallowedChars;
    } else if (charFilterTab === 'allowed') {
      list = allowedChars;
    }

    const q = charSearch.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (c) =>
        c.char.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q),
    );
  });
</script>

{#if loadedCount === 0}
  <div class="card empty-card">
    <div class="empty-icon-box">
      <i class="fa-solid fa-font"></i>
    </div>
    <h3 class="empty-title">No Files Loaded Yet</h3>
    <p class="empty-desc">
      Please ingest your ELAN and audio files in Step 1 first.
    </p>
    <button
      type="button"
      class="btn-step-prev"
      onclick={() => datasetState.setTab('ingest')}
    >
      <i class="fa-solid fa-arrow-left"></i>
      <span>Go to Step 1: Ingest Files</span>
    </button>
  </div>
{:else if !datasetState.hasAnyTierSelected()}
  <div class="card empty-card">
    <div class="empty-icon-box icon-purple">
      <i class="fa-solid fa-layer-group"></i>
    </div>
    <h3 class="empty-title">No Target Tiers Selected</h3>
    <p class="empty-desc">
      Please select at least one tier containing target language speech in Step
      2. Characters will then be extracted automatically.
    </p>
    <button
      type="button"
      class="btn-step-prev"
      onclick={() => datasetState.setTab('tiers')}
    >
      <i class="fa-solid fa-arrow-left"></i>
      <span>Back to Step 2: Select Tiers</span>
    </button>
  </div>
{:else}
  <div class="card character-inventory-card">
    <!-- Header Bar -->
    <div class="card-header-bar">
      <div class="header-left">
        <h3 class="inventory-card-title">
          3. Target Language Character Inventory
        </h3>
        <p class="inventory-card-subtitle">
          Define the valid alphabet and punctuation for your target language.
          Because you selected target tiers in Step 2, only characters from
          those speech tiers are shown below—clean of English translations or
          notes.
        </p>
      </div>

      <div class="header-summary-stats">
        <span class="summary-chip" title="Selected tiers in Step 2">
          <i class="fa-solid fa-layer-group"></i>
          <strong>{stats.tierCount}</strong> tier{stats.tierCount !== 1
            ? 's'
            : ''}
        </span>
        <span
          class="summary-chip"
          title="Total speech segments across selected tiers"
        >
          <i class="fa-solid fa-comments"></i>
          <strong>{stats.annCount}</strong> segments
        </span>
        <span
          class="summary-chip highlight-chip"
          title="Unique characters found in selected tiers"
        >
          <i class="fa-solid fa-spell-check"></i>
          <strong>{detectedChars.length}</strong> unique chars
        </span>
      </div>
    </div>

    <!-- Inventory Configuration Sections -->
    <div class="inventory-config-grid">
      <!-- Allowed Letters Configuration -->
      <section class="config-panel letters-panel">
        <div class="panel-header">
          <div class="panel-title">
            <i class="fa-solid fa-arrow-down-a-z panel-icon"></i>
            <span>Allowed Letters</span>
            <span class="count-badge">{allowedLetterTokens.length} letters</span
            >
          </div>

          <div class="panel-actions">
            <button
              type="button"
              class="btn-panel-action"
              onclick={() => datasetState.autoExtractAllowedLetters()}
              title="Reset allowed letters to unique letters detected in selected tiers"
            >
              <i class="fa-solid fa-rotate-left"></i> Reset Detected
            </button>
            <button
              type="button"
              class="btn-panel-action"
              onclick={() => datasetState.addAllDetectedLetters()}
              title="Add all detected non-punctuation characters"
            >
              <i class="fa-solid fa-plus-check"></i> Allow All
            </button>
            <button
              type="button"
              class="btn-panel-action btn-danger-action"
              onclick={() => datasetState.clearAllowedLetters()}
              title="Clear all allowed letters"
            >
              <i class="fa-solid fa-xmark"></i> Clear
            </button>
          </div>
        </div>

        <p class="panel-desc">
          Space-separated letters, diacritics, tone markers, or IPA symbols
          valid in your target language orthography.
        </p>

        <textarea
          id="allowed-letters"
          rows="3"
          class="form-textarea font-mono"
          bind:value={datasetState.allowedLetters}
          placeholder="e.g. a b c d e f g ŋ ʔ ə..."
        ></textarea>
        <span class="panel-hint">
          Any letter in your audio transcripts not listed here will trigger an
          issue in Step 4.
        </span>
      </section>

      <!-- Allowed Punctuation Configuration -->
      <section class="config-panel punct-panel">
        <div class="panel-header">
          <div class="panel-title">
            <i class="fa-solid fa-quote-right panel-icon"></i>
            <span>Allowed Punctuation</span>
            <span class="count-badge">{allowedPunctTokens.length} marks</span>
          </div>

          <div class="panel-actions">
            <button
              type="button"
              class="btn-panel-action"
              onclick={() => datasetState.resetStandardPunctuation()}
              title="Reset to standard punctuation set (- . , ; : ! ? &quot; ' ’)"
            >
              <i class="fa-solid fa-rotate-left"></i> Standard Preset
            </button>
            <button
              type="button"
              class="btn-panel-action"
              onclick={() => datasetState.autoExtractAllowedLetters()}
              title="Auto-detect punctuation from selected tiers via Unicode"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Detect
            </button>
          </div>
        </div>

        <p class="panel-desc">
          Space-separated symbols permitted as punctuation and phrase
          boundaries.
        </p>

        <textarea
          id="allowed-punctuation"
          rows="3"
          class="form-textarea font-mono"
          bind:value={datasetState.allowedPunctuation}
          placeholder={'- . , ; : ! ? " \' ’'}
        ></textarea>
        <span class="panel-hint">
          Punctuation outside this list will be flagged for review before
          dataset export.
        </span>
      </section>
    </div>

    <!-- Interactive Character Palette Section -->
    <section class="palette-section">
      <div class="palette-top-bar">
        <div class="palette-title-wrap">
          <h4 class="palette-heading">
            <i class="fa-solid fa-cubes-stacked palette-icon"></i>
            Characters Found in Selected Tiers ({detectedChars.length} unique)
          </h4>
          <span class="palette-subheading">
            Unicode classified. Click a letter to toggle Allowed Letters, or
            click punctuation to toggle Allowed Punctuation.
          </span>
        </div>

        <!-- Palette Filter Tabs & Search -->
        <div class="palette-controls">
          <div class="filter-tab-buttons" role="tablist">
            <button
              type="button"
              class="tab-btn {charFilterTab === 'all' ? 'active' : ''}"
              onclick={() => (charFilterTab = 'all')}
            >
              All ({detectedChars.length})
            </button>
            <button
              type="button"
              class="tab-btn {charFilterTab === 'letters' ? 'active' : ''}"
              onclick={() => (charFilterTab = 'letters')}
            >
              <i class="fa-solid fa-font"></i>
              Letters ({lettersList.length})
            </button>
            <button
              type="button"
              class="tab-btn {charFilterTab === 'punctuation' ? 'active' : ''}"
              onclick={() => (charFilterTab = 'punctuation')}
            >
              <i class="fa-solid fa-quote-right"></i>
              Punctuation ({punctList.length})
            </button>
            {#if numSymList.length > 0}
              <button
                type="button"
                class="tab-btn {charFilterTab === 'numbers_symbols'
                  ? 'active'
                  : ''}"
                onclick={() => (charFilterTab = 'numbers_symbols')}
              >
                <i class="fa-solid fa-hashtag"></i>
                Numbers/Symbols ({numSymList.length})
              </button>
            {/if}
            <button
              type="button"
              class="tab-btn {charFilterTab === 'disallowed'
                ? 'active'
                : ''} {disallowedChars.length > 0 ? 'tab-warn' : ''}"
              onclick={() => (charFilterTab = 'disallowed')}
            >
              {#if disallowedChars.length > 0}
                <i class="fa-solid fa-triangle-exclamation"></i>
              {/if}
              Disallowed ({disallowedChars.length})
            </button>
          </div>

          <div class="search-input-wrap">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              class="char-search-input"
              placeholder="Find character or U+..."
              bind:value={charSearch}
            />
            {#if charSearch}
              <button
                type="button"
                class="btn-clear-search"
                onclick={() => (charSearch = '')}
                title="Clear search"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Apostrophe Linguistic Helper Callout -->
      {#if apostropheFound}
        <div class="apostrophe-callout-box">
          <div class="callout-icon-box">
            <i class="fa-solid fa-lightbulb"></i>
          </div>
          <div class="callout-text-wrap">
            <h5 class="callout-heading">Apostrophe / Glottal Stop Treatment</h5>
            <p class="callout-desc">
              Apostrophes were detected in your transcripts. In Unicode,
              standard apostrophes are punctuation, but in many orthographies
              they serve as a glottal stop or ejective letter.
            </p>
          </div>
          <div class="callout-action-wrap">
            {#if isApostropheLetter}
              <span class="callout-status-tag tag-letter">
                <i class="fa-solid fa-check"></i> Treated as Allowed Letter
              </span>
              <button
                type="button"
                class="btn-callout-switch"
                onclick={() => datasetState.makeApostrophePunctuation()}
                title="Move apostrophe into Allowed Punctuation"
              >
                Switch to Punctuation
              </button>
            {:else}
              <span class="callout-status-tag tag-punct">
                <i class="fa-solid fa-quote-right"></i> Treated as Punctuation
              </span>
              <button
                type="button"
                class="btn-callout-switch btn-switch-letter"
                onclick={() => datasetState.makeApostropheLetter()}
                title="Move apostrophe into Allowed Letters (treating it as an orthographic consonant)"
              >
                <i class="fa-solid fa-arrow-right-arrow-left"></i> Make Allowed Letter
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Status Banner -->
      {#if disallowedChars.length > 0}
        <div class="status-banner banner-warning">
          <i class="fa-solid fa-triangle-exclamation banner-icon"></i>
          <div class="banner-content">
            <strong
              >{disallowedChars.length} character(s) detected in your transcripts
              are not in your Allowed list.</strong
            >
            <span>
              These will be flagged in Step 4 as errors or foreign characters.
              Click a chip below to allow it if it is legitimate, or leave it
              disallowed if it is a typo.
            </span>
          </div>
          <button
            type="button"
            class="btn-banner-action"
            onclick={() => datasetState.addAllDetectedLetters()}
          >
            Allow All {disallowedChars.length} Characters
          </button>
        </div>
      {:else}
        <div class="status-banner banner-success">
          <i class="fa-solid fa-circle-check banner-icon"></i>
          <div class="banner-content">
            <strong
              >All {detectedChars.length} characters in selected tiers are allowed!</strong
            >
            <span
              >Your orthography covers 100% of the characters detected in the
              target speech tiers.</span
            >
          </div>
        </div>
      {/if}

      <!-- Interactive Chips Grid -->
      <div class="chips-container">
        {#if displayedChars.length === 0}
          <div class="empty-chips">
            <p>No characters match your search or filter.</p>
          </div>
        {:else}
          <div class="char-chips-grid">
            {#each displayedChars as c}
              <button
                type="button"
                class="char-chip {c.isAllowed
                  ? 'chip-allowed'
                  : 'chip-disallowed'}"
                onclick={() => datasetState.toggleCharacter(c.char)}
                title="{c.char} ({c.hex}) - Unicode: {c.unicodeCat.toUpperCase()} - Count: {c.count}. Click to toggle {c.isAllowed
                  ? 'off'
                  : 'on'}"
              >
                <!-- Row 1: chip-cat-tag  chip-char  chip-status-icon -->
                <div class="chip-row-top">
                  <span class="chip-cat-tag cat-{c.unicodeCat}">
                    {c.unicodeCat === 'letter'
                      ? 'Letter'
                      : c.unicodeCat === 'punctuation'
                        ? 'Punct'
                        : c.unicodeCat === 'number'
                          ? 'Num'
                          : 'Symbol'}
                  </span>
                  <span class="chip-char">{c.char}</span>
                  <span class="chip-status-wrap">
                    {#if c.isAllowed}
                      <i class="fa-solid fa-check chip-status-icon text-success"
                      ></i>
                    {:else}
                      <span class="chip-action-text">+ Allow</span>
                    {/if}
                  </span>
                </div>

                <!-- Row 2: chip-count  chip-hex -->
                <div class="chip-row-bottom">
                  <span class="chip-count">{c.count}×</span>
                  <span class="chip-hex">{c.hex}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- Step Navigation & Validate Action Bar -->
    <div class="step-nav-footer">
      <button
        type="button"
        class="btn-step-prev"
        onclick={() => datasetState.setTab('tiers')}
      >
        <i class="fa-solid fa-arrow-left"></i>
        <span>Back to Select Tiers</span>
      </button>

      <div class="footer-actions-right">
        {#if datasetState.hasChecked}
          <button
            type="button"
            class="btn-step-view"
            onclick={() => datasetState.setTab('reports')}
          >
            <span>View Quality Reports</span>
            <i class="fa-solid fa-chart-column"></i>
          </button>
        {/if}

        <button
          type="button"
          class="btn-check-primary"
          disabled={datasetState.isChecking ||
            !datasetState.hasAnyTierSelected()}
          onclick={() => datasetState.startChecking()}
        >
          {#if datasetState.isChecking}
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Validating Transcripts...</span>
          {:else}
            <i class="fa-solid fa-circle-check"></i>
            <span>Validate &amp; Review Issues</span>
            <i class="fa-solid fa-arrow-right"></i>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .character-inventory-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
  }

  .inventory-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .inventory-header-icon {
    color: #0284c7;
  }

  .inventory-card-subtitle {
    font-size: 0.82rem;
    margin: 1px 0 0 0;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
    max-width: 820px;
  }

  .header-summary-stats {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .summary-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 0.74rem;
    font-weight: 500;
  }

  .summary-chip strong {
    color: var(--text-heading, #0f172a);
  }

  .highlight-chip {
    background: #e0f2fe;
    border-color: #bae6fd;
    color: #0369a1;
  }

  .highlight-chip strong {
    color: #0284c7;
  }

  /* Inventory Config Grid */
  .inventory-config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
  }

  .config-panel {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global([data-theme='dark']) .config-panel {
    background: rgba(255, 255, 255, 0.02);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .panel-title {
    font-size: 0.88rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .panel-icon {
    color: #0284c7;
    font-size: 1rem;
  }

  .count-badge {
    font-size: 0.72rem;
    font-weight: 700;
    background: #e2e8f0;
    color: var(--text-muted, #475569);
    padding: 2px 8px;
    border-radius: 12px;
  }

  .panel-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-panel-action {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--primary-color, #0284c7);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }

  .btn-panel-action:hover {
    background: #e0f2fe;
    border-color: #0284c7;
  }

  .btn-danger-action {
    color: #dc2626;
  }

  .btn-danger-action:hover {
    background: #fee2e2;
    border-color: #ef4444;
  }

  .panel-desc {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
    margin: 0;
    line-height: 1.4;
  }

  .form-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #0f172a);
    font-size: 0.85rem;
    line-height: 1.45;
    resize: vertical;
  }

  .form-textarea:focus {
    outline: none;
    border-color: #0284c7;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .panel-hint {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    font-style: italic;
  }

  /* Palette Section */
  .palette-section {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global([data-theme='dark']) .palette-section {
    background: rgba(255, 255, 255, 0.02);
  }

  .palette-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .palette-heading {
    font-size: 0.92rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .palette-icon {
    color: #7c3aed;
  }

  .palette-subheading {
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
    display: block;
    margin-top: 1px;
  }

  .palette-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-tab-buttons {
    display: flex;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .tab-btn {
    background: transparent;
    border: none;
    padding: 3px 8px;
    font-size: 0.74rem;
    font-weight: 700;
    border-radius: 4px;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: var(--text-heading, #0f172a);
  }

  .tab-btn.active {
    background: #0284c7;
    color: white;
  }

  .tab-warn.active {
    background: #d97706;
  }

  .search-input-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .search-input-wrap i {
    position: absolute;
    left: 8px;
    font-size: 0.74rem;
    color: var(--text-muted, #94a3b8);
  }

  .char-search-input {
    padding: 4px 24px 4px 24px;
    font-size: 0.78rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #0f172a);
    width: 140px;
  }

  .char-search-input:focus {
    outline: none;
    border-color: #0284c7;
    width: 180px;
    transition: width 0.2s ease;
  }

  .btn-clear-search {
    position: absolute;
    right: 6px;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 2px;
    font-size: 0.75rem;
  }

  /* Status Banner */
  .status-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.84rem;
    flex-wrap: wrap;
  }

  .banner-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 240px;
  }

  .banner-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }

  .banner-warning .banner-icon {
    color: #d97706;
  }

  .banner-success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .banner-success .banner-icon {
    color: #16a34a;
  }

  .btn-banner-action {
    background: #d97706;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-banner-action:hover {
    background: #b45309;
  }

  /* Apostrophe Callout Box */
  .apostrophe-callout-box {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .apostrophe-callout-box {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.25);
  }

  .callout-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #dbeafe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .callout-text-wrap {
    flex: 1;
    min-width: 260px;
  }

  .callout-heading {
    margin: 0 0 2px 0;
    font-size: 0.9rem;
    font-weight: 700;
    color: #1e3a8a;
  }

  :global([data-theme='dark']) .callout-heading {
    color: #93c5fd;
  }

  .callout-desc {
    margin: 0;
    font-size: 0.78rem;
    color: #3b82f6;
    line-height: 1.35;
  }

  :global([data-theme='dark']) .callout-desc {
    color: #bfdbfe;
  }

  .callout-action-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .callout-status-tag {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .tag-letter {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }

  .tag-punct {
    background: #f3e8ff;
    color: #7e22ce;
    border: 1px solid #e9d5ff;
  }

  .btn-callout-switch {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: var(--text-base, #334155);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-callout-switch:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
  }

  .btn-switch-letter {
    background: #0284c7;
    color: white;
    border-color: #0284c7;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-switch-letter:hover {
    background: #0369a1;
  }

  /* Chips Container & Grid */
  .chips-container {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 14px;
    max-height: 320px;
    overflow-y: auto;
  }

  .char-chips-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
    gap: 10px;
  }

  .char-chip {
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    min-height: 64px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    user-select: none;
    box-sizing: border-box;
    text-align: left;
  }

  .chip-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
  }

  .chip-char {
    font-size: 1.25rem;
    font-weight: 800;
    font-family: monospace;
    line-height: 1;
    flex: 1;
    text-align: center;
  }

  .chip-status-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 46px;
  }

  .chip-row-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
  }

  .chip-count {
    font-size: 0.72rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .chip-cat-tag {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 4px;
    font-family: sans-serif;
    letter-spacing: 0.2px;
    flex-shrink: 0;
  }

  .cat-letter {
    background: #e0f2fe;
    color: #0369a1;
  }

  .cat-punctuation {
    background: #f3e8ff;
    color: #7e22ce;
  }

  .cat-number {
    background: #fef3c7;
    color: #b45309;
  }

  .cat-symbol,
  .cat-other {
    background: #f1f5f9;
    color: #475569;
  }

  .chip-hex {
    font-size: 0.68rem;
    font-family: monospace;
    font-weight: 500;
    opacity: 0.7;
  }

  .chip-allowed {
    background: #f0fdf4;
    color: #166534;
    border-color: #bbf7d0;
  }

  .chip-allowed:hover {
    background: #dcfce7;
    border-color: #86efac;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .chip-disallowed {
    background: #fffbeb;
    color: #b45309;
    border-color: #fde68a;
  }

  .chip-disallowed:hover {
    background: #fef3c7;
    border-color: #fcd34d;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .chip-action-text {
    font-size: 0.68rem;
    font-weight: 800;
    background: #fde68a;
    color: #92400e;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .chip-status-icon {
    font-size: 0.72rem;
  }

  .empty-chips {
    text-align: center;
    color: var(--text-muted, #64748b);
    padding: 20px;
    font-size: 0.88rem;
  }

  /* Empty Cards */
  .empty-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .empty-icon-box {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #e0f2fe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
  }

  .icon-purple {
    background: #ede9fe;
    color: #7c3aed;
  }

  .empty-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-heading, #0f172a);
  }

  .empty-desc {
    font-size: 0.92rem;
    color: var(--text-muted, #64748b);
    max-width: 480px;
    margin: 0;
  }

  /* Step Navigation Footer */
  .step-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    flex-wrap: wrap;
  }

  .btn-step-prev {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-step-prev:hover {
    background: #e2e8f0;
  }

  .footer-actions-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-step-view {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--primary-color, #0284c7);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-step-view:hover {
    background: #e0f2fe;
    border-color: #0284c7;
  }

  .btn-check-primary {
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 1px 3px rgba(22, 163, 74, 0.2);
    transition: all 0.15s ease;
  }

  .btn-check-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #15803d, #166534);
    box-shadow: 0 3px 8px rgba(22, 163, 74, 0.3);
  }

  .btn-check-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
</style>
