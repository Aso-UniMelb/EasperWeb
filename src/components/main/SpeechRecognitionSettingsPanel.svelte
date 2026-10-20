<script>
  import { appState } from '../../state/appState.svelte.js';
  import { modelState } from '../../state/modelState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import {
    normalizeSubTiers,
    SUB_TIER_TYPE_SENTENCE,
  } from '../../utils/subTiers.js';
  import IntervalPicker from './IntervalPicker.svelte';

  let { onClose = () => {}, onWorkerReset } = $props();

  // Task is always transcribe and timestamps are always segment-level
  transcriptState.task = 'transcribe';
  transcriptState.timestampMode = 'segment';

  const hasAudio = $derived(
    Boolean(audioState.selectedFile || audioState.currentAudioUrl),
  );
  const emptyCount = $derived(transcriptState.emptySegmentsInSelectedRangeCount);
  const rangeTotalCount = $derived(transcriptState.segmentsInSelectedRange.length);
  const totalCount = $derived(transcriptState.segments.length);

  const selectedModel = $derived(
    modelState.models.find((m) => m.id === modelState.selectedModelId),
  );

  const sentenceSubTiers = $derived(
    normalizeSubTiers(projectState.activeProject?.subTiers).filter(
      (t) => t.type === SUB_TIER_TYPE_SENTENCE,
    ),
  );

  const selectedTargetTier = $derived(
    transcriptState.effectiveAsrOutputTarget !== 'main'
      ? sentenceSubTiers.find(
          (t) =>
            String(t.id) === String(transcriptState.effectiveAsrOutputTarget),
        )
      : null,
  );

  const isTranscribing = $derived(
    appState.isProcessing &&
      (appState.activeAction === 'transcribe_empty' ||
        appState.activeAction === 'transcribe'),
  );
</script>

<div class="inline-settings-panel recognition-panel">
  <div class="side-panel-header">
    <div class="side-panel-title">
      <i class="fa-solid fa-brain"></i>
      <span>Speech Recognition</span>
    </div>
    <button
      type="button"
      class="panel-close-btn"
      onclick={onClose}
      title="Close settings panel"
      aria-label="Close"
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <!-- Panel Body -->
  <div class="panel-body">
    {#if modelState.models.length === 0}
      <div class="empty-models-panel">
        <button
          type="button"
          class="panel-tool-btn btn-manage-prominent"
          onclick={() => modelState.openModelManager()}
          title="Open Model Manager modal to download, configure or add speech models"
        >
          <i class="fa-solid fa-sliders"></i>
          <span>Model Manager</span>
        </button>

        <button
          type="button"
          class="panel-close-btn"
          onclick={onClose}
          title="Close settings panel"
          aria-label="Close"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    {:else}
      <div class="model-row">
        <!-- Model Selection & Preload Status -->
        <div class="model-select-container">
          <div class="field-label-row">
            <label for="inline-asr-model-select" class="field-label"
              >Active Model</label
            >
            {#if selectedModel?.language}
              <span
                class="lang-tag"
                title="Target language configured in Model Manager"
              >
                <i class="fa-solid fa-language"></i>
                {selectedModel.language.toUpperCase()}
              </span>
            {/if}
            <span
              class="lang-tag dtype-tag"
              title="Active Model Precision: {modelState.modelSource === 'folder'
                ? modelState.modelDtype?.toUpperCase() || 'FP32'
                : modelState.activeDevice === 'webgpu'
                  ? 'Q4 (Hardware-accelerated WebGPU WGSL MatMulNBits)'
                  : 'Q8 (CPU SIMD)'}"
            >
              {modelState.modelSource === 'folder'
                ? modelState.modelDtype?.toUpperCase() || 'FP32'
                : modelState.activeDevice === 'webgpu'
                  ? 'Q4'
                  : 'Q8'}
            </span>
          </div>

          <div class="select-with-preload">
            <select
              id="inline-asr-model-select"
              class="model-select-input"
              value={modelState.selectedModelId}
              onchange={(e) => modelState.selectModel(e.target.value)}
              disabled={appState.isProcessing || modelState.isModelLoading}
            >
              {#each modelState.models as m (m.id)}
                <option value={m.id}>
                  {m.title}
                </option>
              {/each}
            </select>

            <button
              type="button"
              class="btn-preload-pill {modelState.isModelLoaded ? 'loaded' : ''}"
              onclick={() => modelState.preloadModel(appState.worker)}
              disabled={appState.isProcessing ||
                modelState.isModelLoading ||
                (modelState.modelSource === 'folder' &&
                  modelState.localFileCount === 0)}
              title={modelState.isModelLoaded
                ? 'Model is loaded and ready in memory (click to reload)'
                : 'Preload model weights into browser memory ahead of transcription'}
            >
              {#if modelState.isModelLoading}
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading...</span>
              {:else if modelState.isModelLoaded}
                <i class="fa-solid fa-circle-check"></i>
                <span>Ready</span>
              {:else}
                <i class="fa-solid fa-cloud-arrow-down"></i>
                <span>Preload</span>
              {/if}
            </button>

            {#if modelState.isModelLoading}
              <button
                type="button"
                class="btn-cancel-load"
                onclick={() => transcriptState.stopTranscription(onWorkerReset)}
                title="Cancel model loading"
                aria-label="Cancel model loading"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            {/if}

            <button
              type="button"
              class="panel-tool-btn btn-manage-prominent"
              onclick={() => modelState.openModelManager()}
              title="Open Model Manager modal to download, configure or add speech models"
            >
              <i class="fa-solid fa-sliders"></i>
              <span>Model Manager</span>
            </button>
          </div>
        </div>

        <!-- Acceleration / Compute Device Selection -->
        <div class="device-select-container">
          <div class="field-label-row">
            <label for="inline-asr-device-select" class="field-label"
              >Acceleration</label
            >
            {#if modelState.activeDevice === 'webgpu'}
              <span
                class="device-chip chip-gpu"
                title="WebGPU hardware acceleration active"
              >
                <i class="fa-solid fa-bolt"></i> WebGPU
              </span>
            {:else}
              <span
                class="device-chip chip-cpu"
                title="Multi-threaded CPU WebAssembly active"
              >
                <i class="fa-solid fa-microchip"></i> CPU
              </span>
            {/if}
          </div>

          <select
            id="inline-asr-device-select"
            class="device-select-input"
            value={modelState.preferredDevice}
            onchange={(e) => modelState.setPreferredDevice(e.target.value)}
            disabled={appState.isProcessing || modelState.isModelLoading}
            title="Select execution backend (WebGPU or multi-threaded CPU)"
          >
            <option value="auto">Auto (WebGPU preferred)</option>
            <option value="webgpu" disabled={!modelState.isWebGpuSupported}>
              WebGPU {!modelState.isWebGpuSupported
                ? '(Not supported)'
                : '(Fastest)'}
            </option>
            <option value="wasm">CPU (WASM multi-threaded)</option>
          </select>
        </div>

        <!-- ASR Output Destination Selection -->
        <div class="target-select-container">
          <div class="field-label-row">
            <label for="inline-asr-output-select" class="field-label"
              >Output Destination</label
            >
            {#if selectedTargetTier}
              <span
                class="target-chip chip-subtier"
                title="Output directed to Sub-tier #{selectedTargetTier.id} ({selectedTargetTier.name})"
              >
                <i class="fa-solid fa-layer-group"></i> #{selectedTargetTier.id}
              </span>
            {:else}
              <span
                class="target-chip chip-main"
                title="Output directed to Main Transcription tier"
              >
                <i class="fa-solid fa-align-left"></i> Main
              </span>
            {/if}
          </div>

          <select
            id="inline-asr-output-select"
            class="target-select-input"
            value={transcriptState.effectiveAsrOutputTarget}
            onchange={(e) => transcriptState.setAsrOutputTarget(e.target.value)}
            disabled={appState.isProcessing || modelState.isModelLoading}
            title="Select where to put the output of ASR (Main transcription or sentence-level sub-tier)"
          >
            <option value="main">Main Transcription</option>
            {#each sentenceSubTiers as tier (tier.id)}
              <option value={String(tier.id)}>
                {tier.name} (Sub-tier #{tier.id})
              </option>
            {/each}
          </select>
        </div>

        <!-- Audio Range Selection -->
        {#if audioState.totalAudioDuration > 0}
          <div class="range-select-container">
            <div class="range-head">
              <i class="fa-solid fa-clock"></i>
              <span>Range</span>
              {#if audioState.isIntervalSelected}
                <button
                  type="button"
                  class="btn-reset-interval"
                  onclick={() => audioState.resetInterval()}
                  title="Use entire audio recording"
                >
                  Reset to full
                </button>
              {/if}
            </div>
            <IntervalPicker />
          </div>
        {/if}

        <!-- Action & Live Status -->
        <div class="action-container">
          <div class="status-box">
            {#if isTranscribing}
              <span class="status-chip chip-info">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span
                  >Transcribing{selectedTargetTier
                    ? ` into ${selectedTargetTier.name}`
                    : ''}{audioState.isIntervalSelected
                    ? ' (selected range)'
                    : ''}...{emptyCount > 0
                    ? ` (${emptyCount} left)`
                    : ''}</span
                >
              </span>
            {:else if !hasAudio}
              <span class="status-chip chip-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>Load audio file first</span>
              </span>
            {:else if totalCount === 0}
              <span class="status-chip chip-neutral">
                <i class="fa-solid fa-circle-info"></i>
                <span>No segments &bull; run Auto Segmentation first</span>
              </span>
            {:else if audioState.isIntervalSelected && rangeTotalCount === 0}
              <span class="status-chip chip-warning">
                <i class="fa-solid fa-crop-simple"></i>
                <span>No segments in selected range ({audioState.audioRangeStart.toFixed(1)}s &ndash; {audioState.audioRangeEnd.toFixed(1)}s)</span>
              </span>
            {:else if emptyCount === 0}
              <span class="status-chip chip-success">
                <i class="fa-solid fa-circle-check"></i>
                <span
                  >All {rangeTotalCount} segment{rangeTotalCount === 1
                    ? ''
                    : 's'}{audioState.isIntervalSelected
                    ? ' in range'
                    : ''} transcribed{selectedTargetTier
                    ? ` in ${selectedTargetTier.name}`
                    : ''}</span
                >
              </span>
            {:else}
              <span class="status-chip chip-info">
                <i class="fa-solid fa-clock"></i>
                <span
                  ><strong>{emptyCount}</strong> of {rangeTotalCount} segment{emptyCount ===
                  1
                    ? ''
                    : 's'}{audioState.isIntervalSelected
                    ? ' in range'
                    : ''} empty{selectedTargetTier
                    ? ` in ${selectedTargetTier.name}`
                    : ''}</span
                >
              </span>
            {/if}
          </div>

          <div class="actions-cluster">
            {#if isTranscribing}
              <button
                type="button"
                class="btn-run-action btn-stop-action"
                onclick={() => transcriptState.stopTranscription(onWorkerReset)}
                title="Stop transcription process"
              >
                <i class="fa-solid fa-stop"></i>
                <span>Stop</span>
              </button>
            {:else}
              <button
                type="button"
                class="btn-run-action"
                onclick={() => transcriptState.handleTranscribeEmptySegments()}
                disabled={appState.isProcessing ||
                  emptyCount === 0 ||
                  !hasAudio ||
                  (modelState.modelSource === 'folder' &&
                    modelState.localFileCount === 0)}
                title={selectedTargetTier
                  ? `Transcribe empty segments into ${selectedTargetTier.name} with selected Whisper model`
                  : 'Transcribe empty segments with selected Whisper model'}
              >
                {#if totalCount === 0}
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>Segments Needed</span>
                {:else if audioState.isIntervalSelected && rangeTotalCount === 0}
                  <i class="fa-solid fa-crop-simple"></i>
                  <span>No Segments in Range</span>
                {:else if emptyCount === 0 && rangeTotalCount > 0}
                  <i class="fa-solid fa-circle-check"></i>
                  <span>All Done</span>
                {:else}
                  <i class="fa-solid fa-play"></i>
                  <span
                    >Transcribe {emptyCount} Segment{emptyCount === 1
                      ? ''
                      : 's'}{audioState.isIntervalSelected
                      ? ' in Range'
                      : ''}</span
                  >
                {/if}
              </button>
            {/if}

            <button
              type="button"
              class="panel-close-btn"
              onclick={onClose}
              title="Close settings panel"
              aria-label="Close"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Messages / Progress Alerts if any -->
  {#if appState.errorMessage}
    <div class="panel-alert alert-danger">
      <i class="fa-solid fa-circle-xmark"></i>
      <span>{appState.errorMessage}</span>
    </div>
  {/if}
</div>

<style>
  .inline-settings-panel {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    border-bottom: 2px solid #7c3aed;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    margin: 0;
    animation: slideDown 0.16s ease-out;
    z-index: 10;
  }

  :global([data-theme='dark']) .inline-settings-panel {
    background: #0f172a;
    border-color: #334155;
    border-bottom-color: #a78bfa;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .empty-models-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;
  }

  /* High-visibility Manage Models button */
  .btn-manage-prominent {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #7c3aed;
    color: #ffffff;
    border: 1px solid #6d28d9;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(124, 58, 237, 0.3);
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-manage-prominent:hover {
    background: #6d28d9;
    color: #ffffff;
    border-color: #5b21b6;
    box-shadow: 0 2px 6px rgba(124, 58, 237, 0.42);
    transform: translateY(-1px);
  }

  :global([data-theme='dark']) .btn-manage-prominent {
    background: #8b5cf6;
    border-color: #7c3aed;
    box-shadow: 0 1px 4px rgba(139, 92, 246, 0.4);
  }

  :global([data-theme='dark']) .btn-manage-prominent:hover {
    background: #7c3aed;
    border-color: #6d28d9;
  }

  .panel-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.14s ease;
  }

  .panel-close-btn:hover {
    background: rgba(0, 0, 0, 0.07);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  /* Compact body container */
  .panel-body {
    padding: 10px 14px;
    background: transparent;
    border-radius: 8px 8px 0 0;
  }

  :global([data-theme='dark']) .panel-body {
    background: transparent;
  }

  .model-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .model-select-container {
    min-width: 260px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-label {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-heading, #1e293b);
  }

  :global([data-theme='dark']) .field-label {
    color: #e2e8f0;
  }

  .lang-tag {
    font-size: 0.68rem;
    font-weight: 700;
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #ddd6fe;
    border-radius: 4px;
    padding: 1px 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  :global([data-theme='dark']) .lang-tag {
    background: rgba(124, 58, 237, 0.25);
    color: #ddd6fe;
    border-color: rgba(167, 139, 250, 0.35);
  }

  .dtype-tag {
    background: #f0fdf4 !important;
    color: #16a34a !important;
    border-color: #bbf7d0 !important;
  }

  :global([data-theme='dark']) .dtype-tag {
    background: rgba(22, 163, 74, 0.2) !important;
    color: #86efac !important;
    border-color: rgba(22, 163, 74, 0.35) !important;
  }

  .device-select-container {
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .device-select-input {
    height: 34px;
    padding: 4px 10px;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    transition: border-color 0.14s ease;
  }

  .device-select-input:focus {
    outline: none;
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
  }

  :global([data-theme='dark']) .device-select-input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .device-select-input:focus {
    border-color: #a78bfa;
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
  }

  .device-chip {
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 4px;
    padding: 1px 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .chip-gpu {
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
  }

  :global([data-theme='dark']) .chip-gpu {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.35);
  }

  .chip-cpu {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
  }

  :global([data-theme='dark']) .chip-cpu {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
    border-color: rgba(148, 163, 184, 0.3);
  }

  .target-select-container {
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .target-select-input {
    height: 34px;
    padding: 4px 10px;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    transition: border-color 0.14s ease;
  }

  .target-select-input:focus {
    outline: none;
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
  }

  :global([data-theme='dark']) .target-select-input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .target-select-input:focus {
    border-color: #a78bfa;
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
  }

  .target-chip {
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 4px;
    padding: 1px 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .chip-main {
    background: #eff6ff;
    color: #2563eb;
    border: 1px solid #bfdbfe;
  }

  :global([data-theme='dark']) .chip-main {
    background: rgba(37, 99, 235, 0.2);
    color: #93c5fd;
    border-color: rgba(37, 99, 235, 0.35);
  }

  .chip-subtier {
    background: #fdf2f8;
    color: #db2777;
    border: 1px solid #fbcfe8;
  }

  :global([data-theme='dark']) .chip-subtier {
    background: rgba(219, 39, 119, 0.2);
    color: #f472b6;
    border-color: rgba(219, 39, 119, 0.35);
  }

  .select-with-preload {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .model-select-input {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 4px 10px;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    transition: border-color 0.14s ease;
  }

  .model-select-input:focus {
    outline: none;
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
  }

  :global([data-theme='dark']) .model-select-input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .model-select-input:focus {
    border-color: #a78bfa;
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
  }

  .btn-preload-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 34px;
    padding: 0 11px;
    font-size: 0.76rem;
    font-weight: 600;
    background: var(--bg-muted, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #334155);
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.14s ease;
  }

  .btn-preload-pill:hover:not(:disabled) {
    border-color: #7c3aed;
    color: #7c3aed;
    background: #f5f3ff;
  }

  .btn-preload-pill.loaded {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.35);
    color: #059669;
    font-weight: 700;
  }

  :global([data-theme='dark']) .btn-preload-pill {
    background: #0f172a;
    border-color: #475569;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-preload-pill:hover:not(:disabled) {
    border-color: #a78bfa;
    color: #c084fc;
    background: rgba(124, 58, 237, 0.15);
  }

  :global([data-theme='dark']) .btn-preload-pill.loaded {
    background: rgba(16, 185, 129, 0.18);
    border-color: rgba(16, 185, 129, 0.4);
    color: #34d399;
  }

  .btn-cancel-load {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background: #fee2e2;
    border: 1px solid #fca5a5;
    color: #dc2626;
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .action-container {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .status-box {
    display: flex;
    align-items: center;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 600;
    padding: 6px 11px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .chip-info {
    background: rgba(124, 58, 237, 0.1);
    color: #7c3aed;
    border: 1px solid rgba(124, 58, 237, 0.2);
  }

  :global([data-theme='dark']) .chip-info {
    background: rgba(167, 139, 250, 0.15);
    color: #c084fc;
    border-color: rgba(167, 139, 250, 0.3);
  }

  .chip-success {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  :global([data-theme='dark']) .chip-success {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.35);
  }

  .chip-warning {
    background: rgba(245, 158, 11, 0.12);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  :global([data-theme='dark']) .chip-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.3);
  }

  .chip-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.2);
  }

  :global([data-theme='dark']) .chip-neutral {
    background: rgba(100, 116, 139, 0.18);
    color: #94a3b8;
    border-color: rgba(100, 116, 139, 0.3);
  }

  .actions-cluster {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-run-action {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 16px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ffffff;
    background: linear-gradient(135deg, #7c3aed, #6d28d9);
    border: 1px solid #6d28d9;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(124, 58, 237, 0.3);
    white-space: nowrap;
  }

  .btn-run-action:hover:not(:disabled) {
    background: linear-gradient(135deg, #6d28d9, #5b21b6);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(124, 58, 237, 0.42);
  }

  .btn-run-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .btn-stop-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 16px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ffffff;
    background: #ef4444;
    border: 1px solid #dc2626;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.3);
    white-space: nowrap;
  }

  .btn-stop-action:hover,
  .btn-run-action.btn-stop-action:hover {
    background: #dc2626;
    border-color: #b91c1c;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.42);
  }

  .panel-alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    border-top: 1px solid transparent;
  }

  .alert-danger {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
    border-top-color: rgba(239, 68, 68, 0.2);
  }

  :global([data-theme='dark']) .alert-danger {
    color: #f87171;
  }

  @media (max-width: 640px) {
    .model-row {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .action-container {
      justify-content: space-between;
    }
    .btn-run-action {
      flex: 1;
      justify-content: center;
    }
  }

  .range-select-container {
    min-width: 240px;
    flex: 1 1 260px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 10px 12px;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .range-select-container {
    background: #1e293b;
    border-color: #334155;
  }

  .range-head {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.77rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted, #64748b);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .range-head {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .range-head i {
    color: #7c3aed;
  }

  :global([data-theme='dark']) .range-head i {
    color: #a78bfa;
  }

  .btn-reset-interval {
    margin-left: auto;
    background: transparent;
    border: none;
    font-size: 0.69rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
    color: #7c3aed;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  :global([data-theme='dark']) .btn-reset-interval {
    color: #a78bfa;
  }

  .side-panel-header {
    display: none;
  }

  @media (min-width: 1081px) {
    .inline-settings-panel {
      height: 100%;
      max-height: 100%;
      min-height: 0;
      border-radius: 8px;
      border-top: 2px solid #7c3aed;
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      overflow: hidden;
    }

    :global([data-theme='dark']) .inline-settings-panel {
      border-top-color: #a78bfa;
      border-bottom-color: #334155;
    }

    .side-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-card, #ffffff);
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      flex-shrink: 0;
    }

    :global([data-theme='dark']) .side-panel-header {
      background: #1e293b;
      border-bottom-color: #334155;
    }

    .side-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.86rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }

    :global([data-theme='dark']) .side-panel-title {
      color: #f8fafc;
    }

    .side-panel-title i {
      color: #7c3aed;
    }

    :global([data-theme='dark']) .side-panel-title i {
      color: #a78bfa;
    }

    .panel-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
    }

    .model-row {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }

    .model-select-container,
    .device-select-container,
    .target-select-container,
    .range-select-container {
      min-width: 0;
      width: 100%;
      flex: none;
    }

    .select-with-preload {
      flex-wrap: wrap;
    }

    .model-select-input {
      flex: 1 1 100%;
    }

    .action-container {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      margin-top: 4px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #cbd5e1);
    }

    :global([data-theme='dark']) .action-container {
      border-top-color: #334155;
    }

    .status-chip {
      width: 100%;
      box-sizing: border-box;
      white-space: normal;
    }

    .actions-cluster {
      width: 100%;
    }

    .actions-cluster .panel-close-btn,
    .empty-models-panel .panel-close-btn {
      display: none;
    }

    .btn-run-action,
    .btn-stop-action {
      flex: 1;
      justify-content: center;
    }
  }
</style>

