/**
 * Native Promise-based IndexedDB storage service for Easper Web.
 * Stores project metadata (JSON) and converted 16kHz mono WAV audio Blobs
 * asynchronously with persistent multi-gigabyte browser storage capacity.
 */

const DB_NAME = 'easper_db';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_AUDIO = 'audio';
const STORE_MODELS = 'asr_models';
const STORE_MODEL_FILES = 'asr_model_files';
const STORE_LEXICONS = 'lexicons';

let dbInstance = null;

/**
 * Initializes and opens the IndexedDB database instance.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MODEL_FILES)) {
        db.createObjectStore(STORE_MODEL_FILES, { keyPath: 'modelId' });
      }
      if (!db.objectStoreNames.contains(STORE_LEXICONS)) {
        const lexiconStore = db.createObjectStore(STORE_LEXICONS, { keyPath: 'id' });
        lexiconStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Error opening database:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves all saved projects metadata sorted by updatedAt descending.
 * Audio Blobs are kept in the separate STORE_AUDIO to keep this query lightweight.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readonly');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.getAll();

    request.onsuccess = () => {
      const list = request.result || [];
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      resolve(list);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Retrieves a project document by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readonly');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves the 16kHz mono WAV audio Blob for a project.
 * @param {string} projectId
 * @returns {Promise<Blob|null>}
 */
export async function getProjectAudioBlob(projectId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_AUDIO], 'readonly');
    const store = transaction.objectStore(STORE_AUDIO);
    const request = store.get(projectId);

    request.onsuccess = () => {
      if (request.result && request.result.blob) {
        resolve(request.result.blob);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves or updates project metadata in the STORE_PROJECTS store.
 * @param {Object} projectData
 * @returns {Promise<Object>}
 */
export async function saveProject(projectData) {
  const db = await openDB();
  // Unwrap any reactive Proxies to prevent DataCloneError in IndexedDB
  const cleanDoc = JSON.parse(JSON.stringify(projectData));
  cleanDoc.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.put(cleanDoc);

    request.onsuccess = () => resolve(cleanDoc);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves the converted 16kHz mono WAV audio Blob in the STORE_AUDIO store.
 * @param {string} projectId
 * @param {Blob} audioBlob
 * @returns {Promise<void>}
 */
export async function saveProjectAudioBlob(projectId, audioBlob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_AUDIO], 'readwrite');
    const store = transaction.objectStore(STORE_AUDIO);
    const record = {
      id: projectId,
      blob: audioBlob,
      mimeType: 'audio/wav',
      sampleRate: 16000,
      channels: 1,
      updatedAt: new Date().toISOString(),
    };
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a project and its associated audio Blob from IndexedDB.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function deleteProject(projectId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS, STORE_AUDIO], 'readwrite');
    const projectStore = transaction.objectStore(STORE_PROJECTS);
    const audioStore = transaction.objectStore(STORE_AUDIO);

    projectStore.delete(projectId);
    audioStore.delete(projectId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Retrieves all saved custom ASR models.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllAsrModels() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MODELS], 'readonly');
    const store = transaction.objectStore(STORE_MODELS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves an ASR model record (metadata).
 * @param {Object} model
 * @returns {Promise<string>}
 */
export async function saveAsrModel(model) {
  const db = await openDB();
  const cleanModel = JSON.parse(JSON.stringify(model));
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MODELS], 'readwrite');
    const store = transaction.objectStore(STORE_MODELS);
    const request = store.put(cleanModel);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes an ASR model and its associated files from IndexedDB.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteAsrModel(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MODELS, STORE_MODEL_FILES], 'readwrite');
    transaction.objectStore(STORE_MODELS).delete(id);
    transaction.objectStore(STORE_MODEL_FILES).delete(id);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Saves local model files (as Blobs) for a custom folder-based model.
 * Handles unwrapping Svelte reactive Proxies and ensures files are valid cloneable Blobs.
 * @param {string} modelId
 * @param {Array<{path: string, file: Blob|File}>} files
 * @returns {Promise<boolean>}
 */
export async function saveAsrModelFiles(modelId, files) {
  const db = await openDB();
  const cleanFiles = [];

  for (const item of (files || [])) {
    if (!item) continue;
    const path = String(item.path || '');
    let fileObj = item.file;
    // Extract raw File or slice into a clean pure Blob if needed
    if (fileObj instanceof Blob || fileObj instanceof File) {
      cleanFiles.push({ path, file: fileObj });
    } else if (fileObj && typeof fileObj.slice === 'function') {
      const rawBlob = fileObj.slice(0, fileObj.size, fileObj.type);
      cleanFiles.push({ path, file: rawBlob });
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MODEL_FILES], 'readwrite');
    const store = transaction.objectStore(STORE_MODEL_FILES);
    const request = store.put({ modelId, files: cleanFiles });

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves the local model files for a custom folder-based model.
 * @param {string} modelId
 * @returns {Promise<Array<{path: string, file: Blob|File}>>}
 */
export async function getAsrModelFiles(modelId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MODEL_FILES], 'readonly');
    const store = transaction.objectStore(STORE_MODEL_FILES);
    const request = store.get(modelId);

    request.onsuccess = () => resolve(request.result?.files || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all saved lexicons sorted by updatedAt descending.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllLexicons() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LEXICONS], 'readonly');
    const store = transaction.objectStore(STORE_LEXICONS);
    const request = store.getAll();

    request.onsuccess = () => {
      const list = request.result || [];
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      resolve(list);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Retrieves a single lexicon by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getLexicon(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LEXICONS], 'readonly');
    const store = transaction.objectStore(STORE_LEXICONS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves or updates a lexicon in IndexedDB.
 * @param {Object} lexiconData
 * @returns {Promise<Object>}
 */
export async function saveLexicon(lexiconData) {
  const db = await openDB();
  // Unwrap any reactive Proxies to prevent DataCloneError in IndexedDB
  const cleanDoc = JSON.parse(JSON.stringify(lexiconData));
  cleanDoc.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LEXICONS], 'readwrite');
    const store = transaction.objectStore(STORE_LEXICONS);
    const request = store.put(cleanDoc);

    request.onsuccess = () => resolve(cleanDoc);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a lexicon from IndexedDB.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteLexicon(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LEXICONS], 'readwrite');
    const store = transaction.objectStore(STORE_LEXICONS);
    store.delete(id);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}



