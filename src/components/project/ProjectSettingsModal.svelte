<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import {
    SPEAKER_COLORS,
    ensureDefaultSpeakers,
  } from '../../utils/speakers.js';
  import {
    MAX_SUB_TIERS,
    SUB_TIER_PRESETS,
    normalizeSubTiers,
  } from '../../utils/subTiers.js';

  let title = $state('');
  let transcriber = $state('');
  let speakers = $state([]);
  let subTiers = $state([]);
  let errorMessage = $state('');
  let successMessage = $state('');

  // Synchronize modal state when opened
  $effect(() => {
    if (projectState.isProjectSettingsOpen && projectState.activeProject) {
      title = projectState.activeProject.title || '';
      transcriber = projectState.activeProject.transcriber || '';
      const existingSpeakers = projectState.activeProject.speakers;
      speakers = ensureDefaultSpeakers(existingSpeakers).map((s) => ({ ...s }));
      subTiers = normalizeSubTiers(projectState.activeProject.subTiers).map(
        (t) => ({ ...t }),
      );
      errorMessage = '';
      successMessage = '';
    }
  });

  function handleAddSpeaker() {
    errorMessage = '';
    if (speakers.length >= 5) {
      errorMessage = 'Maximum of 5 speakers allowed per project.';
      return;
    }

    // Find smallest available ID between 1 and 5
    const existingIds = new Set(speakers.map((s) => Number(s.id)));
    let nextId = 1;
    while (nextId <= 5 && existingIds.has(nextId)) {
      nextId++;
    }

    if (nextId > 5) {
      errorMessage = 'Maximum of 5 speakers reached.';
      return;
    }

    speakers = [
      ...speakers,
      {
        id: nextId,
        name: `Speaker ${nextId}`,
        initials: `S${nextId}`,
      },
    ].sort((a, b) => a.id - b.id);
  }

  function handleRemoveSpeaker(idToRemove) {
    errorMessage = '';
    if (speakers.length <= 1) {
      errorMessage = 'A project must have at least one speaker.';
      return;
    }
    speakers = speakers.filter((s) => s.id !== idToRemove);
  }

  function handleAddSubTier() {
    errorMessage = '';
    if (subTiers.length >= MAX_SUB_TIERS) {
      errorMessage = `Maximum of ${MAX_SUB_TIERS} sub-tiers allowed per project.`;
      return;
    }
    const used = new Set(subTiers.map((t) => Number(t.id)));
    let nextId = 1;
    while (nextId <= MAX_SUB_TIERS && used.has(nextId)) nextId++;
    if (nextId > MAX_SUB_TIERS) return;

    const takenNames = new Set(
      subTiers.map((t) => (t.name || '').trim().toLowerCase()),
    );
    const preset =
      SUB_TIER_PRESETS.find((n) => !takenNames.has(n.toLowerCase())) ||
      `Sub-tier ${nextId}`;

    subTiers = [...subTiers, { id: nextId, name: preset }].sort(
      (a, b) => a.id - b.id,
    );
  }

  function handleRemoveSubTier(idToRemove) {
    errorMessage = '';
    subTiers = subTiers.filter((t) => Number(t.id) !== Number(idToRemove));
  }

  function handleInitialsInput(speaker, val) {
    speaker.initials = (val || '').toUpperCase().slice(0, 3);
  }

  async function handleSaveSettings() {
    errorMessage = '';
    successMessage = '';

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errorMessage = 'Project title cannot be empty.';
      return;
    }

    if (!speakers || speakers.length === 0) {
      errorMessage = 'At least one speaker is required.';
      return;
    }

    // Sanitize speakers
    const sanitizedSpeakers = speakers.map((s, idx) => {
      const spkId = Number(s.id) || idx + 1;
      const cleanName = (s.name || `Speaker ${spkId}`).trim();
      let cleanInitials = (s.initials || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 3);
      if (!cleanInitials) {
        cleanInitials = `S${spkId}`;
      }
      return {
        id: spkId,
        name: cleanName,
        initials: cleanInitials,
      };
    });

    // Sub-tier names become ELAN tier ids, so they must be present and distinct
    const seenNames = new Set();
    const sanitizedSubTiers = [];
    for (const t of subTiers) {
      const id = Number(t.id);
      const name = (t.name || '').trim();
      if (!name) {
        errorMessage = 'Every sub-tier needs a name.';
        return;
      }
      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        errorMessage = `Two sub-tiers are both called "${name}". Give each one a distinct name.`;
        return;
      }
      seenNames.add(key);
      sanitizedSubTiers.push({ id, name });
    }

    try {
      await projectState.updateProjectSettings(projectState.activeProject.id, {
        title: cleanTitle,
        transcriber: transcriber.trim(),
        speakers: sanitizedSpeakers,
        subTiers: sanitizedSubTiers,
      });
      projectState.isProjectSettingsOpen = false;
    } catch (err) {
      errorMessage = err.message || 'Failed to save settings.';
    }
  }

  function handleClose() {
    projectState.isProjectSettingsOpen = false;
    errorMessage = '';
    successMessage = '';
  }
</script>

{#if projectState.isProjectSettingsOpen && projectState.activeProject}
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
    role="presentation"
  >
    <div class="modal-dialog project-settings-dialog">
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-solid fa-sliders"></i>
          <span>Project Settings</span>
        </div>
        <button
          type="button"
          class="modal-close-btn"
          onclick={handleClose}
          title="Close modal"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-body">
        {#if errorMessage}
          <div class="alert alert-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>{errorMessage}</span>
          </div>
        {/if}

        <div class="form-section">
          <h4 class="section-title">General Information</h4>
          <div class="form-group">
            <label for="project-settings-title" class="form-label"
              >Project Title</label
            >
            <input
              id="project-settings-title"
              type="text"
              class="form-input"
              bind:value={title}
              placeholder="e.g., Interview Recording A"
            />
          </div>

          <div class="form-group">
            <label for="project-settings-transcriber" class="form-label"
              >Transcriber / Author</label
            >
            <input
              id="project-settings-transcriber"
              type="text"
              class="form-input"
              bind:value={transcriber}
              placeholder="e.g., Alice Smith"
            />
          </div>
        </div>

        <div class="form-section">
          <div class="section-header-row">
            <div>
              <h4 class="section-title">Speakers ({speakers.length} / 5)</h4>
              <p class="section-desc">
                Configure up to 5 speakers. Each speaker is assigned a unique
                color and initials for waveform and ELAN tiers.
              </p>
            </div>
            {#if speakers.length < 5}
              <button
                type="button"
                class="btn-add-speaker"
                onclick={handleAddSpeaker}
              >
                <i class="fa-solid fa-user-plus"></i>
                <span>Add Speaker</span>
              </button>
            {/if}
          </div>

          <div class="speakers-list">
            {#each speakers as spk (spk.id)}
              {@const col = SPEAKER_COLORS[spk.id] || SPEAKER_COLORS[1]}
              <div
                class="speaker-row"
                style="--spk-color: {col.primary}; --spk-bg: {col.bg}; --spk-border: {col.border}"
              >
                <div
                  class="speaker-color-indicator"
                  style="background: {col.primary};"
                  title="Speaker ID {spk.id} Color"
                >
                  <span class="speaker-id-badge">#{spk.id}</span>
                </div>

                <div class="speaker-field speaker-name-field">
                  <label for="spk-name-{spk.id}" class="sub-label"
                    >Full Name</label
                  >
                  <input
                    id="spk-name-{spk.id}"
                    type="text"
                    class="form-input speaker-input"
                    bind:value={spk.name}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div class="speaker-field speaker-initials-field">
                  <label for="spk-init-{spk.id}" class="sub-label"
                    >Initials (max 3)</label
                  >
                  <div class="initials-input-wrapper">
                    <input
                      id="spk-init-{spk.id}"
                      type="text"
                      maxlength="3"
                      class="form-input speaker-input initials-input"
                      value={spk.initials}
                      oninput={(e) => handleInitialsInput(spk, e.target.value)}
                      placeholder="JD"
                    />
                    <span
                      class="initials-preview"
                      style="background: {col.primary}; color: #ffffff;"
                    >
                      {spk.initials || `S${spk.id}`}
                    </span>
                  </div>
                </div>

                <div class="speaker-actions">
                  {#if speakers.length > 1}
                    <button
                      type="button"
                      class="btn-delete-speaker"
                      onclick={() => handleRemoveSpeaker(spk.id)}
                      title="Remove speaker {spk.id}"
                    >
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="form-section">
          <div class="section-header-row">
            <div>
              <h4 class="section-title">
                Sub-tiers ({subTiers.length} / {MAX_SUB_TIERS})
              </h4>
              <p class="section-desc">
                Extra text columns for each utterance &mdash; a free
                translation, a gloss, or any other layer of analysis. Each one
                is exported as an ELAN dependent tier beneath every speaker
                tier, and appears as a tab-separated column in <code>.txt</code>
                and <code>.srt</code>.
              </p>
            </div>
            {#if subTiers.length < MAX_SUB_TIERS}
              <button
                type="button"
                class="btn-add-speaker"
                onclick={handleAddSubTier}
              >
                <i class="fa-solid fa-layer-group"></i>
                <span>Add Sub-tier</span>
              </button>
            {/if}
          </div>

          {#if subTiers.length === 0}
            <p class="subtier-empty">
              No sub-tiers yet. Each segment shows a single transcription
              column.
            </p>
          {:else}
            <div class="subtiers-list">
              {#each subTiers as tier (tier.id)}
                <div class="subtier-row">
                  <div class="subtier-index">#{tier.id}</div>
                  <div class="speaker-field subtier-name-field">
                    <label for="subtier-name-{tier.id}" class="sub-label">
                      Tier name
                    </label>
                    <input
                      id="subtier-name-{tier.id}"
                      type="text"
                      class="form-input speaker-input"
                      bind:value={tier.name}
                      placeholder="e.g. Translation"
                      list="subtier-presets"
                    />
                  </div>
                  <div class="speaker-actions">
                    <button
                      type="button"
                      class="btn-delete-speaker"
                      onclick={() => handleRemoveSubTier(tier.id)}
                      title="Remove the {tier.name || 'sub-tier'} column"
                    >
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            <datalist id="subtier-presets">
              {#each SUB_TIER_PRESETS as preset (preset)}
                <option value={preset}></option>
              {/each}
            </datalist>
            <p class="subtier-note">
              <i class="fa-solid fa-circle-info"></i>
              <span>
                Removing a sub-tier hides its column and leaves it out of
                exports. Text already typed into it stays in the project, so
                adding the tier back restores what was there.
              </span>
            </p>
          {/if}
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick={handleClose}>
          Cancel
        </button>
        <button type="button" class="btn-primary" onclick={handleSaveSettings}>
          <i class="fa-solid fa-check"></i>
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
    padding: 16px;
  }

  .modal-dialog {
    background: var(--bg-card, #ffffff);
    border-radius: 12px;
    border: 1px solid var(--border-color, #e2e8f0);
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.15),
      0 8px 10px -6px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: modalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme='dark']) .modal-dialog {
    background: #1e293b;
    border-color: #334155;
  }

  @keyframes modalPop {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(6px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .modal-header {
    border-color: #334155;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.08rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-height: 75vh;
    overflow-y: auto;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .section-desc {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-color, #334155);
  }

  .sub-label {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    margin-bottom: 3px;
    display: block;
  }

  .form-input {
    padding: 7px 11px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    font-size: 0.86rem;
    background: var(--bg-card, #ffffff);
    color: var(--text-color, #0f172a);
  }

  :global([data-theme='dark']) .form-input {
    background: #0f172a;
    border-color: #334155;
    color: #f1f5f9;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
  }

  .btn-add-speaker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-add-speaker:hover {
    background: #dcfce7;
  }

  :global([data-theme='dark']) .btn-add-speaker {
    background: rgba(22, 101, 52, 0.25);
    border-color: rgba(34, 197, 94, 0.4);
    color: #4ade80;
  }

  .subtiers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .subtier-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .subtier-row {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .subtier-index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 6px;
    background: var(--bg-muted, #e2e8f0);
    color: var(--text-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 700;
  }

  :global([data-theme='dark']) .subtier-index {
    background: #334155;
    color: #cbd5e1;
  }

  .subtier-name-field {
    flex: 1;
    min-width: 0;
  }

  .subtier-empty {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
  }

  .subtier-note {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 10px 0 0;
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--text-muted, #64748b);
  }

  .subtier-note i {
    margin-top: 3px;
    flex-shrink: 0;
  }

  .speakers-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .speaker-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--spk-bg, #f8fafc);
    border: 1px solid var(--spk-border, #e2e8f0);
    border-radius: 8px;
  }

  :global([data-theme='dark']) .speaker-row {
    background: rgba(255, 255, 255, 0.03);
  }

  .speaker-color-indicator {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .speaker-id-badge {
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .speaker-name-field {
    flex: 1;
    min-width: 0;
  }

  .speaker-initials-field {
    width: 140px;
    flex-shrink: 0;
  }

  .initials-input-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .initials-input {
    width: 60px;
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
  }

  .initials-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    min-width: 28px;
  }

  .speaker-actions {
    display: flex;
    align-items: center;
    padding-top: 16px;
  }

  .btn-delete-speaker {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .btn-delete-speaker:hover {
    background: #fee2e2;
  }

  :global([data-theme='dark']) .btn-delete-speaker:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .alert-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  :global([data-theme='dark']) .alert-error {
    background: rgba(153, 27, 27, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .modal-footer {
    background: #1e293b;
    border-color: #334155;
  }

  .btn-primary,
  .btn-secondary {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: var(--primary-color, #0284c7);
    border: 1px solid transparent;
    color: #ffffff;
  }

  .btn-primary:hover {
    background: var(--primary-hover, #0369a1);
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-color, #475569);
  }

  .btn-secondary:hover {
    background: var(--bg-hover, #e2e8f0);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .btn-secondary {
    border-color: #475569;
    color: #cbd5e1;
  }
</style>
