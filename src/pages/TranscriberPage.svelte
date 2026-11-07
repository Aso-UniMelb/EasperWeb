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
  let sortField = $state('updatedAt'); // 'title' | 'duration' | 'segments' | 'updatedAt'
  let sortDir = $state('desc'); // 'asc' | 'desc'
  let openFileInputEl = $state(null);

  function handleOpenProjectFile(e) {
    const file = e.target.files?.[0];
    if (file) {
      projectState.importProjectPackage(file);
    }
    e.target.value = '';
  }

  function toggleSort(field) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = field === 'title' ? 'asc' : 'desc';
    }
  }

  let filteredProjects = $derived.by(() => {
    const list = projectState.projects.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.transcriber || '').toLowerCase().includes(q) ||
        (p.audioFileName || '').toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      } else if (sortField === 'duration') {
        cmp = (a.audioDuration || 0) - (b.audioDuration || 0);
      } else if (sortField === 'segments') {
        cmp = (a.segments?.length || 0) - (b.segments?.length || 0);
      } else if (sortField === 'updatedAt') {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        cmp = timeA - timeB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  });

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
            onclick={() => {
              projectState.elanImportTarget = 'new';
              projectState.isImportElanOpen = true;
            }}
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
        <div class="projects-table-wrap">
          <table class="projects-table">
            <thead>
              <tr>
                <th
                  class="col-title sortable"
                  onclick={() => toggleSort('title')}
                >
                  <div class="th-inner">
                    <span>Project Title</span>
                    {#if sortField === 'title'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-duration sortable"
                  onclick={() => toggleSort('duration')}
                >
                  <div class="th-inner">
                    <span>Duration</span>
                    {#if sortField === 'duration'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-segments sortable"
                  onclick={() => toggleSort('segments')}
                >
                  <div class="th-inner">
                    <span>Utterances</span>
                    {#if sortField === 'segments'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th
                  class="col-updated sortable"
                  onclick={() => toggleSort('updatedAt')}
                >
                  <div class="th-inner">
                    <span>Updated</span>
                    {#if sortField === 'updatedAt'}
                      <i
                        class="fa-solid {sortDir === 'asc'
                          ? 'fa-arrow-up-short-wide'
                          : 'fa-arrow-down-wide-short'} sort-icon active"
                      ></i>
                    {:else}
                      <i class="fa-solid fa-sort sort-icon dim"></i>
                    {/if}
                  </div>
                </th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredProjects as proj (proj.id)}
                <tr
                  class="project-row {projectState.activeProjectId === proj.id
                    ? 'active-row'
                    : ''}"
                  onclick={() => handleOpenProject(proj.id)}
                >
                  <td class="col-title">
                    <div class="row-title-wrap">
                      <span class="row-project-title" title={proj.title}>
                        {proj.title}
                      </span>
                      {#if projectState.activeProjectId === proj.id}
                        <span class="badge-last-active">
                          <i class="fa-solid fa-clock-rotate-left"></i> Last Opened
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td class="col-duration">
                    <span class="row-tabular-val">
                      {formatTimeSec(proj.audioDuration || 0)}
                    </span>
                  </td>
                  <td class="col-segments">
                    <span class="row-tabular-val">
                      {proj.segments?.length || 0}
                    </span>
                  </td>
                  <td class="col-updated">
                    <span class="row-date-val">
                      {new Date(
                        proj.updatedAt || proj.createdAt,
                      ).toLocaleDateString()}
                    </span>
                  </td>
                  <td
                    class="col-actions"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <div class="row-actions-wrap">
                      <button
                        type="button"
                        class="btn-card-action"
                        onclick={(e) => {
                          e.stopPropagation();
                          projectState.saveProjectPackage(proj);
                        }}
                        title="Archive project package (.easper)"
                      >
                        <i class="fa-solid fa-download"></i>
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
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
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

  .btn-open-project-hero {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    color: #0284c7;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
    white-space: nowrap;
  }

  .btn-open-project-hero:hover {
    background: #e0f2fe;
    color: #0369a1;
    border-color: #7dd3fc;
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
  }

  .btn-open-elan-hero {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #059669;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
    white-space: nowrap;
  }

  .btn-open-elan-hero:hover {
    background: #d1fae5;
    color: #047857;
    border-color: #6ee7b7;
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
  }

  .btn-new-project-hero {
    background: #0284c7;
    color: #ffffff;
    border: 1px solid #0369a1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .btn-new-project-hero:hover {
    background: #0369a1;
    border-color: #075985;
  }

  /* Projects Table */
  .projects-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-color, #e4e2dd);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
  }

  .projects-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
    text-align: left;
  }

  .projects-table th {
    background: var(--bg-table-header, #f2f0ed);
    padding: 9px 12px;
    font-weight: 600;
    font-size: 0.78rem;
    color: var(--text-heading, #0f172a);
    border-bottom: 1px solid var(--border-color, #e4e2dd);
    white-space: nowrap;
    user-select: none;
  }

  .projects-table th.sortable {
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .projects-table th.sortable:hover {
    background: var(--border-color, #e4e2dd);
  }

  :global([data-theme='dark']) .projects-table th.sortable:hover {
    background: #334155;
  }

  .th-inner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sort-icon {
    font-size: 0.72rem;
  }

  .sort-icon.dim {
    opacity: 0.35;
  }

  .sort-icon.active {
    color: var(--primary-color, #0284c7);
  }

  .project-row {
    border-bottom: 1px solid var(--border-color, #e4e2dd);
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .project-row:last-child {
    border-bottom: none;
  }

  .project-row:hover {
    background: var(--bg-hover, #f2f0ed);
  }

  .project-row.active-row {
    background: #f0f9ff;
  }

  :global([data-theme='dark']) .project-row.active-row {
    background: rgba(2, 132, 199, 0.12);
  }

  .projects-table td {
    padding: 9px 12px;
    vertical-align: middle;
  }

  .col-title {
    min-width: 240px;
  }

  .col-duration,
  .col-segments,
  .col-updated {
    width: 130px;
    white-space: nowrap;
  }

  .col-actions {
    width: 100px;
    text-align: right;
    white-space: nowrap;
  }

  .projects-table th.col-actions {
    text-align: right;
  }

  .row-title-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .row-project-title {
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .project-row:hover .row-project-title {
    color: var(--primary-color, #0284c7);
  }

  .row-tabular-val {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--text-base, #334155);
  }

  .row-date-val {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .badge-last-active {
    font-size: 0.64rem;
    font-weight: 700;
    color: #0284c7;
    background: #e0f2fe;
    padding: 1px 6px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .badge-last-active {
    background: rgba(2, 132, 199, 0.25);
    color: #38bdf8;
  }

  .row-actions-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .btn-card-action {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #94a3b8);
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
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
