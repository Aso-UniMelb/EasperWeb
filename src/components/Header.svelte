<script>
  import { untrack } from 'svelte';
  import { appState } from '../state/appState.svelte.js';
  import { projectState } from '../state/projectState.svelte.js';
  import { modelState } from '../state/modelState.svelte.js';
  import { router } from '../services/router.svelte.js';

  // The transcriber is the one view that trades the tab bar for project controls
  let isStudio = $derived(router.currentRoute === 'transcriber');

  let isEditingTitle = $state(false);
  let editedTitle = $state('');

  function startEditTitle() {
    if (!projectState.activeProject) return;
    editedTitle = projectState.activeProject.title;
    isEditingTitle = true;
  }

  async function saveTitle() {
    if (isEditingTitle && projectState.activeProject) {
      const clean = editedTitle.trim();
      if (clean && clean !== projectState.activeProject.title) {
        await projectState.updateProjectInfo(projectState.activeProject.id, {
          title: clean,
        });
      }
      isEditingTitle = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      isEditingTitle = false;
    }
  }

  function focusOnMount(node) {
    node.focus();
    node.select();
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
      <div>
        <h1 class="app-title">Easper</h1>
        {#if router.currentRoute === 'home'}
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
        {/if}
      </div>
    </div>

    <!-- Active Project Title Pill in Workspace / Transcriber View -->
    {#if router.currentRoute === 'transcriber' && projectState.activeProject}
      <button
        type="button"
        class="btn-header-action"
        onclick={() => router.navigate('/transcriber')}
        title="View all saved projects"
      >
        <i class="fa-solid fa-folder-tree"></i>
        <span>Projects</span>
      </button>
      <div class="header-project-badge">
        <i class="fa-solid fa-folder-open header-project-icon"></i>
        {#if isEditingTitle}
          <input
            type="text"
            class="header-project-input"
            bind:value={editedTitle}
            onblur={saveTitle}
            onkeydown={handleKeyDown}
            use:focusOnMount
          />
        {:else}
          <button
            type="button"
            class="header-project-btn"
            onclick={startEditTitle}
            title="Click to rename project"
          >
            <span class="header-project-text"
              >{projectState.activeProject.title}</span
            >
            <i class="fa-solid fa-pen-to-square header-edit-icon"></i>
          </button>
        {/if}
      </div>

      <!-- Project actions, moved here from the separate project bar -->
      <button
        type="button"
        class="btn-header-action"
        onclick={() => {
          projectState.isProjectSettingsOpen = true;
        }}
        title="Project settings, speakers & sub-tiers"
      >
        <i class="fa-solid fa-gear"></i>
        <span>Project Settings</span>
      </button>
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
    {#if isStudio && projectState.activeProject}
      <div class="save-status-indicator {projectState.saveStatus}">
        {#if projectState.saveStatus === 'saving'}
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <span>Saving...</span>
        {:else if projectState.saveStatus === 'saved'}
          <i class="fa-solid fa-check"></i>
          <span>Saved locally</span>
        {:else}
          <i class="fa-solid fa-pen"></i>
          <span>Unsaved changes</span>
        {/if}
      </div>
    {/if}

    {#if appState.isInstallable}
      <button
        type="button"
        class="btn-install-pwa"
        onclick={() => appState.handleInstallApp()}
        title="Install Easper as a desktop application"
      >
        <i class="fa-solid fa-download"></i>
        <span class="btn-install-text">Install</span>
      </button>
    {/if}

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
  /* Carried over with the project actions from the old project bar */
  .btn-header-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-color, #334155);
    transition: all 0.15s ease;
  }

  .btn-header-action:hover {
    background: var(--border-color, #e2e8f0);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-header-action {
    background: rgba(255, 255, 255, 0.05);
    border-color: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-header-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #7dd3fc;
  }

  .save-status-indicator {
    font-size: 0.76rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .save-status-indicator.saved {
    color: #10b981;
  }

  .save-status-indicator.saving {
    color: var(--primary-color, #0284c7);
  }

  .save-status-indicator.unsaved {
    color: #f59e0b;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .header-project-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    padding: 3px 8px;
    max-width: 320px;
  }

  :global([data-theme='dark']) .header-project-badge {
    background: rgba(255, 255, 255, 0.05);
    border-color: #334155;
  }

  .header-project-icon {
    font-size: 0.8rem;
    color: var(--primary-color, #0284c7);
    flex-shrink: 0;
  }

  .header-project-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-heading, #0f172a);
    font-size: 0.84rem;
    font-weight: 700;
    max-width: 260px;
    text-align: left;
  }

  .header-project-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-project-btn:hover .header-project-text {
    color: var(--primary-color, #0284c7);
    text-decoration: underline;
  }

  .header-edit-icon {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .header-project-btn:hover .header-edit-icon {
    color: var(--primary-color, #0284c7);
  }

  .header-project-input {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    padding: 1px 4px;
    border: 1px solid var(--primary-color, #0284c7);
    border-radius: 4px;
    outline: none;
    background: var(--bg-card, #ffffff);
    max-width: 240px;
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

    .btn-install-pwa {
      padding: 5px 8px;
      font-size: 0.76rem;
    }
  }

  @media (max-width: 640px) {
    .btn-install-pwa .btn-install-text {
      display: none;
    }

    .header-project-badge {
      max-width: 180px;
    }

    .header-project-btn {
      max-width: 130px;
    }
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
