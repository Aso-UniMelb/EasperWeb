<script>
  import { untrack } from 'svelte';
  import { projectState } from '../../state/projectState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import {
    SPEAKER_COLORS,
    ensureDefaultSpeakers,
  } from '../../utils/speakers.js';
  import {
    MAX_SUB_TIERS,
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
  import {
    DEFAULT_ALLOWED_TAGS,
    ACRONYM_MODES,
    normalizeValidationRules,
    parseAllowedTags,
    formatAllowedTags,
    isValidationActive,
  } from '../../utils/segmentValidator.js';

  let title = $state('');
  let transcriber = $state('');
  let mainTierTitle = $state('');
  let lexiconId = $state('');
  let speakers = $state([]);
  let subTiers = $state([]);
  let activeTab = $state('main'); // 'main' | 'subtiers' | 'validation'
  let showSubTierHelp = $state(false);
  let showValidationHelp = $state(false);

  // Validation Rules state
  let validateTags = $state(false);
  let allowedTags = $state([...DEFAULT_ALLOWED_TAGS]);
  let allowedTagsInput = $state(formatAllowedTags(DEFAULT_ALLOWED_TAGS));
  let fixApostropheBacktick = $state(false);
  let fixDoubleSpaces = $state(false);
  let validateAcronyms = $state(false);
  let acronymMode = $state(ACRONYM_MODES.PLAIN);
  let validateCustomRules = $state(false);
  let customRules = $state([]);
  let newRuleFind = $state('');
  let newRuleReplace = $state('');
  let newRuleIsRegex = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let wasOpen = false;
  let lastOpenProjectId = null;

  // Synchronize modal state when opened
  $effect(() => {
    const isOpen = Boolean(
      projectState.isProjectSettingsOpen && projectState.activeProject,
    );
    const currentProjectId = projectState.activeProject?.id || null;

    if (isOpen && (!wasOpen || lastOpenProjectId !== currentProjectId)) {
      untrack(() => {
        if (
          !lexiconState.isInitialized &&
          (!lexiconState.lexicons || lexiconState.lexicons.length === 0)
        ) {
          lexiconState.init();
        }
        if (projectState.activeProject) {
          title = projectState.activeProject.title || '';
          transcriber = projectState.activeProject.transcriber || '';
          mainTierTitle = projectState.activeProject.mainTierTitle || '';
          lexiconId = projectState.activeProject.lexiconId || '';
          const existingSpeakers = projectState.activeProject.speakers;
          speakers = ensureDefaultSpeakers(existingSpeakers).map((s) => ({
            ...s,
          }));
          subTiers = normalizeSubTiers(projectState.activeProject.subTiers).map(
            (t) => ({
              ...t,
              annotator: t.annotator || '',
              type: t.type || SUB_TIER_TYPE_SENTENCE,
              lexicon: Array.isArray(t.lexicon) ? [...t.lexicon] : [],
              lexiconInput: formatLexicon(t.lexicon),
              splitters:
                t.splitters != null ? String(t.splitters) : DEFAULT_SPLITTERS,
              lexiconField: t.lexiconField || '',
            }),
          );
          const vRules = normalizeValidationRules(
            projectState.activeProject.validationRules,
          );
          validateTags = vRules.validateTags;
          allowedTags = [...vRules.allowedTags];
          allowedTagsInput = formatAllowedTags(vRules.allowedTags);
          fixApostropheBacktick = vRules.fixApostropheBacktick;
          fixDoubleSpaces = vRules.fixDoubleSpaces;
          validateAcronyms = Boolean(vRules.validateAcronyms);
          acronymMode =
            vRules.acronymMode && vRules.acronymMode !== ACRONYM_MODES.DISABLED
              ? vRules.acronymMode
              : ACRONYM_MODES.PLAIN;
          validateCustomRules = Boolean(vRules.validateCustomRules);
          customRules = vRules.customRules.map((r) => ({ ...r }));
          newRuleFind = '';
          newRuleReplace = '';
          newRuleIsRegex = false;
        }
        activeTab = 'main';
        showSubTierHelp = false;
        showValidationHelp = false;
        errorMessage = '';
        successMessage = '';
      });
      lastOpenProjectId = currentProjectId;
    }
    wasOpen = isOpen;
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
    ].sort((a, b) => Number(a.id) - Number(b.id));
  }

  function handleRemoveSpeaker(idToRemove) {
    errorMessage = '';
    if (speakers.length <= 1) {
      errorMessage = 'A project must have at least one speaker.';
      return;
    }
    speakers = speakers.filter((s) => Number(s.id) !== Number(idToRemove));
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

    subTiers = [
      ...subTiers,
      {
        id: nextId,
        name: '',
        annotator: '',
        type: SUB_TIER_TYPE_SENTENCE,
        lexicon: [],
        lexiconInput: '',
        splitters: DEFAULT_SPLITTERS,
        lexiconField: '',
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

  function handleAllowedTagsInput(val) {
    allowedTagsInput = val;
    allowedTags = parseAllowedTags(val);
  }

  function applyDefaultAllowedTags() {
    allowedTags = [...DEFAULT_ALLOWED_TAGS];
    allowedTagsInput = formatAllowedTags(DEFAULT_ALLOWED_TAGS);
  }

  function removeAllowedTag(tagToRemove) {
    allowedTags = allowedTags.filter((t) => t !== tagToRemove);
    allowedTagsInput = formatAllowedTags(allowedTags);
  }

  function handleAddCustomValidationRule() {
    const cleanFind = newRuleFind.trim();
    if (!cleanFind) return;
    customRules = [
      ...customRules,
      {
        id: `vrule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        find: cleanFind,
        replace: newRuleReplace,
        isRegex: newRuleIsRegex,
        matchCase: false,
        enabled: true,
      },
    ];
    newRuleFind = '';
    newRuleReplace = '';
    newRuleIsRegex = false;
  }

  function handleRemoveCustomValidationRule(idToRemove) {
    customRules = customRules.filter((r) => r.id !== idToRemove);
  }

  const activeValidationCount = $derived(
    (validateTags ? 1 : 0) +
      (fixApostropheBacktick ? 1 : 0) +
      (fixDoubleSpaces ? 1 : 0) +
      (validateAcronyms ? 1 : 0) +
      (validateCustomRules
        ? customRules.filter((r) => r.enabled !== false && r.find?.trim()).length
        : 0),
  );

  async function handleSaveSettings() {
    errorMessage = '';
    successMessage = '';

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      activeTab = 'main';
      errorMessage = 'Project title cannot be empty.';
      return;
    }

    if (!speakers || speakers.length === 0) {
      activeTab = 'main';
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
        activeTab = 'subtiers';
        errorMessage = 'Every sub-tier needs a name.';
        return;
      }
      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        activeTab = 'subtiers';
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
      const annotator = (t.annotator || '').trim();

      sanitizedSubTiers.push({
        id,
        name,
        annotator,
        type,
        lexicon,
        splitters,
        lexiconField,
      });
    }

    const sanitizedValidationRules = normalizeValidationRules({
      validateTags,
      allowedTags: parseAllowedTags(allowedTagsInput),
      fixApostropheBacktick,
      fixDoubleSpaces,
      validateAcronyms,
      acronymMode: validateAcronyms ? acronymMode : ACRONYM_MODES.DISABLED,
      validateCustomRules,
      customRules,
    });

    try {
      await projectState.updateProjectSettings(projectState.activeProject.id, {
        title: cleanTitle,
        transcriber: transcriber.trim(),
        mainTierTitle: mainTierTitle.trim(),
        speakers: sanitizedSpeakers,
        subTiers: sanitizedSubTiers,
        lexiconId: lexiconId || null,
        validationRules: sanitizedValidationRules,
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

      <!-- Tab Navigation Bar -->
      <div class="settings-tabs-bar" role="tablist" aria-label="Project settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'main'}
          class="settings-tab-btn {activeTab === 'main' ? 'active' : ''}"
          onclick={() => (activeTab = 'main')}
        >
          <i class="fa-solid fa-sliders"></i>
          <span>Main Settings</span>
          <span class="tab-badge">{speakers.length} spk</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subtiers'}
          class="settings-tab-btn {activeTab === 'subtiers' ? 'active' : ''}"
          onclick={() => (activeTab = 'subtiers')}
        >
          <i class="fa-solid fa-layer-group"></i>
          <span>Sub-tiers</span>
          <span class="tab-badge">{subTiers.length} / {MAX_SUB_TIERS}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'validation'}
          class="settings-tab-btn {activeTab === 'validation' ? 'active' : ''}"
          onclick={() => (activeTab = 'validation')}
        >
          <i class="fa-solid fa-shield-halved"></i>
          <span>Validation</span>
          {#if activeValidationCount > 0}
            <span class="tab-badge tab-badge-active">
              {activeValidationCount} active
            </span>
          {:else}
            <span class="tab-badge">Off</span>
          {/if}
        </button>
      </div>

      <div class="modal-body">
        {#if errorMessage}
          <div class="alert alert-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>{errorMessage}</span>
          </div>
        {/if}

        {#if activeTab === 'main'}
        <div class="form-section">
          <div class="general-grid">
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
        </div>

        <div class="form-section">
          <div class="section-header-row">
            <div class="section-title-wrap">
              <h4 class="section-title">
                Main Transcription Tiers <span class="counter-badge">{speakers.length} / 5</span>
              </h4>
              <span class="section-subtitle">
                Root tier title, transcriber &amp; speaker participants
              </span>
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

          <div class="main-tiers-config-grid">
            <div class="form-group">
              <label
                for="project-settings-main-tier"
                class="form-label"
                title="Title prefix for root transcription tiers in ELAN export (e.g. BIS@Speaker1)"
              >
                Main Tier Title
              </label>
              <input
                id="project-settings-main-tier"
                type="text"
                class="form-input"
                bind:value={mainTierTitle}
                placeholder="e.g. BIS (outputs BIS@Speaker1)"
                title="When exporting to ELAN, root tiers will be named '{mainTierTitle.trim() || 'Title'}@Speaker'"
              />
            </div>

            <div class="form-group">
              <label for="project-settings-transcriber" class="form-label"
                >Transcriber</label
              >
              <input
                id="project-settings-transcriber"
                type="text"
                class="form-input"
                bind:value={transcriber}
                placeholder="e.g., Alice Smith"
                title="Transcriber name added to ANNOTATOR attribute of main transcription tiers"
              />
            </div>
          </div>

          <div class="speakers-list">
            <div class="speakers-header-bar">
              <span class="spk-th-id">#</span>
              <span class="spk-th-name">Speaker Name</span>
              <span class="spk-th-init">Initials</span>
              <span class="spk-th-act"></span>
            </div>
            {#each speakers as spk (spk.id)}
              {@const col = SPEAKER_COLORS[spk.id] || SPEAKER_COLORS[1]}
              <div
                class="speaker-row"
                style="--spk-color: {col.primary}; --spk-bg: {col.bg}; --spk-border: {col.border}"
              >
                <div
                  class="speaker-color-indicator"
                  style="background: {col.primary};"
                  title="Speaker ID #{spk.id}"
                >
                  <span class="speaker-id-badge">#{spk.id}</span>
                </div>

                <div class="speaker-field speaker-name-field">
                  <input
                    id="spk-name-{spk.id}"
                    type="text"
                    class="form-input speaker-input"
                    bind:value={spk.name}
                    placeholder="Speaker {spk.id} Name"
                  />
                </div>

                <div class="speaker-field speaker-initials-field">
                  <div class="initials-input-wrapper">
                    <input
                      id="spk-init-{spk.id}"
                      type="text"
                      maxlength="3"
                      class="form-input speaker-input initials-input"
                      value={spk.initials}
                      oninput={(e) => handleInitialsInput(spk, e.target.value)}
                      placeholder="S{spk.id}"
                      title="Max 3 initials"
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
        {:else if activeTab === 'subtiers'}
        <div class="form-section">
          <div class="section-header-row">
            <div class="section-title-wrap">
              <h4 class="section-title">
                Sub-tiers <span class="counter-badge">{subTiers.length} / {MAX_SUB_TIERS}</span>
              </h4>
              <button
                type="button"
                class="btn-help-toggle"
                class:active={showSubTierHelp}
                onclick={() => (showSubTierHelp = !showSubTierHelp)}
                title="Toggle sub-tier help and type guide"
                aria-label="Toggle sub-tier help"
              >
                <i class="fa-solid fa-circle-question"></i>
                <span>Help &amp; Types</span>
              </button>
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

          {#if showSubTierHelp}
            <div class="subtier-help-panel">
              <div class="help-panel-header">
                <div class="help-panel-title">
                  <i class="fa-solid fa-book-open"></i>
                  <span>Sub-tier Types &amp; Word/Morpheme Guide</span>
                </div>
                <button
                  type="button"
                  class="btn-close-help"
                  onclick={() => (showSubTierHelp = false)}
                  title="Close help"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="help-cards-grid">
                <div class="help-type-card help-card-sentence">
                  <div class="help-type-badge sentence-badge">
                    <i class="fa-solid fa-align-left"></i>
                    <span>Sentence (Translation)</span>
                  </div>
                  <p class="help-type-desc">
                    A single full-utterance text field per segment. Ideal for free translations, comments, or notes.
                  </p>
                  <div class="help-elan-note">
                    <i class="fa-solid fa-file-export"></i>
                    <span>ELAN: exported as a <code>Symbolic_Association</code> tier directly under the main speaker tier.</span>
                  </div>
                </div>

                <div class="help-type-card help-card-word">
                  <div class="help-type-badge word-badge">
                    <i class="fa-solid fa-scissors"></i>
                    <span>Word / Morpheme (POS, Gloss, etc.)</span>
                  </div>
                  <p class="help-type-desc">
                    Divides each utterance into individual tokens for linguistic tagging (e.g. parts of speech, Leipzig glosses, morphemes).
                  </p>
                  <div class="help-points">
                    <div class="help-point">
                      <strong>Splitters:</strong> Characters like <code>-</code> (affixes) or <code>=</code> (clitics) that divide words into morphemes. Whitespace is always a splitter.
                    </div>
                    <div class="help-point">
                      <strong>Tags / Presets:</strong> Define valid values (e.g. <code>prop</code>, <code>n</code>, <code>v</code>) to enable quick auto-complete when annotating.
                    </div>
                    <div class="help-point">
                      <strong>Auto-Tag Field:</strong> Link to a column in your project's Active Lexicon so <em>Auto Tagging</em> automatically fills tags from dictionary matches.
                    </div>
                  </div>
                  <div class="help-elan-note">
                    <i class="fa-solid fa-file-export"></i>
                    <span>ELAN: creates a <code>Time_Subdivision</code> tier (<code>morphs@Speaker</code>) with dependent annotation tiers.</span>
                  </div>
                </div>
              </div>
            </div>
          {/if}

          {#if subTiers.length === 0}
            <p class="subtier-empty">
              No sub-tiers yet. Each segment shows a single transcription column.
            </p>
          {:else}
            <div class="subtiers-list">
              <div class="subtiers-header-bar">
                <span class="sub-th-id">#</span>
                <span class="sub-th-name">Sub-tier Name</span>
                <span class="sub-th-type">Type</span>
                <span class="sub-th-annotator">Annotator</span>
                <span class="sub-th-act"></span>
              </div>
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
                      <input
                        id="subtier-name-{tier.id}"
                        type="text"
                        class="form-input subtier-input"
                        bind:value={tier.name}
                        placeholder="Sub-tier name"
                      />
                    </div>

                    <div class="subtier-field subtier-type-field">
                      <div class="subtier-type-wrapper">
                        <select
                          id="subtier-type-{tier.id}"
                          class="form-input subtier-type-select"
                          value={tier.type}
                          onchange={(e) =>
                            handleTypeChange(tier, e.target.value)}
                        >
                          <option value={SUB_TIER_TYPE_SENTENCE}>
                            Sentence (Translation)
                          </option>
                          <option value={SUB_TIER_TYPE_WORD}>
                            Word / Morpheme (POS, Gloss)
                          </option>
                        </select>
                        <button
                          type="button"
                          class="btn-inline-help"
                          onclick={() => (showSubTierHelp = !showSubTierHelp)}
                          title="Click to learn about Sentence vs. Word/Morpheme tiers"
                        >
                          <i class="fa-solid fa-circle-question"></i>
                        </button>
                      </div>
                    </div>

                    <div class="subtier-field subtier-annotator-field">
                      <input
                        id="subtier-annotator-{tier.id}"
                        type="text"
                        class="form-input subtier-input"
                        bind:value={tier.annotator}
                        placeholder="Annotator"
                        title="Annotator name for this sub-tier in ELAN export"
                      />
                    </div>

                    <div class="subtier-actions">
                      <button
                        type="button"
                        class="btn-delete-speaker"
                        onclick={() => handleRemoveSubTier(tier.id)}
                        title="Remove {tier.name || 'sub-tier'}"
                      >
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>

                  {#if tier.type === SUB_TIER_TYPE_WORD}
                    <div class="subtier-word-panel">
                      <div class="word-panel-info-row">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>
                          Word/Morpheme tier: split words by splitters, autocomplete tags, and map to the active lexicon.
                        </span>
                        <button
                          type="button"
                          class="btn-help-inline-link"
                          onclick={() => (showSubTierHelp = true)}
                        >
                          Learn more
                        </button>
                      </div>

                      <div class="word-tier-meta-row">
                        <div class="splitters-col">
                          <label
                            for="splitters-input-{tier.id}"
                            class="sub-label compact-sub-label"
                            title="Characters that divide utterances (space is always a splitter)"
                          >
                            <i class="fa-solid fa-scissors"></i>
                            Splitters
                          </label>
                          <input
                            id="splitters-input-{tier.id}"
                            type="text"
                            class="form-input splitters-input"
                            placeholder="e.g. - = ~"
                            bind:value={tier.splitters}
                          />
                        </div>

                        <div class="lexfield-col">
                          <div class="lexfield-header-inline">
                            <label
                              for="lexfield-select-{tier.id}"
                              class="sub-label compact-sub-label"
                              title="Field in active lexicon to grab values from during Auto Tagging"
                            >
                              <i class="fa-solid fa-database"></i>
                              Auto-Tag Field
                            </label>
                            {#if selectedLexicon}
                              <span
                                class="lexfield-active-badge-sm"
                                title="Active Lexicon: {selectedLexicon.title || selectedLexicon.name}"
                              >
                                {selectedLexicon.title || selectedLexicon.name || 'Active'}
                              </span>
                            {/if}
                          </div>
                          {#if selectedLexicon}
                            <select
                              id="lexfield-select-{tier.id}"
                              class="form-input lexfield-select-sm"
                              bind:value={tier.lexiconField}
                            >
                              <option value="">None (Disabled)</option>
                              {#each availableLexiconFields as field (field.id)}
                                <option value={field.name}>{field.name}</option>
                              {/each}
                              {#if tier.lexiconField && !availableLexiconFields.some((f) => f.name === tier.lexiconField)}
                                <option value={tier.lexiconField}>
                                  {tier.lexiconField} (Custom)
                                </option>
                              {/if}
                            </select>
                          {:else}
                            <div class="lexfield-no-lexicon-sm" title="Select an Active Lexicon above to enable Auto Tagging">
                              <i class="fa-solid fa-circle-info"></i>
                              <span>No active lexicon selected</span>
                            </div>
                          {/if}
                        </div>
                      </div>

                      <div class="lexicon-header">
                        <div class="lexicon-title-area">
                          <span class="lexicon-title">
                            <i class="fa-solid fa-tags"></i>
                            Tags
                          </span>
                          <span class="lexicon-badge">
                            {tier.lexicon.length}
                          </span>
                        </div>
                        <div class="lexicon-presets-bar">
                          <span class="preset-label">Presets:</span>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, COMMON_POS_LEXICON)}
                            title="Insert common POS tags (prop, n, v, adj, adv...)"
                          >
                            Common POS
                          </button>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, UNIVERSAL_POS_LEXICON)}
                            title="Universal Dependencies POS (NOUN, VERB, ADJ...)"
                          >
                            Universal POS
                          </button>
                          <button
                            type="button"
                            class="btn-preset"
                            onclick={() =>
                              applyPresetLexicon(tier, LEIPZIG_GLOSS_LEXICON)}
                            title="Leipzig Glossing tags (1SG, 2SG, NOM, PAST...)"
                          >
                            Leipzig Gloss
                          </button>
                          {#if tier.lexicon.length > 0}
                            <button
                              type="button"
                              class="btn-preset btn-preset-clear"
                              onclick={() => applyPresetLexicon(tier, [])}
                              title="Clear all tags"
                            >
                              Clear
                            </button>
                          {/if}
                        </div>
                      </div>

                      <div class="lexicon-input-group">
                        <input
                          id="lexicon-input-{tier.id}"
                          type="text"
                          class="form-input lexicon-input-sm"
                          placeholder="Comma/space-separated tags, optional label in braces: n {'{'}Noun{'}'}, v {'{'}Verb{'}'}"
                          value={tier.lexiconInput}
                          oninput={(e) =>
                            handleLexiconInput(tier, e.target.value)}
                        />
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
                      {/if}
                    </div>
                  {:else}
                    <div class="subtier-sentence-note">
                      <i class="fa-solid fa-align-left"></i>
                      <span>
                        Sentence-level tier (single text per segment).
                      </span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {:else if activeTab === 'validation'}
        <!-- Validation Rules Section -->
        <div class="form-section">
          <div class="section-header-row">
            <div class="section-title-wrap">
              <h4 class="section-title">
                Validation Rules
                {#if activeValidationCount > 0}
                  <span class="counter-badge validation-active-badge">
                    {activeValidationCount} active
                  </span>
                {:else}
                  <span class="counter-badge">Off</span>
                {/if}
              </h4>
              <button
                type="button"
                class="btn-help-toggle"
                class:active={showValidationHelp}
                onclick={() => (showValidationHelp = !showValidationHelp)}
                title="Toggle validation rules guide"
                aria-label="Toggle validation rules help"
              >
                <i class="fa-solid fa-circle-question"></i>
                <span>Help &amp; Examples</span>
              </button>
            </div>
          </div>

          {#if showValidationHelp}
            <div class="subtier-help-panel">
              <div class="help-panel-header">
                <div class="help-panel-title">
                  <i class="fa-solid fa-shield-halved"></i>
                  <span>Automatic Segment Validation Guide</span>
                </div>
                <button
                  type="button"
                  class="btn-close-help"
                  onclick={() => (showValidationHelp = false)}
                  title="Close help"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="help-points">
                <div class="help-point">
                  <strong>Paralinguistic Tags:</strong> Flags broken or malformed tags like
                  <code>&lt; hes&gt;</code>, <code>&lt;  overlap  &gt;</code>,
                  <code>&lt;Cough &gt;</code>, or <code>hes&gt;</code> and suggests
                  the clean tag from your Allowed Paralinguistic Tags list.
                </div>
                <div class="help-point">
                  <strong>Punctuation:</strong> Flags invalid apostrophes like
                  <code>`</code> instead of <code>'</code> (e.g. <code>don`t</code>
                  &rarr; <code>don't</code>) and multiple consecutive spaces.
                </div>
                <div class="help-point">
                  <strong>Acronyms:</strong> Enforces a consistent acronym style
                  across segments (e.g. <code>P_N_G_</code> vs. <code>P_N_G</code>
                  vs. <code>PNG</code>).
                </div>
              </div>
            </div>
          {/if}

          <div class="validation-rules-card">
            <div class="validation-toggles-grid">
              <!-- 1. Paralinguistic Tags Check + Allowed List directly underneath -->
              <div class="validation-rule-group">
                <label class="validation-check-item">
                  <input
                    type="checkbox"
                    bind:checked={validateTags}
                  />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Validate Paralinguistic Tags
                    </span>
                    <span class="validation-check-desc">
                      Catch malformed tags like <code>&lt; hes&gt;</code>, <code>&lt;  overlap  &gt;</code>, <code>&lt;Cough &gt;</code>, <code>hes&gt;</code>
                    </span>
                  </div>
                </label>

                {#if validateTags}
                  <div class="validation-subpanel">
                    <div class="lexicon-header">
                      <div class="lexicon-title-area">
                        <span class="lexicon-title">
                          <i class="fa-solid fa-code"></i>
                          Allowed Paralinguistic Tags
                        </span>
                        <span class="lexicon-badge">{allowedTags.length}</span>
                      </div>
                      <div class="lexicon-presets-bar">
                        <button
                          type="button"
                          class="btn-preset"
                          onclick={applyDefaultAllowedTags}
                          title="Restore default paralinguistic tags (<hes>, <overlap>, <cough>, <laughter>...)"
                        >
                          Standard Tags
                        </button>
                        {#if allowedTags.length > 0}
                          <button
                            type="button"
                            class="btn-preset btn-preset-clear"
                            onclick={() => handleAllowedTagsInput('')}
                            title="Clear all allowed tags"
                          >
                            Clear
                          </button>
                        {/if}
                      </div>
                    </div>

                    <input
                      id="validation-allowed-tags-input"
                      type="text"
                      class="form-input lexicon-input-sm"
                      placeholder="Space or comma-separated tags, e.g. <hes> <overlap> <cough> <laughter>"
                      value={allowedTagsInput}
                      oninput={(e) => handleAllowedTagsInput(e.target.value)}
                    />

                    {#if allowedTags.length > 0}
                      <div class="lexicon-chips-list">
                        {#each allowedTags as tag (tag)}
                          <span class="lexicon-chip">
                            <span class="lexicon-chip-text">{tag}</span>
                            <button
                              type="button"
                              class="btn-chip-remove"
                              onclick={() => removeAllowedTag(tag)}
                              title="Remove '{tag}'"
                            >
                              &times;
                            </button>
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- 2. Invalid Apostrophe -->
              <label class="validation-check-item">
                <input
                  type="checkbox"
                  bind:checked={fixApostropheBacktick}
                />
                <div class="validation-check-text">
                  <span class="validation-check-title">
                    Invalid Apostrophe (<code>`</code> &rarr; <code>'</code>)
                  </span>
                  <span class="validation-check-desc">
                    Flag backtick <code>`</code> or <code>´</code> used in place of <code>'</code>
                  </span>
                </div>
              </label>

              <!-- 3. Multiple Spaces -->
              <label class="validation-check-item">
                <input
                  type="checkbox"
                  bind:checked={fixDoubleSpaces}
                />
                <div class="validation-check-text">
                  <span class="validation-check-title">
                    Multiple Spaces
                  </span>
                  <span class="validation-check-desc">
                    Flag 2+ consecutive spaces inside a segment
                  </span>
                </div>
              </label>

              <!-- 4. Acronym Format -->
              <div class="validation-rule-group">
                <label class="validation-check-item">
                  <input
                    type="checkbox"
                    bind:checked={validateAcronyms}
                  />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Acronym Format
                    </span>
                    <span class="validation-check-desc">
                      Standardize acronyms across segments (e.g. <code>P_N_G_</code>, <code>P_N_G</code>, <code>PNG</code>)
                    </span>
                  </div>
                </label>

                {#if validateAcronyms}
                  <div class="validation-subpanel">
                    <div class="lexicon-header">
                      <label
                        for="project-settings-acronym-mode"
                        class="lexicon-title"
                      >
                        <i class="fa-solid fa-font"></i>
                        Preferred Acronym Style
                      </label>
                    </div>
                    <select
                      id="project-settings-acronym-mode"
                      class="form-input"
                      bind:value={acronymMode}
                    >
                      <option value={ACRONYM_MODES.PLAIN}>
                        Plain Uppercase: PNG (flags P_N_G, P_N_G_)
                      </option>
                      <option value={ACRONYM_MODES.UNDERSCORE}>
                        Underscored: P_N_G (flags P_N_G_, PNG)
                      </option>
                      <option value={ACRONYM_MODES.TRAILING}>
                        Trailing Underscore: P_N_G_ (flags P_N_G, PNG)
                      </option>
                    </select>
                  </div>
                {/if}
              </div>

              <!-- 5. Custom Validation Rules -->
              <div class="validation-rule-group">
                <label class="validation-check-item">
                  <input
                    type="checkbox"
                    bind:checked={validateCustomRules}
                  />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Custom Validation Rules
                    </span>
                    <span class="validation-check-desc">
                      Flag specific strings or regex patterns and suggest replacements
                    </span>
                  </div>
                </label>

                {#if validateCustomRules}
                  <div class="validation-subpanel">
                    <div class="lexicon-header">
                      <div class="lexicon-title-area">
                        <span class="lexicon-title">
                          <i class="fa-solid fa-list-check"></i>
                          Custom Rules
                        </span>
                        <span class="lexicon-badge">{customRules.length}</span>
                      </div>
                    </div>

                    <div class="custom-rule-add-row">
                      <input
                        type="text"
                        class="form-input custom-rule-input"
                        placeholder="Invalid text or pattern..."
                        bind:value={newRuleFind}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomValidationRule();
                          }
                        }}
                      />
                      <span class="custom-rule-arrow">&rarr;</span>
                      <input
                        type="text"
                        class="form-input custom-rule-input"
                        placeholder="Suggested replacement..."
                        bind:value={newRuleReplace}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomValidationRule();
                          }
                        }}
                      />
                      <label
                        class="custom-rule-regex-toggle"
                        title="Treat pattern as a Regular Expression"
                      >
                        <input type="checkbox" bind:checked={newRuleIsRegex} />
                        <span>Regex</span>
                      </label>
                      <button
                        type="button"
                        class="btn-add-speaker"
                        disabled={!newRuleFind.trim()}
                        onclick={handleAddCustomValidationRule}
                      >
                        <i class="fa-solid fa-plus"></i>
                        <span>Add Rule</span>
                      </button>
                    </div>

                    {#if customRules.length > 0}
                      <div class="custom-rules-list">
                        {#each customRules as rule (rule.id)}
                          <div class="custom-rule-chip-row">
                            <input
                              type="checkbox"
                              bind:checked={rule.enabled}
                              title="Enable/disable rule"
                            />
                            {#if rule.isRegex}
                              <span class="rule-regex-badge">Regex</span>
                            {/if}
                            <code class="rule-find-code">{rule.find}</code>
                            <span class="custom-rule-arrow">&rarr;</span>
                            <code class="rule-replace-code">
                              {rule.replace || '(delete)'}
                            </code>
                            <button
                              type="button"
                              class="btn-delete-speaker"
                              onclick={() =>
                                handleRemoveCustomValidationRule(rule.id)}
                              title="Remove custom rule"
                            >
                              <i class="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
        {/if}
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
    padding: 12px;
  }

  .modal-dialog {
    background: var(--bg-card, #ffffff);
    border-radius: 10px;
    border: 1px solid var(--border-color, #e2e8f0);
    box-shadow:
      0 16px 24px -4px rgba(0, 0, 0, 0.15),
      0 6px 8px -4px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 720px;
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
      transform: scale(0.97) translateY(4px);
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
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .modal-header {
    border-color: #334155;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 1rem;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .settings-tabs-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 16px 0 16px;
    background: var(--bg-hover, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .settings-tabs-bar {
    background: #0f172a;
    border-bottom-color: #334155;
  }

  .settings-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    margin-bottom: -1px;
    transition: all 0.14s ease;
  }

  .settings-tab-btn:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(2, 132, 199, 0.05);
  }

  :global([data-theme='dark']) .settings-tab-btn:hover {
    color: #f1f5f9;
    background: rgba(56, 189, 248, 0.06);
  }

  .settings-tab-btn.active {
    background: var(--bg-card, #ffffff);
    color: var(--primary-color, #0284c7);
    border-color: var(--border-color, #e2e8f0);
    border-bottom-color: var(--bg-card, #ffffff);
    font-weight: 700;
  }

  :global([data-theme='dark']) .settings-tab-btn.active {
    background: #1e293b;
    color: #38bdf8;
    border-color: #334155;
    border-bottom-color: #1e293b;
  }

  .tab-badge {
    font-size: 0.66rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--bg-muted, #e2e8f0);
    color: var(--text-muted, #64748b);
  }

  :global([data-theme='dark']) .tab-badge {
    background: #334155;
    color: #cbd5e1;
  }

  .settings-tab-btn.active .tab-badge {
    background: rgba(2, 132, 199, 0.14);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .settings-tab-btn.active .tab-badge {
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .tab-badge-active {
    background: rgba(245, 158, 11, 0.16) !important;
    color: #b45309 !important;
  }

  :global([data-theme='dark']) .tab-badge-active {
    background: rgba(245, 158, 11, 0.24) !important;
    color: #fbbf24 !important;
  }

  .modal-body {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .general-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }

  .main-tiers-config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px 12px;
    margin-bottom: 6px;
    padding: 8px 10px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
  }

  :global([data-theme='dark']) .main-tiers-config-grid {
    background: rgba(255, 255, 255, 0.02);
    border-color: #334155;
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .section-title {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .counter-badge {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    background: var(--bg-muted, #e2e8f0);
    padding: 1px 6px;
    border-radius: 10px;
  }

  :global([data-theme='dark']) .counter-badge {
    background: #334155;
    color: #cbd5e1;
  }

  .btn-help-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--primary-color, #0284c7);
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-help-toggle:hover,
  .btn-help-toggle.active {
    background: #e0f2fe;
    border-color: #38bdf8;
    color: #0369a1;
  }

  :global([data-theme='dark']) .btn-help-toggle {
    border-color: #475569;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .btn-help-toggle:hover,
  :global([data-theme='dark']) .btn-help-toggle.active {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #7dd3fc;
  }

  .subtier-help-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    animation: fadeInHelp 0.15s ease-out;
  }

  :global([data-theme='dark']) .subtier-help-panel {
    background: #0f172a;
    border-color: #334155;
  }

  @keyframes fadeInHelp {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .help-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    padding-bottom: 6px;
  }

  :global([data-theme='dark']) .help-panel-header {
    border-bottom-color: #334155;
  }

  .help-panel-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-close-help {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .btn-close-help:hover {
    color: var(--text-heading, #0f172a);
  }

  .help-cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  @media (max-width: 600px) {
    .help-cards-grid {
      grid-template-columns: 1fr;
    }
  }

  .help-type-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    font-size: 0.74rem;
    line-height: 1.4;
  }

  :global([data-theme='dark']) .help-type-card {
    background: #1e293b;
    border-color: #334155;
  }

  .help-card-sentence {
    border-left: 3px solid #10b981;
  }

  .help-card-word {
    border-left: 3px solid var(--primary-color, #0284c7);
  }

  .help-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 700;
    font-size: 0.75rem;
  }

  .sentence-badge {
    color: #059669;
  }

  :global([data-theme='dark']) .sentence-badge {
    color: #34d399;
  }

  .word-badge {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .word-badge {
    color: #38bdf8;
  }

  .help-type-desc {
    margin: 0;
    color: var(--text-color, #334155);
    font-size: 0.73rem;
  }

  .help-points {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }

  .help-point {
    font-size: 0.71rem;
    color: var(--text-color, #334155);
  }

  .help-point strong {
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .help-point strong {
    color: #f1f5f9;
  }

  .help-point code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 3px;
    border-radius: 3px;
  }

  :global([data-theme='dark']) .help-point code {
    background: rgba(255, 255, 255, 0.1);
  }

  .help-elan-note {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    border-top: 1px dashed var(--border-color, #e2e8f0);
    padding-top: 5px;
  }

  :global([data-theme='dark']) .help-elan-note {
    border-top-color: #334155;
  }

  .help-elan-note code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    color: var(--text-color, #334155);
  }

  :global([data-theme='dark']) .help-elan-note code {
    color: #cbd5e1;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .form-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-color, #334155);
  }

  .sub-label {
    font-size: 0.71rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    display: block;
  }

  .compact-sub-label {
    margin-bottom: 2px;
  }

  .form-input {
    padding: 4px 8px;
    height: 30px;
    box-sizing: border-box;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    font-size: 0.8rem;
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
    gap: 5px;
    padding: 3px 8px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    border-radius: 5px;
    font-size: 0.72rem;
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

  .speakers-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .speakers-header-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .spk-th-id {
    width: 24px;
    text-align: center;
  }

  .spk-th-name {
    flex: 1;
  }

  .spk-th-init {
    width: 100px;
  }

  .spk-th-act {
    width: 24px;
  }

  .speaker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    background: var(--spk-bg, #f8fafc);
    border: 1px solid var(--spk-border, #e2e8f0);
    border-radius: 5px;
    height: 36px;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .speaker-row {
    background: rgba(255, 255, 255, 0.03);
  }

  .speaker-color-indicator {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .speaker-id-badge {
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .speaker-name-field {
    flex: 1;
    min-width: 0;
  }

  .speaker-initials-field {
    width: 100px;
    flex-shrink: 0;
  }

  .initials-input-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .initials-input {
    width: 44px;
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 4px;
  }

  .initials-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.68rem;
    font-weight: 700;
    min-width: 24px;
    height: 22px;
    box-sizing: border-box;
  }

  .speaker-actions {
    display: flex;
    align-items: center;
    width: 24px;
    justify-content: center;
  }

  .btn-delete-speaker {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    transition: background 0.15s ease;
  }

  .btn-delete-speaker:hover {
    background: #fee2e2;
  }

  :global([data-theme='dark']) .btn-delete-speaker:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .subtiers-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .subtiers-header-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 9px;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .sub-th-id {
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .sub-th-name {
    flex: 1.2;
    min-width: 0;
  }

  .sub-th-type {
    flex: 1.1;
    min-width: 0;
  }

  .sub-th-annotator {
    flex: 1;
    min-width: 0;
  }

  .sub-th-act {
    width: 24px;
    flex-shrink: 0;
  }

  .subtier-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 9px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-hover, #f8fafc);
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
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .subtier-index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 4px;
    background: var(--bg-muted, #e2e8f0);
    color: var(--text-muted, #64748b);
    font-size: 0.68rem;
    font-weight: 700;
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
    flex: 1.1;
    min-width: 0;
  }

  .subtier-annotator-field {
    flex: 1;
    min-width: 0;
  }

  .subtier-type-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .subtier-type-select {
    cursor: pointer;
    font-weight: 600;
    flex: 1;
    min-width: 0;
  }

  .btn-inline-help {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  .btn-inline-help:hover {
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-inline-help:hover {
    color: #38bdf8;
  }

  .subtier-word-panel {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 8px;
    background: rgba(2, 132, 199, 0.04);
    border: 1px solid rgba(2, 132, 199, 0.15);
    border-radius: 5px;
  }

  :global([data-theme='dark']) .subtier-word-panel {
    background: rgba(56, 189, 248, 0.04);
    border-color: rgba(56, 189, 248, 0.18);
  }

  .word-panel-info-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.08);
    padding: 3px 6px;
    border-radius: 4px;
    line-height: 1.3;
  }

  :global([data-theme='dark']) .word-panel-info-row {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .btn-help-inline-link {
    background: transparent;
    border: none;
    color: inherit;
    font-weight: 700;
    font-size: 0.7rem;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    margin-left: auto;
    white-space: nowrap;
  }

  .word-tier-meta-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .splitters-col {
    flex: 1;
    min-width: 0;
  }

  .splitters-input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .lexfield-col {
    flex: 1.3;
    min-width: 0;
  }

  .lexfield-header-inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 2px;
  }

  .lexfield-active-badge-sm {
    font-size: 0.65rem;
    font-weight: 600;
    color: #059669;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    padding: 0 5px;
    border-radius: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  :global([data-theme='dark']) .lexfield-active-badge-sm {
    color: #34d399;
    background: rgba(16, 185, 129, 0.2);
    border-color: rgba(52, 211, 153, 0.3);
  }

  .lexfield-select-sm {
    font-weight: 600;
  }

  .lexfield-no-lexicon-sm {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 5px;
    padding: 3px 6px;
    height: 30px;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .lexfield-no-lexicon-sm {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.25);
  }

  .lexicon-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px;
  }

  .lexicon-title-area {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .lexicon-title {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  :global([data-theme='dark']) .lexicon-title {
    color: #38bdf8;
  }

  .lexicon-badge {
    background: rgba(2, 132, 199, 0.15);
    color: var(--primary-color, #0284c7);
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 8px;
  }

  :global([data-theme='dark']) .lexicon-badge {
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .lexicon-presets-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px;
  }

  .preset-label {
    font-size: 0.65rem;
    color: var(--text-muted, #64748b);
    font-weight: 600;
  }

  .btn-preset {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-color, #334155);
    font-size: 0.66rem;
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
  }

  .lexicon-input-sm {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.74rem;
  }

  .lexicon-chips-wrapper {
    display: flex;
    flex-direction: column;
  }

  .lexicon-chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    max-height: 60px;
    overflow-y: auto;
    padding: 1px;
  }

  .lexicon-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(2, 132, 199, 0.12);
    border: 1px solid rgba(2, 132, 199, 0.25);
    color: #0369a1;
    font-size: 0.68rem;
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
    font-size: 0.62rem;
    font-weight: 400;
    opacity: 0.85;
    background: rgba(2, 132, 199, 0.15);
    padding: 0 3px;
    border-radius: 2px;
  }

  :global([data-theme='dark']) .lexicon-chip-label {
    background: rgba(56, 189, 248, 0.2);
  }

  .btn-chip-remove {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 1px;
    opacity: 0.7;
  }

  .btn-chip-remove:hover {
    opacity: 1;
    color: #ef4444;
  }

  .subtier-sentence-note {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    color: #059669;
    padding: 1px 4px;
    line-height: 1.25;
  }

  :global([data-theme='dark']) .subtier-sentence-note {
    color: #34d399;
  }

  .subtier-empty {
    margin: 0;
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 5px;
    font-size: 0.78rem;
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
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .modal-footer {
    background: #1e293b;
    border-color: #334155;
  }

  .btn-primary,
  .btn-secondary {
    padding: 4px 12px;
    height: 30px;
    box-sizing: border-box;
    border-radius: 5px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
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

  .validation-active-badge {
    background: rgba(245, 158, 11, 0.16);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  :global([data-theme='dark']) .validation-active-badge {
    background: rgba(245, 158, 11, 0.22);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.35);
  }

  .validation-rules-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .validation-toggles-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .validation-rule-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .validation-check-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    cursor: pointer;
  }

  :global([data-theme='dark']) .validation-check-item {
    background: #0f172a;
    border-color: #334155;
  }

  .validation-check-item input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .validation-check-text {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 10px;
    width: 100%;
  }

  .validation-check-title {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .validation-check-desc {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
  }

  .validation-check-desc code,
  .validation-check-title code,
  .validation-acronym-box code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.68rem;
    background: rgba(0, 0, 0, 0.05);
    padding: 0 3px;
    border-radius: 3px;
  }

  :global([data-theme='dark']) .validation-check-desc code,
  :global([data-theme='dark']) .validation-check-title code,
  :global([data-theme='dark']) .validation-acronym-box code {
    background: rgba(255, 255, 255, 0.1);
  }

  .validation-acronym-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .validation-subpanel {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 8px;
    background: rgba(2, 132, 199, 0.04);
    border: 1px solid rgba(2, 132, 199, 0.15);
    border-radius: 5px;
  }

  :global([data-theme='dark']) .validation-subpanel {
    background: rgba(56, 189, 248, 0.04);
    border-color: rgba(56, 189, 248, 0.18);
  }

  .validation-custom-rules-area {
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-top: 1px dashed var(--border-color, #cbd5e1);
    padding-top: 6px;
  }

  :global([data-theme='dark']) .validation-custom-rules-area {
    border-top-color: #334155;
  }

  .custom-rules-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }

  .custom-rules-hint {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
  }

  .custom-rule-add-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .custom-rule-input {
    flex: 1 1 130px;
    min-width: 110px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.75rem;
  }

  .custom-rule-arrow {
    color: var(--text-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .custom-rule-regex-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-color, #334155);
    cursor: pointer;
    user-select: none;
  }

  .custom-rules-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 90px;
    overflow-y: auto;
  }

  .custom-rule-chip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 4px;
    font-size: 0.74rem;
  }

  :global([data-theme='dark']) .custom-rule-chip-row {
    background: #0f172a;
    border-color: #334155;
  }

  .rule-regex-badge {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(124, 58, 237, 0.12);
    color: #7c3aed;
  }

  .rule-find-code {
    color: #dc2626;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.72rem;
  }

  .rule-replace-code {
    color: #059669;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.72rem;
    margin-right: auto;
  }
</style>
