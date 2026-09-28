<script>
  import { onMount } from 'svelte';
  import { appState } from './state/appState.svelte.js';
  import { modelState } from './state/modelState.svelte.js';
  import { audioState } from './state/audioState.svelte.js';
  import { transcriptState } from './state/transcriptState.svelte.js';
  import { projectState } from './state/projectState.svelte.js';
  import { router } from './services/router.svelte.js';

  import HomePage from './pages/HomePage.svelte';
  import TranscriberPage from './pages/TranscriberPage.svelte';
  import DatasetBuilderPage from './pages/DatasetBuilderPage.svelte';
  import ModelsPage from './pages/ModelsPage.svelte';
  import GuidePage from './pages/GuidePage.svelte';
  import ProjectManagerModal from './components/project/ProjectManagerModal.svelte';
  import NewProjectModal from './components/project/NewProjectModal.svelte';
  import ProjectSettingsModal from './components/project/ProjectSettingsModal.svelte';
  import ElanImportModal from './components/project/ElanImportModal.svelte';
  import SegmentWarningModal from './components/main/SegmentWarningModal.svelte';
  import Footer from './components/Footer.svelte';

  // Maps a worker message `type` to its handler, so initWorker's onmessage is a
  // lookup instead of an ever-growing if/else chain over the worker protocol.
  const WORKER_MESSAGE_HANDLERS = {
    status: (payload) => {
      appState.statusMessage = payload.message;
    },
    progress: (payload) => {
      appState.handleWorkerProgress(payload);
      if (payload.modelId) {
        modelState.handleModelDownloadProgress(payload);
      }
    },
    model_download_progress: (payload) => {
      modelState.handleModelDownloadProgress(payload);
      appState.handleWorkerProgress(payload);
    },
    model_download_complete: (payload) => {
      modelState.handleModelDownloadComplete(payload);
      appState.downloadProgress = null;
    },
    model_download_error: (payload) => {
      modelState.handleModelDownloadError(payload);
      appState.downloadProgress = null;
    },
    loaded: (payload) => {
      modelState.isModelLoaded = true;
      modelState.isModelLoading = false;
      if (payload.activeDevice) {
        modelState.activeDevice = payload.activeDevice;
      }
      modelState.checkAllModelsCached();
      appState.downloadProgress = null;
      const devTag =
        payload.activeDevice === 'webgpu' ? ' (⚡ WebGPU)' : ' (💻 CPU WASM)';
      appState.statusMessage = `Model loaded successfully in ${payload.modelLoadTime.toFixed(2)}s${devTag}!`;
    },
    unloaded: () => {
      modelState.isModelLoaded = false;
      modelState.isModelLoading = false;
    },
    vad_regions: (payload) => {
      transcriptState.handleVadRegions(payload);
    },
    transcribing_segment: (payload) => {
      transcriptState.currentTranscribingSegment = payload;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    },
    transcribing_single_segment: (payload) => {
      transcriptState.currentTranscribingSegment = payload;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    },
    segment_transcribed: (payload) => {
      transcriptState.handleSingleSegmentTranscribed(payload);
    },
    segment_transcribe_error: (payload) => {
      transcriptState.handleSingleSegmentTranscribeError(payload);
    },
    segment_result: (payload) => {
      transcriptState.handleSegmentResult(payload);
    },
    batch_transcription_complete: (payload) => {
      transcriptState.handleBatchTranscriptionComplete(payload);
    },
    diarize_result: (payload) => {
      transcriptState.handleDiarizeResult(payload);
    },
    result: (payload) => {
      transcriptState.handleWorkerResult(payload);
    },
    error: (payload) => {
      appState.handleWorkerError(payload.message);
    },
  };

  function initWorker() {
    if (appState.worker) {
      try {
        appState.worker.terminate();
      } catch (err) {
        console.error('[Main UI] Error terminating worker:', err);
      }
      appState.worker = null;
    }

    appState.worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });

    appState.worker.onmessage = (event) => {
      const { type, payload } = event.data;
      if (import.meta.env.DEV) {
        console.log('[Main UI] Received from worker:', type, payload);
      }
      const handler = WORKER_MESSAGE_HANDLERS[type];
      if (handler) {
        handler(payload);
      }
    };

    appState.worker.onerror = (err) => {
      console.error('[Main UI] Worker error event:', err);
      appState.handleWorkerError(
        err.message || 'An error occurred inside the Web Worker.',
      );
    };
  }

  onMount(() => {
    appState.initEnvironment();

    initWorker();

    projectState.init();
    modelState.init();
    transcriptState.onSegmentsChange = () => {
      projectState.saveCurrentProjectDebounced();
    };

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().then((success) => {
              if (success) {
                console.log(
                  '[Main UI] Unregistered dev Service Worker:',
                  reg.scope,
                );
              }
            });
          }
        });
        if (typeof caches !== 'undefined') {
          caches.keys().then((keys) => {
            for (const key of keys) {
              if (key.startsWith('easper-web-')) {
                caches.delete(key);
              }
            }
          });
        }
      } else {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log(
              '[Main UI] Service Worker registered with scope:',
              reg.scope,
            );
          })
          .catch((err) => {
            console.warn('[Main UI] Service Worker registration failed:', err);
          });
      }
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      appState.deferredInstallPrompt = e;
      appState.isInstallable = true;
    };

    const handleAppInstalled = () => {
      appState.deferredInstallPrompt = null;
      appState.isInstallable = false;
      appState.isAppInstalled = true;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const handleGlobalClick = (e) => {
      if (
        transcriptState.contextMenu.visible &&
        !e.target.closest('.waveform-context-menu')
      ) {
        transcriptState.closeContextMenu();
      }
    };
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape' && transcriptState.contextMenu.visible) {
        transcriptState.closeContextMenu();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (appState.worker) {
        appState.worker.terminate();
      }
      if (audioState.intervalPlayCleanup) {
        audioState.intervalPlayCleanup();
        audioState.intervalPlayCleanup = null;
      }
      audioState.stopRecordingCleanup();
      if (audioState.fileAudioUrl) {
        URL.revokeObjectURL(audioState.fileAudioUrl);
      }
      if (audioState.recordedAudioUrl) {
        URL.revokeObjectURL(audioState.recordedAudioUrl);
      }
      if (audioState.recordedWavDownloadUrl) {
        URL.revokeObjectURL(audioState.recordedWavDownloadUrl);
      }
    };
  });

  $effect(() => {
    if (router.currentRoute === 'home') {
      projectState.currentView = 'home';
    } else if (router.currentRoute === 'transcriber') {
      projectState.currentView = 'workspace';
    } else if (router.currentRoute === 'dataset-builder') {
      projectState.currentView = 'dataset';
    } else if (router.currentRoute === 'guide') {
      projectState.currentView = 'guide';
    }
  });
</script>

<main
  class="container {router.currentRoute === 'transcriber'
    ? 'container-studio'
    : ''} {router.currentRoute === 'home' ? 'container-landing' : ''}"
>
  {#if router.currentRoute === 'home'}
    <HomePage />
  {:else if router.currentRoute === 'transcriber'}
    <TranscriberPage projectId={router.params.id} onWorkerReset={initWorker} />
  {:else if router.currentRoute === 'dataset-builder'}
    <DatasetBuilderPage />
  {:else if router.currentRoute === 'models'}
    <ModelsPage />
  {:else if router.currentRoute === 'guide'}
    <GuidePage />
  {:else}
    <HomePage />
  {/if}

  {#if router.currentRoute !== 'home'}
    <Footer />
  {/if}

  <ProjectManagerModal />
  <NewProjectModal />
  <ProjectSettingsModal />
  <ElanImportModal />
  <SegmentWarningModal />
</main>
