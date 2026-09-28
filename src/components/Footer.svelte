<script>
  import { appState } from '../state/appState.svelte.js';
  import { transcriptState } from '../state/transcriptState.svelte.js';
  import { projectState } from '../state/projectState.svelte.js';
  import { modelState } from '../state/modelState.svelte.js';

  let storageUsageStr = $state('');

  async function updateStorageEstimate() {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.usage !== undefined) {
          if (est.usage >= 1024 * 1024 * 1024) {
            storageUsageStr = `${(est.usage / (1024 * 1024 * 1024)).toFixed(2)} GB storage`;
          } else {
            storageUsageStr = `${(est.usage / (1024 * 1024)).toFixed(1)} MB storage`;
          }
        }
      } catch (_) {}
    }
  }

  $effect(() => {
    updateStorageEstimate();
    if (!appState.isProcessing) {
      updateStorageEstimate();
    }
  });
</script>

<footer
  class="easper-global-footer"
  aria-label="Application Status and Device Bar"
>
  <!-- Left: Operation Status Reports -->
  <div class="footer-left-col">
    <div class="status-indicator-group">
      <span
        class="status-pulse-dot {appState.isProcessing
          ? 'dot-processing'
          : appState.errorMessage
            ? 'dot-error'
            : 'dot-ready'}"
      ></span>
      <span class="footer-status-text" title={appState.statusMessage}>
        {#if appState.isProcessing}
          <i class="fa-solid fa-spinner fa-spin status-spinner"></i>
        {/if}
        {appState.statusMessage || 'Ready'}
      </span>
    </div>

    {#if transcriptState.metrics?.transcriptionTime && !appState.isProcessing}
      <span
        class="footer-chip chip-metric"
        title="Last transcription time: {transcriptState.metrics.transcriptionTime.toFixed(
          2,
        )}s for {transcriptState.metrics.audioDuration.toFixed(1)}s audio"
      >
        <i class="fa-solid fa-bolt"></i>
        {(
          transcriptState.metrics.audioDuration /
          Math.max(0.001, transcriptState.metrics.transcriptionTime)
        ).toFixed(1)}x speed
      </span>
    {/if}
  </div>

  <!-- Right: Device Status & Theme Switcher -->
  <div class="footer-right-col">
    <!-- CPU Cores & Multi-threading -->
    {#if appState.isIsolated}
      <span
        class="footer-chip chip-success"
        title="Cross-Origin Isolation active: Multi-threaded WASM running with {appState.hardwareConcurrency} CPU cores"
      >
        <i class="fa-solid fa-microchip"></i>
        <span>{appState.hardwareConcurrency} Cores</span>
        <span class="chip-subtag">Multi-thread</span>
      </span>
    {:else}
      <span
        class="footer-chip chip-warning"
        title="Cross-Origin Isolation inactive: Single-threaded WASM execution"
      >
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>1 Core</span>
        <span class="chip-subtag">Single-thread</span>
      </span>
    {/if}

    <!-- WASM SIMD Runtime -->
    <span
      class="footer-chip chip-subtle"
      title="ONNX Runtime WebAssembly execution with SIMD acceleration"
    >
      <i class="fa-solid fa-gears"></i>
      <span>WASM SIMD</span>
    </span>

    <!-- Storage Quota -->
    {#if storageUsageStr}
      <span
        class="footer-chip chip-subtle"
        title="Local browser storage used by projects and custom models"
      >
        <i class="fa-solid fa-database"></i>
        <span>{storageUsageStr}</span>
      </span>
    {/if}

    <!-- Offline Models Status (Clickable to open Model Manager) -->
    <button
      type="button"
      class="footer-chip chip-clickable {modelState.offlineModelsCount > 0
        ? 'chip-success'
        : 'chip-subtle'}"
      onclick={() => modelState.openModelManager()}
      title="{modelState.offlineModelsCount} speech model(s) available offline. Click to open Model Manager."
    >
      <i class="fa-solid fa-brain"></i>
      <span
        >{modelState.offlineModelsCount} Offline Model{modelState.offlineModelsCount ===
        1
          ? ''
          : 's'}</span
      >
    </button>

    <!-- Theme Switch Button -->
    <button
      type="button"
      class="footer-theme-btn"
      onclick={() => appState.toggleTheme()}
      title="Switch theme (currently {appState.theme} mode)"
      aria-label="Toggle dark and light theme"
    >
      <i
        class="fa-solid {appState.theme === 'dark'
          ? 'fa-sun text-amber'
          : 'fa-moon text-indigo'}"
      ></i>
      <span class="theme-name"
        >{appState.theme === 'dark' ? 'Dark' : 'Light'}</span
      >
    </button>
  </div>
</footer>

<style>
  .easper-global-footer {
    position: sticky;
    bottom: 0;
    z-index: 40;
    background-color: var(--bg-app, #f8fafc);
    margin-top: auto;
    padding-top: 10px;
    padding-bottom: 4px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
  }

  .footer-left-col {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    min-width: 0;
  }

  .footer-right-col {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  .status-indicator-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 480px;
    min-width: 0;
  }

  .status-pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-ready {
    background: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  .dot-processing {
    background: #0284c7;
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.3);
    animation: dot-pulse 1.4s infinite;
  }

  .dot-error {
    background: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
  }

  @keyframes dot-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.45;
      transform: scale(1.2);
    }
  }

  .status-spinner {
    color: #0284c7;
    margin-right: 2px;
  }

  .footer-status-text {
    color: var(--text-base, #334155);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer Badges & Chips */
  .footer-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 12px;
    white-space: nowrap;
    line-height: 1;
  }

  .chip-subtag {
    font-size: 0.65rem;
    opacity: 0.8;
    font-weight: 500;
    padding-left: 2px;
  }

  .chip-success {
    background-color: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .chip-warning {
    background-color: #fffbeb;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .chip-metric {
    background-color: #f5f3ff;
    color: #6d28d9;
    border: 1px solid #ddd6fe;
  }

  .chip-subtle {
    background-color: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
    border: 1px solid var(--border-color, #e2e8f0);
  }

  .chip-clickable {
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .chip-clickable:hover {
    transform: translateY(-1px);
    filter: brightness(0.96);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }

  :global([data-theme='dark']) .chip-clickable:hover {
    filter: brightness(1.15);
  }

  /* Theme Switch Button */
  .footer-theme-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .footer-theme-btn:hover {
    background: var(--border-color, #e2e8f0);
    color: var(--text-heading, #0f172a);
    transform: translateY(-1px);
  }

  .text-amber {
    color: #f59e0b;
  }

  .text-indigo {
    color: #6366f1;
  }

  /* Dark Theme Adjustments */
  :global([data-theme='dark']) .footer-chip.chip-success {
    background-color: rgba(6, 95, 70, 0.25);
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.3);
  }

  :global([data-theme='dark']) .footer-chip.chip-warning {
    background-color: rgba(146, 64, 14, 0.25);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.3);
  }

  :global([data-theme='dark']) .footer-chip.chip-metric {
    background-color: rgba(109, 40, 217, 0.25);
    color: #c084fc;
    border-color: rgba(192, 132, 252, 0.3);
  }

  :global([data-theme='dark']) .footer-chip.chip-subtle {
    background-color: #1e293b;
    color: #94a3b8;
    border-color: #334155;
  }

  :global([data-theme='dark']) .footer-theme-btn {
    background: #1e293b;
    border-color: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .footer-theme-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  @media (max-width: 768px) {
    .easper-global-footer {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      position: static;
    }

    .footer-right-col {
      margin-left: 0;
      justify-content: flex-start;
    }
  }
</style>
