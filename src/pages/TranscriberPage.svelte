<script>
  import { onMount } from 'svelte';
  import { appState } from '../state/appState.svelte.js';
  import { projectState } from '../state/projectState.svelte.js';
  import { router } from '../services/router.svelte.js';
  import { formatTimeSec } from '../utils/formatters.js';
  import Header from '../components/Header.svelte';
  import AudioElement from '../components/AudioElement.svelte';
  import TranscriptCard from '../components/main/TranscriptCard.svelte';

  let { projectId = null, onWorkerReset } = $props();

  let projectNotFound = $state(false);
  let isLoadingProject = $state(false);

  // Projects Dashboard state (used when on /transcriber without project ID)
  let searchQuery = $state('');
  let editingProjectId = $state(null);
  let editTitle = $state('');
  let editTranscriber = $state('');
  let openFileInputEl = $state(null);

  function handleOpenProjectFile(e) {
    const file = e.target.files?.[0];
    if (file) {
      projectState.importProjectPackage(file);
    }
    e.target.value = '';
  }

  let filteredProjects = $derived(
    projectState.projects.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.transcriber || '').toLowerCase().includes(q) ||
        (p.audioFileName || '').toLowerCase().includes(q)
      );
    }),
  );

  function startEdit(proj, e) {
    if (e) e.stopPropagation();
    editingProjectId = proj.id;
    editTitle = proj.title || '';
    editTranscriber = proj.transcriber || '';
  }

  async function saveEdit(projId, e) {
    if (e) e.stopPropagation();
    if (editingProjectId === projId) {
      await projectState.updateProjectInfo(projId, {
        title: editTitle,
        transcriber: editTranscriber,
      });
      editingProjectId = null;
    }
  }

  function cancelEdit(e) {
    if (e) e.stopPropagation();
    editingProjectId = null;
  }

  async function handleOpenProject(projId) {
    const proj = projectState.findProjectById(projId);
    await projectState.openProject(projId);
    router.navigate(`/transcriber/${proj?.numericId || projId}`);
  }

  async function handleDeleteProject(proj, e) {
    if (e) e.stopPropagation();
    const confirmMsg = `Are you sure you want to delete project "${proj.title}"?\nThis will permanently remove the audio file and its dialogue transcriptions from local storage.`;
    if (window.confirm(confirmMsg)) {
      await projectState.deleteProject(proj.id);
    }
  }

  function handleCreateNew() {
    projectState.isNewProjectOpen = true;
  }

  async function syncProject(targetId) {
    projectNotFound = false;

    // Ensure projects are loaded
    if (projectState.projects.length === 0) {
      await projectState.loadProjects();
    }

    if (!targetId) {
      // At /transcriber (no target project specified in URL)
      // Show saved projects dashboard view
      appState.resetStatus();
      return;
    }

    const targetDoc = projectState.findProjectById(targetId);

    if (!targetDoc) {
      // Check if project exists directly in IndexedDB
      try {
        isLoadingProject = true;
        await projectState.openProject(targetId);
        isLoadingProject = false;
        return;
      } catch (err) {
        isLoadingProject = false;
        projectNotFound = true;
        return;
      }
    }

    // Canonical redirect if URL has old string ID instead of small int numericId
    if (
      targetDoc.numericId &&
      String(targetId) !== String(targetDoc.numericId)
    ) {
      router.navigate(`/transcriber/${targetDoc.numericId}`, { replace: true });
    }

    // If not already active project, open it
    if (
      !projectState.activeProject ||
      projectState.activeProject.id !== targetDoc.id
    ) {
      try {
        isLoadingProject = true;
        await projectState.openProject(targetDoc.id);
      } catch (err) {
        projectNotFound = true;
      } finally {
        isLoadingProject = false;
      }
    }
  }

  $effect(() => {
    // Re-run when projectId prop changes
    syncProject(projectId);
  });
</script>

<Header />

{#if !projectId}
  <!-- Saved Projects Section on Transcriber Page -->
  <div class="transcriber-projects-container">
    <section class="starting-projects-section">
      <div class="projects-section-header">
        <div class="section-title-wrap">
          <i class="fa-solid fa-folder-tree section-icon"></i>
          <div>
            <h2 class="section-title">
              Saved Projects ({filteredProjects.length})
            </h2>
          </div>
        </div>

        <div class="projects-section-actions">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              class="search-input"
              placeholder="Search projects..."
              bind:value={searchQuery}
            />
            {#if searchQuery}
              <button
                type="button"
                class="btn-clear-search"
                aria-label="Clear search"
                onclick={() => (searchQuery = '')}
              >
                <i class="fa-solid fa-circle-xmark"></i>
              </button>
            {/if}
          </div>

          <!-- Button to Models Page -->
          <button
            type="button"
            class="btn-hero-models"
            onclick={() => router.navigate('/models')}
            title="Speech Recognition Model Management"
          >
            <i class="fa-solid fa-brain"></i>
            <span>Models</span>
          </button>

          <!-- Import Project Button -->
          <button
            type="button"
            class="btn-open-project-hero"
            onclick={() => openFileInputEl?.click()}
            title="Import full project package with audio (.easper, .zip)"
          >
            <i class="fa-solid fa-file-import"></i>
            <span>Open Project</span>
          </button>
          <input
            type="file"
            accept=".easper,.zip,.json"
            bind:this={openFileInputEl}
            onchange={handleOpenProjectFile}
            style="display: none;"
          />

          <!-- Import ELAN Button -->
          <button
            type="button"
            class="btn-open-elan-hero"
            onclick={() => (projectState.isImportElanOpen = true)}
            title="Import from ELAN annotation format (.eaf + .wav)"
          >
            <i class="fa-solid fa-file-waveform"></i>
            <span>Import ELAN</span>
          </button>

          <!-- New Project Button -->
          <button
            type="button"
            class="btn-new-project-hero"
            onclick={handleCreateNew}
          >
            <i class="fa-solid fa-plus"></i>
            <span>New Project</span>
          </button>

          <!-- Resume active project if exists -->
          {#if projectState.activeProject}
            <button
              type="button"
              class="btn-resume-active"
              onclick={() =>
                router.navigate(
                  `/transcriber/${projectState.activeProject.numericId || projectState.activeProject.id}`,
                )}
              title="Return to currently loaded workspace"
            >
              <i class="fa-solid fa-play"></i>
              <span>Resume #{projectState.activeProject.numericId || ''}</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Projects Grid or Clean Empty State -->
      {#if filteredProjects.length === 0}
        <div class="starting-empty-state">
          <div class="empty-icon-wrap">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          {#if searchQuery}
            <h3>No matching projects</h3>
            <p>No project found matching "{searchQuery}".</p>
            <button
              type="button"
              class="btn-modal-cancel"
              onclick={() => (searchQuery = '')}
              style="margin-top: 8px;"
            >
              Clear Search
            </button>
          {:else}
            <h3>No projects yet</h3>
            <p>Create your first transcription project to get started.</p>
            <button
              type="button"
              class="btn-new-project-hero"
              onclick={handleCreateNew}
              style="margin-top: 10px;"
            >
              <i class="fa-solid fa-plus"></i>
              <span>Create Project</span>
            </button>
          {/if}
        </div>
      {:else}
        <div class="starting-projects-grid">
          {#each filteredProjects as proj (proj.id)}
            <div
              class="home-project-card {projectState.activeProjectId === proj.id
                ? 'active-card'
                : ''}"
              onclick={() => handleOpenProject(proj.id)}
              role="button"
              tabindex="0"
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleOpenProject(proj.id);
                }
              }}
            >
              {#if editingProjectId === proj.id}
                <!-- Inline Editing Form -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="card-edit-overlay"
                  onclick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <div class="form-group">
                    <label for="edit-home-title-{proj.id}">Project Title</label>
                    <input
                      id="edit-home-title-{proj.id}"
                      type="text"
                      class="form-control form-control-sm"
                      bind:value={editTitle}
                    />
                  </div>
                  <div class="form-group">
                    <label for="edit-home-transcriber-{proj.id}"
                      >Transcriber Name</label
                    >
                    <input
                      id="edit-home-transcriber-{proj.id}"
                      type="text"
                      class="form-control form-control-sm"
                      bind:value={editTranscriber}
                    />
                  </div>
                  <div class="edit-btn-row">
                    <button
                      type="button"
                      class="btn-sm btn-primary"
                      onclick={(e) => saveEdit(proj.id, e)}
                    >
                      <i class="fa-solid fa-check"></i> Save
                    </button>
                    <button
                      type="button"
                      class="btn-sm btn-secondary"
                      onclick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Card Header -->
                <div class="card-top-row">
                  <div class="card-title-wrap">
                    <h3 class="card-project-title" title={proj.title}>
                      {proj.title}
                    </h3>
                    {#if projectState.activeProjectId === proj.id}
                      <span class="badge-last-active">
                        <i class="fa-solid fa-clock-rotate-left"></i> Last Opened
                      </span>
                    {/if}
                  </div>

                  <div class="card-actions-row">
                    <button
                      type="button"
                      class="btn-card-action"
                      onclick={(e) => startEdit(proj, e)}
                      title="Edit project title and transcriber"
                    >
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button
                      type="button"
                      class="btn-card-action"
                      onclick={(e) => {
                        e.stopPropagation();
                        projectState.saveProjectPackage(proj);
                      }}
                      title="Archive project package (.easper)"
                    >
                      <i class="fa-solid fa-box-archive"></i>
                    </button>
                    <button
                      type="button"
                      class="btn-card-action btn-card-danger"
                      onclick={(e) => handleDeleteProject(proj, e)}
                      title="Delete project from storage"
                    >
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>

                <!-- Card Metadata -->
                <div class="card-meta-grid">
                  <div class="meta-item">
                    <i class="fa-solid fa-user-pen"></i>
                    <strong class="meta-value"
                      >{proj.transcriber || 'Unknown'}</strong
                    >
                  </div>
                  <div class="meta-item">
                    <i class="fa-solid fa-clock"></i>
                    <strong class="meta-value"
                      >{formatTimeSec(proj.audioDuration || 0)}</strong
                    >
                  </div>
                  <div class="meta-item">
                    <i class="fa-solid fa-comments"></i>
                    <strong class="meta-value"
                      >{proj.segments?.length || 0} Utterances</strong
                    >
                  </div>
                  <div class="meta-item">
                    <i class="fa-solid fa-music"></i>
                    <span class="meta-value-file" title={proj.audioFileName}>
                      {proj.audioFileName || '16kHz WAV'}
                    </span>
                  </div>
                </div>

                <!-- Card Footer with Open Button -->
                <div class="card-footer-row">
                  <span class="card-date-label">
                    Updated {new Date(
                      proj.updatedAt || proj.createdAt,
                    ).toLocaleDateString()}
                  </span>

                  <button
                    type="button"
                    class="btn-enter-project"
                    onclick={(e) => {
                      e.stopPropagation();
                      handleOpenProject(proj.id);
                    }}
                  >
                    <span>Open Studio</span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{:else if isLoadingProject}
  <div class="transcriber-notice-card">
    <div class="notice-icon">
      <i class="fa-solid fa-circle-notch fa-spin"></i>
    </div>
    <div class="notice-body">
      <h3>Loading Project #{projectId}...</h3>
      <p>
        Retrieving dialogue transcriptions and 16kHz audio from browser storage.
      </p>
    </div>
  </div>
{:else if projectNotFound}
  <div class="transcriber-notice-card card-warning">
    <div class="notice-icon">
      <i class="fa-solid fa-triangle-exclamation"></i>
    </div>
    <div class="notice-body">
      <h3>Project #{projectId} Not Found</h3>
      <p>
        The requested project could not be found in local browser storage. It
        may have been deleted or created in another browser profile.
      </p>
      <div class="notice-actions">
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => router.navigate('/transcriber')}
        >
          <i class="fa-solid fa-folder-tree"></i> View Saved Projects
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => router.navigate('/')}
        >
          <i class="fa-solid fa-house"></i> Return to Home
        </button>
      </div>
    </div>
  </div>
{:else}
  <!-- Transcription Studio Workspace -->
  <AudioElement />
  <div class="transcriber-workspace">
    <TranscriptCard {onWorkerReset} />
  </div>
{/if}

<style>
  .transcriber-projects-container {
    padding: 12px 16px 40px 16px;
  }

  /* Projects Dashboard Section & Compact Project Cards */
  .starting-projects-section {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 14px 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  :global([data-theme='dark']) .starting-projects-section {
    background: rgba(30, 41, 59, 0.5);
    border-color: #334155;
  }

  .projects-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  :global([data-theme='dark']) .projects-section-header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    font-size: 1.15rem;
    color: var(--primary-color, #0284c7);
  }

  .section-title {
    font-size: 1.12rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    margin: 0;
  }

  .projects-section-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 0.78rem;
    color: var(--text-muted, #94a3b8);
    pointer-events: none;
  }

  .search-input {
    padding: 6px 28px 6px 28px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.82rem;
    width: 170px;
    background: var(--bg-hover, #f8fafc);
    color: var(--text-heading, #0f172a);
    transition: all 0.15s ease;
  }

  .search-input:focus {
    width: 210px;
    outline: none;
    border-color: var(--primary-color, #0284c7);
    background: var(--bg-card, #ffffff);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .btn-clear-search {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 2px;
    font-size: 0.78rem;
  }

  .btn-hero-models {
    background: #ede9fe;
    border: 1px solid #ddd6fe;
    color: #7c3aed;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-hero-models:hover {
    background: #ddd6fe;
    color: #6d28d9;
    transform: translateY(-1px);
  }

  :global([data-theme='dark']) .btn-hero-models {
    background: rgba(124, 58, 237, 0.18);
    border-color: rgba(124, 58, 237, 0.3);
    color: #c084fc;
  }

  .btn-open-project-hero {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    color: #0284c7;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-open-project-hero:hover {
    background: #e0f2fe;
    color: #0369a1;
    border-color: #7dd3fc;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(2, 132, 199, 0.18);
  }

  :global([data-theme='dark']) .btn-open-project-hero {
    background: rgba(2, 132, 199, 0.16);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-open-project-hero:hover {
    background: rgba(2, 132, 199, 0.28);
    border-color: rgba(56, 189, 248, 0.55);
    color: #7dd3fc;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(56, 189, 248, 0.25);
  }

  .btn-open-elan-hero {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #059669;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-open-elan-hero:hover {
    background: #d1fae5;
    color: #047857;
    border-color: #6ee7b7;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(5, 150, 105, 0.18);
  }

  :global([data-theme='dark']) .btn-open-elan-hero {
    background: rgba(5, 150, 105, 0.16);
    border: 1px solid rgba(52, 211, 153, 0.35);
    color: #34d399;
  }

  :global([data-theme='dark']) .btn-open-elan-hero:hover {
    background: rgba(5, 150, 105, 0.28);
    border-color: rgba(52, 211, 153, 0.55);
    color: #6ee7b7;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(52, 211, 153, 0.25);
  }

  .btn-new-project-hero {
    background: #0284c7;
    color: #ffffff;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-new-project-hero:hover {
    background: #0369a1;
    transform: translateY(-1px);
  }

  .btn-resume-active {
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    color: #15803d;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-resume-active:hover {
    background: #bbf7d0;
    color: #166534;
  }

  :global([data-theme='dark']) .btn-resume-active {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  /* Projects Grid */
  .starting-projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }

  .home-project-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  .home-project-card:hover {
    background: var(--bg-card, #ffffff);
    border-color: var(--primary-color, #0284c7);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
  }

  .home-project-card.active-card {
    border-color: #0284c7;
    background: var(--primary-light, #f0f9ff);
  }

  :global([data-theme='dark']) .home-project-card {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  :global([data-theme='dark']) .home-project-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: #38bdf8;
  }

  :global([data-theme='dark']) .home-project-card.active-card {
    background: rgba(2, 132, 199, 0.12);
    border-color: #38bdf8;
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .card-title-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .card-project-title {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .badge-last-active {
    font-size: 0.64rem;
    font-weight: 700;
    color: #0284c7;
    background: #e0f2fe;
    padding: 1px 5px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .badge-last-active {
    background: rgba(2, 132, 199, 0.25);
    color: #38bdf8;
  }

  .card-actions-row {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .btn-card-action {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #94a3b8);
    padding: 3px 5px;
    border-radius: 4px;
    font-size: 0.76rem;
    transition: all 0.12s ease;
  }

  .btn-card-action:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.05);
  }

  :global([data-theme='dark']) .btn-card-action:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-card-danger:hover {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.1) !important;
  }

  /* Card Meta Grid */
  .card-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 10px;
    font-size: 0.74rem;
    padding: 4px 0;
    border-top: 1px solid var(--border-color, #e2e8f0);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .card-meta-grid {
    border-color: rgba(255, 255, 255, 0.06);
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted, #64748b);
    overflow: hidden;
    white-space: nowrap;
  }

  .meta-item i {
    font-size: 0.72rem;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }

  .meta-value {
    color: var(--text-heading, #0f172a);
    font-weight: 600;
  }

  .meta-value-file {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Card Footer */
  .card-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 2px;
  }

  .card-date-label {
    font-size: 0.68rem;
    color: var(--text-muted, #94a3b8);
  }

  .btn-enter-project {
    background: #0284c7;
    color: #ffffff;
    border: none;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.12s ease;
  }

  .btn-enter-project:hover {
    background: #0369a1;
    transform: translateX(1px);
  }

  /* Edit Overlay */
  .card-edit-overlay {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .form-group label {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .form-control-sm {
    padding: 4px 6px;
    font-size: 0.78rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 4px;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
  }

  .edit-btn-row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 4px;
  }

  .btn-sm {
    padding: 3px 8px;
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: #0284c7;
    color: white;
  }

  .btn-secondary {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
  }

  /* Empty State */
  .starting-empty-state {
    text-align: center;
    padding: 32px 16px;
    background: var(--bg-hover, #f8fafc);
    border: 2px dashed var(--border-color, #cbd5e1);
    border-radius: 8px;
    margin: 4px 0;
  }

  :global([data-theme='dark']) .starting-empty-state {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .empty-icon-wrap {
    font-size: 2rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 6px;
  }

  .starting-empty-state h3 {
    margin: 0 0 4px 0;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .starting-empty-state p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-modal-cancel {
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* Notice Cards */
  .transcriber-notice-card {
    display: flex;
    align-items: flex-start;
    gap: 18px;
    max-width: 640px;
    margin: 40px auto;
    padding: 24px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .transcriber-notice-card.card-warning {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  :global([data-theme='dark']) .transcriber-notice-card.card-warning {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .notice-icon {
    font-size: 2rem;
    color: var(--primary-color, #0284c7);
    flex-shrink: 0;
  }

  .card-warning .notice-icon {
    color: #d97706;
  }

  .notice-body h3 {
    margin: 0 0 8px 0;
    font-size: 1.15rem;
    color: var(--text-heading, #0f172a);
  }

  .notice-body p {
    margin: 0 0 16px 0;
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--text-muted, #475569);
  }

  .notice-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 0.88rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }
</style>
