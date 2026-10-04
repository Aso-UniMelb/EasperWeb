/**
 * Project Management State.
 * Svelte 5 universal reactive module (.svelte.js)
 * Manages project metadata (Title, Transcriber, Segments/Transcriptions),
 * 16kHz mono WAV conversion, IndexedDB persistence, auto-saving, and switching.
 */

import {
  getAllProjects,
  getProject,
  getProjectAudioBlob,
  saveProject,
  saveProjectAudioBlob,
  deleteProject as dbDeleteProject,
} from '../services/db.js';
import { normalizeSubTiers } from '../utils/subTiers.js';
import { processAudioFile, encodeWavBlob } from '../audio.js';
import { audioState } from './audioState.svelte.js';
import { transcriptState } from './transcriptState.svelte.js';
import { appState } from './appState.svelte.js';
import { router } from '../services/router.svelte.js';
import { hunspellState } from './hunspellState.svelte.js';
import { lexiconState } from './lexiconState.svelte.js';
import JSZip from 'jszip';

class ProjectState {
  // Projects collection
  projects = $state([]);
  activeProject = $state(null);
  activeProjectId = $state(null);

  // View state: 'home' (starting page) | 'workspace' (transcription environment)
  currentView = $state('home');

  // Conversion / Processing state
  isConverting = $state(false);
  convertingMessage = $state('');

  // Modals visibility
  isProjectManagerOpen = $state(false);
  isNewProjectOpen = $state(false);
  isProjectSettingsOpen = $state(false);
  isImportElanOpen = $state(false);

  // Auto-save state
  saveStatus = $state('saved'); // 'saved' | 'saving' | 'unsaved'
  autoSaveTimer = null;

  // Initialize projects on app mount
  async init() {
    try {
      await this.loadProjects();

      // Check if user had a previous active project (remember ID, but start on Home)
      const lastId = localStorage.getItem('easper_active_project_id');
      if (lastId && this.projects.some((p) => p.id === lastId)) {
        this.activeProjectId = lastId;
      }
    } catch (err) {
      console.error('[ProjectState] Init failed:', err);
    }
  }

  goToHome() {
    if (this.activeProject) {
      this.persistActiveProjectNow().catch(() => {});
    }
    this.currentView = 'home';
    router.navigate('/');
  }

  goToWorkspace(targetId) {
    if (targetId) {
      const proj = this.findProjectById(targetId);
      if (proj) {
        this.currentView = 'workspace';
        router.navigate(`/transcriber/${proj.numericId || proj.id}`);
        return;
      }
    }
    if (this.activeProject) {
      this.currentView = 'workspace';
      if (transcriptState.segments && transcriptState.segments.length > 0) {
        transcriptState.workflowStep = 'transcribe';
      } else {
        transcriptState.workflowStep = 'segment';
      }
      router.navigate(
        `/transcriber/${this.activeProject.numericId || this.activeProject.id}`,
      );
    } else if (this.projects.length > 0) {
      this.currentView = 'workspace';
      const first = this.projects[0];
      router.navigate(`/transcriber/${first.numericId || first.id}`);
    } else {
      this.currentView = 'workspace';
      router.navigate('/transcriber');
    }
  }

  goToDataset() {
    if (this.activeProject) {
      this.persistActiveProjectNow().catch(() => {});
    }
    this.currentView = 'dataset';
    router.navigate('/dataset-builder');
  }

  goToGuide() {
    if (this.activeProject) {
      this.persistActiveProjectNow().catch(() => {});
    }
    this.currentView = 'guide';
    router.navigate('/guide');
  }

  getNextNumericId() {
    const existingIds = this.projects
      .map((p) => p.numericId)
      .filter((n) => typeof n === 'number' && !isNaN(n) && n > 0);
    return existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  }

  findProjectById(identifier) {
    if (!identifier && identifier !== 0) return null;
    const num = Number(identifier);
    if (!isNaN(num) && num > 0) {
      const foundByNum = this.projects.find((p) => p.numericId === num);
      if (foundByNum) return foundByNum;
    }
    return this.projects.find((p) => p.id === String(identifier)) || null;
  }

  async loadProjects() {
    try {
      const rawProjects = await getAllProjects();

      // Ensure every project has a unique sequential numericId (1, 2, 3...)
      let maxNum = 0;
      for (const p of rawProjects) {
        if (typeof p.numericId === 'number' && p.numericId > maxNum) {
          maxNum = p.numericId;
        }
      }

      let nextNum = maxNum + 1;
      let hasUpdates = false;

      // For projects lacking numericId, sort older first and assign sequential IDs
      const needsId = rawProjects.filter(
        (p) =>
          typeof p.numericId !== 'number' ||
          isNaN(p.numericId) ||
          p.numericId <= 0,
      );

      if (needsId.length > 0) {
        needsId.sort(
          (a, b) =>
            new Date(a.createdAt || a.updatedAt || 0) -
            new Date(b.createdAt || b.updatedAt || 0),
        );

        for (const p of needsId) {
          p.numericId = nextNum++;
          await saveProject(p);
          hasUpdates = true;
        }
      }

      this.projects = hasUpdates ? await getAllProjects() : rawProjects;
    } catch (err) {
      console.error('[ProjectState] Failed to load projects:', err);
      this.projects = [];
    }
  }

  /**
   * Creates a new project from an audio file or Blob.
   * Automatically decodes and converts audio to 16kHz mono 16-bit PCM WAV (Whisper format),
   * stores audio Blob and project JSON in IndexedDB, and opens it.
   */
  async createProject({ title, transcriber, audioFileOrBlob, audioFileName, lexiconId = null }) {
    if (!audioFileOrBlob) {
      throw new Error('Please select an audio file.');
    }

    this.isConverting = true;
    this.convertingMessage =
      'Converting audio to 16kHz mono WAV (Whisper standard)...';

    try {
      // 1. Convert to 16kHz mono Float32Array via high-performance fast-path / resampler
      console.log('[ProjectState] Converting input audio file:', audioFileName);
      const { audioData, duration } = await processAudioFile(audioFileOrBlob);

      this.convertingMessage = 'Encoding standard 16-bit PCM WAV...';
      // 2. Encode to standard 16-bit PCM 16kHz mono WAV Blob
      const wavBlob = encodeWavBlob(audioData, 16000);

      this.convertingMessage =
        'Saving project to browser storage (IndexedDB)...';
      const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const numericId = this.getNextNumericId();
      const cleanTitle =
        title?.trim() ||
        audioFileName?.replace(/\.[^/.]+$/, '') ||
        `Project ${new Date().toLocaleDateString()}`;
      const cleanTranscriber = transcriber?.trim() || 'Transcriber';

      const projectDoc = {
        id: projectId,
        numericId,
        title: cleanTitle,
        transcriber: cleanTranscriber,
        audioFileName: audioFileName || 'recording-16khz.wav',
        audioDuration: Number(duration.toFixed(2)),
        audioFormat: 'WAV 16kHz Mono',
        audioFileSize: wavBlob.size,
        speakers: [{ id: 1, name: 'Speaker 1', initials: 'S1' }],
        subTiers: [],
        columnOrder: [],
        hiddenColumns: [],
        lexiconId: lexiconId || null,
        segments: [],
        transcript: '',
        textDirection: transcriptState.textDirection || 'ltr',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 3. Persist to IndexedDB
      await saveProjectAudioBlob(projectId, wavBlob);
      await saveProject(projectDoc);

      // 4. Remember last entered transcriber name for convenience
      localStorage.setItem('easper_last_transcriber', cleanTranscriber);

      // 5. Reload list & Open project
      await this.loadProjects();
      await this.openProject(projectId);

      this.isNewProjectOpen = false;
      // A new project has no segments and no settings yet, so start with the setup
      // panel open even if the user had collapsed it on a previous project.
      appState.openSidebar();
      appState.statusMessage = `Project #${numericId} "${cleanTitle}" created successfully!`;
      router.navigate(`/transcriber/${numericId}`);
      return projectDoc;
    } catch (err) {
      console.error('[ProjectState] Project creation failed:', err);
      appState.errorMessage = `Project creation failed: ${err.message || err}`;
      throw err;
    } finally {
      this.isConverting = false;
      this.convertingMessage = '';
    }
  }

  /**
   * Creates a new project from an ELAN (.eaf) transcription and its matching audio file.
   * Resamples audio to 16kHz mono WAV, builds project with configured speakers, sub-tiers,
   * and imported segments, persists to IndexedDB, and opens it.
   */
  async createProjectFromElan({
    title,
    transcriber,
    audioFileOrBlob,
    audioFileName,
    speakers,
    subTiers,
    segments,
    transcript,
    lexiconId = null,
  }) {
    if (!audioFileOrBlob) {
      throw new Error('Please provide the matching audio file for the ELAN project.');
    }

    this.isConverting = true;
    this.convertingMessage =
      'Converting audio to 16kHz mono WAV (Whisper standard)...';

    try {
      console.log('[ProjectState] Converting input audio file for ELAN import:', audioFileName);
      const { audioData, duration } = await processAudioFile(audioFileOrBlob);

      this.convertingMessage = 'Encoding standard 16-bit PCM WAV...';
      const wavBlob = encodeWavBlob(audioData, 16000);

      this.convertingMessage =
        'Saving ELAN project to browser storage (IndexedDB)...';
      const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const numericId = this.getNextNumericId();
      const cleanTitle =
        title?.trim() ||
        audioFileName?.replace(/\.[^/.]+$/, '') ||
        `ELAN Project ${new Date().toLocaleDateString()}`;
      const cleanTranscriber = transcriber?.trim() || 'Transcriber';

      const cleanSpeakers = Array.isArray(speakers) && speakers.length > 0
        ? speakers
        : [{ id: 1, name: 'Speaker 1', initials: 'S1' }];
      const cleanSubTiers = normalizeSubTiers(subTiers, { sort: true });

      const projectDoc = {
        id: projectId,
        numericId,
        title: cleanTitle,
        transcriber: cleanTranscriber,
        audioFileName: audioFileName || 'recording-16khz.wav',
        audioDuration: Number(duration.toFixed(2)),
        audioFormat: 'WAV 16kHz Mono',
        audioFileSize: wavBlob.size,
        speakers: cleanSpeakers,
        subTiers: cleanSubTiers,
        columnOrder: [],
        hiddenColumns: [],
        lexiconId: lexiconId || null,
        segments: Array.isArray(segments) ? segments : [],
        transcript: transcript || '',
        textDirection: transcriptState.textDirection || 'ltr',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist to IndexedDB
      await saveProjectAudioBlob(projectId, wavBlob);
      await saveProject(projectDoc);

      localStorage.setItem('easper_last_transcriber', cleanTranscriber);

      await this.loadProjects();
      await this.openProject(projectId);

      this.isImportElanOpen = false;
      appState.statusMessage = `Project #${numericId} "${cleanTitle}" imported from ELAN with ${projectDoc.segments.length} utterances!`;
      router.navigate(`/transcriber/${numericId}`);
      return projectDoc;
    } catch (err) {
      console.error('[ProjectState] ELAN project creation failed:', err);
      appState.errorMessage = `ELAN import failed: ${err.message || err}`;
      throw err;
    } finally {
      this.isConverting = false;
      this.convertingMessage = '';
    }
  }

  /**
   * Opens and activates a project by ID or numericId, loading its 16kHz WAV audio
   * and dialogue segments into the main UI.
   */
  async openProject(projectIdOrNumericId) {
    try {
      this.isConverting = true;
      this.convertingMessage =
        'Loading project and audio from local storage...';

      let targetDoc = this.findProjectById(projectIdOrNumericId);
      let projectId = targetDoc ? targetDoc.id : projectIdOrNumericId;

      const projectDoc = targetDoc || (await getProject(projectId));
      if (!projectDoc) {
        throw new Error('Project not found in database.');
      }
      projectId = projectDoc.id;

      const audioBlob = await getProjectAudioBlob(projectId);
      if (!audioBlob) {
        throw new Error('Project audio file not found in database.');
      }

      if (
        !projectDoc.speakers ||
        !Array.isArray(projectDoc.speakers) ||
        projectDoc.speakers.length === 0
      ) {
        projectDoc.speakers = [{ id: 1, name: 'Speaker 1', initials: 'S1' }];
      }

      this.activeProject = projectDoc;
      this.activeProjectId = projectId;
      localStorage.setItem('easper_active_project_id', projectId);

      // Load audio and segments into transcriptState and audioState
      await transcriptState.loadProjectState(projectDoc, audioBlob);

      // Sync project's chosen lexicon with Hunspell spellchecker
      await this.syncProjectLexiconToHunspell(projectDoc.lexiconId);

      this.saveStatus = 'saved';
      this.isProjectManagerOpen = false;
      this.currentView = 'workspace';
      appState.resetStatus();
      return projectDoc;
    } catch (err) {
      console.error('[ProjectState] Failed to open project:', err);
      appState.errorMessage = `Failed to load project: ${err.message || err}`;
      throw err;
    } finally {
      this.isConverting = false;
      this.convertingMessage = '';
    }
  }

  /**
   * Syncs the project's chosen lexicon to Hunspell engine.
   * If lexiconId is provided, rebuilds Hunspell dictionary from that lexicon.
   * If null/empty, clears or resets Hunspell dictionary.
   * @param {string|null} lexiconId
   */
  async syncProjectLexiconToHunspell(lexiconId) {
    try {
      if (!lexiconId) {
        await hunspellState.rebuildFromLexicon(null);
        return;
      }
      if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
        await lexiconState.init();
      }
      const lex = lexiconState.lexicons.find((l) => l.id === lexiconId);
      if (lex) {
        await hunspellState.rebuildFromLexicon(lex);
      } else {
        await hunspellState.rebuildFromLexicon(null);
      }
    } catch (err) {
      console.warn('[ProjectState] Failed to sync lexicon to Hunspell:', err);
    }
  }

  /**
   * Updates the project's assigned spellchecking lexicon and persists to DB.
   * @param {string} projectId
   * @param {string|null} lexiconId
   */
  async setProjectLexicon(projectId, lexiconId) {
    try {
      const proj = await getProject(projectId);
      if (!proj) return;

      const cleanLexId = lexiconId || null;
      proj.lexiconId = cleanLexId;
      proj.updatedAt = new Date().toISOString();
      await saveProject(proj);

      if (this.activeProject?.id === projectId) {
        this.activeProject = { ...this.activeProject, lexiconId: cleanLexId };
        await this.syncProjectLexiconToHunspell(cleanLexId);
      }

      const idx = this.projects.findIndex((p) => p.id === projectId);
      if (idx !== -1) {
        this.projects[idx] = { ...this.projects[idx], lexiconId: cleanLexId };
      }
      appState.statusMessage = cleanLexId ? 'Spellcheck lexicon updated.' : 'Spellcheck disabled for this project.';
    } catch (err) {
      console.error('[ProjectState] Failed to set project lexicon:', err);
    }
  }

  /**
   * Schedules a debounced auto-save of the active project to IndexedDB.
   */
  saveCurrentProjectDebounced() {
    if (!this.activeProject || !this.activeProjectId) return;

    this.saveStatus = 'unsaved';
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(async () => {
      await this.persistActiveProjectNow();
    }, 500);
  }

  /**
   * Immediately saves the current project's segments and transcript to IndexedDB.
   */
  async persistActiveProjectNow() {
    if (!this.activeProject || !this.activeProjectId) return;

    try {
      this.saveStatus = 'saving';

      const updatedDoc = {
        ...this.activeProject,
        segments: $state.snapshot(transcriptState.segments || []),
        transcript: transcriptState.transcript || '',
        textDirection: transcriptState.textDirection || 'ltr',
        updatedAt: new Date().toISOString(),
      };

      await saveProject(updatedDoc);
      this.activeProject = updatedDoc;

      // Update in memory projects array
      const idx = this.projects.findIndex((p) => p.id === updatedDoc.id);
      if (idx !== -1) {
        this.projects[idx] = { ...this.projects[idx], ...updatedDoc };
      }

      this.saveStatus = 'saved';
    } catch (err) {
      console.error('[ProjectState] Auto-save failed:', err);
      this.saveStatus = 'unsaved';
    }
  }

  /**
   * Updates project title, transcriber info, and speakers.
   */
  async updateProjectSettings(
    projectId,
    { title, transcriber, speakers, subTiers, lexiconId },
  ) {
    try {
      const proj = await getProject(projectId);
      if (!proj) return;

      const newSpeakers = Array.isArray(speakers)
        ? $state.snapshot(speakers)
        : proj.speakers || [{ id: 1, name: 'Speaker 1', initials: 'S1' }];

      // Map of speaker id -> speaker object
      const spkMap = new Map();
      for (const s of newSpeakers) {
        if (s && s.id != null) {
          spkMap.set(Number(s.id), s);
        }
      }
      const defaultSpk = newSpeakers[0] || {
        id: 1,
        name: 'Speaker 1',
        initials: 'S1',
      };

      const syncSegmentSpeaker = (seg) => {
        let spkId = Number(seg.speakerId);
        if (!spkId && seg.speaker) {
          const m = String(seg.speaker).match(
            /^(?:speaker|spk)?[_\s]*([1-5])$/i,
          );
          if (m) spkId = Number(m[1]);
        }
        if (!spkId) spkId = 1;
        const matched = spkMap.get(spkId) || defaultSpk;
        return {
          ...seg,
          speakerId: Number(matched.id),
          speaker: matched.name || `Speaker ${matched.id}`,
        };
      };

      // 1. Update in-memory segments if this project is currently active
      if (
        this.activeProjectId === projectId &&
        Array.isArray(transcriptState.segments)
      ) {
        transcriptState.segments =
          transcriptState.segments.map(syncSegmentSpeaker);
        if (transcriptState.fullResult?.segments) {
          transcriptState.fullResult.segments = transcriptState.segments;
        }
        if (transcriptState.fullResult?.output?.segments) {
          transcriptState.fullResult.output.segments = transcriptState.segments;
        }
      }

      // 2. Update segments stored in the project document
      let updatedSegments = proj.segments;
      if (
        this.activeProjectId === projectId &&
        Array.isArray(transcriptState.segments)
      ) {
        updatedSegments = $state.snapshot(transcriptState.segments);
      } else if (Array.isArray(proj.segments)) {
        updatedSegments = proj.segments.map(syncSegmentSpeaker);
      }

      const newSubTiers =
        subTiers !== undefined
          ? normalizeSubTiers($state.snapshot(subTiers))
          : normalizeSubTiers(proj.subTiers);

      const cleanLexId =
        lexiconId !== undefined ? (lexiconId || null) : (proj.lexiconId || null);

      const updated = {
        ...proj,
        title: title !== undefined ? title.trim() : proj.title,
        transcriber:
          transcriber !== undefined ? transcriber.trim() : proj.transcriber,
        speakers: newSpeakers,
        subTiers: newSubTiers,
        lexiconId: cleanLexId,
        segments: updatedSegments || [],
        updatedAt: new Date().toISOString(),
      };

      await saveProject(updated);
      if (this.activeProjectId === projectId) {
        this.activeProject = { ...this.activeProject, ...updated };
        await this.syncProjectLexiconToHunspell(cleanLexId);
      }
      await this.loadProjects();
      appState.statusMessage = 'Project settings saved successfully.';
    } catch (err) {
      console.error('[ProjectState] Update project settings failed:', err);
      appState.errorMessage = `Failed to save project settings: ${err.message || err}`;
    }
  }

  /**
   * Ensures the active project has at least targetCount speakers defined (up to 5).
   * Automatically creates new speakers (e.g. Speaker 2, Speaker 3) if missing and persists to DB.
   * @param {number} targetCount
   * @returns {Promise<Array>} The updated speakers array
   */
  async ensureSpeakerCount(targetCount) {
    const count = Math.max(1, Math.min(5, Number(targetCount) || 1));
    if (!this.activeProject) {
      const defaultFallback = [];
      for (let i = 1; i <= count; i++) {
        defaultFallback.push({
          id: i,
          name: `Speaker ${i}`,
          initials: `S${i}`,
        });
      }
      return defaultFallback;
    }
    const currentSpeakers =
      Array.isArray(this.activeProject.speakers) &&
      this.activeProject.speakers.length > 0
        ? [...this.activeProject.speakers]
        : [{ id: 1, name: 'Speaker 1', initials: 'S1' }];

    const existingIds = new Set(currentSpeakers.map((s) => Number(s.id)));
    let added = false;

    for (let id = 1; id <= count; id++) {
      if (!existingIds.has(id)) {
        currentSpeakers.push({
          id,
          name: `Speaker ${id}`,
          initials: `S${id}`,
        });
        existingIds.add(id);
        added = true;
      }
    }

    if (added) {
      currentSpeakers.sort((a, b) => a.id - b.id);
      await this.updateProjectSettings(this.activeProject.id, {
        speakers: currentSpeakers,
      });
      console.log(
        `[ProjectState] Expanded project speakers to ${currentSpeakers.length}:`,
        currentSpeakers,
      );
    }

    return currentSpeakers;
  }

  /**
   * Updates project title and transcriber info.
   */
  async updateProjectInfo(projectId, { title, transcriber }) {
    return this.updateProjectSettings(projectId, { title, transcriber });
  }

  /**
   * Writes the segment column arrangement onto the active project.
   *
   * Kept separate from updateProjectSettings, which re-syncs speakers across every
   * segment: reordering a column has nothing to do with speakers and runs on every
   * drag, so it stays a narrow patch of two fields.
   *
   * @param {string} projectId
   * @param {{ columnOrder?: Array<string>, hiddenColumns?: Array<string> }} patch
   */
  async setColumnLayout(projectId, patch) {
    try {
      const proj = await getProject(projectId);
      if (!proj) return;

      const updated = {
        ...proj,
        columnOrder:
          patch.columnOrder !== undefined
            ? patch.columnOrder.map(String)
            : proj.columnOrder || [],
        hiddenColumns:
          patch.hiddenColumns !== undefined
            ? patch.hiddenColumns.map(String)
            : proj.hiddenColumns || [],
        updatedAt: new Date().toISOString(),
      };

      await saveProject(updated);
      if (this.activeProjectId === projectId) {
        this.activeProject = { ...this.activeProject, ...updated };
      }
    } catch (err) {
      console.error('[ProjectState] Failed to save column layout:', err);
      appState.errorMessage = `Could not save the column layout: ${err.message || err}`;
    }
  }

  /** Moves one column to a new index in the display order. */
  async moveColumn(columnKeys, fromKey, toIndex) {
    const keys = columnKeys.map(String);
    const from = keys.indexOf(String(fromKey));
    if (from === -1) return;
    const target = Math.max(0, Math.min(keys.length - 1, toIndex));
    if (from === target) return;
    keys.splice(target, 0, keys.splice(from, 1)[0]);
    if (this.activeProjectId) {
      await this.setColumnLayout(this.activeProjectId, { columnOrder: keys });
    }
  }

  /**
   * Shows or collapses one column. Refuses to collapse the last visible one, since
   * a row with no text at all cannot be edited back into view.
   */
  async toggleColumnVisibility(allKeys, key, currentlyHidden) {
    const hidden = new Set(currentlyHidden.map(String));
    const target = String(key);
    if (hidden.has(target)) {
      hidden.delete(target);
    } else {
      const visibleLeft = allKeys
        .map(String)
        .filter((k) => k !== target && !hidden.has(k)).length;
      if (visibleLeft === 0) {
        appState.statusMessage = 'At least one column has to stay visible.';
        return;
      }
      hidden.add(target);
    }
    if (this.activeProjectId) {
      await this.setColumnLayout(this.activeProjectId, {
        hiddenColumns: [...hidden],
      });
    }
  }

  /**
   * Deletes a project from IndexedDB.
   */
  async deleteProject(projectId) {
    try {
      await dbDeleteProject(projectId);
      await this.loadProjects();

      if (this.activeProjectId === projectId) {
        this.activeProject = null;
        this.activeProjectId = null;
        this.currentView = 'workspace';
        this.isProjectManagerOpen = false;
        localStorage.removeItem('easper_active_project_id');
        transcriptState.resetState();
        router.navigate('/transcriber');
      }
      appState.statusMessage = 'Project deleted.';
    } catch (err) {
      console.error('[ProjectState] Delete project failed:', err);
      appState.errorMessage = `Failed to delete project: ${err.message || err}`;
    }
  }

  /**
   * Saves and packages a project as a portable .easper archive.
   * Bundles project metadata (speakers, sub-tiers, segments, transcripts) and
   * the converted 16kHz mono WAV audio file so users can share projects seamlessly.
   */
  async saveProjectPackage(project = null) {
    const proj = project || this.activeProject;
    if (!proj) {
      appState.errorMessage = 'No project selected to save.';
      return;
    }

    try {
      // If saving the currently active project, persist any pending edits first
      if (this.activeProjectId === proj.id) {
        await this.persistActiveProjectNow();
      }

      appState.statusMessage = `Packaging project "${proj.title}" with audio into .easper...`;

      // 1. Fetch the 16kHz mono WAV audio blob from IndexedDB
      let audioBlob = await getProjectAudioBlob(proj.id);
      if (!audioBlob && audioState.selectedFile) {
        audioBlob = audioState.selectedFile;
      }

      // 2. Prepare comprehensive metadata snapshot
      const currentSegments =
        this.activeProjectId === proj.id && transcriptState.segments
          ? $state.snapshot(transcriptState.segments)
          : proj.segments || [];

      const packageData = {
        easperVersion: '1.0',
        exportedAt: new Date().toISOString(),
        project: {
          id: proj.id,
          numericId: proj.numericId,
          title: proj.title,
          transcriber: proj.transcriber || 'Transcriber',
          audioFileName: proj.audioFileName || 'recording-16khz.wav',
          audioDuration: proj.audioDuration || 0,
          audioFormat: proj.audioFormat || 'WAV 16kHz Mono',
          audioFileSize: audioBlob ? audioBlob.size : proj.audioFileSize || 0,
          speakers: proj.speakers || [{ id: 1, name: 'Speaker 1', initials: 'S1' }],
          subTiers: proj.subTiers || [],
          columnOrder: proj.columnOrder || [],
          hiddenColumns: proj.hiddenColumns || [],
          segments: currentSegments,
          transcript:
            (this.activeProjectId === proj.id
              ? transcriptState.transcript
              : proj.transcript) || '',
          textDirection:
            (this.activeProjectId === proj.id
              ? transcriptState.textDirection
              : proj.textDirection) || 'ltr',
          createdAt: proj.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      // 3. Create zip bundle using JSZip
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify(packageData, null, 2));

      if (audioBlob) {
        const audioName =
          proj.audioFileName && proj.audioFileName.toLowerCase().endsWith('.wav')
            ? proj.audioFileName
            : 'audio.wav';
        zip.file(audioName, audioBlob);
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // 4. Trigger download
      const cleanTitle = (proj.title || 'project').replace(/[^a-z0-9_-]/gi, '_');
      const filename = `${cleanTitle}.easper`;

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      appState.statusMessage = `Project "${proj.title}" saved successfully as "${filename}"!`;
    } catch (err) {
      console.error('[ProjectState] Failed to save project package:', err);
      appState.errorMessage = `Failed to save project: ${err.message || err}`;
    }
  }

  async saveActiveProjectPackage() {
    return this.saveProjectPackage(this.activeProject);
  }

  /**
   * Opens and imports a project package (.easper, .zip, or .json) shared by another user or from disk.
   * Extracts project metadata and audio file into local IndexedDB and opens the workspace.
   */
  async importProjectPackage(file) {
    if (!file) return;

    this.isConverting = true;
    this.convertingMessage = 'Reading project package...';
    appState.errorMessage = '';

    try {
      // Auto-save current project if open
      if (this.activeProject) {
        await this.persistActiveProjectNow();
      }

      const fileName = file.name.toLowerCase();
      let projectData = null;
      let audioBlob = null;
      let audioFileName = 'recording-16khz.wav';

      if (fileName.endsWith('.json')) {
        // Plain JSON file
        const text = await file.text();
        const parsed = JSON.parse(text);
        projectData = parsed.project || parsed;
        if (projectData.audioFileName) {
          audioFileName = projectData.audioFileName;
        }

        // If user already has an active project open in workspace, import annotations directly
        if (this.activeProject && this.activeProjectId) {
          if (Array.isArray(projectData.speakers) && projectData.speakers.length > 0) {
            this.activeProject.speakers = projectData.speakers;
          }
          if (Array.isArray(projectData.subTiers)) {
            this.activeProject.subTiers = projectData.subTiers;
          }
          if (Array.isArray(projectData.columnOrder)) {
            this.activeProject.columnOrder = projectData.columnOrder;
          }
          if (Array.isArray(projectData.hiddenColumns)) {
            this.activeProject.hiddenColumns = projectData.hiddenColumns;
          }
          if (Array.isArray(projectData.segments)) {
            transcriptState.segments = projectData.segments;
            this.activeProject.segments = projectData.segments;
          }
          if (projectData.transcript) {
            transcriptState.transcript = projectData.transcript;
            this.activeProject.transcript = projectData.transcript;
          }
          if (projectData.textDirection) {
            transcriptState.textDirection = projectData.textDirection;
            this.activeProject.textDirection = projectData.textDirection;
          }

          await this.persistActiveProjectNow();
          transcriptState.notifySegmentsChange();
          requestAnimationFrame(() => transcriptState.drawVerticalWaveform());

          appState.statusMessage = `Imported annotations from "${file.name}" into current project!`;
          return this.activeProject;
        }
      } else {
        // Assume zip archive (.easper or .zip)
        const zip = await JSZip.loadAsync(file);

        // 1. Locate and parse project.json
        let projectEntry = zip.file('project.json');
        if (!projectEntry) {
          const jsonEntries = zip.file(/\.json$/i);
          if (jsonEntries.length > 0) {
            projectEntry = jsonEntries[0];
          }
        }

        if (!projectEntry) {
          throw new Error('Invalid project package: missing project.json metadata.');
        }

        const projectText = await projectEntry.async('string');
        const parsed = JSON.parse(projectText);
        projectData = parsed.project || parsed;

        // 2. Locate audio file inside zip
        let audioEntry = null;
        if (projectData.audioFileName) {
          audioEntry = zip.file(projectData.audioFileName);
        }
        if (!audioEntry) {
          audioEntry = zip.file('audio.wav');
        }
        if (!audioEntry) {
          const audioEntries = zip.file(/\.(wav|mp3|m4a|ogg|flac|aac)$/i);
          if (audioEntries.length > 0) {
            audioEntry = audioEntries[0];
          }
        }

        if (audioEntry) {
          audioBlob = await audioEntry.async('blob');
          audioFileName = audioEntry.name;
        }
      }

      if (!projectData || typeof projectData !== 'object') {
        throw new Error('Project file contains invalid or unreadable data.');
      }

      if (!audioBlob) {
        throw new Error(
          'No audio file found in package. JSON files contain dialogue annotations only. Please open your project in the workspace and click "Import JSON" to load annotations into that audio recording, or import an .easper archive package.',
        );
      }

      // Check if audio needs conversion or if it's already 16kHz PCM WAV
      this.convertingMessage = 'Verifying and processing audio...';
      const { audioData, duration } = await processAudioFile(audioBlob);
      const finalAudioBlob = encodeWavBlob(audioData, 16000);
      const audioDuration = Number(duration.toFixed(2));

      // Generate fresh unique ID and sequential numericId so it doesn't collide with existing projects
      const newProjectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newNumericId = this.getNextNumericId();
      const projectTitle =
        projectData.title?.trim() || file.name.replace(/\.[^/.]+$/, '');

      const projectDoc = {
        id: newProjectId,
        numericId: newNumericId,
        title: projectTitle,
        transcriber: projectData.transcriber || 'Transcriber',
        audioFileName: audioFileName,
        audioDuration: audioDuration,
        audioFormat: 'WAV 16kHz Mono',
        audioFileSize: finalAudioBlob.size,
        speakers:
          Array.isArray(projectData.speakers) && projectData.speakers.length > 0
            ? projectData.speakers
            : [{ id: 1, name: 'Speaker 1', initials: 'S1' }],
        subTiers: Array.isArray(projectData.subTiers) ? projectData.subTiers : [],
        columnOrder: Array.isArray(projectData.columnOrder)
          ? projectData.columnOrder
          : [],
        hiddenColumns: Array.isArray(projectData.hiddenColumns)
          ? projectData.hiddenColumns
          : [],
        segments: Array.isArray(projectData.segments) ? projectData.segments : [],
        transcript: projectData.transcript || '',
        textDirection: projectData.textDirection || 'ltr',
        createdAt: projectData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save audio blob and project document to IndexedDB
      this.convertingMessage = 'Saving imported project to storage...';
      await saveProjectAudioBlob(newProjectId, finalAudioBlob);
      await saveProject(projectDoc);

      // Reload project list & open the imported project
      await this.loadProjects();
      await this.openProject(newProjectId);

      appState.statusMessage = `Project #${newNumericId} "${projectTitle}" opened successfully!`;
      router.navigate(`/transcriber/${newNumericId}`);
      return projectDoc;
    } catch (err) {
      console.error('[ProjectState] Failed to import project package:', err);
      appState.errorMessage = `Failed to open project: ${err.message || err}`;
      throw err;
    } finally {
      this.isConverting = false;
      this.convertingMessage = '';
    }
  }

  /**
   * Exports project package (replaces legacy json-only export).
   */
  exportProjectJson(project) {
    return this.saveProjectPackage(project);
  }

  /**
   * Imports annotations and metadata from a .json file directly into the active workspace project.
   * Does NOT replace the audio recording.
   * @param {File} file
   * @returns {Promise<Object>} The updated active project
   */
  async importJsonToActiveProject(file) {
    if (!this.activeProject || !this.activeProjectId) {
      throw new Error(
        'No active project open. Please open a project first before importing JSON annotations.',
      );
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.json')) {
      throw new Error(
        'Only .json files can be imported into the active project. To import full project packages with audio (.easper / .zip), please use the Project Manager.',
      );
    }

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON format: Unable to parse file contents.');
    }

    const projectData =
      parsed.project || (Array.isArray(parsed) ? { segments: parsed } : parsed);
    const candidateSegments = Array.isArray(projectData.segments)
      ? projectData.segments
      : Array.isArray(parsed.segments)
        ? parsed.segments
        : Array.isArray(parsed)
          ? parsed
          : null;

    if (!candidateSegments && !projectData.transcript && !parsed.text) {
      throw new Error(
        'JSON file does not contain recognized transcript segments or text.',
      );
    }

    // 1. Update speakers if present
    if (Array.isArray(projectData.speakers) && projectData.speakers.length > 0) {
      this.activeProject.speakers = projectData.speakers;
    }

    // 2. Update subTiers if present
    if (Array.isArray(projectData.subTiers)) {
      this.activeProject.subTiers = normalizeSubTiers(projectData.subTiers);
    }

    // 3. Update column orders if present
    if (Array.isArray(projectData.columnOrder)) {
      this.activeProject.columnOrder = projectData.columnOrder;
    }
    if (Array.isArray(projectData.hiddenColumns)) {
      this.activeProject.hiddenColumns = projectData.hiddenColumns;
    }

    // 4. Update segments if present
    if (Array.isArray(candidateSegments)) {
      const spkList = this.activeProject.speakers || [
        { id: 1, name: 'Speaker 1', initials: 'S1' },
      ];
      const spkMap = new Map(spkList.map((s) => [Number(s.id), s]));
      const defaultSpk = spkList[0] || {
        id: 1,
        name: 'Speaker 1',
        initials: 'S1',
      };

      const normalizedSegments = candidateSegments.map((s, idx) => {
        const segStart = Number(s.start) || 0;
        const segEnd = Number(s.end) || segStart + 1;
        let spkId = Number(s.speakerId);
        if (!spkId && s.speaker) {
          const m = String(s.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
          if (m) spkId = Number(m[1]);
        }
        if (!spkId) spkId = 1;
        const matchedSpk = spkMap.get(spkId) || defaultSpk;

        return {
          id: s.id || `seg_${idx + 1}`,
          start: Number(segStart.toFixed(3)),
          end: Number(segEnd.toFixed(3)),
          text: s.text ? String(s.text).trim() : '',
          speakerId: Number(matchedSpk.id),
          speaker: matchedSpk.name || `Speaker ${matchedSpk.id}`,
          subTiers:
            s.subTiers && typeof s.subTiers === 'object' ? s.subTiers : {},
        };
      });

      transcriptState.segments = normalizedSegments;
      this.activeProject.segments = normalizedSegments;
      if (transcriptState.fullResult) {
        transcriptState.fullResult.segments = normalizedSegments;
      }
    }

    // 5. Update full text transcript if present
    const transcriptText = projectData.transcript || parsed.text || '';
    if (transcriptText) {
      transcriptState.transcript = transcriptText;
      this.activeProject.transcript = transcriptText;
    }

    // 6. Update text direction if present
    if (projectData.textDirection) {
      transcriptState.textDirection = projectData.textDirection;
      this.activeProject.textDirection = projectData.textDirection;
    }

    // 7. Persist immediately to IndexedDB and update waveform display
    await this.persistActiveProjectNow();
    transcriptState.notifySegmentsChange();
    requestAnimationFrame(() => transcriptState.drawVerticalWaveform());

    appState.statusMessage = `Successfully imported annotations from "${file.name}"!`;
    return this.activeProject;
  }
}

export const projectState = new ProjectState();
