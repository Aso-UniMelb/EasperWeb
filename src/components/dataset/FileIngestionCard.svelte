<script>
  import {
    datasetState,
    MAX_DATASET_PAIRS,
  } from '../../state/datasetState.svelte.js';

  let isDragging = $state(false);
  let fileInputEl = $state(null);
  let folderInputEl = $state(null);

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;

    const files = [];
    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry && entry.isDirectory) {
            await traverseDirectory(entry, files);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      files.push(...Array.from(e.dataTransfer.files));
    }

    if (files.length > 0) {
      await datasetState.ingestFiles(files);
    }
  }

  async function traverseDirectory(entry, files) {
    const reader = entry.createReader();
    const readEntries = () =>
      new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    let entries = await readEntries();
    while (entries.length > 0) {
      for (const child of entries) {
        if (child.isFile) {
          const file = await new Promise((resolve) => child.file(resolve));
          files.push(file);
        } else if (child.isDirectory) {
          await traverseDirectory(child, files);
        }
      }
      entries = await readEntries();
    }
  }

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      datasetState.ingestFiles(files);
    }
    e.target.value = '';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getAnnotationCount(pair) {
    if (!pair.parsedEaf || !pair.parsedEaf.tiers) return 0;
    return pair.parsedEaf.tiers.reduce(
      (sum, t) => sum + (t.annotations?.length || 0),
      0,
    );
  }
</script>

<div class="card dataset-ingestion-card">
  <div class="card-header-row">
    <div class="header-title-wrap">
      <i class="fa-solid fa-folder-open section-icon"></i>
      <div>
        <div class="title-with-badge">
          <h2 class="card-title">1. Ingest &amp; Pair Files</h2>
          <span
            class="pair-limit-chip {datasetState.pairedFiles.length >=
            MAX_DATASET_PAIRS
              ? 'chip-limit-reached'
              : ''}"
            title="Safety limit: Maximum 50 paired files per dataset to prevent browser memory crashes"
          >
            <i
              class="fa-solid {datasetState.pairedFiles.length >=
              MAX_DATASET_PAIRS
                ? 'fa-triangle-exclamation'
                : 'fa-shield-halved'}"
            ></i>
            {datasetState.pairedFiles.length} / {MAX_DATASET_PAIRS} Pairs Max
          </span>
        </div>
        <p class="card-subtitle">
          Add ELAN (.eaf) annotations and audio recordings (.wav, .mp3, .ogg,
          .flac, .m4a) &bull; Up to 50 pairs to prevent browser memory
          exhaustion.
        </p>
      </div>
    </div>

    {#if datasetState.pairedFiles.length > 0}
      <button
        type="button"
        class="btn-clear-dataset"
        onclick={() => datasetState.clearAll()}
        title="Remove all loaded files"
      >
        <i class="fa-solid fa-trash-can"></i> Clear All
      </button>
    {/if}
  </div>

  <!-- Drag and Drop Zone -->
  <div
    class="dataset-drop-zone {isDragging ? 'drop-active' : ''}"
    ondragover={handleDragOver}
    onpointerleave={handleDragLeave}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
    aria-label="Drag and drop files"
  >
    <div class="drop-icon-wrap">
      <i class="fa-solid fa-folder-open drop-icon"></i>
    </div>
    <h3 class="drop-title">Drop ELAN (.eaf) &amp; Audio files here</h3>
    <p class="drop-hint">
      Pairing is done automatically on your device (max {MAX_DATASET_PAIRS} pairs
      to maintain browser stability). No data is sent to a server.
    </p>

    <div class="drop-action-buttons">
      <button
        type="button"
        class="btn-primary-action"
        onclick={() => {
          if (
            datasetState.pairedFiles.length >= MAX_DATASET_PAIRS &&
            datasetState.unmatchedEaf.length === 0
          ) {
            alert(
              `Maximum dataset capacity reached (${MAX_DATASET_PAIRS} pairs). Please remove some files before adding new ones to prevent browser crashes.`,
            );
            return;
          }
          fileInputEl?.click();
        }}
      >
        Choose Files
      </button>

      <button
        type="button"
        class="btn-outline-action"
        onclick={() => {
          if (
            datasetState.pairedFiles.length >= MAX_DATASET_PAIRS &&
            datasetState.unmatchedEaf.length === 0
          ) {
            alert(
              `Maximum dataset capacity reached (${MAX_DATASET_PAIRS} pairs). Please remove some files before adding new ones to prevent browser crashes.`,
            );
            return;
          }
          folderInputEl?.click();
        }}
      >
        Choose Folder
      </button>
    </div>

    <input
      bind:this={fileInputEl}
      type="file"
      multiple
      accept=".eaf,.wav,.mp3,.ogg,.flac,.m4a"
      class="hidden-file-input"
      onchange={handleFileSelect}
    />

    <input
      bind:this={folderInputEl}
      type="file"
      webkitdirectory
      directory
      multiple
      class="hidden-file-input"
      onchange={handleFileSelect}
    />
  </div>

  <!-- 50-Pair Memory Safeguard Warning Banner -->
  {#if datasetState.pairLimitNotice}
    <div class="warning-banner limit-warning-banner">
      <div class="warning-icon-wrap">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="warning-content">
        <h4>Dataset Size Limitation (Max {MAX_DATASET_PAIRS} Pairs)</h4>
        <p>{datasetState.pairLimitNotice}</p>
      </div>
      <button
        type="button"
        class="btn-dismiss-warning"
        onclick={() => datasetState.dismissPairLimitNotice()}
        title="Dismiss notice"
        aria-label="Dismiss limit notice"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  {:else if datasetState.pairedFiles.length >= MAX_DATASET_PAIRS}
    <div class="warning-banner limit-warning-banner">
      <div class="warning-icon-wrap">
        <i class="fa-solid fa-shield-halved"></i>
      </div>
      <div class="warning-content">
        <h4>
          Maximum Pair Capacity Reached ({MAX_DATASET_PAIRS}/{MAX_DATASET_PAIRS}
          Pairs)
        </h4>
        <p>
          The memory safety limit has been reached for this dataset. To add
          different recordings, please remove some existing files first to
          prevent browser tab crashes.
        </p>
      </div>
    </div>
  {/if}

  <!-- Missing Audio Warning Banner -->
  {#if datasetState.unmatchedEaf.length > 0}
    <div class="warning-banner">
      <div class="warning-icon-wrap">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="warning-content">
        <h4>Missing Audio File(s) Detected</h4>
        <p>
          The following {datasetState.unmatchedEaf.length} ELAN file(s) do not have
          a matching audio file loaded. Please drop their matching audio files to
          include them in the dataset:
        </p>
        <ul class="missing-files-list">
          {#each datasetState.unmatchedEaf as name}
            <li>• <strong>{name}</strong></li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <!-- Ingestion Summary Pills & Inserted Files -->
  {#if datasetState.pairedFiles.length > 0 || datasetState.audioFiles.length > 0}
    <div class="file-summary-grid">
      <div class="summary-stat-box">
        <span class="stat-num">{datasetState.eafFiles.length}</span>
        <span class="stat-label">ELAN (.eaf) Files</span>
      </div>
      <div class="summary-stat-box">
        <span class="stat-num">{datasetState.audioFiles.length}</span>
        <span class="stat-label">Audio Recordings</span>
      </div>
      <div
        class="summary-stat-box {datasetState.pairedFiles.filter(
          (p) => p.hasAudio,
        ).length >= MAX_DATASET_PAIRS
          ? 'stat-warning-box'
          : ''}"
      >
        <span class="stat-num stat-success">
          {datasetState.pairedFiles.filter((p) => p.hasAudio).length}
          <span class="stat-max-sub">/ {MAX_DATASET_PAIRS}</span>
        </span>
        <span class="stat-label">Successfully Paired</span>
      </div>
      {#if datasetState.unmatchedEaf.length > 0}
        <div class="summary-stat-box stat-warning-box">
          <span class="stat-num stat-warning"
            >{datasetState.unmatchedEaf.length}</span
          >
          <span class="stat-label">Missing Audio</span>
        </div>
      {/if}
    </div>

    <!-- Inserted Files List -->
    <div class="inserted-files-section">
      <div class="inserted-files-header">
        <div class="inserted-heading-left">
          <i class="fa-solid fa-list-check inserted-icon"></i>
          <h4 class="inserted-title">
            Inserted Files
            <span class="inserted-count-badge">
              {datasetState.eafFiles.length + datasetState.audioFiles.length}
            </span>
          </h4>
        </div>
        <span class="inserted-hint">
          {datasetState.pairedFiles.length} ELAN file{datasetState.pairedFiles
            .length !== 1
            ? 's'
            : ''} (max {MAX_DATASET_PAIRS}) &bull; {datasetState.audioFiles
            .length} audio file{datasetState.audioFiles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div class="inserted-files-table-wrapper">
        <table class="inserted-files-table">
          <thead>
            <tr>
              <th class="th-file-elan">ELAN Annotation (.eaf)</th>
              <th class="th-file-size">Size</th>
              <th class="th-file-meta">Tiers &amp; Annotations</th>
              <th class="th-file-audio">Paired Audio Recording</th>
              <th class="th-file-action"></th>
            </tr>
          </thead>
          <tbody>
            {#each datasetState.pairedFiles as pair (pair.id)}
              {@const tierCount = pair.parsedEaf?.tiers?.length || 0}
              {@const annCount = getAnnotationCount(pair)}
              <tr>
                <td class="td-file-elan">
                  <div class="file-cell">
                    <i class="fa-solid fa-file-code file-icon-eaf"></i>
                    <span class="file-name" title={pair.eafFile.name}
                      >{pair.eafFile.name}</span
                    >
                  </div>
                </td>
                <td class="td-file-size">
                  <span class="size-text"
                    >{formatFileSize(pair.eafFile.size)}</span
                  >
                </td>
                <td class="td-file-meta">
                  <span
                    class="meta-pill"
                    title="{tierCount} tiers and {annCount} annotations found"
                  >
                    <i class="fa-solid fa-layer-group"></i>
                    <strong>{tierCount}</strong>
                    {tierCount === 1 ? 'tier' : 'tiers'} &bull;
                    <strong>{annCount}</strong>
                    {annCount === 1 ? 'ann' : 'anns'}
                  </span>
                </td>
                <td class="td-file-audio">
                  {#if pair.hasAudio}
                    <div class="audio-match-box">
                      <i class="fa-solid fa-file-audio file-icon-audio"></i>
                      <span class="audio-name" title={pair.audioFileName}
                        >{pair.audioFileName}</span
                      >
                      {#if pair.audioFile}
                        <span class="audio-size-sub"
                          >({formatFileSize(pair.audioFile.size)})</span
                        >
                      {/if}
                      <span
                        class="badge-status-paired"
                        title="Paired with matching audio"
                      >
                        <i class="fa-solid fa-link"></i> Paired
                      </span>
                    </div>
                  {:else}
                    <span
                      class="badge-status-missing"
                      title="No matching audio file uploaded yet"
                    >
                      <i class="fa-solid fa-triangle-exclamation"></i> Missing Audio
                    </span>
                  {/if}
                </td>
                <td class="td-file-action">
                  <button
                    type="button"
                    class="btn-remove-item"
                    onclick={() =>
                      datasetState.removeEafFile(pair.eafFile.name)}
                    title="Remove this ELAN file"
                  >
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </td>
              </tr>
            {/each}

            <!-- Unmatched Audio Files (e.g., audio files uploaded without an EAF) -->
            {#if datasetState.unmatchedAudio.length > 0}
              {#each datasetState.unmatchedAudio as audioName}
                {@const audioObj = datasetState.audioFiles.find(
                  (a) => a.name === audioName,
                )}
                <tr class="row-unmatched-audio">
                  <td class="td-file-elan" colspan="3">
                    <div class="file-cell">
                      <i class="fa-solid fa-file-audio file-icon-audio"></i>
                      <span class="file-name" title={audioName}
                        >{audioName}</span
                      >
                      {#if audioObj}
                        <span class="size-text-muted"
                          >({formatFileSize(audioObj.size)})</span
                        >
                      {/if}
                    </div>
                  </td>
                  <td class="td-file-audio">
                    <span
                      class="badge-status-unmatched"
                      title="Audio file waiting for matching .eaf file"
                    >
                      <i class="fa-solid fa-circle-question"></i> Unmatched Audio
                      (no .eaf)
                    </span>
                  </td>
                  <td class="td-file-action">
                    <button
                      type="button"
                      class="btn-remove-item"
                      onclick={() => datasetState.removeAudioFile(audioName)}
                      title="Remove this audio file"
                    >
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <!-- Step Navigation Footer -->
  <div class="step-nav-footer">
    <div class="footer-left-status">
      {#if datasetState.pairedFiles.length > 0}
        <span class="status-ready-text">
          <i class="fa-solid fa-circle-check text-success"></i>
          {datasetState.pairedFiles.length} ELAN file{datasetState.pairedFiles
            .length !== 1
            ? 's'
            : ''} loaded ({datasetState.pairedFiles.filter((p) => p.hasAudio)
            .length} paired with audio)
        </span>
      {:else}
        <span class="status-empty-text">
          Please add .eaf and audio files to proceed.
        </span>
      {/if}
    </div>

    <button
      type="button"
      class="btn-step-next"
      disabled={datasetState.pairedFiles.length === 0}
      onclick={() => datasetState.setTab('tiers')}
    >
      <span>Next: Select Tiers</span>
      <i class="fa-solid fa-arrow-right"></i>
    </button>
  </div>
</div>

<style>
  .dataset-ingestion-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
  }

  .card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 10px;
  }

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-icon {
    font-size: 1.2rem;
    color: var(--primary-color, #0284c7);
  }

  .card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
  }

  .title-with-badge {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pair-limit-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 700;
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
    border: 1px solid var(--border-color, #cbd5e1);
  }

  .pair-limit-chip.chip-limit-reached {
    background: #fff7ed;
    color: #c2410c;
    border-color: #fdba74;
  }

  .limit-warning-banner {
    position: relative;
    padding-right: 36px;
  }

  .btn-dismiss-warning {
    position: absolute;
    top: 8px;
    right: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0.7;
    padding: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .btn-dismiss-warning:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.06);
  }

  .stat-max-sub {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    margin-left: 2px;
  }

  .card-subtitle {
    font-size: 0.82rem;
    margin: 1px 0 0 0;
    color: var(--text-muted, #64748b);
  }

  .btn-clear-dataset {
    background: transparent;
    border: 1px solid #fca5a5;
    color: #dc2626;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-clear-dataset:hover {
    background: #fef2f2;
  }

  .dataset-drop-zone {
    border: 2px dashed var(--border-dashed, #cbd5e1);
    border-radius: 10px;
    padding: 16px 14px;
    text-align: center;
    background: var(--bg-dropzone, #f8fafc);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .dataset-drop-zone.drop-active {
    border-color: #0284c7;
    background: #eff6ff;
  }

  .drop-icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #e0f2fe;
    color: #0284c7;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    margin-bottom: 8px;
  }

  .drop-title {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0 0 2px 0;
    color: var(--text-heading, #0f172a);
  }

  .drop-hint {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
    margin: 0 0 10px 0;
  }

  .drop-action-buttons {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-primary-action {
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s ease;
  }

  .btn-primary-action:hover {
    background: #0369a1;
  }

  .btn-outline-action {
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-outline-action:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: #94a3b8;
  }

  .hidden-file-input {
    display: none;
  }

  .warning-banner {
    margin-top: 10px;
    display: flex;
    gap: 10px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 8px 12px;
    color: #92400e;
  }

  .warning-icon-wrap {
    font-size: 1.15rem;
    color: #d97706;
    margin-top: 2px;
  }

  .warning-content h4 {
    margin: 0 0 2px 0;
    font-size: 0.88rem;
    font-weight: 700;
  }

  .warning-content p {
    margin: 0 0 6px 0;
    font-size: 0.8rem;
  }

  .missing-files-list {
    margin: 0;
    padding-left: 14px;
    font-size: 0.78rem;
    list-style-type: none;
  }

  .file-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
    margin-top: 4px;
  }

  .summary-stat-box {
    background: var(--bg-summary-box, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 4px 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-num {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
  }

  .stat-success {
    color: #16a34a;
  }

  .stat-warning {
    color: #d97706;
  }

  .stat-warning-box {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .stat-label {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
  }

  .step-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .status-ready-text {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .status-empty-text {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
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
    box-shadow: 0 3px 8px rgba(2, 132, 199, 0.3);
  }

  .btn-step-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* Dark Theme Overrides */
  :global([data-theme='dark']) .btn-clear-dataset:hover {
    background: rgba(220, 38, 38, 0.2);
  }

  :global([data-theme='dark']) .dataset-drop-zone.drop-active {
    background: rgba(2, 132, 199, 0.15);
    border-color: #38bdf8;
  }

  :global([data-theme='dark']) .drop-icon-wrap {
    background: rgba(2, 132, 199, 0.15);
    color: #38bdf8;
  }

  :global([data-theme='dark']) .warning-banner {
    background: rgba(217, 119, 6, 0.15);
    border-color: rgba(217, 119, 6, 0.3);
    color: #fde68a;
  }

  :global([data-theme='dark']) .warning-icon-wrap {
    color: #fbbf24;
  }

  :global([data-theme='dark']) .stat-warning-box {
    background: rgba(217, 119, 6, 0.15);
    border-color: rgba(217, 119, 6, 0.3);
  }

  :global([data-theme='dark']) .pair-limit-chip {
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.15);
  }

  :global([data-theme='dark']) .pair-limit-chip.chip-limit-reached {
    background: rgba(194, 65, 12, 0.2);
    color: #fdba74;
    border-color: rgba(253, 186, 116, 0.4);
  }

  :global([data-theme='dark']) .btn-dismiss-warning:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* Inserted Files Section */
  .inserted-files-section {
    margin-top: 14px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 14px;
  }

  .inserted-files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .inserted-heading-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .inserted-icon {
    font-size: 0.95rem;
    color: var(--primary-color, #0284c7);
  }

  .inserted-title {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .inserted-count-badge {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .inserted-hint {
    font-size: 0.74rem;
    color: var(--text-muted, #64748b);
  }

  .inserted-files-table-wrapper {
    overflow-x: auto;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
  }

  .inserted-files-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
    text-align: left;
  }

  .inserted-files-table th {
    background: var(--bg-hover, #f8fafc);
    color: var(--text-muted, #64748b);
    font-weight: 700;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .inserted-files-table td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    vertical-align: middle;
  }

  .inserted-files-table tbody tr:hover {
    background: var(--bg-hover, #f8fafc);
  }

  .file-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 280px;
  }

  .file-icon-eaf {
    color: #0284c7;
    font-size: 0.88rem;
    flex-shrink: 0;
  }

  .file-icon-audio {
    color: #10b981;
    font-size: 0.88rem;
    flex-shrink: 0;
  }

  .file-name {
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size-text {
    color: var(--text-muted, #64748b);
    font-size: 0.74rem;
    white-space: nowrap;
  }

  .size-text-muted {
    color: var(--text-muted, #94a3b8);
    font-size: 0.72rem;
    margin-left: 4px;
  }

  .meta-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f1f5f9;
    color: #475569;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .audio-match-box {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .audio-name {
    font-weight: 500;
    color: var(--text-base, #334155);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .audio-size-sub {
    color: var(--text-muted, #94a3b8);
    font-size: 0.72rem;
  }

  .badge-status-paired {
    background: #dcfce7;
    color: #15803d;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .badge-status-missing {
    background: #fffbeb;
    color: #b45309;
    border: 1px solid #fde68a;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .badge-status-unmatched {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .btn-remove-item {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 3px 6px;
    border-radius: 4px;
    transition: all 0.12s ease;
  }

  .btn-remove-item:hover {
    color: #dc2626;
    background: #fee2e2;
  }

  .row-unmatched-audio {
    background: #f8fafc;
  }

  :global([data-theme='dark']) .inserted-files-section {
    background: rgba(15, 23, 42, 0.4);
    border-color: #334155;
  }

  :global([data-theme='dark']) .inserted-files-table-wrapper {
    background: var(--bg-card, #1e293b);
    border-color: #334155;
  }

  :global([data-theme='dark']) .inserted-files-table th {
    background: #0f172a;
    border-color: #334155;
  }

  :global([data-theme='dark']) .inserted-files-table td {
    border-color: #334155;
  }

  :global([data-theme='dark']) .inserted-files-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  :global([data-theme='dark']) .meta-pill {
    background: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .badge-status-paired {
    background: rgba(22, 163, 74, 0.2);
    color: #4ade80;
  }

  :global([data-theme='dark']) .badge-status-missing {
    background: rgba(217, 119, 6, 0.2);
    border-color: rgba(217, 119, 6, 0.4);
    color: #fbbf24;
  }

  :global([data-theme='dark']) .badge-status-unmatched {
    background: rgba(2, 132, 199, 0.2);
    border-color: rgba(2, 132, 199, 0.4);
    color: #60a5fa;
  }

  :global([data-theme='dark']) .btn-remove-item:hover {
    background: rgba(220, 38, 38, 0.2);
    color: #f87171;
  }

  :global([data-theme='dark']) .inserted-count-badge {
    background: rgba(2, 132, 199, 0.25);
    color: #38bdf8;
  }
</style>
