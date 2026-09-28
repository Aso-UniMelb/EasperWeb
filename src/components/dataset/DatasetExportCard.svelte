<script>
  import { datasetState } from '../../state/datasetState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { modelState } from '../../state/modelState.svelte.js';

  let totalIssues = $derived(
    (datasetState.validationResults.naRecords?.length || 0) +
      (datasetState.validationResults.longRecords?.length || 0) +
      (datasetState.validationResults.overlapRecords?.length || 0),
  );

  function openGoogleDrive() {
    window.open('https://drive.google.com/drive/my-drive', '_blank');
  }

  function openColabNotebook() {
    window.open(
      'https://colab.research.google.com/drive/1vRt5T4FHj_z3KHv0_Z4fReHYW8IMOxNv?usp=sharing',
      '_blank',
    );
  }
</script>

{#if datasetState.pairedFiles.length === 0}
  <div class="card empty-export-card">
    <div class="empty-icon-box icon-green">
      <i class="fa-solid fa-file-zipper"></i>
    </div>
    <h3 class="empty-title">No Files Loaded</h3>
    <p class="empty-desc">
      Please load ELAN and audio files in Step 1 first before exporting a
      dataset.
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
  <div class="card dataset-export-card">
    <div class="card-header-bar">
      <div class="header-left">
        <h3 class="export-card-title">
          <i class="fa-solid fa-file-zipper section-icon"></i>
          7. Export Dataset
        </h3>
        <p class="export-card-subtitle">
          Export standardized 16kHz mono WAV clips and metadata.tsv packaged
          into a .zip training archive for model fine-tuning.
        </p>
      </div>
    </div>

    <!-- Warning banner if unaddressed issues remain in Step 4 -->
    {#if totalIssues > 0}
      <div class="issues-warning-banner">
        <div class="warning-icon-box">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="warning-content">
          <strong>{totalIssues} issue(s) remaining in Step 4: Issues</strong>
          <span
            >You can proceed to export now, or return to Step 4 to correct them
            in ELAN for a cleaner training dataset.</span
          >
        </div>
        <button
          type="button"
          class="btn-review-issues"
          onclick={() => datasetState.setTab('reports')}
        >
          <i class="fa-solid fa-wrench"></i>
          <span>Review Issues in Step 4</span>
        </button>
      </div>
    {/if}

    <div class="export-body">
      <!-- Build action box -->
      <div class="build-action-box">
        <div class="build-info-text">
          <h4>Export Training Package</h4>
          <p>
            Generates 16kHz mono audio slices and <code>metadata.tsv</code>
            (columns:
            <code>audio_filepath</code>, <code>duration</code>,
            <code>text</code>) formatted for standard Whisper fine-tuning
            scripts.
          </p>
        </div>

        <button
          type="button"
          class="btn-build-dataset"
          disabled={datasetState.isBuilding ||
            !datasetState.hasAnyTierSelected()}
          onclick={() => datasetState.buildTrainingDataset()}
        >
          {#if datasetState.isBuilding}
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Building Dataset (.zip)...</span>
          {:else}
            <i class="fa-solid fa-file-zipper"></i>
            <span>Export Dataset (.zip)</span>
          {/if}
        </button>
      </div>

      <!-- Progress Box -->
      {#if datasetState.isBuilding || datasetState.buildProgress.percent > 0}
        <div class="progress-container">
          <div class="progress-status-row">
            <span class="status-msg">{datasetState.buildProgress.status}</span>
            <span class="status-pct">{datasetState.buildProgress.percent}%</span
            >
          </div>
          <div class="progress-bar-bg">
            <div
              class="progress-bar-fill"
              style="width: {datasetState.buildProgress.percent}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Green Success Card -->
      {#if datasetState.buildSuccess}
        <div class="build-success-card">
          <div class="success-header">
            <i class="fa-solid fa-circle-check success-icon"></i>
            <div>
              <h4 class="success-title">Training Dataset Ready!</h4>
              <p class="success-subtitle">
                Generated <strong>{datasetState.buildSuccess.filename}</strong>
                ({datasetState.buildSuccess.sizeStr}, {datasetState.buildSuccess
                  .totalSegments} audio segments).
              </p>
            </div>
          </div>

          <div class="download-action-row">
            <button
              type="button"
              class="btn-download-again"
              onclick={() => datasetState.downloadZip()}
            >
              <i class="fa-solid fa-download"></i> Download asr_training_dataset.zip
            </button>
          </div>

          <!-- Next Steps for Fine-Tuning -->
          <div class="next-steps-box">
            <h5 class="next-steps-heading">Next Steps: Fine-Tune Whisper</h5>

            <div class="step-item">
              <div class="step-badge">1</div>
              <div class="step-info">
                <p class="step-text">
                  Upload <code>asr_training_dataset.zip</code> to the
                  <strong>"Colab"</strong> folder in your Google Drive:
                </p>
                <button
                  type="button"
                  class="btn-step-action btn-drive"
                  onclick={openGoogleDrive}
                >
                  <i class="fa-brands fa-google-drive"></i> Open Google Drive
                </button>
              </div>
            </div>

            <div class="step-item">
              <div class="step-badge">2</div>
              <div class="step-info">
                <p class="step-text">
                  Run the Whisper fine-tuning notebook on Google Colab:
                </p>
                <button
                  type="button"
                  class="btn-step-action btn-colab"
                  onclick={openColabNotebook}
                >
                  <i class="fa-solid fa-code"></i> Open Colab Notebook
                </button>
              </div>
            </div>

            <div class="step-item">
              <div class="step-badge">3</div>
              <div class="step-info">
                <p class="step-text">
                  When fine-tuning finishes, <strong
                    >download the model archive</strong
                  >
                  from Colab / Google Drive and <strong>unzip</strong> it into a
                  folder on your computer.
                </p>
                <span class="step-subtext">
                  The unzipped folder contains your fine-tuned Whisper ONNX
                  model weights (<code>model.onnx</code> or
                  <code>model_quantized.onnx</code>),
                  <code>tokenizer.json</code>, and <code>config.json</code>.
                </span>
              </div>
            </div>

            <div class="step-item">
              <div class="step-badge">4</div>
              <div class="step-info">
                <p class="step-text">
                  Add the unzipped folder into Easper's <strong
                    >Speech Recognition Model Manager</strong
                  >
                  (using <em>Add Local Folder</em>) to define and store your
                  custom model in browser storage:
                </p>
                <span class="step-subtext">
                  Once registered, your custom model is permanently stored
                  locally in your browser and ready to use for automatic
                  transcription.
                </span>
                <div class="step-actions-row">
                  <button
                    type="button"
                    class="btn-step-action btn-model"
                    onclick={() => modelState.openModelManager()}
                  >
                    <i class="fa-solid fa-brain"></i> Open Speech Recognition Model
                    Manager
                  </button>
                  <button
                    type="button"
                    class="btn-step-action btn-studio"
                    onclick={() => projectState.goToWorkspace()}
                  >
                    <i class="fa-solid fa-microphone"></i> Open Transcription Studio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step Navigation Footer -->
      <div class="step-nav-footer">
        <button
          type="button"
          class="btn-step-prev"
          onclick={() => datasetState.setTab('review')}
        >
          <i class="fa-solid fa-arrow-left"></i>
          <span>Back to Step 6: Review</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dataset-export-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .export-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    color: #16a34a;
  }

  .export-card-subtitle {
    font-size: 0.82rem;
    margin: 2px 0 0 0;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
  }

  /* Issues Warning Banner */
  .issues-warning-banner {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .warning-icon-box {
    color: #d97706;
    font-size: 1.15rem;
  }

  .warning-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.8rem;
    flex: 1;
    min-width: 200px;
  }

  .warning-content strong {
    color: #92400e;
  }

  .warning-content span {
    color: #b45309;
  }

  .btn-review-issues {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }

  .btn-review-issues:hover {
    background: #fde68a;
  }

  .export-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Build Action Box */
  .build-action-box {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .build-action-box {
    background: rgba(255, 255, 255, 0.02);
  }

  .build-info-text h4 {
    margin: 0 0 2px 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .build-info-text p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
  }

  .build-info-text code {
    font-family: monospace;
    background: #e2e8f0;
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .btn-build-dataset {
    background: #16a34a;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(22, 163, 74, 0.25);
  }

  .btn-build-dataset:hover:not(:disabled) {
    background: #15803d;
  }

  .btn-build-dataset:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Progress */
  .progress-container {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 10px 12px;
  }

  .progress-status-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    margin-bottom: 6px;
  }

  .status-msg {
    color: var(--text-base, #1e293b);
    font-weight: 600;
  }

  .status-pct {
    color: #16a34a;
    font-weight: 700;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #16a34a;
    transition: width 0.2s ease;
  }

  /* Success Card */
  .build-success-card {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .success-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .success-icon {
    font-size: 1.5rem;
    color: #16a34a;
  }

  .success-title {
    font-size: 1.05rem;
    font-weight: 800;
    color: #14532d;
    margin: 0 0 2px 0;
  }

  .success-subtitle {
    font-size: 0.82rem;
    color: #166534;
    margin: 0;
  }

  .btn-download-again {
    background: #16a34a;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-download-again:hover {
    background: #15803d;
  }

  .next-steps-box {
    background: white;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .next-steps-heading {
    font-size: 0.86rem;
    font-weight: 700;
    color: #14532d;
    margin: 0;
  }

  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .step-badge {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #16a34a;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .step-text {
    font-size: 0.8rem;
    color: #1e293b;
    margin: 0;
  }

  .btn-step-action {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-drive {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #334155;
  }

  .btn-drive:hover {
    background: #e2e8f0;
    border-color: #94a3b8;
  }

  .btn-colab {
    background: #fef3c7;
    border-color: #fde68a;
    color: #b45309;
  }

  .btn-colab:hover {
    background: #fde68a;
    border-color: #f59e0b;
  }

  .btn-model {
    background: #f3e8ff;
    border-color: #d8b4fe;
    color: #7e22ce;
  }

  .btn-model:hover {
    background: #ede9fe;
    border-color: #c084fc;
  }

  .btn-studio {
    background: #e0f2fe;
    border-color: #bae6fd;
    color: #0369a1;
  }

  .btn-studio:hover {
    background: #bae6fd;
    border-color: #7dd3fc;
  }

  .step-subtext {
    font-size: 0.74rem;
    color: #64748b;
    line-height: 1.4;
  }

  .step-subtext code {
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 0.72rem;
    color: #0f172a;
  }

  .step-actions-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  /* Step Navigation Footer */
  .step-nav-footer {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .btn-step-prev {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-step-prev:hover {
    background: var(--bg-hover, #f1f5f9);
  }
</style>
