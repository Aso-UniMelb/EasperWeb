<script>
  import { untrack } from 'svelte';
  import { appState } from '../state/appState.svelte.js';
  import { projectState } from '../state/projectState.svelte.js';
  import { modelState } from '../state/modelState.svelte.js';
  import { audioState } from '../state/audioState.svelte.js';
  import { transcriptState } from '../state/transcriptState.svelte.js';
  import { router } from '../services/router.svelte.js';
  import { lexiconState } from '../state/lexiconState.svelte.js';

  // The transcriber is the one view that trades the tab bar for project controls
  let isStudio = $derived(router.currentRoute === 'transcriber');

  let jsonFileInputEl = $state(null);
  let isProjectMenuOpen = $state(false);
  let projectMenuContainer = $state(null);
  let isExportMenuOpen = $state(false);
  let exportMenuContainer = $state(null);
  let isAutomationMenuOpen = $state(false);
  let automationMenuContainer = $state(null);

  function toggleProjectMenu(e) {
    if (e) e.stopPropagation();
    isProjectMenuOpen = !isProjectMenuOpen;
    if (isProjectMenuOpen) {
      isExportMenuOpen = false;
      isAutomationMenuOpen = false;
    }
  }

  function closeProjectMenu() {
    isProjectMenuOpen = false;
  }

  function toggleExportMenu(e) {
    e.stopPropagation();
    isExportMenuOpen = !isExportMenuOpen;
    if (isExportMenuOpen) {
      isProjectMenuOpen = false;
      isAutomationMenuOpen = false;
    }
  }

  function closeExportMenu() {
    isExportMenuOpen = false;
  }

  function toggleAutomationMenu(e) {
    if (e) e.stopPropagation();
    isAutomationMenuOpen = !isAutomationMenuOpen;
    if (isAutomationMenuOpen) {
      isProjectMenuOpen = false;
      isExportMenuOpen = false;
    }
  }

  function selectAutomationTool(tool) {
    transcriptState.toggleDrawer(tool);
    isAutomationMenuOpen = false;
  }

  $effect(() => {
    if (!isProjectMenuOpen && !isExportMenuOpen && !isAutomationMenuOpen) return;

    function handlePointerDown(e) {
      if (
        isProjectMenuOpen &&
        projectMenuContainer &&
        !projectMenuContainer.contains(e.target)
      ) {
        isProjectMenuOpen = false;
      }
      if (
        isExportMenuOpen &&
        exportMenuContainer &&
        !exportMenuContainer.contains(e.target)
      ) {
        isExportMenuOpen = false;
      }
      if (
        isAutomationMenuOpen &&
        automationMenuContainer &&
        !automationMenuContainer.contains(e.target)
      ) {
        isAutomationMenuOpen = false;
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        isProjectMenuOpen = false;
        isExportMenuOpen = false;
        isAutomationMenuOpen = false;
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
      console.error('[Header] Failed to import JSON:', err);
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

  let projectLexicon = $derived(
    projectState.activeProject?.lexiconId
      ? lexiconState.lexicons.find(
          (l) => l.id === projectState.activeProject.lexiconId,
        ) || null
      : null,
  );

  $effect(() => {
    if (projectState.activeProject?.lexiconId) {
      if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
        lexiconState.init();
      }
    }
  });

  function handleGoToLexicon() {
    const lexId = projectState.activeProject?.lexiconId;
    if (lexId) {
      router.navigate(`/lexicon/${lexId}`);
    } else {
      router.navigate('/lexicon');
    }
  }

  function handleOpenActiveLexiconInNewTab() {
    const lexId = projectState.activeProject?.lexiconId;
    const targetPath = lexId ? `/lexicon/${lexId}` : '/lexicon';
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const href =
      typeof window !== 'undefined' && window.location.hash.startsWith('#/')
        ? `#${targetPath}`
        : `${base}${targetPath}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  let isDrawerOpen = $state(false);

  function openDrawer() {
    isDrawerOpen = true;
  }

  function closeDrawer() {
    isDrawerOpen = false;
  }

  function toggleDrawer() {
    isDrawerOpen = !isDrawerOpen;
  }

  // Manage body scroll locking when drawer is open
  $effect(() => {
    if (typeof document === 'undefined') return;
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  });

  // Automatically close drawer ONLY when route actually changes
  let lastRoute = router.currentRoute;
  $effect(() => {
    const currentRoute = router.currentRoute;
    if (currentRoute !== lastRoute) {
      lastRoute = currentRoute;
      untrack(() => {
        isDrawerOpen = false;
      });
    }
  });

  function handleWindowResize() {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth > 860 &&
      isDrawerOpen
    ) {
      closeDrawer();
    }
  }

  function handleWindowKeyDown(e) {
    if (e.key === 'Escape' && isDrawerOpen) {
      closeDrawer();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} onresize={handleWindowResize} />

<header class="easper-header">
  <div class="header-left">
    <div
      class="header-branding cursor-pointer"
      onclick={() => projectState.goToHome()}
      role="button"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') projectState.goToHome();
      }}
      title="Click to return to Projects Starting Page"
    >
      <div class="header-icon-wrap">
        <img src="/icon.png" alt="Easper Logo" class="app-logo-img" />
      </div>
      {#if router.currentRoute === 'home'}
        <div>
          <p class="subtitle">
            A Portable ASR Workflow for Field Linguists &bull;
            <a
              href="https://github.com/Aso-UniMelb/Easper"
              target="_blank"
              rel="noopener noreferrer"
              class="repo-link"
              onclick={(e) => e.stopPropagation()}
            >
              <i class="fa-brands fa-github"></i> Aso-UniMelb/Easper
            </a>
            &bull;
            <a
              href="https://arxiv.org/abs/2608.11629"
              target="_blank"
              rel="noopener noreferrer"
              class="repo-link"
              onclick={(e) => e.stopPropagation()}
              title="Easper: An Accessible ASR Pipeline for Language Documentation (arXiv:2608.11629)"
            >
              <i class="fa-solid fa-graduation-cap"></i> Paper (arXiv:2608.11629)
            </a>
          </p>
        </div>
      {/if}
    </div>

    <!-- Active Project Menu in Workspace / Transcriber View -->
    {#if router.currentRoute === 'transcriber' && projectState.activeProject}
      <div class="project-dropdown-container" bind:this={projectMenuContainer}>
        <button
          type="button"
          class="btn-project-menu-trigger {isProjectMenuOpen ? 'active' : ''}"
          onclick={toggleProjectMenu}
          aria-expanded={isProjectMenuOpen}
          aria-haspopup="menu"
          title="Project menu: {projectState.activeProject.title}"
        >
          <i class="fa-solid fa-folder-open project-menu-icon"></i>
          <span class="project-menu-title"
            >{projectState.activeProject.title}</span
          >
          <i
            class="fa-solid fa-chevron-down caret-icon {isProjectMenuOpen
              ? 'rotated'
              : ''}"
          ></i>
        </button>

        {#if isProjectMenuOpen}
          <div class="project-dropdown-menu" role="menu">
            <button
              type="button"
              class="export-menu-item"
              role="menuitem"
              onclick={() => {
                closeProjectMenu();
                router.navigate('/transcriber');
              }}
              title="Return to Project Manager"
            >
              <div class="item-icon-box icon-projects">
                <i class="fa-solid fa-folder-tree"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title">Back to Project Manager</div>
                <div class="item-desc">View and manage all saved projects</div>
              </div>
            </button>

            <button
              type="button"
              class="export-menu-item"
              role="menuitem"
              onclick={() => {
                closeProjectMenu();
                projectState.isProjectSettingsOpen = true;
              }}
              title="Project settings, speakers & sub-tiers"
            >
              <div class="item-icon-box icon-settings">
                <i class="fa-solid fa-gear"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title">Project Settings</div>
                <div class="item-desc">
                  Rename project, configure speakers &amp; sub-tiers
                </div>
              </div>
            </button>

            <button
              type="button"
              class="export-menu-item"
              role="menuitem"
              onclick={() => {
                closeProjectMenu();
                handleOpenActiveLexiconInNewTab();
              }}
              title={projectLexicon
                ? `Open active lexicon (${projectLexicon.title || projectLexicon.name}) in a new tab`
                : 'Open Lexicon Manager in a new tab'}
            >
              <div class="item-icon-box icon-lexicon">
                <i class="fa-solid fa-book"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title">
                  Active Lexicon
                  <i
                    class="fa-solid fa-arrow-up-right-from-square external-link-icon"
                  ></i>
                </div>
                <div class="item-desc">
                  {projectLexicon
                    ? `${projectLexicon.title || projectLexicon.name} (opens in new tab)`
                    : 'Open Lexicon Manager in new tab'}
                </div>
              </div>
            </button>
          </div>
        {/if}
      </div>

      <!-- Unified Export/Import Dropdown Menu -->
      <div class="export-dropdown-container" bind:this={exportMenuContainer}>
        <button
          type="button"
          class="btn-export-menu-trigger {isExportMenuOpen ? 'active' : ''}"
          onclick={toggleExportMenu}
          aria-expanded={isExportMenuOpen}
          aria-haspopup="menu"
          title="Export or import transcript and project files"
        >
          <i class="fa-solid fa-file-export"></i>
          <span>Export/Import</span>
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

            <div class="dropdown-menu-separator"></div>
            <div class="dropdown-category-title">
              <i class="fa-solid fa-file-import"></i>
              <span>Import into Project</span>
            </div>

            <button
              type="button"
              class="export-menu-item"
              role="menuitem"
              onclick={() => {
                closeExportMenu();
                projectState.requestImportElanToActiveProject();
              }}
              disabled={!projectState.activeProject || appState.isProcessing}
              title="Replace current segments and import speakers, sub-tiers, and utterances from an ELAN (.eaf) file"
            >
              <div class="item-icon-box icon-import-eaf">
                <i class="fa-solid fa-file-waveform"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title">Import ELAN (.eaf)</div>
                <div class="item-desc">
                  Replace segments &amp; configure tiers from ELAN
                </div>
              </div>
            </button>

            <button
              type="button"
              class="export-menu-item"
              role="menuitem"
              onclick={() => {
                closeExportMenu();
                jsonFileInputEl?.click();
              }}
              disabled={!projectState.activeProject || appState.isProcessing}
              title="Import dialogue segments and metadata from a .json file into this project"
            >
              <div class="item-icon-box icon-import-json">
                <i class="fa-solid fa-file-import"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title">Import JSON</div>
                <div class="item-desc">
                  Import segments and annotations from a .json file
                </div>
              </div>
            </button>
          </div>
        {/if}
      </div>

      <input
        type="file"
        accept=".json,application/json"
        bind:this={jsonFileInputEl}
        onchange={handleJsonFileSelected}
        style="display: none;"
      />

      <!-- Automation Tools Dropdown Collection -->
      <div
        class="automation-dropdown-container"
        bind:this={automationMenuContainer}
      >
        <button
          type="button"
          class="btn-automation-menu-trigger {isAutomationMenuOpen
            ? 'active'
            : ''} {transcriptState.activeDrawer ? 'drawer-active' : ''}"
          onclick={toggleAutomationMenu}
          aria-expanded={isAutomationMenuOpen}
          title="Automation tools: Auto Segmentation, Speech Recognition, Auto Tagging, and Find & Replace"
        >
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>Automation Tools</span>
          <i
            class="fa-solid fa-chevron-down caret-icon {isAutomationMenuOpen
              ? 'rotated'
              : ''}"
          ></i>
        </button>

        {#if isAutomationMenuOpen}
          <div class="automation-dropdown-menu" role="menu">
            <div class="dropdown-category-title">
              <i class="fa-solid fa-bolt"></i>
              <span>AI &amp; Automation</span>
            </div>

            <!-- Auto Segmentation -->
            <button
              type="button"
              class="automation-menu-item {transcriptState.activeDrawer ===
              'segmentation'
                ? 'active-item'
                : ''}"
              role="menuitem"
              onclick={() => selectAutomationTool('segmentation')}
              title="Automatic speech segmentation (Silero VAD or uniform intervals)"
            >
              <div class="item-icon-box icon-segmentation">
                <i class="fa-solid fa-scissors"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title-row">
                  <span class="item-title">Auto Segmentation</span>
                  {#if transcriptState.activeDrawer === 'segmentation'}
                    <span class="item-status-pill">Active</span>
                  {/if}
                </div>
                <div class="item-desc">
                  Detect speech boundaries with Silero VAD or uniform intervals
                </div>
              </div>
            </button>

            <!-- Speech Recognition -->
            <button
              type="button"
              class="automation-menu-item {transcriptState.activeDrawer ===
              'recognition'
                ? 'active-item'
                : ''}"
              role="menuitem"
              onclick={() => selectAutomationTool('recognition')}
              title="Speech recognition model settings and execution"
            >
              <div class="item-icon-box icon-recognition">
                <i class="fa-solid fa-brain"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title-row">
                  <span class="item-title">Speech Recognition</span>
                  {#if transcriptState.emptySegmentsCount > 0}
                    <span
                      class="tool-count-badge"
                      title="{transcriptState.emptySegmentsCount} segments awaiting transcription"
                    >
                      {transcriptState.emptySegmentsCount}
                    </span>
                  {/if}
                  {#if transcriptState.activeDrawer === 'recognition'}
                    <span class="item-status-pill">Active</span>
                  {/if}
                </div>
                <div class="item-desc">
                  Transcribe speech to text using Whisper ONNX models
                </div>
              </div>
            </button>

            <!-- Auto Tagging -->
            <button
              type="button"
              class="automation-menu-item {transcriptState.activeDrawer ===
              'tagging'
                ? 'active-item'
                : ''}"
              role="menuitem"
              onclick={() => selectAutomationTool('tagging')}
              title="Automatically tag word-level sub-tiers from active lexicon"
            >
              <div class="item-icon-box icon-tagging">
                <i class="fa-solid fa-tags"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title-row">
                  <span class="item-title">Auto Tagging</span>
                  {#if transcriptState.activeDrawer === 'tagging'}
                    <span class="item-status-pill">Active</span>
                  {/if}
                </div>
                <div class="item-desc">
                  Automatically annotate word tokens from project lexicons
                </div>
              </div>
            </button>

            <!-- Find & Replace -->
            <button
              type="button"
              class="automation-menu-item {transcriptState.activeDrawer ===
              'find-replace'
                ? 'active-item'
                : ''}"
              role="menuitem"
              onclick={() => selectAutomationTool('find-replace')}
              title="Find and replace text across transcription tiers and sub-tiers"
            >
              <div class="item-icon-box icon-find-replace">
                <i class="fa-solid fa-arrow-right-arrow-left"></i>
              </div>
              <div class="item-text-box">
                <div class="item-title-row">
                  <span class="item-title">Find &amp; Replace</span>
                  {#if transcriptState.activeDrawer === 'find-replace'}
                    <span class="item-status-pill">Active</span>
                  {/if}
                </div>
                <div class="item-desc">
                  Search and replace text in main transcription and sub-tiers
                </div>
              </div>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- The studio needs the width for the transcript, and its own controls cover
       everything the tabs offer, so the tab bar is dropped there. The logo still
       goes home, which is where the other apps are reached from. -->
  {#if !isStudio}
    <nav class="header-nav" aria-label="Page Navigation">
      <button
        type="button"
        class="nav-tab {router.currentRoute === 'home' ? 'active' : ''}"
        onclick={() => projectState.goToHome()}
        title="Projects & Starting Page"
      >
        <i class="fa-solid fa-house"></i>
        <span>Home</span>
      </button>

      <button
        type="button"
        class="nav-tab {router.currentRoute === 'transcriber' ? 'active' : ''}"
        onclick={() => projectState.goToWorkspace()}
        title="Audio Transcription Studio"
      >
        <i class="fa-solid fa-microphone"></i>
        <span>Transcriber</span>
        {#if projectState.activeProject?.numericId && router.currentRoute === 'transcriber'}
          <span class="nav-id-bubble"
            >#{projectState.activeProject.numericId}</span
          >
        {/if}
      </button>

      <button
        type="button"
        class="nav-tab {router.currentRoute === 'dataset-builder'
          ? 'active'
          : ''}"
        onclick={() => projectState.goToDataset()}
        title="ASR Model Fine-Tuning Dataset Builder"
      >
        <i class="fa-solid fa-database"></i>
        <span>Dataset Builder</span>
      </button>

      <button
        type="button"
        class="nav-tab {router.currentRoute === 'models' ? 'active' : ''}"
        onclick={() => modelState.openModelManager()}
        title="Speech Recognition Model Management"
      >
        <i class="fa-solid fa-brain"></i>
        <span>Models</span>
      </button>

      <button
        type="button"
        class="nav-tab {router.currentRoute === 'lexicons' ? 'active' : ''}"
        onclick={() => router.navigate('/lexicon')}
        title="Lexicon Management System"
      >
        <i class="fa-solid fa-book-bookmark"></i>
        <span>Lexicons</span>
      </button>

      <button
        type="button"
        class="nav-tab {router.currentRoute === 'guide' ? 'active' : ''}"
        onclick={() => projectState.goToGuide()}
        title="Documentation & Guides"
      >
        <i class="fa-solid fa-book"></i>
        <span>Guide</span>
      </button>
    </nav>
  {/if}

  <div class="header-badges">
    <!-- Mobile Drawer Menu Toggle -->
    <button
      type="button"
      class="btn-drawer-toggle"
      onclick={(e) => {
        e.stopPropagation();
        toggleDrawer();
      }}
      aria-label={isDrawerOpen
        ? 'Close navigation menu'
        : 'Open navigation menu'}
      aria-expanded={isDrawerOpen}
      title="Navigation menu"
    >
      <i class="fa-solid {isDrawerOpen ? 'fa-xmark' : 'fa-bars'}"></i>
    </button>
  </div>
</header>

{#if isDrawerOpen}
  <!-- Backdrop Overlay -->
  <div
    class="drawer-backdrop"
    onclick={closeDrawer}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') closeDrawer();
    }}
    aria-label="Close navigation drawer"
  ></div>

  <!-- Mobile Drawer Menu -->
  <div
    class="drawer-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Mobile Navigation Drawer"
  >
    <!-- Drawer Header -->
    <div class="drawer-header">
      <div
        class="drawer-brand"
        onclick={() => {
          closeDrawer();
          projectState.goToHome();
        }}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            closeDrawer();
            projectState.goToHome();
          }
        }}
      >
        <div class="drawer-logo-wrap">
          <img src="/icon.png" alt="Easper Logo" class="drawer-logo-img" />
        </div>
        <div>
          <span class="drawer-brand-title">Easper</span>
          <span class="drawer-brand-desc">Portable ASR Workflow</span>
        </div>
      </div>
      <button
        type="button"
        class="drawer-close-btn"
        onclick={closeDrawer}
        aria-label="Close menu"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- Drawer Navigation Links -->
    <nav class="drawer-nav" aria-label="Mobile Navigation">
      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'home' ? 'active' : ''}"
        onclick={() => {
          projectState.goToHome();
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-house"></i>
        </div>
        <div class="drawer-item-content">
          <span class="drawer-item-title">Home</span>
          <span class="drawer-item-sub">Projects &amp; Starting Page</span>
        </div>
      </button>

      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'transcriber'
          ? 'active'
          : ''}"
        onclick={() => {
          projectState.goToWorkspace();
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-microphone"></i>
        </div>
        <div class="drawer-item-content">
          <div class="drawer-item-row">
            <span class="drawer-item-title">Transcriber</span>
            {#if projectState.activeProject?.numericId}
              <span class="nav-id-bubble"
                >#{projectState.activeProject.numericId}</span
              >
            {/if}
          </div>
          <span class="drawer-item-sub">Audio Studio &amp; Timings</span>
        </div>
      </button>

      {#if router.currentRoute === 'transcriber' && projectState.activeProject}
        <div class="drawer-project-actions">
          <button
            type="button"
            class="drawer-subaction-btn"
            onclick={() => {
              closeDrawer();
              router.navigate('/transcriber');
            }}
          >
            <i class="fa-solid fa-folder-tree"></i>
            <span>All Projects</span>
          </button>
          <button
            type="button"
            class="drawer-subaction-btn"
            onclick={() => {
              closeDrawer();
              projectState.isProjectSettingsOpen = true;
            }}
          >
            <i class="fa-solid fa-gear"></i>
            <span>Project Settings</span>
          </button>
          <button
            type="button"
            class="drawer-subaction-btn"
            onclick={() => {
              closeDrawer();
              handleGoToLexicon();
            }}
            title={projectLexicon
              ? `Open active lexicon: ${projectLexicon.title || projectLexicon.name}`
              : 'Open Lexicon Manager'}
          >
            <i class="fa-solid fa-book"></i>
            <span>{projectLexicon ? `Lexicon: ${projectLexicon.title || projectLexicon.name}` : 'Lexicons'}</span>
          </button>
        </div>
      {/if}

      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'dataset-builder'
          ? 'active'
          : ''}"
        onclick={() => {
          projectState.goToDataset();
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-database"></i>
        </div>
        <div class="drawer-item-content">
          <span class="drawer-item-title">Dataset Builder</span>
          <span class="drawer-item-sub">Fine-tuning dataset prep</span>
        </div>
      </button>

      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'models'
          ? 'active'
          : ''}"
        onclick={() => {
          modelState.openModelManager();
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-brain"></i>
        </div>
        <div class="drawer-item-content">
          <span class="drawer-item-title">Models</span>
          <span class="drawer-item-sub">Speech Recognition &amp; VAD</span>
        </div>
      </button>

      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'lexicons'
          ? 'active'
          : ''}"
        onclick={() => {
          router.navigate('/lexicon');
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-book-bookmark"></i>
        </div>
        <div class="drawer-item-content">
          <span class="drawer-item-title">Lexicons</span>
          <span class="drawer-item-sub">Dictionaries &amp; Vocabularies</span>
        </div>
      </button>

      <button
        type="button"
        class="drawer-nav-item {router.currentRoute === 'guide'
          ? 'active'
          : ''}"
        onclick={() => {
          projectState.goToGuide();
          closeDrawer();
        }}
      >
        <div class="drawer-item-icon-box">
          <i class="fa-solid fa-book"></i>
        </div>
        <div class="drawer-item-content">
          <span class="drawer-item-title">Guide</span>
          <span class="drawer-item-sub">Documentation for linguists</span>
        </div>
      </button>
    </nav>

    <!-- Drawer Footer -->
    <div class="drawer-footer">
      {#if appState.isInstallable}
        <button
          type="button"
          class="drawer-install-btn"
          onclick={() => {
            closeDrawer();
            appState.handleInstallApp();
          }}
        >
          <i class="fa-solid fa-download"></i>
          <span>Install Easper App</span>
        </button>
      {/if}

      <div class="drawer-ext-links">
        <a
          href="https://github.com/Aso-UniMelb/Easper"
          target="_blank"
          rel="noopener noreferrer"
          class="drawer-ext-link"
        >
          <i class="fa-brands fa-github"></i>
          <span>GitHub</span>
        </a>
        <a
          href="https://arxiv.org/abs/2608.11629"
          target="_blank"
          rel="noopener noreferrer"
          class="drawer-ext-link"
        >
          <i class="fa-solid fa-graduation-cap"></i>
          <span>arXiv Paper</span>
        </a>
      </div>
    </div>
  </div>
{/if}

<style>
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .project-dropdown-container {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
  }

  .btn-project-menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    font-size: 0.8125rem;
    font-weight: 700;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background-color: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    cursor: pointer;
    transition: all 0.15s ease;
    max-width: 300px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .btn-project-menu-trigger:hover,
  .btn-project-menu-trigger.active {
    background-color: var(--bg-hover, #f8fafc);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-project-menu-trigger {
    background-color: rgba(255, 255, 255, 0.06);
    border-color: #334155;
    color: #f8fafc;
  }

  :global([data-theme='dark']) .btn-project-menu-trigger:hover,
  :global([data-theme='dark']) .btn-project-menu-trigger.active {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .project-menu-icon {
    font-size: 0.8rem;
    color: var(--primary-color, #0284c7);
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .project-menu-icon {
    color: #38bdf8;
  }

  .project-menu-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-project-menu-trigger .caret-icon {
    font-size: 0.65rem;
    opacity: 0.7;
    transition: transform 0.18s ease;
    flex-shrink: 0;
  }

  .btn-project-menu-trigger .caret-icon.rotated {
    transform: rotate(180deg);
  }

  .project-dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 280px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.12),
      0 8px 10px -6px rgba(0, 0, 0, 0.08);
    padding: 6px;
    z-index: 1050;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: exportMenuFadeIn 0.14s ease-out;
  }

  :global([data-theme='dark']) .project-dropdown-menu {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45);
  }

  .item-icon-box.icon-projects {
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
  }

  .item-icon-box.icon-settings {
    background: rgba(100, 116, 139, 0.12);
    color: #475569;
  }

  .item-icon-box.icon-lexicon {
    background: rgba(139, 92, 246, 0.12);
    color: #7c3aed;
  }

  .item-icon-box.icon-import-eaf {
    background: rgba(5, 150, 105, 0.12);
    color: #059669;
  }

  .item-icon-box.icon-import-json {
    background: rgba(217, 119, 6, 0.12);
    color: #d97706;
  }

  .external-link-icon {
    font-size: 0.68rem;
    margin-left: 4px;
    opacity: 0.7;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-hover, #f1f5f9);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .header-nav {
    background: rgba(255, 255, 255, 0.04);
    border-color: #334155;
  }

  .nav-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-tab:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.04);
  }

  :global([data-theme='dark']) .nav-tab:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-tab.active {
    color: var(--primary-color, #0284c7);
    background: var(--bg-card, #ffffff);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  :global([data-theme='dark']) .nav-tab.active {
    background: #1e293b;
    color: #38bdf8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .nav-id-bubble {
    font-size: 0.68rem;
    background: var(--primary-light, #e0f2fe);
    color: var(--primary-color, #0284c7);
    padding: 1px 5px;
    border-radius: 4px;
  }

  :global([data-theme='dark']) .nav-id-bubble {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }

  /* Drawer Toggle Button */
  .btn-drawer-toggle {
    display: none;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    pointer-events: auto;
    position: relative;
    z-index: 10;
  }

  .btn-drawer-toggle:hover {
    background: var(--border-color, #e2e8f0);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-drawer-toggle {
    background: rgba(255, 255, 255, 0.06);
    border-color: #334155;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .btn-drawer-toggle:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #38bdf8;
  }

  /* Drawer Overlay & Panel */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
    z-index: 1000;
    animation: drawerFadeIn 0.2s ease-out;
  }

  @keyframes drawerFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .drawer-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 290px;
    max-width: 85vw;
    height: 100%;
    height: 100dvh;
    background: var(--bg-card, #ffffff);
    border-left: 1px solid var(--border-color, #e2e8f0);
    box-shadow: -8px 0 30px rgba(0, 0, 0, 0.2);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    animation: drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme='dark']) .drawer-panel {
    background: #1e293b;
    border-color: #334155;
    box-shadow: -8px 0 30px rgba(0, 0, 0, 0.5);
  }

  @keyframes drawerSlideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-card, #ffffff);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  :global([data-theme='dark']) .drawer-header {
    background: #1e293b;
    border-color: #334155;
  }

  .drawer-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .drawer-logo-wrap {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 2px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .drawer-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .drawer-brand-title {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    display: block;
    line-height: 1.1;
  }

  :global([data-theme='dark']) .drawer-brand-title {
    color: #f8fafc;
  }

  .drawer-brand-desc {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-muted, #64748b);
    display: block;
  }

  .drawer-close-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.15s ease;
  }

  .drawer-close-btn:hover {
    color: var(--text-heading, #0f172a);
    background: var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .drawer-close-btn {
    background: rgba(255, 255, 255, 0.06);
    border-color: #334155;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .drawer-close-btn:hover {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.12);
  }

  .drawer-nav {
    display: flex;
    flex-direction: column;
    padding: 12px 10px;
    gap: 6px;
    flex: 1;
  }

  .drawer-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-heading, #0f172a);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .drawer-nav-item {
    color: #e2e8f0;
  }

  .drawer-nav-item:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  :global([data-theme='dark']) .drawer-nav-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .drawer-nav-item.active {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.2);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .drawer-nav-item.active {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.25);
    color: #38bdf8;
  }

  .drawer-item-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-muted, #64748b);
    font-size: 1rem;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  :global([data-theme='dark']) .drawer-item-icon-box {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }

  .drawer-nav-item.active .drawer-item-icon-box {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
  }

  :global([data-theme='dark']) .drawer-nav-item.active .drawer-item-icon-box {
    background: #38bdf8;
    color: #0f172a;
  }

  .drawer-item-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .drawer-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawer-item-title {
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .drawer-item-sub {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global([data-theme='dark']) .drawer-item-sub {
    color: #94a3b8;
  }

  .drawer-project-actions {
    margin: 4px 6px 8px;
    padding: 8px;
    background: var(--bg-hover, #f8fafc);
    border-radius: 8px;
    border: 1px dashed var(--border-color, #cbd5e1);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  :global([data-theme='dark']) .drawer-project-actions {
    background: rgba(15, 23, 42, 0.4);
    border-color: #334155;
  }

  .drawer-subaction-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  :global([data-theme='dark']) .drawer-subaction-btn {
    color: #cbd5e1;
  }

  .drawer-subaction-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .drawer-subaction-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #38bdf8;
  }

  .drawer-footer {
    padding: 14px 16px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .drawer-footer {
    border-color: #334155;
    background: #1e293b;
  }

  .drawer-install-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    font-size: 0.84rem;
    font-weight: 600;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .drawer-install-btn:hover {
    opacity: 0.9;
  }

  .drawer-ext-links {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 8px;
    font-size: 0.78rem;
  }

  .drawer-ext-link {
    color: var(--text-muted, #64748b);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }

  .drawer-ext-link:hover {
    color: var(--primary-color, #0284c7);
    text-decoration: underline;
  }

  :global([data-theme='dark']) .drawer-ext-link {
    color: #94a3b8;
  }

  :global([data-theme='dark']) .drawer-ext-link:hover {
    color: #38bdf8;
  }

  /* Responsive Breakpoints */
  @media (max-width: 860px) {
    .header-nav {
      display: none !important;
    }

    .btn-drawer-toggle {
      display: inline-flex !important;
    }

    .header-badges {
      gap: 6px;
    }
  }

  @media (max-width: 640px) {
    .btn-project-menu-trigger {
      max-width: 180px;
    }
  }

  .tool-count-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.2);
    color: #b45309;
  }

  :global([data-theme='dark']) .tool-count-badge {
    background: rgba(245, 158, 11, 0.25);
    color: #fbbf24;
  }

  @media (min-width: 861px) {
    .btn-drawer-toggle {
      display: none !important;
    }

    .drawer-backdrop,
    .drawer-panel {
      display: none !important;
    }
  }
</style>
