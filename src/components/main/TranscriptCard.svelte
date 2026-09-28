<script>
  import { appState } from '../../state/appState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import WaveformDualView from './WaveformDualView.svelte';

  let { onWorkerReset } = $props();
  let jsonFileInputEl = $state(null);
  let isExportMenuOpen = $state(false);
  let exportMenuContainer = $state(null);

  function toggleExportMenu(e) {
    e.stopPropagation();
    isExportMenuOpen = !isExportMenuOpen;
  }

  function closeExportMenu() {
    isExportMenuOpen = false;
  }

  $effect(() => {
    if (!isExportMenuOpen) return;

    function handlePointerDown(e) {
      if (exportMenuContainer && !exportMenuContainer.contains(e.target)) {
        isExportMenuOpen = false;
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        isExportMenuOpen = false;
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  async function handleJsonFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        alert(
          'Only JSON files (.json) can be imported here.\n\nTo import full project packages with audio (.easper / .zip), please use the Project Manager.',
        );
        return;
      }
      if (!projectState.activeProject) {
        alert(
          'Please open or create a project first before importing JSON annotations.',
        );
        return;
      }
      await projectState.importJsonToActiveProject(file);
    } catch (err) {
      console.error('[TranscriptCard] Failed to import JSON:', err);
      alert('Failed to import JSON: ' + (err?.message || err));
    } finally {
      if (e.target) e.target.value = '';
    }
  }

  const canExportText = $derived(
    (Boolean(transcriptState.transcript) ||
      transcriptState.segments.length > 0) &&
      !appState.isProcessing,
  );
  const canExportJson = $derived(
    (Boolean(transcriptState.fullResult) ||
      transcriptState.segments.length > 0 ||
      Boolean(transcriptState.transcript)) &&
      !appState.isProcessing,
  );
  const canExportAudio = $derived(
    Boolean(
      transcriptState.waveformState ||
        audioState.selectedFile ||
        audioState.recordedBlob ||
        projectState.activeProject,
    ) && !appState.isProcessing,
  );
  const canExportArchive = $derived(
    Boolean(projectState.activeProject) && !appState.isProcessing,
  );
</script>

<section
  class="card main-card transcript-card {transcriptState.textDirection === 'rtl'
    ? 'direction-rtl'
    : 'direction-ltr'}"
>
  <div class="section-header">
    <div class="section-title">
      <h2><i class="fa-solid fa-comments"></i> Transcript</h2>
    </div>
    <div class="transcript-header-actions">
      <div class="transcript-actions-bar">
        <!-- Unified Export Dropdown Menu -->
        <div class="export-dropdown-container" bind:this={exportMenuContainer}>
          <button
            type="button"
            class="btn-export-menu-trigger {isExportMenuOpen ? 'active' : ''}"
            onclick={toggleExportMenu}
            aria-expanded={isExportMenuOpen}
            aria-haspopup="menu"
            title="Export transcript in various formats"
          >
            <i class="fa-solid fa-file-export"></i>
            <span>Export</span>
            <i
              class="fa-solid fa-chevron-down caret-icon {isExportMenuOpen
                ? 'rotated'
                : ''}"
            ></i>
          </button>

          {#if isExportMenuOpen}
            <div class="export-dropdown-menu" role="menu">
              <div class="dropdown-category-title">
                <i class="fa-solid fa-file-lines"></i>
                <span>Annotations &amp; Captions</span>
              </div>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  transcriptState.exportEaf();
                  closeExportMenu();
                }}
                disabled={!canExportText}
                title="Export ELAN annotation document (.eaf) with speaker tiers"
              >
                <div class="item-icon-box icon-eaf">
                  <i class="fa-solid fa-file-code"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">ELAN Annotation (.eaf)</div>
                  <div class="item-desc">
                    Multi-tier annotation for field linguistics
                  </div>
                </div>
              </button>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  transcriptState.exportSrt();
                  closeExportMenu();
                }}
                disabled={!canExportText}
                title="Export SubRip subtitle format (.srt)"
              >
                <div class="item-icon-box icon-srt">
                  <i class="fa-solid fa-closed-captioning"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">SubRip Subtitles (.srt)</div>
                  <div class="item-desc">
                    Timed subtitle captions with timestamps
                  </div>
                </div>
              </button>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  transcriptState.exportTxt();
                  closeExportMenu();
                }}
                disabled={!canExportText}
                title="Export plain text transcript (.txt)"
              >
                <div class="item-icon-box icon-txt">
                  <i class="fa-solid fa-file-lines"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">Plain Text (.txt)</div>
                  <div class="item-desc">Continuous plain text transcript</div>
                </div>
              </button>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  transcriptState.exportJson();
                  closeExportMenu();
                }}
                disabled={!canExportJson}
                title="Export full project metadata and transcription JSON (.json)"
              >
                <div class="item-icon-box icon-json">
                  <i class="fa-solid fa-code"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">Transcript Data (.json)</div>
                  <div class="item-desc">
                    Dialogue segments, speaker tiers &amp; metadata
                  </div>
                </div>
              </button>

              <div class="dropdown-menu-separator"></div>
              <div class="dropdown-category-title">
                <i class="fa-solid fa-photo-film"></i>
                <span>Media &amp; Project</span>
              </div>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  transcriptState.exportAudio();
                  closeExportMenu();
                }}
                disabled={!canExportAudio}
                title="Export converted 16kHz mono WAV audio file (.wav)"
              >
                <div class="item-icon-box icon-audio">
                  <i class="fa-solid fa-music"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">Audio File (.wav)</div>
                  <div class="item-desc">
                    Converted 16kHz mono PCM WAV audio
                  </div>
                </div>
              </button>

              <button
                type="button"
                class="export-menu-item"
                role="menuitem"
                onclick={() => {
                  projectState.saveActiveProjectPackage();
                  closeExportMenu();
                }}
                disabled={!canExportArchive}
                title="Archive complete project package (.easper) with audio, segments, and speakers"
              >
                <div class="item-icon-box icon-archive">
                  <i class="fa-solid fa-box-archive"></i>
                </div>
                <div class="item-text-box">
                  <div class="item-title">Project Archive (.easper)</div>
                  <div class="item-desc">
                    Complete bundle with audio &amp; annotations
                  </div>
                </div>
              </button>
            </div>
          {/if}
        </div>

        <!-- Import JSON Only Button -->
        <button
          type="button"
          class="btn-import-json"
          onclick={() => jsonFileInputEl?.click()}
          disabled={!projectState.activeProject || appState.isProcessing}
          title="Import dialogue segments and metadata from a .json file into this project"
        >
          <i class="fa-solid fa-file-import"></i>
          <span>Import JSON</span>
        </button>
        <input
          type="file"
          accept=".json,application/json"
          bind:this={jsonFileInputEl}
          onchange={handleJsonFileSelected}
          style="display: none;"
        />
      </div>
    </div>
  </div>

  <WaveformDualView {onWorkerReset} />
</section>
