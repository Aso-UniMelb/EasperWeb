<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { modelState } from '../../state/modelState.svelte.js';

  let {
    activeStep = 'none',
    mode = 'full', // 'full' | 'compact'
    interactive = true,
    collapsible = false,
  } = $props();

  let isExpanded = $state(false);
  let copiedBibtex = $state(false);

  const BIBTEX_ENTRY = `@inproceedings{mahmudi26_interspeech,
  title={Easper: An Accessible ASR Pipeline for Language Documentation},
  author={Mahmudi, Aso and Dang, Ting and Vylomova, Ekaterina and Thieberger, Nick},
  booktitle={Interspeech 2026},
  year={2026}
}`;

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(BIBTEX_ENTRY);
      copiedBibtex = true;
      setTimeout(() => {
        copiedBibtex = false;
      }, 2000);
    } catch (err) {
      console.error('[EasperLoopPipeline] Copy BibTeX failed:', err);
    }
  }

  const COLAB_URL =
    'https://colab.research.google.com/drive/1vRt5T4FHj_z3KHv0_Z4fReHYW8IMOxNv?usp=sharing';

  function handleStepClick(step) {
    if (!interactive) return;

    if (step === 'transcribe') {
      projectState.goToWorkspace();
    } else if (step === 'dataset') {
      projectState.goToDataset();
    } else if (step === 'colab') {
      window.open(COLAB_URL, '_blank');
    } else if (step === 'custom_model') {
      projectState.goToWorkspace();
      setTimeout(() => {
        modelState.openModelManager();
      }, 100);
    }
  }
</script>

<div
  class="easper-pipeline-card mode-{mode} {collapsible ? 'is-collapsible' : ''}"
>
  {#if collapsible}
    <button
      type="button"
      class="pipeline-collapse-toggle"
      onclick={() => (isExpanded = !isExpanded)}
      aria-expanded={isExpanded}
    >
      <div class="toggle-left">
        <i class="fa-solid fa-circle-question toggle-icon"></i>
        <span class="toggle-title">How Easper Works?</span>
        <span class="toggle-hint"
          >The Continuous Speech-to-Text &amp; Fine-Tuning Loop</span
        >
      </div>
      <div class="toggle-right">
        <span class="toggle-status-text"
          >{isExpanded ? 'Hide' : 'Show workflow'}</span
        >
        <i
          class="fa-solid {isExpanded
            ? 'fa-chevron-up'
            : 'fa-chevron-down'} toggle-chevron"
        ></i>
      </div>
    </button>
  {/if}

  {#if !collapsible || isExpanded}
    {#if mode === 'full' && !collapsible}
      <div class="pipeline-header">
        <div class="pipeline-tag">
          <i class="fa-solid fa-rotate"></i>
          <span>The Continuous Easper Loop</span>
        </div>
        <span class="pipeline-subtitle">
          How field linguists build and use custom speech recognition models for
          any language
        </span>
      </div>
    {/if}

    <div
      class="pipeline-chain"
      role="navigation"
      aria-label="Easper workflow steps"
    >
      <!-- Node 1: Transcribe -->
      <button
        type="button"
        class="pipeline-node node-transcribe {activeStep === 'transcribe'
          ? 'node-active'
          : ''} {interactive ? 'node-clickable' : ''}"
        onclick={() => handleStepClick('transcribe')}
        title="Step 1: Open Transcription Studio to transcribe & segment recordings"
      >
        <div class="node-icon-box">
          <i class="fa-solid fa-microphone"></i>
          <span class="node-step-num">1</span>
        </div>
        <div class="node-text">
          <strong class="node-title">1. Transcribe</strong>
          <span class="node-desc">Studio Workspace</span>
        </div>
        {#if activeStep === 'transcribe'}
          <span class="active-badge">Current</span>
        {/if}
      </button>

      <!-- Connector 1 -->
      <div class="pipeline-connector">
        <div class="connector-line"></div>
        <span
          class="connector-pill pill-subtle"
          title="If recognition accuracy is low on your language"
        >
          Need higher accuracy?
        </span>
        <i class="fa-solid fa-arrow-right connector-arrow"></i>
      </div>

      <!-- Node 2: Build Dataset -->
      <button
        type="button"
        class="pipeline-node node-dataset {activeStep === 'dataset'
          ? 'node-active'
          : ''} {interactive ? 'node-clickable' : ''}"
        onclick={() => handleStepClick('dataset')}
        title="Step 2: Convert ELAN .eaf files & audio into a normalized speech dataset"
      >
        <div class="node-icon-box">
          <i class="fa-solid fa-database"></i>
          <span class="node-step-num">2</span>
        </div>
        <div class="node-text">
          <strong class="node-title">2. Build Dataset</strong>
          <span class="node-desc">From ELAN (.eaf)</span>
        </div>
      </button>

      <!-- Connector 2 -->
      <div class="pipeline-connector">
        <div class="connector-line"></div>
        <span class="connector-pill" title="Export .zip dataset">
          Export .zip
        </span>
        <i class="fa-solid fa-arrow-right connector-arrow"></i>
      </div>

      <!-- Node 3: Fine-Tune (Colab) -->
      <button
        type="button"
        class="pipeline-node node-colab {activeStep === 'colab'
          ? 'node-active'
          : ''} {interactive ? 'node-clickable' : ''}"
        onclick={() => handleStepClick('colab')}
        title="Step 3: Fine-tune Whisper in Google Colab using free cloud GPU (opens notebook)"
      >
        <div class="node-icon-box">
          <i class="fa-solid fa-cloud-bolt"></i>
          <span class="node-step-num">3</span>
        </div>
        <div class="node-text">
          <strong class="node-title">3. Fine-Tune</strong>
          <span class="node-desc">Google Colab (GPU)</span>
        </div>
        {#if activeStep === 'colab'}
          <span class="active-badge badge-amber">Current</span>
        {/if}
      </button>

      <!-- Connector 3 -->
      <div class="pipeline-connector">
        <div class="connector-line"></div>
        <span class="connector-pill" title="Save fine-tuned model folder">
          Trained model
        </span>
        <i class="fa-solid fa-arrow-right connector-arrow"></i>
      </div>

      <!-- Node 4: Custom Model -->
      <button
        type="button"
        class="pipeline-node node-custom {activeStep === 'custom_model'
          ? 'node-active'
          : ''} {interactive ? 'node-clickable' : ''}"
        onclick={() => handleStepClick('custom_model')}
        title="Step 4: Load your fine-tuned model back into Transcription Studio"
      >
        <div class="node-icon-box">
          <i class="fa-solid fa-bullseye"></i>
          <span class="node-step-num">4</span>
        </div>
        <div class="node-text">
          <strong class="node-title">4. Use your Model</strong>
          <span class="node-desc">Add it to Easper</span>
        </div>
        {#if activeStep === 'custom_model'}
          <span class="active-badge badge-success">Current</span>
        {/if}
      </button>
    </div>

    {#if mode === 'full'}
      <!-- Loop Return Bar -->
      <div class="pipeline-loop-footer">
        <div class="loop-icon-wrap">
          <i class="fa-solid fa-arrows-spin"></i>
        </div>
        <p class="loop-text">
          <strong>The Loop Repeats:</strong> As you transcribe more audio and verify
          transcripts in Easper or ELAN, you can export new datasets to continually
          improve your model's accuracy.
        </p>
      </div>

      <!-- Academic Research Paper & Citation Instruction -->
      <div class="pipeline-citation-card">
        <div class="citation-header">
          <div class="citation-title-wrap">
            <i class="fa-solid fa-graduation-cap citation-icon"></i>
            <span class="citation-heading"
              >Academic Research &amp; Citation</span
            >
          </div>
          <a
            href="https://arxiv.org/abs/2608.11629"
            target="_blank"
            rel="noopener noreferrer"
            class="citation-paper-link"
            title="Easper: An Accessible ASR Pipeline for Language Documentation (arXiv:2608.11629)"
          >
            <i class="fa-regular fa-file-lines"></i>
            <span>arXiv:2608.11629</span>
            <i class="fa-solid fa-arrow-up-right-from-square ext-icon"></i>
          </a>
        </div>

        <p class="citation-prompt">
          If you use Easper in your research, please cite our paper accepted at
          the <strong>Interspeech 2026</strong> Conference:
        </p>

        <div class="citation-paper-meta">
          <div class="citation-paper-title">
            <a
              href="https://arxiv.org/abs/2608.11629"
              target="_blank"
              rel="noopener noreferrer"
              class="paper-title-link"
            >
              Easper: An Accessible ASR Pipeline for Language Documentation
            </a>
          </div>
          <div class="citation-paper-authors">
            Aso Mahmudi, Ting Dang, Ekaterina Vylomova, and Nick Thieberger
          </div>
        </div>

        <div class="citation-bibtex-section">
          <div class="bibtex-label-row">
            <span class="bibtex-instruction"
              >You can use the following BibTeX entry:</span
            >
            <button
              type="button"
              class="btn-copy-bibtex"
              onclick={copyBibtex}
              title="Copy BibTeX citation to clipboard"
            >
              <i class="fa-solid {copiedBibtex ? 'fa-check' : 'fa-copy'}"></i>
              <span>{copiedBibtex ? 'Copied!' : 'Copy BibTeX'}</span>
            </button>
          </div>
          <pre class="bibtex-code-block"><code>{BIBTEX_ENTRY}</code></pre>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .easper-pipeline-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.2s ease;
  }

  .easper-pipeline-card.is-collapsible {
    padding: 0;
    overflow: hidden;
  }

  .pipeline-collapse-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    background: var(--bg-hover, #f8fafc);
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    color: inherit;
    border-radius: 12px;
  }

  .pipeline-collapse-toggle:hover {
    background: #f1f5f9;
  }

  :global([data-theme='dark']) .pipeline-collapse-toggle {
    background: rgba(255, 255, 255, 0.03);
  }

  :global([data-theme='dark']) .pipeline-collapse-toggle:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .toggle-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .toggle-icon {
    color: var(--primary-color, #0284c7);
    font-size: 1.05rem;
  }

  .toggle-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .toggle-hint {
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
  }

  .toggle-right {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .toggle-chevron {
    font-size: 0.76rem;
    color: var(--primary-color, #0284c7);
  }

  .is-collapsible .pipeline-chain {
    padding: 10px 16px 14px 16px;
    border-top: 1px solid var(--border-color, #f1f5f9);
  }

  .is-collapsible .pipeline-loop-footer {
    margin: 0 16px 14px 16px;
  }

  .mode-full {
    padding: 18px 22px;
    margin-bottom: 24px;
  }

  .mode-compact {
    padding: 10px 16px;
    margin-bottom: 16px;
  }

  .pipeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  .pipeline-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--primary-color, #0284c7);
    background: #e0f2fe;
    padding: 3px 10px;
    border-radius: 20px;
  }

  :global([data-theme='dark']) .pipeline-tag {
    background: rgba(2, 132, 199, 0.2);
    color: #38bdf8;
  }

  .pipeline-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
  }

  /* Chain Row */
  .pipeline-chain {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    position: relative;
    overflow-x: auto;
    padding: 4px 2px;
  }

  /* Nodes */
  .pipeline-node {
    flex: 1;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    text-align: left;
    transition: all 0.15s ease;
    outline: none;
    color: inherit;
  }

  .mode-compact .pipeline-node {
    padding: 6px 10px;
    min-width: 125px;
  }

  .node-clickable {
    cursor: pointer;
  }

  .node-clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
    border-color: #94a3b8;
  }

  .node-active {
    border-color: #0284c7 !important;
    background: #f0f9ff !important;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
  }

  :global([data-theme='dark']) .node-active {
    background: rgba(2, 132, 199, 0.15) !important;
  }

  .node-icon-box {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .mode-compact .node-icon-box {
    width: 28px;
    height: 28px;
    font-size: 0.95rem;
  }

  .node-transcribe .node-icon-box {
    background: #e0f2fe;
    color: #0284c7;
  }

  .node-dataset .node-icon-box {
    background: #ede9fe;
    color: #7c3aed;
  }

  .node-colab .node-icon-box {
    background: #ffedd5;
    color: #ea580c;
  }

  .node-custom .node-icon-box {
    background: #dcfce7;
    color: #16a34a;
  }

  .node-step-num {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-heading, #0f172a);
    color: white;
    font-size: 0.62rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--bg-card, #ffffff);
  }

  .node-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .node-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-compact .node-title {
    font-size: 0.78rem;
  }

  .node-desc {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-compact .node-desc {
    font-size: 0.68rem;
  }

  .active-badge {
    position: absolute;
    top: -8px;
    right: 8px;
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 1px 6px;
    border-radius: 10px;
    background: #0284c7;
    color: white;
  }

  .badge-purple {
    background: #7c3aed;
  }

  .badge-amber {
    background: #ea580c;
  }

  .badge-success {
    background: #16a34a;
  }

  /* Connectors */
  .pipeline-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0 4px;
    flex-shrink: 0;
    gap: 2px;
  }

  .connector-arrow {
    font-size: 0.78rem;
    color: var(--text-muted, #94a3b8);
  }

  .connector-pill {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    background: var(--bg-hover, #f1f5f9);
    padding: 1px 6px;
    border-radius: 8px;
    white-space: nowrap;
    border: 1px solid var(--border-color, #e2e8f0);
  }

  .pill-subtle {
    color: #0284c7;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  :global([data-theme='dark']) .pill-subtle {
    background: rgba(2, 132, 199, 0.15);
    border-color: rgba(2, 132, 199, 0.3);
    color: #38bdf8;
  }

  .mode-compact .connector-pill {
    display: none;
  }

  /* Loop Footer */
  .pipeline-loop-footer {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
    gap: 10px;
    background: #f8fafc;
    border-radius: 8px;
    padding: 10px 14px;
  }

  :global([data-theme='dark']) .pipeline-loop-footer {
    background: rgba(255, 255, 255, 0.03);
  }

  .loop-icon-wrap {
    color: var(--primary-color, #0284c7);
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .loop-text {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-base, #334155);
    line-height: 1.4;
  }

  /* Academic Citation Box */
  .pipeline-citation-card {
    margin-top: 10px;
    padding: 10px 14px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global([data-theme='dark']) .pipeline-citation-card {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .citation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .citation-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 0.84rem;
    color: var(--text-base, #1e293b);
  }

  .citation-icon {
    color: var(--primary-color, #0284c7);
    font-size: 0.95rem;
  }

  .citation-paper-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.74rem;
    font-weight: 600;
    color: #0284c7;
    background: #eff6ff;
    padding: 2px 8px;
    border-radius: 6px;
    text-decoration: none;
    border: 1px solid #bfdbfe;
    transition: all 0.15s ease;
  }

  .citation-paper-link:hover {
    background: #dbeafe;
    color: #0369a1;
  }

  :global([data-theme='dark']) .citation-paper-link {
    background: rgba(2, 132, 199, 0.15);
    border-color: rgba(2, 132, 199, 0.3);
    color: #38bdf8;
  }

  :global([data-theme='dark']) .citation-paper-link:hover {
    background: rgba(2, 132, 199, 0.25);
  }

  .ext-icon {
    font-size: 0.65rem;
    opacity: 0.8;
  }

  .citation-prompt {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-base, #334155);
    line-height: 1.4;
  }

  .citation-paper-meta {
    padding: 6px 10px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  :global([data-theme='dark']) .citation-paper-meta {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .paper-title-link {
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--primary-color, #0284c7);
    text-decoration: none;
  }

  .paper-title-link:hover {
    text-decoration: underline;
  }

  .citation-paper-authors {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .citation-bibtex-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }

  .bibtex-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .bibtex-instruction {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
    font-weight: 500;
  }

  .btn-copy-bibtex {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #0284c7;
    background: transparent;
    border: 1px solid #0284c7;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-copy-bibtex:hover {
    background: #0284c7;
    color: #ffffff;
  }

  :global([data-theme='dark']) .btn-copy-bibtex {
    color: #38bdf8;
    border-color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-copy-bibtex:hover {
    background: #0284c7;
    color: #ffffff;
  }

  .bibtex-code-block {
    margin: 0;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    overflow-x: auto;
    color: var(--text-base, #1e293b);
  }

  :global([data-theme='dark']) .bibtex-code-block {
    background: #0f172a;
    border-color: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }

  @media (max-width: 860px) {
    .pipeline-chain {
      flex-direction: column;
      align-items: stretch;
    }
    .pipeline-node {
      width: 100%;
    }
    .pipeline-connector {
      margin: 2px 0;
      flex-direction: row;
      gap: 6px;
    }
    .connector-arrow {
      transform: rotate(90deg);
    }
  }
</style>
