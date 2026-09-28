<script>
  import { datasetState } from '../../state/datasetState.svelte.js';

  let hasFilter = $derived(datasetState.tierFilter.trim().length > 0);
  let loadedCount = $derived(datasetState.pairedFiles.length);
  let stats = $derived(datasetState.totalSelectedStats);

  function handleFilterInput(e) {
    datasetState.tierFilter = e.target.value;
  }
</script>

{#if loadedCount === 0}
  <div class="card empty-tier-card">
    <div class="empty-icon-box">
      <i class="fa-solid fa-layer-group"></i>
    </div>
    <h3 class="empty-title">No Files Ingested Yet</h3>
    <p class="empty-desc">
      Please load ELAN (.eaf) annotations and matching audio files in Step 1
      first.
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
{:else}
  <div class="card dataset-tier-card">
    <div class="card-header-bar">
      <div class="header-left">
        <h3 class="tier-card-title">
          2 .Select Target Language Tiers
          <span class="file-count-badge"
            >({loadedCount} file{loadedCount !== 1 ? 's' : ''} loaded)</span
          >
        </h3>
        <p class="tier-card-subtitle">
          Select only the tiers that contain <strong
            >target language speech transcriptions</strong
          > corresponding to the audio. Exclude English translation, gloss, and note
          tiers. In Step 3, the target language character inventory will be automatically
          filtered from these selected tiers.
        </p>
      </div>
    </div>

    <!-- Target Language Tier Selection Section -->
    <section class="config-subcard tiers-section">
      <div class="subcard-header">
        <div class="subcard-title">
          <i class="fa-solid fa-layer-group subcard-icon icon-purple"></i>
          <span>Target Language Tier Selection</span>
        </div>
        <div class="selection-summary-pill">
          <i class="fa-solid fa-check-double"></i>
          <span
            ><strong>{stats.tierCount}</strong> tier{stats.tierCount !== 1
              ? 's'
              : ''} selected</span
          >
          <span class="pill-divider">&bull;</span>
          <span><strong>{stats.annCount}</strong> speech segments</span>
        </div>
      </div>

      <p class="subcard-desc">
        Select only the tiers that contain <strong
          >target language speech transcriptions</strong
        >. Deselect translations or glosses so foreign letters don't enter your
        model.
      </p>

      <!-- Search & Filter Toolbar -->
      <div class="tier-toolbar">
        <div class="filter-box">
          <label for="tier-filter-input" class="filter-label"
            >Filter Tiers:</label
          >
          <div class="input-icon-wrap">
            <input
              id="tier-filter-input"
              type="text"
              class="filter-input"
              placeholder="Search tier by name..."
              value={datasetState.tierFilter}
              oninput={handleFilterInput}
            />
            {#if hasFilter}
              <button
                type="button"
                class="btn-clear-filter"
                onclick={() => (datasetState.tierFilter = '')}
                title="Clear filter"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            {/if}
          </div>
        </div>

        <div class="toolbar-actions">
          <button
            type="button"
            class="btn-tier-action btn-select-matching"
            onclick={() => datasetState.selectMatchingTiers()}
          >
            <i class="fa-solid fa-check-double"></i>
            <span>{hasFilter ? 'Select Matching' : 'Select All'}</span>
          </button>

          <button
            type="button"
            class="btn-tier-action btn-deselect-matching"
            onclick={() => datasetState.deselectMatchingTiers()}
          >
            <i class="fa-solid fa-ban"></i>
            <span>{hasFilter ? 'Deselect Matching' : 'Deselect All'}</span>
          </button>
        </div>
      </div>

      <!-- Tiers List grouped by file with live sample preview -->
      <div class="tiers-scroll-container">
        {#each datasetState.pairedFiles as pair (pair.id)}
          {@const fileName = pair.eafFile.name}
          {@const fileTiers = datasetState.tierSelections[fileName] || {}}
          {@const parsedTiers = pair.parsedEaf ? pair.parsedEaf.tiers : []}
          {@const filterTerm = datasetState.tierFilter.trim().toLowerCase()}

          <div class="file-tiers-group">
            <div class="file-group-header">
              <div class="header-title-left">
                <i class="fa-solid fa-file-lines file-icon"></i>
                <span class="group-filename">{fileName}</span>
                {#if pair.hasAudio}
                  <span
                    class="badge-matched-audio"
                    title="Linked audio: {pair.audioFileName}"
                  >
                    <i class="fa-solid fa-music"></i>
                    {pair.audioFileName}
                  </span>
                {:else}
                  <span
                    class="badge-unmatched-audio"
                    title="Missing matching audio file"
                  >
                    <i class="fa-solid fa-triangle-exclamation"></i> No Audio
                  </span>
                {/if}
              </div>
            </div>

            <div class="tier-checkboxes-grid">
              {#each parsedTiers as tier (tier.tierId)}
                {@const isMatch =
                  !filterTerm || tier.tierId.toLowerCase().includes(filterTerm)}
                {#if isMatch}
                  {@const isChecked = !!fileTiers[tier.tierId]}
                  {@const annCount = tier.annotations
                    ? tier.annotations.length
                    : 0}

                  <label
                    class="tier-checkbox-label {isChecked ? 'checked' : ''}"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onchange={() =>
                        datasetState.toggleTier(fileName, tier.tierId)}
                    />
                    <div class="tier-label-body">
                      <div class="tier-title-row">
                        <span class="tier-name">{tier.tierId}</span>
                        {#if tier.linguisticType}
                          <span class="tier-type-tag"
                            >{tier.linguisticType}</span
                          >
                        {/if}
                        <span class="ann-count-pill">
                          {annCount} ann{annCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {#if tier.sampleText}
                        <div
                          class="tier-sample-snippet"
                          title={tier.sampleText}
                        >
                          "{tier.sampleText.slice(0, 48)}{tier.sampleText
                            .length > 48
                            ? '...'
                            : ''}"
                        </div>
                      {/if}
                    </div>
                  </label>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Step Navigation Action Bar -->
    <div class="step-nav-footer">
      <button
        type="button"
        class="btn-step-prev"
        onclick={() => datasetState.setTab('ingest')}
      >
        <i class="fa-solid fa-arrow-left"></i>
        <span>Back to Files</span>
      </button>

      <div class="footer-actions-right">
        {#if !datasetState.hasAnyTierSelected()}
          <span class="no-selection-hint">
            <i class="fa-solid fa-circle-info"></i> Please select at least 1 tier
            to continue
          </span>
        {/if}
        <button
          type="button"
          class="btn-step-next"
          disabled={!datasetState.hasAnyTierSelected()}
          onclick={() => datasetState.setTab('characters')}
        >
          <span>Next: Character Inventory</span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dataset-tier-card {
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
    align-items: center;
    gap: 10px;
  }

  .tier-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .file-count-badge {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
  }

  .tier-card-subtitle {
    font-size: 0.82rem;
    margin: 1px 0 0 0;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
  }

  /* Subcard styling */
  .config-subcard {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global([data-theme='dark']) .config-subcard {
    background: rgba(255, 255, 255, 0.02);
  }

  .subcard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .subcard-title {
    font-size: 0.92rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .subcard-icon {
    color: #0284c7;
    font-size: 1rem;
  }

  .icon-purple {
    color: #7c3aed;
  }

  .subcard-desc {
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
    margin: -2px 0 0 0;
    line-height: 1.35;
  }

  .selection-summary-pill {
    font-size: 0.74rem;
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #ddd6fe;
    border-radius: 20px;
    padding: 2px 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  :global([data-theme='dark']) .selection-summary-pill {
    background: rgba(124, 58, 237, 0.2);
    color: #c4b5fd;
    border-color: rgba(124, 58, 237, 0.3);
  }

  .pill-divider {
    opacity: 0.5;
  }

  /* Toolbar */
  .tier-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 6px 10px;
  }

  .filter-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 240px;
  }

  .filter-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-base, #334155);
    white-space: nowrap;
  }

  .input-icon-wrap {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .input-icon-wrap i:first-child {
    color: var(--text-muted, #94a3b8);
    font-size: 0.82rem;
  }

  .filter-input {
    width: 100%;
    padding: 6px 10px 6px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.84rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #0f172a);
  }

  .btn-clear-filter {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 2px 4px;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-tier-action {
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }

  .btn-select-matching {
    background: #0284c7;
    color: white;
    border: 1px solid #0284c7;
  }

  .btn-select-matching:hover {
    background: #0369a1;
  }

  .btn-deselect-matching {
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #475569);
    border: 1px solid var(--border-color, #cbd5e1);
  }

  .btn-deselect-matching:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  /* File tiers explorer */
  .tiers-scroll-container {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 8px;
    background: var(--bg-card, #ffffff);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-tiers-group {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 6px 10px;
  }

  :global([data-theme='dark']) .file-tiers-group {
    background: rgba(255, 255, 255, 0.03);
  }

  .file-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  .header-title-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .file-icon {
    color: var(--primary-color, #0284c7);
  }

  .group-filename {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .badge-matched-audio {
    font-size: 0.7rem;
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
    padding: 1px 6px;
    border-radius: 12px;
    font-weight: 600;
  }

  .badge-unmatched-audio {
    font-size: 0.7rem;
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
    padding: 1px 6px;
    border-radius: 12px;
    font-weight: 600;
  }

  .tier-checkboxes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 6px;
  }

  .tier-checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    cursor: pointer;
    font-size: 0.8rem;
    user-select: none;
    transition: all 0.15s ease;
  }

  .tier-checkbox-label.checked {
    background: #f5f3ff;
    border-color: #c4b5fd;
    color: #5b21b6;
  }

  .tier-checkbox-label input {
    cursor: pointer;
    margin-top: 2px;
  }

  .tier-label-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .tier-title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tier-name {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tier-type-tag {
    font-size: 0.62rem;
    background: #e2e8f0;
    color: #475569;
    padding: 0 4px;
    border-radius: 3px;
  }

  .ann-count-pill {
    font-size: 0.66rem;
    background: var(--bg-hover, #e2e8f0);
    color: var(--text-muted, #475569);
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: 600;
    margin-left: auto;
  }

  .tier-sample-snippet {
    font-size: 0.7rem;
    font-style: italic;
    color: var(--text-muted, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tier-checkbox-label.checked .tier-sample-snippet {
    color: #6d28d9;
  }

  /* Empty state */
  .empty-tier-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 24px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .empty-icon-box {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #e0f2fe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
  }

  .empty-title {
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    margin: 0;
  }

  .empty-desc {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    margin: 0;
    max-width: 420px;
  }

  /* Step footer */
  .step-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
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

  .no-selection-hint {
    font-size: 0.76rem;
    color: #f59e0b;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-step-next {
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(2, 132, 199, 0.2);
  }

  .btn-step-next:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-step-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>
