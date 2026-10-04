<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import {
    SPEAKER_COLORS,
    ensureDefaultSpeakers,
  } from '../../utils/speakers.js';
  import {
    MAX_SUB_TIERS,
    SUB_TIER_PRESETS,
    SUB_TIER_TYPE_SENTENCE,
    SUB_TIER_TYPE_WORD,
    DEFAULT_SPLITTERS,
    COMMON_POS_LEXICON,
    UNIVERSAL_POS_LEXICON,
    LEIPZIG_GLOSS_LEXICON,
    normalizeSubTiers,
    formatLexicon,
    parseLexicon,
  } from '../../utils/subTiers.js';

  let title = $state('');
  let transcriber = $state('');
  let lexiconId = $state('');
  let speakers = $state([]);
  let subTiers = $state([]);
  let errorMessage = $state('');
  let successMessage = $state('');

  // Synchronize modal state when opened
  $effect(() => {
    if (projectState.isProjectSettingsOpen && projectState.activeProject) {
      if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
        lexiconState.init();
      }
      title = projectState.activeProject.title || '';
      transcriber = projectState.activeProject.transcriber || '';
      lexiconId = projectState.activeProject.lexiconId || '';
      const existingSpeakers = projectState.activeProject.speakers;
      speakers = ensureDefaultSpeakers(existingSpeakers).map((s) => ({ ...s }));
      subTiers = normalizeSubTiers(projectState.activeProject.subTiers).map(
        (t) => ({
          ...t,
          type: t.type || SUB_TIER_TYPE_SENTENCE,
          lexicon: Array.isArray(t.lexicon) ? [...t.lexicon] : [],
          lexiconInput: formatLexicon(t.lexicon),
          splitters:
            t.splitters != null ? String(t.splitters) : DEFAULT_SPLITTERS,
          lexiconField: t.lexiconField || '',
        }),
      );
      errorMessage = '';
      successMessage = '';
    }
  });

  const selectedLexicon = $derived(
    lexiconState.lexicons?.find((l) => l.id === lexiconId) || null,
  );

  const availableLexiconFields = $derived(
    selectedLexicon?.fields
      ? selectedLexicon.fields.filter(
          (f) => (f.name || '').trim().toLowerCase() !== 'headword',
        )
      : [],
  );

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

    const isWordType =
      preset === 'POS' || preset === 'Morphology' || preset === 'Gloss';
    const defaultLexicon =
      preset === 'POS'
        ? [...COMMON_POS_LEXICON]
        : preset === 'Morphology' || preset === 'Gloss'
          ? [...LEIPZIG_GLOSS_LEXICON]
          : [];
    const defaultLexField =
      preset === 'POS'
        ? 'POS'
        : preset === 'Morphology' || preset === 'Gloss'
          ? 'Gloss'
          : '';

    subTiers = [
      ...subTiers,
      {
        id: nextId,
        name: preset,
        type: isWordType ? SUB_TIER_TYPE_WORD : SUB_TIER_TYPE_SENTENCE,
        lexicon: defaultLexicon,
        lexiconInput: formatLexicon(defaultLexicon),
        splitters: DEFAULT_SPLITTERS,
        lexiconField: isWordType ? defaultLexField : '',
      },
    ].sort((a, b) => a.id - b.id);
  }

  function handleRemoveSubTier(idToRemove) {
    errorMessage = '';
    subTiers = subTiers.filter((t) => Number(t.id) !== Number(idToRemove));
  }

  function handleLexiconInput(tier, val) {
    tier.lexiconInput = val;
    tier.lexicon = parseLexicon(val);
  }

  function applyPresetLexicon(tier, presetArr) {
    tier.lexicon = [...presetArr];
    tier.lexiconInput = formatLexicon(presetArr);
  }

  function removeLexiconItem(tier, itemToRemove) {
    const removeVal =
      typeof itemToRemove === 'object' && itemToRemove !== null
        ? itemToRemove.value
        : itemToRemove;
    tier.lexicon = tier.lexicon.filter(
      (item) =>
        (typeof item === 'object' && item !== null ? item.value : item) !==
        removeVal,
    );
    tier.lexiconInput = formatLexicon(tier.lexicon);
  }

  function handleTypeChange(tier, newType) {
    tier.type = newType;
    if (newType === SUB_TIER_TYPE_WORD) {
      const low = (tier.name || '').toLowerCase();
      if (!tier.lexicon || tier.lexicon.length === 0) {
        if (low.includes('pos')) {
          applyPresetLexicon(tier, COMMON_POS_LEXICON);
        } else if (low.includes('gloss') || low.includes('morph')) {
          applyPresetLexicon(tier, LEIPZIG_GLOSS_LEXICON);
        }
      }
      if (!tier.lexiconField) {
        if (low.includes('pos')) {
          tier.lexiconField = 'POS';
        } else if (low.includes('gloss') || low.includes('morph')) {
          tier.lexiconField = 'Gloss';
        }
      }
    }
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

      const type =
        t.type === SUB_TIER_TYPE_WORD
          ? SUB_TIER_TYPE_WORD
          : SUB_TIER_TYPE_SENTENCE;
      const lexicon =
        type === SUB_TIER_TYPE_WORD
          ? parseLexicon(
              t.lexiconInput !== undefined
                ? t.lexiconInput
                : formatLexicon(t.lexicon),
            )
          : [];
      const splitters =
        type === SUB_TIER_TYPE_WORD
          ? t.splitters != null
            ? String(t.splitters)
            : DEFAULT_SPLITTERS
          : DEFAULT_SPLITTERS;
      const lexiconField =
        type === SUB_TIER_TYPE_WORD
          ? (t.lexiconField || '').trim()
          : '';

      sanitizedSubTiers.push({ id, name, type, lexicon, splitters, lexiconField });
    }

    try {
      await projectState.updateProjectSettings(projectState.activeProject.id, {
        title: cleanTitle,
        transcriber: transcriber.trim(),
        speakers: sanitizedSpeakers,
        subTiers: sanitizedSubTiers,
        lexiconId: lexiconId || null,
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
          <h4 class="section-title">Spellchecking &amp; Lexicon</h4>
          <p class="section-desc">
            Select an Easper lexicon to automatically spellcheck dialogue in the Transcription Studio using Hunspell.
          </p>
          <div class="form-group">
            <label for="project-settings-lexicon" class="form-label"
              >Active Lexicon</label
            >
            <select
              id="project-settings-lexicon"
              class="form-input"
              bind:value={lexiconId}
            >
              <option value="">None (Spellchecking Disabled)</option>
              {#each lexiconState.lexicons as lex (lex.id)}
                <option value={lex.id}>
                  {lex.title || lex.name || 'Untitled Lexicon'} ({lex.entries?.length || 0} entries)
                </option>
              {/each}
            </select>
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
                Extra annotation layers for each utterance. Choose between
                simple sentence-level tiers (e.g., translation) and
                word/morpheme-level tiers with lexicon auto-complete (e.g., POS
                tags, glosses, etymology). Each is exported as an ELAN dependent
                tier.
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
                <div
                  class="subtier-card {tier.type === SUB_TIER_TYPE_WORD
                    ? 'subtier-card-word'
                    : 'subtier-card-sentence'}"
                >
                  <div class="subtier-card-top">
                    <div class="subtier-index" title="Sub-tier #{tier.id}">
                      #{tier.id}
                    </div>

                    <div class="subtier-field subtier-name-field">
                      <label for="subtier-name-{tier.id}" class="sub-label">
                        Tier Name
                      </label>
                      <input
                        id="subtier-name-{tier.id}"
                        type="text"
                        class="form-input speaker-input"
                        bind:value={tier.name}
                        placeholder="e.g. Translation, POS, Gloss"
                        list="subtier-presets"
                      />
                    </div>

                    <div class="subtier-field subtier-type-field">
                      <label for="subtier-type-{tier.id}" class="sub-label">
                        Format / Type
                      </label>
                      <select
                        id="subtier-type-{tier.id}"
                        class="form-input subtier-type-select"
                        value={tier.type}
                        onchange={(e) => handleTypeChange(tier, e.target.value)}
                      >
                        <option value={SUB_TIER_TYPE_SENTENCE}>
                          Sentence (Translation)
                        </option>
                        <option value={SUB_TIER_TYPE_WORD}>
                          Word / Morpheme (POS, Gloss)
                        </option>
                      </select>
                    </div>

                    <div class="subtier-actions">
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

                  {#if tier.type === SUB_TIER_TYPE_WORD}
                    <div class="subtier-word-panel">
                      <div class="splitters-input-group">
                        <label
                          for="splitters-input-{tier.id}"
                          class="sub-label"
                        >
                          <i class="fa-solid fa-scissors"></i>
                          Word and Morpheme Splitter Characters (space is always
                          a splitter):
                        </label>
                        <textarea
                          id="splitters-input-{tier.id}"
                          class="form-input splitters-textarea"
                          rows="1"
                          placeholder="e.g. - = ~"
                          bind:value={tier.splitters}
                        ></textarea>
                        <span class="splitters-hint">
                          Characters that divide utterances (e.g. <code>-</code>
                          for affixes and <code>=</code> for clitics).
                        </span>
                      </div>

                      <div class="lexicon-header">
                        <div class="lexicon-title-area">
                          <span class="lexicon-title">
                            <i class="fa-solid fa-tags"></i>
                            Lexicon &amp; Valid Values
                          </span>
                          <span class="lexicon-badge">
                            {tier.lexicon.length} tag{tier.lexicon.length === 1
                              ? ''
                              : 's'}
                          </span>
                        </div>
                        <div class="lexicon-presets-bar">
                          <span class="preset-label">Presets:</span>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, COMMON_POS_LEXICON)}
                            title="Insert common POS tags (prop, n, v, adj, adv, h, aux...)"
                          >
                            Common POS
                          </button>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, UNIVERSAL_POS_LEXICON)}
                            title="Universal Dependencies POS (NOUN, VERB, ADJ, ADV...)"
                          >
                            Universal POS
                          </button>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, LEIPZIG_GLOSS_LEXICON)}
                            title="Leipzig Glossing tags (1SG, 2SG, NOM, PAST, PL...)"
                          >
                            Leipzig Gloss
                          </button>
                          {#if tier.lexicon.length > 0}
                            <button
                              type="button"
                              class="btn-preset btn-preset-clear"
                              onclick={() => applyPresetLexicon(tier, [])}
                              title="Clear all lexicon values"
                            >
                              Clear
                            </button>
                          {/if}
                        </div>
                      </div>

                      <div class="lexicon-input-group">
                        <label for="lexicon-input-{tier.id}" class="sub-label">
                          Valid values / tags (comma, space, or
                          newline-separated, optional label in braces):
                        </label>
                        <textarea
                          id="lexicon-input-{tier.id}"
                          class="form-input lexicon-textarea"
                          rows="2"
                          placeholder={'e.g. prop {Proper Name}, n {Noun}, v {Verb}, adj {Adjective}'}
                          value={tier.lexiconInput}
                          oninput={(e) =>
                            handleLexiconInput(tier, e.target.value)}
                        ></textarea>
                      </div>

                      {#if tier.lexicon.length > 0}
                        <div class="lexicon-chips-wrapper">
                          <div class="lexicon-chips-list">
                            {#each tier.lexicon as tag}
                              {@const tagVal =
                                typeof tag === 'object' && tag !== null
                                  ? tag.value
                                  : tag}
                              {@const tagLabel =
                                typeof tag === 'object' && tag !== null
                                  ? tag.label
                                  : ''}
                              <span
                                class="lexicon-chip"
                                title={tagLabel
                                  ? `${tagVal}: ${tagLabel}`
                                  : tagVal}
                              >
                                <span class="lexicon-chip-text">{tagVal}</span>
                                {#if tagLabel}
                                  <span class="lexicon-chip-label"
                                    >{tagLabel}</span
                                  >
                                {/if}
                                <button
                                  type="button"
                                  class="btn-chip-remove"
                                  onclick={() => removeLexiconItem(tier, tag)}
                                  title="Remove '{tagVal}'"
                                >
                                  &times;
                                </button>
                              </span>
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <p class="lexicon-empty-tip">
                          <i class="fa-solid fa-circle-info"></i>
                          <span>
                            No lexicon tags defined. Click a preset above or
                            type tags to enable auto-complete when annotating
                            words.
                          </span>
                        </p>
                      {/if}

                      <!-- Active Lexicon Source Field Setting -->
                      <div class="lexfield-mapping-group">
                        <div class="lexfield-mapping-header">
                          <label
                            for="lexfield-select-{tier.id}"
                            class="sub-label lexfield-label"
                          >
                            <i class="fa-solid fa-database"></i>
                            Active Lexicon Field (Auto Tagging Source):
                          </label>
                          {#if selectedLexicon}
                            <span
                              class="lexfield-active-badge"
                              title="Active Lexicon for this project"
                            >
                              <i class="fa-solid fa-book-bookmark"></i>
                              {selectedLexicon.title ||
                                selectedLexicon.name ||
                                'Active Lexicon'}
                            </span>
                          {/if}
                        </div>

                        {#if selectedLexicon}
                          <div class="lexfield-select-wrapper">
                            <select
                              id="lexfield-select-{tier.id}"
                              class="form-input lexfield-select"
                              bind:value={tier.lexiconField}
                            >
                              <option value="">None (Auto Tagging Disabled)</option>
                              {#each availableLexiconFields as field (field.id)}
                                <option value={field.name}>
                                  {field.name}
                                </option>
                              {/each}
                              {#if tier.lexiconField && !availableLexiconFields.some((f) => f.name === tier.lexiconField)}
                                <option value={tier.lexiconField}>
                                  {tier.lexiconField} (Custom / Unmatched)
                                </option>
                              {/if}
                            </select>
                          </div>
                          <span class="lexfield-hint">
                            Values from this field in <strong
                              >{selectedLexicon.title ||
                                'the active lexicon'}</strong
                            > will be automatically grabbed when you run Auto Tagging
                            in the workspace.
                          </span>
                        {:else}
                          <div class="lexfield-no-lexicon-warning">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>
                              No active lexicon selected for this project. Choose
                              an <strong>Active Lexicon</strong> in the section above
                              to specify a field (e.g. POS or Gloss) for Auto Tagging.
                            </span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="subtier-sentence-note">
                      <i class="fa-solid fa-align-left"></i>
                      <span>
                        Simple sub-tier: each segment displays a single text
                        area for straightforward sentences or translations.
                      </span>
                    </div>
                  {/if}
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
    max-width: 680px;
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
    gap: 12px;
  }

  .subtier-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    background: var(--bg-hover, #f8fafc);
    transition: border-color 0.15s ease;
  }

  :global([data-theme='dark']) .subtier-card {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .subtier-card-word {
    border-left: 3px solid var(--primary-color, #0284c7);
  }

  .subtier-card-sentence {
    border-left: 3px solid #10b981;
  }

  .subtier-card-top {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    width: 100%;
  }

  .subtier-index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 6px;
    background: var(--bg-muted, #e2e8f0);
    color: var(--text-muted, #64748b);
    font-size: 0.75rem;
    font-weight: 700;
    margin-bottom: 1px;
  }

  :global([data-theme='dark']) .subtier-index {
    background: #334155;
    color: #cbd5e1;
  }

  .subtier-name-field {
    flex: 1.2;
    min-width: 0;
  }

  .subtier-type-field {
    flex: 1.4;
    min-width: 0;
  }

  .subtier-type-select {
    cursor: pointer;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .subtier-type-select {
    color: #f1f5f9;
  }

  .subtier-actions {
    display: flex;
    align-items: center;
    padding-bottom: 2px;
  }

  .subtier-word-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: rgba(2, 132, 199, 0.04);
    border: 1px solid rgba(2, 132, 199, 0.15);
    border-radius: 8px;
  }

  :global([data-theme='dark']) .subtier-word-panel {
    background: rgba(56, 189, 248, 0.04);
    border-color: rgba(56, 189, 248, 0.18);
  }

  .splitters-input-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 6px;
    border-bottom: 1px dashed rgba(2, 132, 199, 0.2);
  }

  :global([data-theme='dark']) .splitters-input-group {
    border-bottom-color: rgba(56, 189, 248, 0.2);
  }

  .splitters-textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.4;
    resize: vertical;
    min-height: 32px;
    padding: 5px 10px;
  }

  .splitters-hint {
    font-size: 0.71rem;
    color: var(--text-muted, #64748b);
    line-height: 1.35;
  }

  .splitters-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.74rem;
    background: rgba(0, 0, 0, 0.06);
    color: var(--primary-color, #0284c7);
    padding: 1px 4px;
    border-radius: 3px;
  }

  :global([data-theme='dark']) .splitters-hint code {
    background: rgba(255, 255, 255, 0.1);
    color: #38bdf8;
  }

  .lexicon-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lexicon-title-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lexicon-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  :global([data-theme='dark']) .lexicon-title {
    color: #38bdf8;
  }

  .lexicon-badge {
    background: rgba(2, 132, 199, 0.15);
    color: var(--primary-color, #0284c7);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }

  :global([data-theme='dark']) .lexicon-badge {
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .lexicon-presets-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .preset-label {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    font-weight: 600;
  }

  .btn-preset {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-color, #334155);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .btn-preset:hover {
    background: #e0f2fe;
    color: #0284c7;
    border-color: #7dd3fc;
  }

  :global([data-theme='dark']) .btn-preset {
    background: #1e293b;
    border-color: #475569;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-preset:hover {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .btn-preset-clear {
    color: #ef4444;
    border-color: #fca5a5;
  }

  .btn-preset-clear:hover {
    background: #fee2e2;
    color: #dc2626;
    border-color: #f87171;
  }

  .lexicon-input-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .lexicon-textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.78rem;
    line-height: 1.4;
    resize: vertical;
    min-height: 44px;
  }

  .lexicon-chips-wrapper {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lexicon-chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 110px;
    overflow-y: auto;
    padding: 2px;
  }

  .lexicon-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.12);
    border: 1px solid rgba(2, 132, 199, 0.25);
    color: #0369a1;
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-weight: 600;
  }

  :global([data-theme='dark']) .lexicon-chip {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.25);
    color: #7dd3fc;
  }

  .lexicon-chip-label {
    font-size: 0.68rem;
    font-weight: 400;
    opacity: 0.8;
    background: rgba(2, 132, 199, 0.15);
    padding: 0 4px;
    border-radius: 3px;
  }

  :global([data-theme='dark']) .lexicon-chip-label {
    background: rgba(56, 189, 248, 0.2);
  }

  .btn-chip-remove {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 0.82rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 1px;
    opacity: 0.7;
    transition: opacity 0.1s ease;
  }

  .btn-chip-remove:hover {
    opacity: 1;
    color: #ef4444;
  }

  .lexicon-empty-tip,
  .subtier-sentence-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
  }

  .subtier-sentence-note {
    padding: 4px 6px;
    color: #059669;
  }

  :global([data-theme='dark']) .subtier-sentence-note {
    color: #34d399;
  }

  .lexfield-mapping-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px dashed rgba(2, 132, 199, 0.2);
    margin-top: 4px;
  }

  :global([data-theme='dark']) .lexfield-mapping-group {
    border-top-color: rgba(56, 189, 248, 0.2);
  }

  .lexfield-mapping-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lexfield-label {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }

  .lexfield-active-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #059669;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    padding: 2px 8px;
    border-radius: 12px;
  }

  :global([data-theme='dark']) .lexfield-active-badge {
    color: #34d399;
    background: rgba(16, 185, 129, 0.2);
    border-color: rgba(52, 211, 153, 0.3);
  }

  .lexfield-select-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lexfield-select {
    max-width: 320px;
    font-weight: 600;
  }

  .lexfield-hint {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    line-height: 1.35;
  }

  .lexfield-hint strong {
    color: var(--text-color, #1e293b);
  }

  :global([data-theme='dark']) .lexfield-hint strong {
    color: #f1f5f9;
  }

  .lexfield-no-lexicon-warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.75rem;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 6px 10px;
    line-height: 1.4;
  }

  :global([data-theme='dark']) .lexfield-no-lexicon-warning {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.25);
  }

  .lexfield-no-lexicon-warning i {
    margin-top: 2px;
    flex-shrink: 0;
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
