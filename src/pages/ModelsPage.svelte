<script>
  import { onMount } from 'svelte';
  import Header from '../components/Header.svelte';
  import {
    modelState,
    WHISPER_LANGUAGES,
    WHISTLE_LANGUAGES,
  } from '../state/modelState.svelte.js';
  import { projectState } from '../state/projectState.svelte.js';
  import { appState } from '../state/appState.svelte.js';
  import { router } from '../services/router.svelte.js';

  onMount(() => {
    modelState.checkAllModelsCached();
  });

  let activeAddTab = $state('presets'); // 'presets' | 'folder' | 'hub'
  let isAddModelModalOpen = $state(false);
  let sortField = $state('title'); // 'title' | 'modelSource' | 'language' | 'dtype'
  let sortDir = $state('asc'); // 'asc' | 'desc'

  function toggleSort(field) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = 'asc';
    }
  }

  let sortedModels = $derived(
    [...modelState.models].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'title') {
        return (a.title || '').localeCompare(b.title || '') * dir;
      }
      if (sortField === 'modelSource') {
        return (a.modelSource || '').localeCompare(b.modelSource || '') * dir;
      }
      if (sortField === 'language') {
        return (a.language || 'en').localeCompare(b.language || 'en') * dir;
      }
      if (sortField === 'dtype') {
        const runtimeA =
          a.architecture === 'whistle' || a.dtype === 'wasm'
            ? 'WASM CPU'
            : a.dtype || 'q8';
        const runtimeB =
          b.architecture === 'whistle' || b.dtype === 'wasm'
            ? 'WASM CPU'
            : b.dtype || 'q8';
        return runtimeA.localeCompare(runtimeB) * dir;
      }
      return 0;
    }),
  );

  let presetLanguages = $state({
    whistle: 'en',
    'whisper-base': 'en',
    'whisper-small': 'en',
  });

  // Local Folder Form State
  let folderInputEl = $state(null);
  let rawFolderFiles = []; // Plain array to prevent Svelte 5 Proxy wrapping on File objects
  let localFileCount = $state(0);
  let localFolderName = $state('');
  let localAnalysis = $state(null);
  let localTitle = $state('');
  let localLanguage = $state('en');
  let localDtype = $state('q8');
  let isSavingFolder = $state(false);
  let folderError = $state('');

  // Hugging Face Form State
  let hubModelId = $state('');
  let hubTitle = $state('');
  let hubLanguage = $state('en');
  let isSavingHub = $state(false);
  let hubError = $state('');

  function selectHubPreset(repoId, defaultTitle, defaultLang = 'en') {
    hubModelId = repoId;
    if (
      !hubTitle.trim() ||
      hubTitle === 'Whistle' ||
      hubTitle === 'Whisper-base' ||
      hubTitle === 'Whisper-small'
    ) {
      hubTitle = defaultTitle;
    }
    hubLanguage = defaultLang;
    hubError = '';
  }

  function handleFolderChosen(e) {
    folderError = '';
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const result = modelState.analyzeFolderFiles(fileList);
    if (!result) return;

    rawFolderFiles = result.entries;
    localFileCount = result.entries.length;
    localFolderName = result.topFolderName;
    localAnalysis = result;
    localDtype = result.detectedDtype;
    if (!localTitle) {
      localTitle = result.topFolderName;
    }
  }

  async function handleSaveLocalFolder() {
    if (!rawFolderFiles || rawFolderFiles.length === 0) {
      folderError = 'Please choose a folder with model files.';
      return;
    }
    if (!localAnalysis?.isValid) {
      folderError =
        'Folder must contain a .cact model file (e.g. whistle.cact) or config.json with .onnx weights.';
      return;
    }
    if (!localTitle.trim()) {
      folderError = 'Please provide a title for this model.';
      return;
    }

    isSavingFolder = true;
    folderError = '';

    try {
      await modelState.saveCustomModel({
        title: localTitle.trim(),
        modelSource: 'folder',
        folderName: localFolderName,
        files: rawFolderFiles,
        language: localLanguage.trim() || 'en',
        dtype: localDtype,
        architecture: localAnalysis.architecture || 'whisper',
      });

      // Reset form
      rawFolderFiles = [];
      localFileCount = 0;
      localFolderName = '';
      localAnalysis = null;
      localTitle = '';
      localLanguage = 'en';
      if (folderInputEl) folderInputEl.value = '';
      isAddModelModalOpen = false;
    } catch (err) {
      folderError = err.message || 'Failed to save local model.';
    } finally {
      isSavingFolder = false;
    }
  }

  async function handleSaveHubModel() {
    if (!hubModelId.trim()) {
      hubError = 'Please enter a Hugging Face model repository ID.';
      return;
    }
    if (!hubTitle.trim()) {
      hubError = 'Please enter a title for this model.';
      return;
    }

    isSavingHub = true;
    hubError = '';

    const cleanRepo = hubModelId.trim();
    const isWhistle =
      cleanRepo.toLowerCase().includes('whistle') ||
      cleanRepo.toLowerCase().endsWith('.cact');

    try {
      await modelState.saveCustomModel({
        title: hubTitle.trim(),
        modelSource: 'hub',
        modelId: cleanRepo,
        language: hubLanguage.trim() || 'en',
        dtype: isWhistle ? 'wasm' : 'q8',
        architecture: isWhistle ? 'whistle' : 'whisper',
      });

      // Reset form
      hubModelId = '';
      hubTitle = '';
      hubLanguage = 'en';
      isAddModelModalOpen = false;
    } catch (err) {
      hubError = err.message || 'Failed to save model.';
    } finally {
      isSavingHub = false;
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && isAddModelModalOpen) {
      isAddModelModalOpen = false;
    }
  }}
/>

<Header />

<div class="models-page-container">
  <!-- Model Library Panel -->
  <div class="card models-panel">
    <div class="panel-header">
      <div class="panel-title-wrap">
        <i class="fa-solid fa-layer-group panel-icon"></i>
        <div>
          <h3 class="panel-title">
            Speech Recognition Model Library ({modelState.models.length})
          </h3>
        </div>
      </div>

      <div class="panel-header-right">
        {#if modelState.selectedModel}
          <span class="active-model-pill">
            Active: <strong>{modelState.selectedModel.title}</strong>
          </span>
        {/if}
      </div>
    </div>

    {#if modelState.models.length === 0}
      <div class="empty-models-notice">
        <div class="empty-icon">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h4>No Models in Library</h4>
      </div>
    {:else}
      <div class="models-table-wrap">
        <table class="models-table">
          <thead>
            <tr>
              <th class="col-radio">Active</th>
              <th class="col-model">
                <button
                  type="button"
                  class="th-sort-btn {sortField === 'title' ? 'active' : ''}"
                  onclick={() => toggleSort('title')}
                >
                  <span>Model</span>
                  <i
                    class="fa-solid {sortField === 'title'
                      ? sortDir === 'asc'
                        ? 'fa-sort-up'
                        : 'fa-sort-down'
                      : 'fa-sort sort-idle'}"
                  ></i>
                </button>
              </th>
              <th class="col-source">
                <button
                  type="button"
                  class="th-sort-btn {sortField === 'modelSource'
                    ? 'active'
                    : ''}"
                  onclick={() => toggleSort('modelSource')}
                >
                  <span>Source</span>
                  <i
                    class="fa-solid {sortField === 'modelSource'
                      ? sortDir === 'asc'
                        ? 'fa-sort-up'
                        : 'fa-sort-down'
                      : 'fa-sort sort-idle'}"
                  ></i>
                </button>
              </th>
              <th class="col-lang">
                <button
                  type="button"
                  class="th-sort-btn {sortField === 'language' ? 'active' : ''}"
                  onclick={() => toggleSort('language')}
                >
                  <span>Language</span>
                  <i
                    class="fa-solid {sortField === 'language'
                      ? sortDir === 'asc'
                        ? 'fa-sort-up'
                        : 'fa-sort-down'
                      : 'fa-sort sort-idle'}"
                  ></i>
                </button>
              </th>
              <th class="col-runtime">
                <button
                  type="button"
                  class="th-sort-btn {sortField === 'dtype' ? 'active' : ''}"
                  onclick={() => toggleSort('dtype')}
                >
                  <span>Runtime</span>
                  <i
                    class="fa-solid {sortField === 'dtype'
                      ? sortDir === 'asc'
                        ? 'fa-sort-up'
                        : 'fa-sort-down'
                      : 'fa-sort sort-idle'}"
                  ></i>
                </button>
              </th>
              <th class="col-offline">Offline Cache</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedModels as m (m.id)}
              <tr
                class="model-row {modelState.selectedModelId === m.id
                  ? 'selected'
                  : ''}"
                onclick={() => modelState.selectModel(m.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    modelState.selectModel(m.id);
                }}
              >
                <td class="col-radio">
                  <i
                    class="fa-solid {modelState.selectedModelId === m.id
                      ? 'fa-circle-dot text-primary'
                      : 'fa-circle text-muted'}"
                  ></i>
                </td>
                <td class="col-model">
                  <div class="model-title-cell">
                    {#if m.modelSource === 'hub' && m.modelId}
                      <a
                        href="https://huggingface.co/{m.modelId}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="model-title-link"
                        onclick={(e) => e.stopPropagation()}
                        title="View {m.modelId} on Hugging Face"
                      >
                        <span>{m.title}</span>
                        <i
                          class="fa-solid fa-arrow-up-right-from-square link-ext-icon"
                        ></i>
                      </a>
                    {:else}
                      <strong class="model-title-plain">{m.title}</strong>
                    {/if}
                  </div>
                </td>
                <td class="col-source">
                  <span class="meta-chip">
                    <i
                      class="fa-solid {m.modelSource === 'folder'
                        ? 'fa-folder'
                        : 'fa-cloud'}"
                    ></i>
                    {m.modelSource === 'folder'
                      ? 'Local Folder'
                      : 'Hugging Face'}
                    {#if m.modelSource === 'folder' && m.fileCount}
                      <span class="text-muted">({m.fileCount})</span>
                    {/if}
                  </span>
                </td>
                <td class="col-lang">
                  <span class="meta-chip">
                    <i class="fa-solid fa-language"></i>
                    {m.language || 'en'}
                  </span>
                </td>
                <td class="col-runtime">
                  <span class="meta-chip">
                    <i class="fa-solid fa-microchip"></i>
                    {m.architecture === 'whistle' || m.dtype === 'wasm'
                      ? 'WASM CPU'
                      : m.dtype || 'q8'}
                  </span>
                </td>
                <td class="col-offline">
                  {#if m.modelSource === 'hub'}
                    {#if modelState.isModelCached(m.modelId || m.id)}
                      <span
                        class="tag-offline-ready"
                        title="Model is cached in browser storage. Ready for offline use."
                      >
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Available offline</span>
                        <button
                          type="button"
                          class="btn-purge-pill"
                          title="Purge cached model weights from browser storage to free disk space"
                          onclick={async (e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `Purge cached weights for "${m.title}" from local storage?`,
                              )
                            ) {
                              const count = await modelState.clearModelCache(
                                m.modelId,
                                m.id,
                              );
                              await modelState.checkAllModelsCached();
                              appState.statusMessage = `Purged ${count} cached file(s) for "${m.title}" from browser storage.`;
                            }
                          }}
                        >
                          <i class="fa-solid fa-broom"></i>
                        </button>
                      </span>
                    {:else if modelState.downloadProgress[m.modelId || m.id] !== undefined}
                      {@const pct =
                        modelState.downloadProgress[m.modelId || m.id] || 0}
                      <div
                        class="table-download-progress-box"
                        title="Loading: {pct}%"
                      >
                        <div class="table-progress-bar-track">
                          <div
                            class="table-progress-bar-fill"
                            style="width: {Math.max(2, pct)}%"
                          ></div>
                        </div>
                        <span class="table-progress-text">{pct}%</span>
                      </div>
                    {:else}
                      <button
                        type="button"
                        class="btn-offline-action"
                        onclick={(e) => {
                          e.stopPropagation();
                          modelState.downloadModelForOffline(m);
                        }}
                        title="Download and cache model files in browser storage for offline use"
                      >
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span>Make available offline</span>
                      </button>
                    {/if}
                  {:else if m.modelSource === 'folder'}
                    <span
                      class="tag-offline-ready tag-local-ready"
                      title="Stored in browser IndexedDB. Available offline."
                    >
                      <i class="fa-solid fa-circle-check"></i>
                      <span>Available offline (Local)</span>
                    </span>
                  {/if}
                </td>
                <td class="col-actions">
                  <button
                    type="button"
                    class="btn-subtle text-danger"
                    onclick={(e) => {
                      e.stopPropagation();
                      const note = m.isPreset
                        ? ' (You can restore default presets anytime)'
                        : '';
                      if (
                        confirm(
                          `Delete model "${m.title}" from your library?${note}`,
                        )
                      ) {
                        modelState.deleteCustomModel(m.id);
                      }
                    }}
                    title={m.isPreset
                      ? 'Delete preset model'
                      : 'Delete custom model'}
                  >
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <div class="model-library-footer">
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => (isAddModelModalOpen = true)}
      >
        <i class="fa-solid fa-plus"></i>
        <span>Add New Model</span>
      </button>
    </div>
  </div>
</div>

<!-- Add New Model Dialog Box -->
{#if isAddModelModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => (isAddModelModalOpen = false)}>
    <div
      class="modal-dialog add-model-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-model-modal-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <div class="panel-title-wrap">
          <i class="fa-solid fa-circle-plus panel-icon"></i>
          <h3 id="add-model-modal-title" class="panel-title">Add New Model</h3>
        </div>
        <button
          type="button"
          class="modal-close-btn"
          onclick={() => (isAddModelModalOpen = false)}
          aria-label="Close dialog"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-body">
        <div class="segmented-control" style="margin-bottom: 16px;">
          <button
            type="button"
            class="segment-btn {activeAddTab === 'presets' ? 'active' : ''}"
            onclick={() => (activeAddTab = 'presets')}
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Official Models</span>
          </button>
          <button
            type="button"
            class="segment-btn {activeAddTab === 'folder' ? 'active' : ''}"
            onclick={() => (activeAddTab = 'folder')}
          >
            <i class="fa-solid fa-folder-open"></i>
            <span>Local Folder</span>
          </button>
          <button
            type="button"
            class="segment-btn {activeAddTab === 'hub' ? 'active' : ''}"
            onclick={() => (activeAddTab = 'hub')}
          >
            <i class="fa-brands fa-hubspot"></i>
            <span>Hugging Face Hub</span>
          </button>
        </div>

        {#if activeAddTab === 'presets'}
          <div class="presets-section">
            <div class="preset-cards-grid">
              {#each modelState.availablePresets as preset (preset.id)}
                {@const presetKey = preset.baseId || preset.id}
                {@const currentLang = presetLanguages[presetKey] || 'en'}
                {@const isAdded = modelState.isPresetAdded(
                  presetKey,
                  currentLang,
                )}
                {@const isCached = modelState.isModelCached(
                  preset.modelId || preset.id,
                )}
                {@const isDownloading =
                  modelState.downloadProgress[preset.modelId || preset.id] !==
                  undefined}
                {@const downloadPct =
                  modelState.downloadProgress[preset.modelId || preset.id] || 0}
                {@const addedModel = modelState.models.find(
                  (m) =>
                    (m.baseId === presetKey ||
                      m.id === presetKey ||
                      m.id === `${presetKey}-${currentLang}`) &&
                    m.language === currentLang,
                )}
                <div class="preset-card {isAdded ? 'is-added' : ''}">
                  <div class="preset-card-header">
                    <div>
                      <h4 class="preset-card-title">
                        {#if preset.modelId}
                          <a
                            href="https://huggingface.co/{preset.modelId}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="model-title-link"
                            title="View {preset.modelId} on Hugging Face"
                          >
                            <span>{preset.title}</span>
                            <i
                              class="fa-solid fa-arrow-up-right-from-square link-ext-icon"
                            ></i>
                          </a>
                        {:else}
                          {preset.title}
                        {/if}
                      </h4>
                    </div>
                  </div>

                  <div class="preset-card-meta">
                    <span class="meta-chip">
                      <i class="fa-solid fa-hard-drive"></i>
                      {preset.sizeApprox}
                    </span>
                    {#if preset.architecture === 'whistle'}
                      <span class="meta-chip">
                        <i class="fa-solid fa-language"></i>
                        7 Languages
                      </span>
                      <span class="meta-chip">
                        <i class="fa-solid fa-microchip"></i>
                        CPU WASM
                      </span>
                    {:else}
                      <span class="meta-chip">
                        <i class="fa-solid fa-language"></i>
                        99+ Languages
                      </span>
                      <span class="meta-chip">
                        <i class="fa-solid fa-microchip"></i>
                        WASM Q8 / WebGPU Q4
                      </span>
                    {/if}
                  </div>

                  <div class="preset-card-actions">
                    <div class="preset-lang-row">
                      <label
                        for="lang-select-{preset.id}"
                        class="preset-lang-label"
                      >
                        <i class="fa-solid fa-language"></i> Language:
                      </label>
                      <select
                        id="lang-select-{preset.id}"
                        class="preset-lang-select"
                        bind:value={presetLanguages[presetKey]}
                      >
                        {#if preset.architecture === 'whistle'}
                          {#each WHISTLE_LANGUAGES as lang}
                            <option value={lang.code}
                              >{lang.name} ({lang.code})</option
                            >
                          {/each}
                        {:else}
                          {#each WHISPER_LANGUAGES as lang}
                            <option value={lang.code}
                              >{lang.name} ({lang.code})</option
                            >
                          {/each}
                        {/if}
                      </select>
                    </div>

                    {#if !isAdded}
                      <button
                        type="button"
                        class="btn btn-primary btn-block"
                        onclick={() =>
                          modelState.addPresetModel(
                            presetKey,
                            currentLang,
                            true,
                          )}
                      >
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span>Add & Download for Offline</span>
                      </button>
                    {:else if isDownloading}
                      <div
                        class="preset-download-progress-box"
                        title="Loading: {downloadPct}%"
                      >
                        <div class="preset-progress-header">
                          <span class="preset-progress-label">
                            <i class="fa-solid fa-cloud-arrow-down fa-bounce"
                            ></i>
                            <span>Loading weights...</span>
                          </span>
                          <span class="preset-progress-pct">{downloadPct}%</span
                          >
                        </div>
                        <div class="preset-progress-track">
                          <div
                            class="preset-progress-fill"
                            style="width: {Math.max(2, downloadPct)}%"
                          ></div>
                        </div>
                      </div>
                    {:else if isCached}
                      <div class="preset-installed-row">
                        <span class="tag-offline-ready">
                          <i class="fa-solid fa-circle-check"></i>
                          <span>Available Offline</span>
                        </span>
                        {#if modelState.selectedModel?.id === addedModel?.id}
                          <span class="badge badge-success">Active</span>
                        {:else if addedModel}
                          <button
                            type="button"
                            class="btn btn-sm btn-subtle"
                            onclick={() =>
                              modelState.selectModel(addedModel.id)}
                          >
                            Set as Active
                          </button>
                        {/if}
                      </div>
                    {:else}
                      <div class="preset-installed-row">
                        <span class="badge badge-info">In Library</span>
                        <button
                          type="button"
                          class="btn btn-sm btn-primary"
                          onclick={() =>
                            modelState.downloadModelForOffline(
                              addedModel || preset,
                            )}
                        >
                          <i class="fa-solid fa-cloud-arrow-down"></i>
                          <span>Download for Offline</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else if activeAddTab === 'folder'}
          <!-- Local Folder Form -->
          <div class="form-section">
            <div class="drop-zone-area" style="margin-bottom: 14px;">
              <input
                type="file"
                bind:this={folderInputEl}
                webkitdirectory
                directory
                multiple
                onchange={handleFolderChosen}
                class="file-input-hidden"
                id="model-folder-input"
              />
              <label for="model-folder-input" class="drop-zone-label">
                <i class="fa-solid fa-folder-open drop-icon"></i>
                <span class="drop-text-primary">
                  {localFolderName
                    ? `Folder: ${localFolderName}`
                    : 'Click to choose model folder'}
                </span>
                <span class="drop-text-sub">
                  {localFileCount > 0
                    ? `${localFileCount} files found`
                    : 'Select a directory with ONNX or .cact files'}
                </span>
              </label>
            </div>

            {#if localAnalysis}
              <div
                class="analysis-box {localAnalysis.isValid
                  ? 'analysis-valid'
                  : 'analysis-invalid'}"
                style="margin-bottom: 14px;"
              >
                {#if localAnalysis.isValid}
                  {#if localAnalysis.isCact}
                    <div class="analysis-status text-success">
                      <i class="fa-solid fa-check-circle"></i>
                      <span>Valid Cactus (.cact) Model Detected</span>
                    </div>
                    <div class="analysis-details text-xs">
                      <div>
                        Model file: <code>{localAnalysis.cactFiles[0]}</code>
                        &bull; Architecture: <strong>Whistle</strong>
                        &bull; Execution:
                        <strong>CPU WebAssembly (WASM)</strong>
                      </div>
                      <div>
                        Format: <strong>Cactus Container (~17 MB)</strong> &bull;
                        Zero GPU requirement
                      </div>
                    </div>
                  {:else}
                    <div class="analysis-status text-success">
                      <i class="fa-solid fa-check-circle"></i>
                      <span>Valid ONNX Model Detected</span>
                    </div>
                    <div class="analysis-details text-xs">
                      <div>
                        Encoder: <code
                          >{localAnalysis.hasEncoder ? 'Yes' : 'No'}</code
                        >
                        &bull; Decoder:
                        <code>{localAnalysis.hasDecoder ? 'Yes' : 'No'}</code>
                        &bull; Config:
                        <code>{localAnalysis.hasConfig ? 'Yes' : 'No'}</code>
                        &bull; Tokenizer:
                        <code>{localAnalysis.hasTokenizer ? 'Yes' : 'No'}</code>
                      </div>
                      <div>
                        Weights format: <strong
                          >{localAnalysis.detectedDtype.toUpperCase()}</strong
                        >
                      </div>
                    </div>
                  {/if}
                {:else}
                  <div class="analysis-status text-danger">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Incomplete Model Folder</span>
                  </div>
                  <div class="analysis-details text-xs text-muted">
                    Missing required components. Please ensure the folder
                    contains a <code>.cact</code> file (e.g.
                    <code>whistle.cact</code>) or <code>config.json</code> with
                    valid <code>.onnx</code> weights files.
                  </div>
                {/if}
              </div>
            {/if}

            <div class="form-group" style="margin-bottom: 12px;">
              <label for="local-model-title">Model Display Name</label>
              <input
                id="local-model-title"
                type="text"
                class="form-control"
                placeholder="e.g. Whistle or Whisper-Base Bislama"
                bind:value={localTitle}
              />
            </div>

            <div
              class="form-row"
              style="display: flex; gap: 10px; margin-bottom: 16px;"
            >
              <div class="form-group" style="flex: 1;">
                <label for="local-model-lang">Language Code</label>
                <input
                  id="local-model-lang"
                  type="text"
                  class="form-control"
                  placeholder="e.g. en, de, fr, es, fa"
                  bind:value={localLanguage}
                />
              </div>

              <div class="form-group" style="flex: 1;">
                <label for="local-model-dtype">Quantization (dtype)</label>
                <select
                  id="local-model-dtype"
                  class="form-control"
                  bind:value={localDtype}
                >
                  {#if localAnalysis?.isCact}
                    <option value="wasm">wasm (CPU WebAssembly Only)</option>
                  {:else}
                    <option value="q8">q8 (8-bit quantized, fast)</option>
                    <option value="fp32">fp32 (Full precision)</option>
                  {/if}
                </select>
              </div>
            </div>

            {#if folderError}
              <div class="alert alert-danger" style="margin-bottom: 14px;">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span>{folderError}</span>
              </div>
            {/if}

            <button
              type="button"
              class="btn btn-primary btn-block"
              onclick={handleSaveLocalFolder}
              disabled={isSavingFolder || !localAnalysis?.isValid}
            >
              {#if isSavingFolder}
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Saving to Browser Storage...</span>
              {:else}
                <i class="fa-solid fa-floppy-disk"></i>
                <span>Save Local Model to Library</span>
              {/if}
            </button>
          </div>
        {:else}
          <!-- Hugging Face Hub Form -->
          <div class="form-section">
            <div
              class="hub-presets-bar"
              style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;"
            >
              <span class="text-xs text-muted" style="font-weight: 500;"
                >Quick Fill:</span
              >
              <button
                type="button"
                class="badge badge-info"
                style="cursor: pointer; padding: 5px 9px; font-size: 11px; border: none;"
                onclick={() =>
                  selectHubPreset('Cactus-Compute/whistle', 'Whistle', 'en')}
              >
                Cactus-Compute/whistle
              </button>
              <button
                type="button"
                class="badge badge-secondary"
                style="cursor: pointer; padding: 5px 9px; font-size: 11px; border: none;"
                onclick={() =>
                  selectHubPreset(
                    'onnx-community/whisper-base',
                    'Whisper-base',
                    'en',
                  )}
              >
                onnx-community/whisper-base
              </button>
              <button
                type="button"
                class="badge badge-secondary"
                style="cursor: pointer; padding: 5px 9px; font-size: 11px; border: none;"
                onclick={() =>
                  selectHubPreset(
                    'onnx-community/whisper-small',
                    'Whisper-small',
                    'en',
                  )}
              >
                onnx-community/whisper-small
              </button>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label for="hub-model-id">Hugging Face Repository ID</label>
              <input
                id="hub-model-id"
                type="text"
                class="form-control"
                placeholder="e.g. Cactus-Compute/whistle or onnx-community/whisper-tiny"
                bind:value={hubModelId}
              />
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label for="hub-model-title">Model Display Name</label>
              <input
                id="hub-model-title"
                type="text"
                class="form-control"
                placeholder="e.g. Whistle or Whisper-Base Bislama"
                bind:value={hubTitle}
              />
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label for="hub-model-lang">Default Language Code</label>
              <input
                id="hub-model-lang"
                type="text"
                class="form-control"
                placeholder="e.g. en, es, fr, de"
                bind:value={hubLanguage}
              />
            </div>

            {#if hubError}
              <div class="alert alert-danger" style="margin-bottom: 14px;">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span>{hubError}</span>
              </div>
            {/if}

            <button
              type="button"
              class="btn btn-primary btn-block"
              onclick={handleSaveHubModel}
              disabled={isSavingHub || !hubModelId.trim() || !hubTitle.trim()}
            >
              {#if isSavingHub}
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Registering Model...</span>
              {:else}
                <i class="fa-solid fa-plus"></i>
                <span>Add Hugging Face Model</span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .models-page-container {
    max-width: 1140px;
    margin: 0 auto;
    padding: 20px 16px 60px 16px;
  }

  .models-panel {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 12px;
    padding: 22px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  :global([data-theme='dark']) .models-panel {
    background: rgba(30, 41, 59, 0.6);
    border-color: #334155;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .panel-header {
    border-bottom-color: #334155;
  }

  .panel-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .panel-icon {
    font-size: 1.15rem;
    color: var(--primary-color, #0284c7);
  }

  .panel-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .panel-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Model Library Table */
  .models-table-wrap {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
  }

  :global([data-theme='dark']) .models-table-wrap {
    border-color: #334155;
  }

  .models-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.88rem;
  }

  .models-table thead {
    background: var(--bg-hover, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .models-table thead {
    background: rgba(15, 23, 42, 0.5);
    border-bottom-color: #334155;
  }

  .models-table th {
    padding: 10px 14px;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    user-select: none;
  }

  .th-sort-btn {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted, #64748b);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: color 0.12s ease;
  }

  .th-sort-btn:hover,
  .th-sort-btn.active {
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .th-sort-btn:hover,
  :global([data-theme='dark']) .th-sort-btn.active {
    color: #f8fafc;
  }

  .th-sort-btn .sort-idle {
    opacity: 0.35;
  }

  .models-table tbody tr.model-row {
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .models-table tbody tr.model-row:last-child {
    border-bottom: none;
  }

  :global([data-theme='dark']) .models-table tbody tr.model-row {
    border-bottom-color: #334155;
  }

  .models-table tbody tr.model-row:hover {
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .models-table tbody tr.model-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .models-table tbody tr.model-row.selected {
    background: rgba(2, 132, 199, 0.06);
  }

  :global([data-theme='dark']) .models-table tbody tr.model-row.selected {
    background: rgba(56, 189, 248, 0.1);
  }

  .models-table td {
    padding: 12px 14px;
    vertical-align: middle;
    color: var(--text-base, #334155);
  }

  .col-radio {
    width: 64px;
    text-align: center;
  }

  .col-actions {
    width: 60px;
    text-align: right;
  }

  .models-table th.col-actions {
    text-align: right;
  }

  .model-title-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .model-title-plain {
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .model-library-footer {
    margin-top: 16px;
    display: flex;
    justify-content: flex-start;
  }

  /* Add New Model Dialog Box */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
    padding: 16px;
  }

  .modal-dialog.add-model-modal {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 12px;
    width: 100%;
    max-width: 580px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    overflow: hidden;
  }

  :global([data-theme='dark']) .modal-dialog.add-model-modal {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .modal-header {
    border-bottom-color: #334155;
  }

  .modal-close-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted, #64748b);
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .modal-close-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
  }

  .modal-body {
    padding: 20px;
    overflow-y: auto;
  }

  .empty-models-notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    text-align: center;
    background: var(--bg-hover, #f8fafc);
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 10px;
    margin-bottom: 12px;
  }

  .empty-models-notice .empty-icon {
    font-size: 2.2rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 10px;
  }

  .empty-models-notice h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .empty-models-notice {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  /* Preset Cards in Add Tab */
  .presets-section {
    display: flex;
    flex-direction: column;
  }

  .preset-cards-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .preset-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 16px;
    transition: all 0.15s ease;
  }

  :global([data-theme='dark']) .preset-card {
    background: rgba(30, 41, 59, 0.45);
    border-color: #334155;
  }

  .preset-card.is-added {
    border-left: 3px solid var(--primary-color, #0284c7);
  }

  .preset-card-title {
    margin: 0 0 8px 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .model-title-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-heading, #0f172a);
    text-decoration: none;
    font-weight: 700;
    transition: color 0.12s ease;
  }

  .model-title-link:hover {
    color: var(--primary-color, #0284c7);
    text-decoration: underline;
  }

  .link-ext-icon {
    font-size: 0.7rem;
    opacity: 0.65;
  }

  .model-title-link:hover .link-ext-icon {
    opacity: 1;
  }

  .preset-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }

  .preset-lang-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    width: 100%;
  }

  .preset-lang-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    margin: 0;
  }

  :global([data-theme='dark']) .preset-lang-label {
    color: #cbd5e1;
  }

  .preset-lang-select {
    flex: 1;
    padding: 6px 10px;
    font-size: 0.82rem;
    background: var(--bg-surface, #ffffff);
    color: var(--text-base, #334155);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .preset-lang-select:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  :global([data-theme='dark']) .preset-lang-select {
    background: #1e293b;
    color: #e2e8f0;
    border-color: #475569;
  }

  :global([data-theme='dark']) .preset-lang-select:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .preset-installed-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }

  .active-model-pill {
    font-size: 0.78rem;
    background: var(--primary-light, #e0f2fe);
    color: var(--primary-color, #0284c7);
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 500;
  }

  :global([data-theme='dark']) .active-model-pill {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 0.88rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover, #0369a1);
  }

  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-block {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
  }

  .btn-subtle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .btn-subtle:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .text-danger {
    color: #ef4444;
  }

  .drop-zone-area {
    border: 2px dashed var(--border-color, #cbd5e1);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    background: var(--bg-hover, #f8fafc);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global([data-theme='dark']) .drop-zone-area {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .drop-zone-area:hover {
    border-color: var(--primary-color, #0284c7);
    background: var(--primary-light, #f0f9ff);
  }

  :global([data-theme='dark']) .drop-zone-area:hover {
    background: rgba(2, 132, 199, 0.1);
    border-color: #38bdf8;
  }

  .file-input-hidden {
    display: none;
  }

  .drop-zone-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .drop-icon {
    font-size: 1.8rem;
    color: var(--primary-color, #0284c7);
  }

  .drop-text-primary {
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--text-heading, #0f172a);
  }

  .drop-text-sub {
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
  }

  .analysis-box {
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.84rem;
  }

  .analysis-valid {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
  }

  :global([data-theme='dark']) .analysis-valid {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .analysis-invalid {
    background: #fff7ed;
    border: 1px solid #fed7aa;
  }

  :global([data-theme='dark']) .analysis-invalid {
    background: rgba(249, 115, 22, 0.12);
    border-color: rgba(249, 115, 22, 0.3);
  }

  .analysis-status {
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .text-success {
    color: #10b981;
  }

  .text-xs {
    font-size: 0.75rem;
  }

  .alert {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alert-danger {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  :global([data-theme='dark']) .alert-danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .form-group label {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    margin-bottom: 4px;
  }

  .form-control {
    width: 100%;
    padding: 8px 10px;
    font-size: 0.86rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .form-control {
    background: #0f172a;
    border-color: #334155;
    color: #f8fafc;
  }

  .form-control:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
  }

  .badge-success {
    background: #dcfce7;
    color: #166534;
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 700;
  }

  :global([data-theme='dark']) .badge-success {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  .tag-offline-ready {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #15803d;
    background: #dcfce7;
    border: 1px solid #86efac;
    padding: 2px 7px;
    border-radius: 6px;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  :global([data-theme='dark']) .tag-offline-ready {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.35);
    color: #4ade80;
  }

  .tag-local-ready {
    color: #0284c7;
    background: #e0f2fe;
    border-color: #7dd3fc;
  }

  :global([data-theme='dark']) .tag-local-ready {
    background: rgba(2, 132, 199, 0.18);
    border-color: rgba(2, 132, 199, 0.35);
    color: #38bdf8;
  }

  .btn-purge-pill {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #15803d;
    padding: 1px 4px;
    margin-left: 2px;
    font-size: 0.68rem;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    opacity: 0.7;
    transition: all 0.15s ease;
  }

  .btn-purge-pill:hover {
    opacity: 1;
    color: #b91c1c;
    background: rgba(239, 68, 68, 0.18);
  }

  :global([data-theme='dark']) .btn-purge-pill {
    color: #4ade80;
  }

  :global([data-theme='dark']) .btn-purge-pill:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-offline-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    padding: 2px 8px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-offline-action:hover:not(:disabled) {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
    box-shadow: 0 1px 4px rgba(2, 132, 199, 0.25);
  }

  :global([data-theme='dark']) .btn-offline-action {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.25);
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-offline-action:hover:not(:disabled) {
    background: #0284c7;
    color: #ffffff;
  }

  .table-download-progress-box {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    padding: 3px 10px;
    border-radius: 6px;
    min-width: 140px;
  }

  .table-progress-bar-track {
    flex: 1;
    height: 6px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 3px;
    overflow: hidden;
  }

  .table-progress-bar-fill {
    height: 100%;
    background: #0284c7;
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .table-progress-text {
    font-size: 0.75rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .table-download-progress-box {
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.25);
  }

  :global([data-theme='dark']) .table-progress-bar-track {
    background: rgba(255, 255, 255, 0.12);
  }

  :global([data-theme='dark']) .table-progress-text {
    color: #38bdf8;
  }

  .preset-download-progress-box {
    width: 100%;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    padding: 8px 12px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
  }

  .preset-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
  }

  .preset-progress-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .preset-progress-pct {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .preset-progress-track {
    width: 100%;
    height: 7px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    overflow: hidden;
  }

  .preset-progress-fill {
    height: 100%;
    background: #0284c7;
    border-radius: 4px;
    transition: width 0.2s ease;
  }

  :global([data-theme='dark']) .preset-download-progress-box {
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.25);
  }

  :global([data-theme='dark']) .preset-progress-header {
    color: #38bdf8;
  }

  :global([data-theme='dark']) .preset-progress-track {
    background: rgba(255, 255, 255, 0.12);
  }

  .segmented-control {
    display: flex;
    background: var(--bg-hover, #f1f5f9);
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    gap: 4px;
  }

  :global([data-theme='dark']) .segmented-control {
    background: rgba(255, 255, 255, 0.04);
    border-color: #334155;
  }

  .segment-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    font-size: 0.86rem;
    font-weight: 600;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted, #64748b);
    transition: all 0.15s ease;
  }

  .segment-btn:hover:not(:disabled) {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.03);
  }

  :global([data-theme='dark']) .segment-btn:hover:not(:disabled) {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.05);
  }

  .segment-btn.active {
    background: var(--bg-card, #ffffff);
    color: var(--primary-color, #0284c7);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  :global([data-theme='dark']) .segment-btn.active {
    background: #1e293b;
    color: #38bdf8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
</style>
