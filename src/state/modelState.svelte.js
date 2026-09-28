/**
 * ASR Model Management & Selection State.
 * Supports default presets (Whisper-small, Whisper-base) and persistent custom models
 * (local folder or Hugging Face Hub) stored in IndexedDB.
 * Svelte 5 universal reactive module (.svelte.js)
 */

import { MODEL_ID } from '../config.js';
import { appState } from './appState.svelte.js';
import { transcriptState } from './transcriptState.svelte.js';
import {
  getAllAsrModels,
  saveAsrModel,
  deleteAsrModel,
  saveAsrModelFiles,
  getAsrModelFiles,
} from '../services/db.js';
import { router } from '../services/router.svelte.js';
import {
  WHISPER_LANGUAGES,
  getLanguageName,
} from '../services/whisperLanguages.js';

export { WHISPER_LANGUAGES, getLanguageName };

export const AVAILABLE_PRESETS = [
  {
    baseId: 'whisper-base',
    id: 'whisper-base',
    title: 'Whisper-base',
    baseTitle: 'Whisper-base',
    modelSource: 'hub',
    modelId: 'onnx-community/whisper-base',
    language: 'en',
    dtype: 'q8',
    isPreset: true,
    sizeApprox: '~274 MB',
    speed: 'Fast (~274MB total)',
    description: 'Multilingual Hugging Face ONNX Whisper-base with dual offline support (8-bit quantized for CPU WASM and Q4 for WebGPU). Fast transcription with balanced accuracy.',
  },
  {
    baseId: 'whisper-small',
    id: 'whisper-small',
    title: 'Whisper-small',
    baseTitle: 'Whisper-small',
    modelSource: 'hub',
    modelId: 'onnx-community/whisper-small',
    language: 'en',
    dtype: 'q8',
    isPreset: true,
    sizeApprox: '~799 MB',
    speed: 'High Accuracy (~799MB total)',
    description: 'Multilingual Hugging Face ONNX Whisper-small with dual offline support (8-bit quantized for CPU WASM and Q4 for WebGPU). Higher accuracy for varied speakers and accents.',
  },
];
export const DEFAULT_PRESET_MODELS = AVAILABLE_PRESETS;

class ModelState {
  // Collection of available models (starts empty by default; models are added explicitly by the user)
  models = $state([]);
  selectedModelId = $state(null);

  // Modal & Navigation state
  isModelManagerOpen = $state(false);

  // Offline caching state
  cachedModelIds = $state([]);
  downloadProgress = $state({}); // modelId -> number (percentage)

  get availablePresets() {
    return AVAILABLE_PRESETS;
  }

  get offlineModels() {
    return this.models.filter(
      (m) =>
        m.modelSource === 'folder' ||
        this.isModelCached(m.modelId || m.id),
    );
  }

  get offlineModelsCount() {
    return this.offlineModels.length;
  }

  openModelManager() {
    this.isModelManagerOpen = true;
    router.navigate('/models');
  }

  closeModelManager() {
    this.isModelManagerOpen = false;
  }

  isModelCached(modelIdentifier) {
    if (!modelIdentifier) return false;
    const cleanId = String(modelIdentifier).toLowerCase();
    return this.cachedModelIds.some((id) => {
      const c = String(id).toLowerCase();
      return c === cleanId || cleanId.includes(c) || c.includes(cleanId);
    });
  }

  async checkAllModelsCached() {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open('transformers-cache');
      const requests = await cache.keys();
      const urls = requests.map((r) => r.url.toLowerCase());

      const newlyCached = [];

      const allToCheck = [...this.models, ...AVAILABLE_PRESETS];

      for (const m of allToCheck) {
        if (m.modelSource === 'folder') {
          newlyCached.push(m.id);
          continue;
        }

        const targetHubId = (m.modelId || m.id).toLowerCase();
        let hasConfig = false;
        let hasWeights = false;

        for (const url of urls) {
          if (url.includes(targetHubId)) {
            if (url.includes('config.json')) hasConfig = true;
            if (url.includes('.onnx')) hasWeights = true;
          }
        }

        if (hasConfig && hasWeights) {
          newlyCached.push(m.id);
          if (m.modelId) newlyCached.push(m.modelId);
        }
      }

      this.cachedModelIds = Array.from(new Set(newlyCached));
    } catch (err) {
      console.warn('[ModelState] Error checking cache:', err);
    }
  }

  downloadModelForOffline(model) {
    if (!model) return;
    const targetModelId = model.modelId || model.id;
    const dtype = model.dtype || 'q4';

    if (this.isModelCached(targetModelId)) {
      return;
    }

    this.downloadProgress = {
      ...this.downloadProgress,
      [targetModelId]: 0,
      [model.id]: 0,
    };

    appState.statusMessage = 'Loading model...';

    if (appState.worker) {
      appState.worker.postMessage({
        type: 'download_model',
        payload: {
          modelId: targetModelId,
          dtype,
          device: this.preferredDevice,
        },
      });
    }
  }

  handleModelDownloadProgress({ modelId, progress }) {
    const pct = typeof progress === 'number' ? Math.round(progress) : 0;
    this.downloadProgress = {
      ...this.downloadProgress,
      [modelId]: pct,
    };
    for (const m of this.models) {
      if (m.modelId === modelId || m.id === modelId) {
        this.downloadProgress[m.id] = pct;
      }
    }
  }

  handleModelDownloadComplete({ modelId }) {
    const updated = { ...this.downloadProgress };
    delete updated[modelId];
    for (const m of this.models) {
      if (m.modelId === modelId || m.id === modelId) {
        delete updated[m.id];
        delete updated[m.modelId];
      }
    }
    this.downloadProgress = updated;

    this.checkAllModelsCached();
    appState.statusMessage = `Model "${modelId}" is now cached and available offline!`;
  }

  handleModelDownloadError({ modelId, message }) {
    const updated = { ...this.downloadProgress };
    delete updated[modelId];
    for (const m of this.models) {
      if (m.modelId === modelId || m.id === modelId) {
        delete updated[m.id];
        delete updated[m.modelId];
      }
    }
    this.downloadProgress = updated;
    appState.errorMessage = `Failed to download model "${modelId}": ${message}`;
  }

  // Compute Device Preference: 'auto' | 'webgpu' | 'wasm'
  preferredDevice = $state(
    (typeof localStorage !== 'undefined' && localStorage.getItem('easper_preferred_device')) || 'auto',
  );
  activeDevice = $state('wasm');

  get isWebGpuSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  setPreferredDevice(device) {
    this.preferredDevice = device;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('easper_preferred_device', device);
    }
  }

  // Active execution model attributes
  modelSource = $state('hub'); // 'hub' | 'folder'
  hubModelId = $state('onnx-community/whisper-small');
  modelDtype = $state('q8');
  localFolderName = $state('');
  localFileCount = $state(0);
  isModelLoaded = $state(false);
  isModelLoading = $state(false);

  // Plain non-reactive array for raw File/Blob handles (prevents Svelte 5 Proxy DataCloneError when posting to Worker)
  rawLocalFiles = [];

  get selectedModel() {
    return (
      this.models.find((m) => m.id === this.selectedModelId) ||
      this.models[0] ||
      null
    );
  }

  get hasDeletedPresets() {
    return AVAILABLE_PRESETS.some(
      (p) => !this.models.some((m) => m.id === p.id),
    );
  }

  isPresetAdded(presetKey, languageCode = null) {
    if (languageCode) {
      const cleanLang = String(languageCode).toLowerCase().trim();
      return this.models.some(
        (m) =>
          (m.id === presetKey || m.baseId === presetKey) &&
          m.language === cleanLang,
      );
    }
    return this.models.some(
      (m) => m.id === presetKey || m.baseId === presetKey,
    );
  }

  async addPresetModel(presetKey, languageCode = 'en', startDownload = true) {
    const basePreset = AVAILABLE_PRESETS.find(
      (p) => p.id === presetKey || p.baseId === presetKey,
    );
    if (!basePreset) return null;

    const cleanLang = (languageCode || 'en').toLowerCase().trim();
    const langName = getLanguageName(cleanLang);
    const instanceId = `${basePreset.baseId || basePreset.id}-${cleanLang}`;
    const instanceTitle = `${basePreset.baseTitle || basePreset.title} (${langName})`;

    const presetInstance = {
      ...basePreset,
      id: instanceId,
      baseId: basePreset.baseId || basePreset.id,
      title: instanceTitle,
      language: cleanLang,
      languageName: langName,
    };

    let addedPresetIds = [];
    try {
      const stored = localStorage.getItem('easper_added_preset_model_ids');
      if (stored) addedPresetIds = JSON.parse(stored);
    } catch (e) {}

    if (!addedPresetIds.includes(instanceId)) {
      addedPresetIds.push(instanceId);
      try {
        localStorage.setItem(
          'easper_added_preset_model_ids',
          JSON.stringify(addedPresetIds),
        );
      } catch (e) {}
    }

    const existingIdx = this.models.findIndex((m) => m.id === instanceId);
    if (existingIdx !== -1) {
      this.models[existingIdx] = presetInstance;
    } else {
      this.models = [...this.models, presetInstance];
    }

    await this.selectModel(instanceId);
    await this.checkAllModelsCached();

    if (startDownload) {
      this.downloadModelForOffline(presetInstance);
      appState.statusMessage = `Added ${instanceTitle} and started offline download.`;
    } else {
      appState.statusMessage = `Added ${instanceTitle} to your library.`;
    }
    return presetInstance;
  }

  async restoreDefaultPresets() {
    for (const preset of AVAILABLE_PRESETS) {
      await this.addPresetModel(preset.id, 'en', false);
    }
    appState.statusMessage = 'Added official Whisper models to library.';
  }

  async clearModelCache(modelIdentifier, altIdentifier = '') {
    if (typeof caches === 'undefined') return 0;
    let purgedCount = 0;
    try {
      const candidates = new Set();
      if (modelIdentifier) {
        const id1 = String(modelIdentifier).toLowerCase().trim();
        candidates.add(id1);
        const parts1 = id1.split('/').filter(Boolean);
        if (parts1.length > 0) candidates.add(parts1[parts1.length - 1]);
      }
      if (altIdentifier) {
        const id2 = String(altIdentifier).toLowerCase().trim();
        candidates.add(id2);
        const parts2 = id2.split('/').filter(Boolean);
        if (parts2.length > 0) candidates.add(parts2[parts2.length - 1]);
      }

      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        for (const req of requests) {
          const url = req.url.toLowerCase();
          for (const candidate of candidates) {
            if (candidate && url.includes(candidate)) {
              await cache.delete(req);
              purgedCount++;
              break;
            }
          }
        }
      }
      console.log(`[ModelState] Purged ${purgedCount} cached file(s) for:`, Array.from(candidates));
    } catch (e) {
      console.warn('[ModelState] Could not remove model from cache:', e);
    }
    return purgedCount;
  }

  async init() {
    try {
      // Clean up legacy deletion tracking key if present
      try {
        localStorage.removeItem('easper_deleted_preset_model_ids');
      } catch (e) {}

      let addedPresetIds = [];
      try {
        const stored = localStorage.getItem('easper_added_preset_model_ids');
        if (stored) addedPresetIds = JSON.parse(stored);
      } catch (e) {}

      // Reconstruct models from added IDs
      const activePresets = [];
      for (const pId of addedPresetIds) {
        let base = AVAILABLE_PRESETS.find(
          (p) => p.id === pId || p.baseId === pId,
        );
        let lang = 'en';
        if (!base) {
          if (pId.startsWith('whisper-base')) {
            base = AVAILABLE_PRESETS.find((p) => p.baseId === 'whisper-base');
            const dashIdx = pId.lastIndexOf('-');
            if (dashIdx !== -1) lang = pId.slice(dashIdx + 1);
          } else if (pId.startsWith('whisper-small')) {
            base = AVAILABLE_PRESETS.find((p) => p.baseId === 'whisper-small');
            const dashIdx = pId.lastIndexOf('-');
            if (dashIdx !== -1) lang = pId.slice(dashIdx + 1);
          }
        } else {
          lang = base.language || 'en';
        }
        if (base) {
          const langName = getLanguageName(lang);
          activePresets.push({
            ...base,
            id: pId,
            baseId: base.baseId || base.id,
            title: `${base.baseTitle || base.title} (${langName})`,
            language: lang,
            languageName: langName,
          });
        }
      }

      const customModels = await getAllAsrModels();
      // Normalize any previous q4 dtype to 8-bit q8
      const normalizedCustom = customModels.map((m) =>
        m.dtype === 'q4' ? { ...m, dtype: 'q8' } : m,
      );
      this.models = [...activePresets, ...normalizedCustom];

      const savedId = localStorage.getItem('easper_selected_asr_model_id');
      if (savedId && this.models.some((m) => m.id === savedId)) {
        await this.selectModel(savedId);
      } else if (this.models.length > 0) {
        await this.selectModel(this.models[0].id);
      } else {
        this.selectedModelId = null;
      }

      await this.checkAllModelsCached();
    } catch (err) {
      console.error('[ModelState] Failed to initialize models:', err);
      this.models = [];
      this.selectedModelId = null;
      await this.checkAllModelsCached();
    }
  }

  async selectModel(modelId) {
    const target = this.models.find((m) => m.id === modelId) || this.models[0];
    if (!target) return;

    this.selectedModelId = target.id;
    try {
      localStorage.setItem('easper_selected_asr_model_id', target.id);
    } catch (e) {}

    this.modelSource = target.modelSource;
    this.hubModelId = target.modelId || MODEL_ID;
    this.modelDtype = target.dtype === 'q4' ? 'q8' : (target.dtype || 'q8');
    this.localFolderName = target.folderName || '';
    this.isModelLoaded = false;

    if (target.language) {
      transcriptState.language = target.language;
    }

    if (target.modelSource === 'folder') {
      try {
        const files = await getAsrModelFiles(target.id);
        this.rawLocalFiles = files || [];
        this.localFileCount = this.rawLocalFiles.length;
      } catch (err) {
        console.error('[ModelState] Failed to load model files from DB:', err);
        this.rawLocalFiles = [];
        this.localFileCount = 0;
      }
    } else {
      this.rawLocalFiles = [];
      this.localFileCount = 0;
    }

    console.log('[ModelState] Selected model:', target.title, `(${target.modelSource})`);
  }

  analyzeFolderFiles(fileList) {
    if (!fileList || fileList.length === 0) return null;

    const entries = [];
    let topFolderName = '';

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      let relPath = f.webkitRelativePath || f.name;
      const slashIdx = relPath.indexOf('/');
      if (slashIdx !== -1) {
        if (!topFolderName) {
          topFolderName = relPath.slice(0, slashIdx);
        }
        relPath = relPath.slice(slashIdx + 1);
      }
      entries.push({ path: relPath, file: f });
    }

    const paths = entries.map((e) => e.path.toLowerCase().replace(/\\/g, '/'));
    const hasConfig = paths.some(
      (p) =>
        p.endsWith('config.json') &&
        !p.includes('preprocessor') &&
        !p.includes('tokenizer') &&
        !p.includes('generation'),
    );
    const hasTokenizer = paths.some(
      (p) => p.endsWith('tokenizer.json') || p.endsWith('vocab.json'),
    );
    const hasPreprocessor = paths.some((p) =>
      p.endsWith('preprocessor_config.json'),
    );
    const onnxFiles = entries
      .filter((e) => e.path.toLowerCase().endsWith('.onnx'))
      .map((e) => e.path);

    let detectedDtype = 'q8';
    if (onnxFiles.some((p) => p.includes('quantized') || p.includes('_q8') || p.includes('_q4'))) {
      detectedDtype = 'q8';
    } else if (onnxFiles.some((p) => p.includes('_fp16'))) {
      detectedDtype = 'fp16';
    } else if (onnxFiles.length > 0) {
      detectedDtype = 'fp32';
    }

    return {
      entries,
      topFolderName: topFolderName || 'selected-folder',
      hasConfig,
      hasTokenizer,
      hasPreprocessor,
      onnxFiles,
      totalFiles: entries.length,
      isValid: hasConfig && onnxFiles.length > 0,
      detectedDtype,
    };
  }

  async saveCustomModel({
    title,
    modelSource = 'folder',
    modelId = '',
    folderName = '',
    files = [],
    language = 'en',
    dtype = 'q8',
  }) {
    const id = 'model_' + Date.now();
    const cleanTitle = title?.trim() || folderName || modelId || 'Custom Model';
    const cleanLang = language?.trim() || 'en';
    const normalizedDtype = dtype === 'q4' ? 'q8' : (dtype || 'q8');

    const record = {
      id,
      title: cleanTitle,
      modelSource,
      modelId: modelId?.trim() || '',
      folderName: folderName || '',
      language: cleanLang,
      dtype: normalizedDtype,
      fileCount: Array.isArray(files) ? files.length : 0,
      isPreset: false,
      createdAt: new Date().toISOString(),
    };

    if (modelSource === 'folder' && Array.isArray(files) && files.length > 0) {
      await saveAsrModelFiles(id, files);
    }

    await saveAsrModel(record);
    this.models = [...this.models, record];
    await this.selectModel(id);
    await this.checkAllModelsCached();

    appState.statusMessage = `Saved ASR model "${cleanTitle}".`;
    return record;
  }

  async deleteCustomModel(id) {
    const target = this.models.find((m) => m.id === id);
    if (!target) return;

    // 1. If currently loaded, unload from worker memory
    if (this.selectedModelId === id) {
      if (appState.worker) {
        try {
          appState.worker.postMessage({ type: 'unload' });
        } catch (e) {
          console.warn('[ModelState] Could not post unload to worker:', e);
        }
      }
      this.isModelLoaded = false;
    }

    // 2. Remove from presets record or delete from IndexedDB
    if (target.isPreset) {
      let addedPresetIds = [];
      try {
        const stored = localStorage.getItem('easper_added_preset_model_ids');
        if (stored) addedPresetIds = JSON.parse(stored);
      } catch (e) {}
      addedPresetIds = addedPresetIds.filter((pId) => pId !== id);
      try {
        localStorage.setItem(
          'easper_added_preset_model_ids',
          JSON.stringify(addedPresetIds),
        );
      } catch (e) {}
    } else {
      // Deletes model metadata and all associated binary file Blobs from IndexedDB
      await deleteAsrModel(id);
    }

    // 3. Purge cached weights/files from browser CacheStorage
    let purgedFiles = 0;
    if (target.modelSource === 'hub') {
      purgedFiles = await this.clearModelCache(target.modelId, target.id);
    }

    this.models = this.models.filter((m) => m.id !== id);
    await this.checkAllModelsCached();

    if (this.selectedModelId === id) {
      const nextModel = this.models[0];
      if (nextModel) {
        await this.selectModel(nextModel.id);
      } else {
        this.selectedModelId = null;
        this.hubModelId = '';
        this.rawLocalFiles = [];
        this.localFileCount = 0;
        this.isModelLoaded = false;
        try {
          localStorage.removeItem('easper_selected_asr_model_id');
        } catch (e) {}
      }
    }

    if (purgedFiles > 0) {
      appState.statusMessage = `Deleted model "${target.title}" and purged ${purgedFiles} cached file(s) from local storage.`;
    } else {
      appState.statusMessage = `Deleted model "${target.title}" and purged from local storage.`;
    }
  }

  async deleteModel(id) {
    return this.deleteCustomModel(id);
  }

  preloadModel(worker) {
    if (appState.isProcessing || this.isModelLoading) return;
    if (this.modelSource === 'folder' && this.rawLocalFiles.length === 0) {
      appState.errorMessage = 'Please select a model folder first.';
      return;
    }

    this.isModelLoading = true;
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    appState.downloadProgress = null;
    appState.statusMessage = 'Loading model...';

    try {
      worker.postMessage({
        type: 'load',
        payload: {
          modelSource: this.modelSource,
          modelId: this.hubModelId.trim() || MODEL_ID,
          folderName: this.localFolderName,
          files: this.rawLocalFiles,
          dtype: this.modelDtype,
          device: this.preferredDevice,
        },
      });
    } catch (err) {
      console.error('[Main UI] postMessage failed:', err);
      appState.handleWorkerError(`Failed to initiate worker: ${err.message || err}`);
      this.isModelLoading = false;
    }
  }
}

export const modelState = new ModelState();
