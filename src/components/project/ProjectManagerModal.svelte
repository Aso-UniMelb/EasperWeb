<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { router } from '../../services/router.svelte.js';
  import { formatTimeSec } from '../../utils/formatters.js';

  let searchQuery = $state('');
  let editingProjectId = $state(null);
  let editTitle = $state('');
  let editTranscriber = $state('');
  let fileInputEl = $state(null);

  function handleProjectFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) {
      projectState.importProjectPackage(file);
      projectState.isProjectManagerOpen = false;
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

  function startEdit(proj) {
    editingProjectId = proj.id;
    editTitle = proj.title || '';
    editTranscriber = proj.transcriber || '';
  }

  async function saveEdit(projId) {
    if (editingProjectId === projId) {
      await projectState.updateProjectInfo(projId, {
        title: editTitle,
        transcriber: editTranscriber,
      });
      editingProjectId = null;
    }
  }

  function cancelEdit() {
    editingProjectId = null;
  }

  async function handleOpenProject(projId) {
    const proj = projectState.findProjectById(projId);
    await projectState.openProject(projId);
    router.navigate(`/transcriber/${proj?.numericId || projId}`);
  }

  async function handleDeleteProject(proj) {
    const confirmMsg = `Are you sure you want to delete project "${proj.title}"?\nThis will permanently remove the audio file and all its dialogue transcriptions from local storage.`;
    if (window.confirm(confirmMsg)) {
      await projectState.deleteProject(proj.id);
    }
  }

  function handleCreateNew() {
    projectState.isProjectManagerOpen = false;
    projectState.isNewProjectOpen = true;
  }
</script>

{#if projectState.isProjectManagerOpen}
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget)
        projectState.isProjectManagerOpen = false;
    }}
    role="presentation"
  >
    <div class="modal-dialog project-manager-dialog">
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-solid fa-folder-tree"></i>
          <span>Projects Library ({projectState.projects.length})</span>
        </div>
        <button
          type="button"
          class="btn-modal-close"
          onclick={() => (projectState.isProjectManagerOpen = false)}
          aria-label="Close modal"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-toolbar">
        <div class="project-search-box">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="project-search-input"
            placeholder="Search projects by title, transcriber, or audio..."
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

        <button
          type="button"
          class="btn-modal-secondary"
          onclick={() => fileInputEl?.click()}
          title="Import full project package with audio (.easper, .zip)"
        >
          <i class="fa-solid fa-file-import"></i>
          <span>Open Project</span>
        </button>
        <input
          type="file"
          accept=".easper,.zip,.json"
          bind:this={fileInputEl}
          onchange={handleProjectFileSelected}
          style="display: none;"
        />

        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleCreateNew}
        >
          <i class="fa-solid fa-plus"></i>
          <span>New Project</span>
        </button>
      </div>

      <div class="modal-body project-list-body">
        {#if filteredProjects.length === 0}
          <div class="empty-projects-state">
            <i class="fa-solid fa-folder-open empty-icon"></i>
            {#if searchQuery}
              <h4>No matching projects</h4>
              <p>No projects matched your search "{searchQuery}".</p>
            {:else}
              <h4>No projects yet</h4>
              <p>
                Create your first project with an audio file to start
                transcribing.
              </p>
              <button
                type="button"
                class="btn-modal-primary"
                onclick={handleCreateNew}
                style="margin-top: 12px;"
              >
                <i class="fa-solid fa-plus"></i>
                <span>Create New Project</span>
              </button>
            {/if}
          </div>
        {:else}
          <div class="projects-grid">
            {#each filteredProjects as proj (proj.id)}
              <div
                class="project-card {projectState.activeProjectId === proj.id
                  ? 'active-project'
                  : ''}"
              >
                {#if editingProjectId === proj.id}
                  <!-- Inline Edit Mode -->
                  <div class="project-edit-form">
                    <div class="form-group">
                      <label for="edit-proj-title">Title</label>
                      <input
                        id="edit-proj-title"
                        type="text"
                        class="form-control form-control-sm"
                        bind:value={editTitle}
                      />
                    </div>
                    <div class="form-group">
                      <label for="edit-proj-transcriber">Transcriber</label>
                      <input
                        id="edit-proj-transcriber"
                        type="text"
                        class="form-control form-control-sm"
                        bind:value={editTranscriber}
                      />
                    </div>
                    <div class="edit-actions-row">
                      <button
                        type="button"
                        class="btn-sm btn-primary"
                        onclick={() => saveEdit(proj.id)}
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
                  <!-- Display Mode -->
                  <div class="project-card-header">
                    <div class="project-card-title-group">
                      <h4 class="project-card-title" title={proj.title}>
                        {proj.title}
                      </h4>
                      {#if projectState.activeProjectId === proj.id}
                        <span class="badge-active-project">
                          <i class="fa-solid fa-circle-dot"></i> Active
                        </span>
                      {/if}
                    </div>

                    <div class="project-card-quick-actions">
                      <button
                        type="button"
                        class="btn-icon-action"
                        onclick={() => startEdit(proj)}
                        title="Edit project title and transcriber"
                      >
                        <i class="fa-solid fa-pen-to-square"></i>
                      </button>
                      <button
                        type="button"
                        class="btn-icon-action"
                        onclick={() => projectState.saveProjectPackage(proj)}
                        title="Archive project package (.easper)"
                      >
                        <i class="fa-solid fa-box-archive"></i>
                      </button>
                      <button
                        type="button"
                        class="btn-icon-action btn-icon-danger"
                        onclick={() => handleDeleteProject(proj)}
                        title="Delete project from storage"
                      >
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>

                  <div class="project-card-meta">
                    <div class="meta-item" title="Transcriber">
                      <i class="fa-solid fa-user-pen"></i>
                      <span>{proj.transcriber || 'Unknown'}</span>
                    </div>
                    <div class="meta-item" title="Audio duration">
                      <i class="fa-solid fa-clock"></i>
                      <span>{formatTimeSec(proj.audioDuration || 0)}</span>
                    </div>
                    <div class="meta-item" title="Dialogue segments">
                      <i class="fa-solid fa-comments"></i>
                      <span>{proj.segments?.length || 0} segments</span>
                    </div>
                    <div class="meta-item" title="Audio file">
                      <i class="fa-solid fa-file-audio"></i>
                      <span class="file-name-truncate"
                        >{proj.audioFileName || 'audio.wav'}</span
                      >
                    </div>
                  </div>

                  <div class="project-card-footer">
                    <span class="updated-time">
                      Updated {new Date(
                        proj.updatedAt || proj.createdAt,
                      ).toLocaleDateString()}
                    </span>

                    {#if projectState.activeProjectId === proj.id}
                      <button
                        type="button"
                        class="btn-open-project btn-open-active"
                        disabled
                      >
                        <i class="fa-solid fa-check"></i> Currently Open
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="btn-open-project"
                        onclick={() => handleOpenProject(proj.id)}
                      >
                        <i class="fa-solid fa-arrow-right-to-bracket"></i> Open
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <div class="modal-footer-storage-note">
          <i class="fa-solid fa-database"></i>
          <span
            >Stored persistently in browser IndexedDB (audio converted to 16kHz
            mono WAV)</span
          >
        </div>
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={() => (projectState.isProjectManagerOpen = false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
