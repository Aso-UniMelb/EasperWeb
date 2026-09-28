<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import {
    datasetState,
    MAX_DATASET_PAIRS,
  } from '../../state/datasetState.svelte.js';
  import FileIngestionCard from './FileIngestionCard.svelte';
  import TierSelectionCard from './TierSelectionCard.svelte';
  import CharacterInventoryCard from './CharacterInventoryCard.svelte';
  import ValidationReportsCard from './ValidationReportsCard.svelte';
  import TextReplacementsCard from './TextReplacementsCard.svelte';
  import DatasetReviewCard from './DatasetReviewCard.svelte';
  import DatasetExportCard from './DatasetExportCard.svelte';

  let totalIssues = $derived(
    (datasetState.validationResults.naRecords?.length || 0) +
      (datasetState.validationResults.longRecords?.length || 0) +
      (datasetState.validationResults.overlapRecords?.length || 0),
  );

  let allowedTokensCount = $derived(
    datasetState.allowedLetters.split(/\s+/).filter(Boolean).length,
  );
</script>

<div class="dataset-builder-app">
  {#if datasetState.currentTab === 'ingest'}
    <!-- Hero Header (Shown only on Step 1 when picking files) -->
    <header class="dataset-hero-card">
      <div class="hero-icon-wrap">
        <i class="fa-solid fa-database hero-icon"></i>
      </div>
      <div class="hero-text">
        <h1 class="hero-title">Speech Dataset Builder</h1>
        <p class="hero-desc">
          Follow the 7 steps below to turn your ELAN (.eaf) annotations and
          audio files into a speech recognition training package.
        </p>
      </div>
    </header>
  {/if}

  <!-- 7-Step Tabs Bar -->
  <nav class="dataset-step-tabs" aria-label="Dataset Builder Steps">
    <!-- Tab 1: Ingest & Pair -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'ingest'
        ? 'tab-active'
        : ''} {datasetState.pairedFiles.length > 0 ? 'tab-completed' : ''}"
      onclick={() => datasetState.setTab('ingest')}
    >
      <div class="tab-num">1</div>
      <div class="tab-content">
        <span class="tab-title"> Select Files </span>
        <span class="tab-badge">
          {#if datasetState.pairedFiles.length > 0}
            <i class="fa-solid fa-check text-success"></i>
            {datasetState.pairedFiles.length}{datasetState.pairedFiles.length >=
            MAX_DATASET_PAIRS
              ? ' (max)'
              : ''} loaded
          {:else}
            Files &amp; Audio
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 2: Select Tiers -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'tiers'
        ? 'tab-active'
        : ''} {datasetState.hasAnyTierSelected() ? 'tab-completed' : ''}"
      onclick={() => datasetState.setTab('tiers')}
      disabled={datasetState.pairedFiles.length === 0}
      title={datasetState.pairedFiles.length === 0
        ? 'Load files in Step 1 first'
        : 'Select target language speech tiers'}
    >
      <div class="tab-num">2</div>
      <div class="tab-content">
        <span class="tab-title"> Select Tiers </span>
        <span class="tab-badge">
          {#if datasetState.hasAnyTierSelected()}
            <i class="fa-solid fa-check text-success"></i> Tiers Selected
          {:else if datasetState.pairedFiles.length > 0}
            Choose Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 3: Character Inventory -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'characters'
        ? 'tab-active'
        : ''} {datasetState.hasAnyTierSelected() && allowedTokensCount > 0
        ? 'tab-completed'
        : ''}"
      onclick={() => datasetState.setTab('characters')}
      disabled={!datasetState.hasAnyTierSelected()}
      title={!datasetState.hasAnyTierSelected()
        ? 'Select tiers in Step 2 first'
        : 'Review target language character inventory'}
    >
      <div class="tab-num">3</div>
      <div class="tab-content">
        <span class="tab-title"> Target Characters </span>
        <span class="tab-badge">
          {#if datasetState.hasAnyTierSelected()}
            {#if allowedTokensCount > 0}
              <i class="fa-solid fa-check text-success"></i>
              {allowedTokensCount} letters
            {:else}
              Review Inventory
            {/if}
          {:else if datasetState.pairedFiles.length > 0}
            Requires Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 4: Issues -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'reports'
        ? 'tab-active'
        : ''} {datasetState.hasChecked ? 'tab-completed' : ''}"
      onclick={() => datasetState.setTab('reports')}
      disabled={!datasetState.hasAnyTierSelected()}
      title={!datasetState.hasAnyTierSelected()
        ? 'Select tiers in Step 2 first'
        : 'Review and correct ELAN issues'}
    >
      <div class="tab-num">4</div>
      <div class="tab-content">
        <span class="tab-title">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Issues
        </span>
        <span class="tab-badge">
          {#if datasetState.hasChecked}
            {#if totalIssues > 0}
              <span class="badge-issues">{totalIssues} issues</span>
            {:else}
              <i class="fa-solid fa-check text-success"></i> Clean
            {/if}
          {:else if datasetState.hasAnyTierSelected()}
            Validation
          {:else if datasetState.pairedFiles.length > 0}
            Requires Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 5: Clean & Replace (Strings & Special Tokens) -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'replacements'
        ? 'tab-active'
        : ''} {datasetState.hasVisitedReplacements &&
      datasetState.replacementRules.length > 0
        ? 'tab-completed'
        : ''}"
      onclick={() => datasetState.setTab('replacements')}
      disabled={!datasetState.hasAnyTierSelected()}
      title={!datasetState.hasAnyTierSelected()
        ? 'Select tiers in Step 2 first'
        : 'Delete or replace special tokens and text before exporting'}
    >
      <div class="tab-num">5</div>
      <div class="tab-content">
        <span class="tab-title"> Clean &amp; Replace </span>
        <span class="tab-badge">
          {#if datasetState.hasVisitedReplacements}
            <i class="fa-solid fa-check text-success"></i>
            {datasetState.replacementRules.filter((r) => r.enabled).length} rules
          {:else if datasetState.hasAnyTierSelected()}
            Special Tokens
          {:else if datasetState.pairedFiles.length > 0}
            Requires Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 6: Review -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'review'
        ? 'tab-active'
        : ''} {datasetState.hasChecked ? 'tab-completed' : ''}"
      onclick={() => datasetState.setTab('review')}
      disabled={!datasetState.hasAnyTierSelected()}
      title={!datasetState.hasAnyTierSelected()
        ? 'Select tiers in Step 2 first'
        : 'Review dataset assessment, vocabulary, and training metrics'}
    >
      <div class="tab-num">6</div>
      <div class="tab-content">
        <span class="tab-title"> Review </span>
        <span class="tab-badge">
          {#if datasetState.hasChecked}
            Assessment
          {:else if datasetState.hasAnyTierSelected()}
            Reports
          {:else if datasetState.pairedFiles.length > 0}
            Requires Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>

    <!-- Tab 7: Export Dataset -->
    <button
      type="button"
      class="step-tab {datasetState.currentTab === 'export'
        ? 'tab-active'
        : ''} {datasetState.buildSuccess ? 'tab-completed' : ''}"
      onclick={() => datasetState.setTab('export')}
      disabled={!datasetState.hasAnyTierSelected()}
      title={!datasetState.hasAnyTierSelected()
        ? 'Select tiers in Step 2 first'
        : 'Export .zip dataset for Google Colab'}
    >
      <div class="tab-num">7</div>
      <div class="tab-content">
        <span class="tab-title"> Export Dataset </span>
        <span class="tab-badge">
          {#if datasetState.buildSuccess}
            <i class="fa-solid fa-check text-success"></i> Ready ({datasetState
              .buildSuccess.totalSegments} clips)
          {:else if datasetState.hasAnyTierSelected()}
            Package (.zip)
          {:else if datasetState.pairedFiles.length > 0}
            Requires Tiers
          {:else}
            Requires Files
          {/if}
        </span>
      </div>
    </button>
  </nav>

  <!-- Active Tab Content Area -->
  <main class="tab-body-container" role="region" aria-label="Step Content">
    {#if datasetState.currentTab === 'ingest'}
      <FileIngestionCard />
    {:else if datasetState.currentTab === 'tiers'}
      <TierSelectionCard />
    {:else if datasetState.currentTab === 'characters'}
      <CharacterInventoryCard />
    {:else if datasetState.currentTab === 'reports'}
      <ValidationReportsCard />
    {:else if datasetState.currentTab === 'replacements'}
      <TextReplacementsCard />
    {:else if datasetState.currentTab === 'review'}
      <DatasetReviewCard />
    {:else if datasetState.currentTab === 'export'}
      <DatasetExportCard />
    {/if}
  </main>
</div>

<style>
  .dataset-builder-app {
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    padding-bottom: 16px;
  }

  .dataset-hero-card {
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    border-radius: 10px;
    padding: 10px 16px;
    color: white;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.2);
  }

  .hero-icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .hero-title {
    margin: 0 0 2px 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.3px;
  }

  .hero-desc {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.92;
    line-height: 1.35;
  }

  /* Step Tabs Bar */
  .dataset-step-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 4px;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 4px;
    margin-bottom: 10px;
  }

  :global([data-theme='dark']) .dataset-step-tabs {
    background: rgba(255, 255, 255, 0.04);
  }

  .step-tab {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--text-base, #334155);
  }

  .step-tab:hover:not(:disabled) {
    background: var(--bg-card, #ffffff);
    border-color: var(--border-color, #cbd5e1);
  }

  .step-tab:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .step-tab.tab-active {
    background: var(--bg-card, #ffffff);
    border-color: #0284c7;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .step-tab.tab-active {
    background: rgba(2, 132, 199, 0.15);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .tab-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--border-color, #e2e8f0);
    color: var(--text-heading, #0f172a);
    font-size: 0.76rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .step-tab.tab-active .tab-num {
    background: #0284c7;
    color: white;
  }

  .step-tab.tab-completed:not(.tab-active) .tab-num {
    background: #dcfce7;
    color: #16a34a;
  }

  :global([data-theme='dark'])
    .step-tab.tab-completed:not(.tab-active)
    .tab-num {
    background: rgba(22, 163, 74, 0.25);
    color: #4ade80;
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }

  .tab-title {
    font-size: 0.82rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-badge {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-issues {
    color: #dc2626;
    font-weight: 700;
  }

  .text-success {
    color: #16a34a;
  }

  .tab-body-container {
    animation: fadeIn 0.15s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0.8;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 768px) {
    .dataset-step-tabs {
      grid-template-columns: 1fr;
    }
  }
</style>
