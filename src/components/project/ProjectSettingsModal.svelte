<script>
  import { untrack } from 'svelte';
  import { projectState } from '../../state/projectState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import {
    SPEAKER_COLORS,
    ensureDefaultSpeakers,
    getSegmentSpeakerId,
  } from '../../utils/speakers.js';
  import {
    MAX_SUB_TIERS,
    SUB_TIER_TYPE_SENTENCE,
    SUB_TIER_TYPE_WORD,
    ELAN_STEREOTYPE_SYM_ASSOC,
    ELAN_STEREOTYPE_SYM_SUBDIV,
    ELAN_STEREOTYPE_TIME_SUBDIV,
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
  let expandedWordTierIds = $state({});
  let speakerRowUid = 0;

  const SPEAKER_COLOR_LIST = [
    { ...SPEAKER_COLORS[1], label: 'Sky Blue' },
    { ...SPEAKER_COLORS[2], label: 'Purple' },
    { ...SPEAKER_COLORS[3], label: 'Emerald Green' },
    { ...SPEAKER_COLORS[4], label: 'Amber' },
    { ...SPEAKER_COLORS[5], label: 'Rose' },
  ];

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
            id: Number(s.id) || 1,
            originalId: Number(s.id) || 1,
            elanTierType: s.elanTierType || '',
            _uid: ++speakerRowUid,
          }));
          subTiers = normalizeSubTiers(projectState.activeProject.subTiers).map(
            (t) => ({
              ...t,
              annotator: t.annotator || '',
              type: t.type || SUB_TIER_TYPE_SENTENCE,
              stereotype:
                t.stereotype ||
                (t.type === SUB_TIER_TYPE_WORD
                  ? ELAN_STEREOTYPE_SYM_SUBDIV
                  : ELAN_STEREOTYPE_SYM_ASSOC),
              elanTierType: t.elanTierType || '',
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
        expandedWordTierIds = {};
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

  const speakerSegmentCounts = $derived.by(() => {
    const counts = {};
    const segs =
      Array.isArray(transcriptState.segments) &&
      transcriptState.segments.length > 0
        ? transcriptState.segments
        : projectState.activeProject?.segments || [];
    for (const seg of segs) {
      const spkId = getSegmentSpeakerId(seg);
      counts[spkId] = (counts[spkId] || 0) + 1;
    }
    return counts;
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
        originalId: null,
        _uid: ++speakerRowUid,
        name: `Speaker ${nextId}`,
        initials: `S${nextId}`,
        elanTierType: '',
      },
    ];
  }

  function handleSelectSpeakerColor(speaker, colorId) {
    const targetId = Number(colorId);
    if (Number(speaker.id) === targetId) return;
    const isTaken = speakers.some(
      (s) => s !== speaker && Number(s.id) === targetId,
    );
    if (isTaken) return;
    speaker.id = targetId;
  }

  function handleRemoveSpeaker(idToRemove) {
    errorMessage = '';
    if (speakers.length <= 1) {
      errorMessage = 'A project must have at least one speaker.';
      return;
    }
    const targetSpk = speakers.find((s) => Number(s.id) === Number(idToRemove));
    const spkName = targetSpk?.name?.trim() || `Speaker ${idToRemove}`;
    const segCount =
      speakerSegmentCounts[targetSpk?.originalId ?? idToRemove] || 0;
    const confirmMsg =
      segCount > 0
        ? `Remove "${spkName}"? Its ${segCount} ${segCount === 1 ? 'segment' : 'segments'} will be reassigned to another speaker when you save.`
        : `Are you sure you want to remove "${spkName}"?`;
    if (!window.confirm(confirmMsg)) {
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
        stereotype: ELAN_STEREOTYPE_SYM_ASSOC,
        elanTierType: '',
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

  function toggleWordTierConfig(tierId) {
    expandedWordTierIds = {
      ...expandedWordTierIds,
      [tierId]: !expandedWordTierIds[tierId],
    };
  }

  function handleStereotypeChange(tier, val) {
    let newStereotype = ELAN_STEREOTYPE_SYM_ASSOC;
    let newType = SUB_TIER_TYPE_SENTENCE;

    if (
      val === ELAN_STEREOTYPE_SYM_SUBDIV ||
      val === SUB_TIER_TYPE_WORD
    ) {
      newStereotype = ELAN_STEREOTYPE_SYM_SUBDIV;
      newType = SUB_TIER_TYPE_WORD;
    } else if (val === ELAN_STEREOTYPE_TIME_SUBDIV) {
      newStereotype = ELAN_STEREOTYPE_TIME_SUBDIV;
      newType = SUB_TIER_TYPE_WORD;
    } else {
      newStereotype = ELAN_STEREOTYPE_SYM_ASSOC;
      newType = SUB_TIER_TYPE_SENTENCE;
    }

    tier.stereotype = newStereotype;
    tier.type = newType;
    if (newType === SUB_TIER_TYPE_WORD) {
      expandedWordTierIds = {
        ...expandedWordTierIds,
        [tier.id]: true,
      };
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
        ? customRules.filter((r) => r.enabled !== false && r.find?.trim())
            .length
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

    // Sanitize speakers and track any speaker color/ID remapping
    const speakerIdRemap = {};
    const sanitizedSpeakers = speakers.map((s, idx) => {
      const spkId = Number(s.id) || idx + 1;
      if (s.originalId != null && Number(s.originalId) !== spkId) {
        speakerIdRemap[Number(s.originalId)] = spkId;
      }
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
        elanTierType: (s.elanTierType || '').trim(),
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
        t.type === SUB_TIER_TYPE_WORD ||
        t.stereotype === ELAN_STEREOTYPE_SYM_SUBDIV ||
        t.stereotype === ELAN_STEREOTYPE_TIME_SUBDIV
          ? SUB_TIER_TYPE_WORD
          : SUB_TIER_TYPE_SENTENCE;
      const stereotype =
        type === SUB_TIER_TYPE_WORD
          ? t.stereotype === ELAN_STEREOTYPE_TIME_SUBDIV
            ? ELAN_STEREOTYPE_TIME_SUBDIV
            : ELAN_STEREOTYPE_SYM_SUBDIV
          : ELAN_STEREOTYPE_SYM_ASSOC;
      const elanTierType = (t.elanTierType || '').trim();
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
        type === SUB_TIER_TYPE_WORD ? (t.lexiconField || '').trim() : '';
      const annotator = (t.annotator || '').trim();

      sanitizedSubTiers.push({
        id,
        name,
        annotator,
        type,
        stereotype,
        elanTierType,
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
        speakerIdRemap,
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
  <div class="modal-backdrop" role="presentation">
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
      <div
        class="settings-tabs-bar"
        role="tablist"
        aria-label="Project settings sections"
      >
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
                      {lex.title || lex.name || 'Untitled Lexicon'} ({lex
                        .entries?.length || 0} entries)
                    </option>
                  {/each}
                </select>
              </div>

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
                  title="When exporting to ELAN, root tiers will be named '{mainTierTitle.trim() ||
                    'Title'}@Speaker'"
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
          </div>

          <div class="form-section">
            <div class="section-header-row">
              <h4 class="section-title">Speakers</h4>
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
              <div class="speakers-header-bar">
                <span class="spk-th-color">Color</span>
                <span class="spk-th-name">Speaker Name</span>
                <span class="spk-th-init">Initials</span>
                <span class="spk-th-elantype">ELAN Tier Type</span>
                <span class="spk-th-segs">Segments</span>
                <span class="spk-th-act"></span>
              </div>
              {#each speakers as spk (spk._uid || spk.id)}
                {@const col = SPEAKER_COLORS[spk.id] || SPEAKER_COLORS[1]}
                {@const segCount =
                  speakerSegmentCounts[spk.originalId ?? spk.id] || 0}
                <div
                  class="speaker-row"
                  style="--spk-color: {col.primary}; --spk-bg: {col.bg}; --spk-border: {col.border}"
                >
                  <div
                    class="speaker-color-picker"
                    role="radiogroup"
                    aria-label="Speaker color"
                  >
                    {#each SPEAKER_COLOR_LIST as colorOpt (colorOpt.id)}
                      {@const isSelected = Number(spk.id) === colorOpt.id}
                      {@const takenBy = speakers.find(
                        (other) =>
                          other !== spk && Number(other.id) === colorOpt.id,
                      )}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        class="speaker-color-swatch {isSelected
                          ? 'selected'
                          : ''}"
                        style="--swatch-color: {colorOpt.primary};"
                        disabled={Boolean(takenBy)}
                        onclick={() =>
                          handleSelectSpeakerColor(spk, colorOpt.id)}
                        title={takenBy
                          ? `${colorOpt.label} (used by ${takenBy.name || 'another speaker'})`
                          : colorOpt.label}
                      >
                        {#if isSelected}
                          <i class="fa-solid fa-check"></i>
                        {/if}
                      </button>
                    {/each}
                  </div>

                  <div class="speaker-field speaker-name-field">
                    <input
                      id="spk-name-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input"
                      bind:value={spk.name}
                      placeholder="Speaker Name"
                    />
                  </div>

                  <div class="speaker-field speaker-initials-field">
                    <input
                      id="spk-init-{spk._uid || spk.id}"
                      type="text"
                      maxlength="3"
                      class="form-input speaker-input initials-input"
                      value={spk.initials}
                      oninput={(e) => handleInitialsInput(spk, e.target.value)}
                      placeholder="S{spk.id}"
                      title="Max 3 initials"
                    />
                  </div>

                  <div class="speaker-field speaker-elantype-field">
                    <input
                      id="spk-elantype-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input speaker-elantype-input"
                      bind:value={spk.elanTierType}
                      placeholder="default-lt"
                      title="ELAN Tier Type (LINGUISTIC_TYPE_REF) for this speaker's root tier"
                    />
                  </div>

                  <div
                    class="speaker-field speaker-segs-field"
                    title="{segCount} {segCount === 1 ? 'segment' : 'segments'}"
                  >
                    <span class="speaker-seg-count">{segCount}</span>
                  </div>

                  <div class="speaker-actions">
                    {#if speakers.length > 1}
                      <button
                        type="button"
                        class="btn-delete-speaker"
                        onclick={() => handleRemoveSpeaker(spk.id)}
                        title="Remove {spk.name || 'speaker'}"
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
                <div class="help-points">
                  <div class="help-point">
                    <strong>Symbolic Association (Undivided):</strong> Single
                    full-utterance text field per segment for translations,
                    comments, or notes (1-to-1 ELAN <code>REF_ANNOTATION</code>).
                  </div>
                  <div class="help-point">
                    <strong>Symbolic / Time Subdivision (Divided):</strong>
                    Token-level annotation split by whitespace and custom
                    <strong>Splitters</strong> (e.g. <code>-</code>,
                    <code>=</code>), with autocomplete <strong>Tags</strong>
                    and optional <strong>Auto-Tag Field</strong> lookup from the
                    Active Lexicon.
                  </div>
                  <div class="help-point">
                    <strong>ELAN Tier Type:</strong> Custom
                    <code>LINGUISTIC_TYPE_ID</code> name preserved when importing
                    and exporting ELAN (<code>.eaf</code>) files.
                  </div>
                </div>
              </div>
            {/if}

            {#if subTiers.length === 0}
              <p class="subtier-empty">
                No sub-tiers yet. Each segment shows a single transcription
                column.
              </p>
            {:else}
              <div class="settings-table-wrap">
                <table class="settings-data-table subtiers-table">
                  <thead>
                    <tr>
                      <th class="col-sub-id">#</th>
                      <th class="col-sub-name">Sub-tier Name</th>
                      <th class="col-sub-type">Stereotype / Type</th>
                      <th class="col-sub-elantype">ELAN Tier Type</th>
                      <th class="col-sub-annotator">Annotator</th>
                      <th class="col-sub-config">Config</th>
                      <th class="col-sub-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each subTiers as tier (tier.id)}
                      {@const isWordTier =
                        tier.type === SUB_TIER_TYPE_WORD ||
                        tier.stereotype === ELAN_STEREOTYPE_SYM_SUBDIV ||
                        tier.stereotype === ELAN_STEREOTYPE_TIME_SUBDIV}
                      {@const currentStereotype =
                        tier.stereotype ||
                        (isWordTier
                          ? ELAN_STEREOTYPE_SYM_SUBDIV
                          : ELAN_STEREOTYPE_SYM_ASSOC)}
                      {@const isExpanded = Boolean(
                        expandedWordTierIds[tier.id],
                      )}
                      <tr
                        class="subtier-row {isWordTier
                          ? 'subtier-row-word'
                          : 'subtier-row-sentence'} {isExpanded
                          ? 'is-expanded'
                          : ''}"
                      >
                        <td class="col-sub-id">
                          <span
                            class="subtier-index"
                            title="Sub-tier #{tier.id}"
                          >
                            #{tier.id}
                          </span>
                        </td>
                        <td class="col-sub-name">
                          <input
                            id="subtier-name-{tier.id}"
                            type="text"
                            class="form-input subtier-input"
                            bind:value={tier.name}
                            placeholder="Sub-tier name"
                          />
                        </td>
                        <td class="col-sub-type">
                          <select
                            id="subtier-type-{tier.id}"
                            class="form-input subtier-type-select"
                            value={currentStereotype}
                            onchange={(e) =>
                              handleStereotypeChange(tier, e.target.value)}
                            title="ELAN Constraint Stereotype and Easper division behavior"
                          >
                            <option value={ELAN_STEREOTYPE_SYM_ASSOC}>
                              Symbolic Association (Undivided)
                            </option>
                            <option value={ELAN_STEREOTYPE_SYM_SUBDIV}>
                              Symbolic Subdivision (Divided)
                            </option>
                            <option value={ELAN_STEREOTYPE_TIME_SUBDIV}>
                              Time Subdivision (Divided)
                            </option>
                          </select>
                        </td>
                        <td class="col-sub-elantype">
                          <input
                            id="subtier-elantype-{tier.id}"
                            type="text"
                            class="form-input subtier-input"
                            bind:value={tier.elanTierType}
                            placeholder={isWordTier
                              ? currentStereotype === ELAN_STEREOTYPE_TIME_SUBDIV
                                ? 'words-lt'
                                : 'sym-subdivision-lt'
                              : 'dependent-lt'}
                            title="ELAN Tier Type (LINGUISTIC_TYPE_REF) for this sub-tier"
                          />
                        </td>
                        <td class="col-sub-annotator">
                          <input
                            id="subtier-annotator-{tier.id}"
                            type="text"
                            class="form-input subtier-input"
                            bind:value={tier.annotator}
                            placeholder="Annotator"
                            title="Annotator name for this sub-tier in ELAN export"
                          />
                        </td>
                        <td class="col-sub-config">
                          {#if isWordTier}
                            <button
                              type="button"
                              class="btn-word-config-toggle {isExpanded
                                ? 'expanded'
                                : ''}"
                              onclick={() => toggleWordTierConfig(tier.id)}
                              title={isExpanded
                                ? 'Hide divided tier configuration'
                                : 'Configure splitters, auto-tag field, and tags'}
                            >
                              <span>{tier.lexicon.length} tags</span>
                              {#if tier.lexiconField}
                                <span class="config-summary-sep">&bull;</span>
                                <span class="config-summary-field"
                                  >{tier.lexiconField}</span
                                >
                              {/if}
                              <i
                                class="fa-solid fa-chevron-{isExpanded
                                  ? 'up'
                                  : 'down'} config-caret"
                              ></i>
                            </button>
                          {:else}
                            <span
                              class="sentence-config-placeholder"
                              title="Undivided tier (single text per segment)"
                            >
                              &mdash;
                            </span>
                          {/if}
                        </td>
                        <td class="col-sub-actions">
                          <button
                            type="button"
                            class="btn-delete-speaker"
                            onclick={() => handleRemoveSubTier(tier.id)}
                            title="Remove {tier.name || 'sub-tier'}"
                          >
                            <i class="fa-solid fa-trash-can"></i>
                          </button>
                        </td>
                      </tr>

                      {#if isWordTier && isExpanded}
                        <tr class="subtier-expanded-row">
                          <td colspan="7">
                            <div class="subtier-word-panel">
                              <div class="word-tier-meta-row">
                                <div class="splitters-col">
                                  <label
                                    for="splitters-input-{tier.id}"
                                    class="sub-label compact-sub-label"
                                    title="Space-separated characters or strings that divide utterances (space is always a splitter)"
                                  >
                                    Splitters
                                  </label>
                                  <input
                                    id="splitters-input-{tier.id}"
                                    type="text"
                                    class="form-input splitters-input"
                                    placeholder="e.g. - = ((E ))"
                                    bind:value={tier.splitters}
                                  />
                                </div>

                                <div class="lexfield-col">
                                  <label
                                    for="lexfield-select-{tier.id}"
                                    class="sub-label compact-sub-label"
                                    title="Field in active lexicon to grab values from during Auto Tagging"
                                  >
                                    Auto-Tag Field
                                  </label>
                                  <select
                                    id="lexfield-select-{tier.id}"
                                    class="form-input lexfield-select-sm"
                                    bind:value={tier.lexiconField}
                                    disabled={!selectedLexicon}
                                    title={selectedLexicon
                                      ? `Active Lexicon: ${selectedLexicon.title || selectedLexicon.name}`
                                      : 'Select an Active Lexicon in Main Settings to enable Auto Tagging'}
                                  >
                                    <option value="">
                                      {selectedLexicon
                                        ? 'None (Disabled)'
                                        : 'No active lexicon'}
                                    </option>
                                    {#each availableLexiconFields as field (field.id)}
                                      <option value={field.name}
                                        >{field.name}</option
                                      >
                                    {/each}
                                    {#if tier.lexiconField && !availableLexiconFields.some((f) => f.name === tier.lexiconField)}
                                      <option value={tier.lexiconField}>
                                        {tier.lexiconField} (Custom)
                                      </option>
                                    {/if}
                                  </select>
                                </div>
                              </div>

                              <div class="lexicon-header">
                                <div class="lexicon-title-area">
                                  <label
                                    for="lexicon-input-{tier.id}"
                                    class="sub-label"
                                  >
                                    Tags ({tier.lexicon.length})
                                  </label>
                                </div>
                                <div class="lexicon-presets-bar">
                                  <span class="preset-label">Presets:</span>
                                  <button
                                    type="button"
                                    class="btn-preset"
                                    onclick={() =>
                                      applyPresetLexicon(
                                        tier,
                                        COMMON_POS_LEXICON,
                                      )}
                                    title="Insert common POS tags (prop, n, v, adj, adv...)"
                                  >
                                    Common POS
                                  </button>
                                  <button
                                    type="button"
                                    class="btn-preset"
                                    onclick={() =>
                                      applyPresetLexicon(
                                        tier,
                                        UNIVERSAL_POS_LEXICON,
                                      )}
                                    title="Universal Dependencies POS (NOUN, VERB, ADJ...)"
                                  >
                                    Universal POS
                                  </button>
                                  <button
                                    type="button"
                                    class="btn-preset"
                                    onclick={() =>
                                      applyPresetLexicon(
                                        tier,
                                        LEIPZIG_GLOSS_LEXICON,
                                      )}
                                    title="Leipzig Glossing tags (1SG, 2SG, NOM, PAST...)"
                                  >
                                    Leipzig Gloss
                                  </button>
                                  {#if tier.lexicon.length > 0}
                                    <button
                                      type="button"
                                      class="btn-preset btn-preset-clear"
                                      onclick={() =>
                                        applyPresetLexicon(tier, [])}
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
                                        <span class="lexicon-chip-text"
                                          >{tagVal}</span
                                        >
                                        {#if tagLabel}
                                          <span class="lexicon-chip-label"
                                            >{tagLabel}</span
                                          >
                                        {/if}
                                        <button
                                          type="button"
                                          class="btn-chip-remove"
                                          onclick={() =>
                                            removeLexiconItem(tier, tag)}
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
                          </td>
                        </tr>
                      {/if}
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'validation'}
          <!-- Validation Rules Section -->
          <div class="form-section">
            <div class="section-header-row">
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

            {#if showValidationHelp}
              <div class="subtier-help-panel">
                <div class="help-points">
                  <div class="help-point">
                    <strong>Paralinguistic Tags:</strong> Flags broken or
                    malformed tags like
                    <code>&lt; hes&gt;</code>, <code>&lt; overlap &gt;</code>,
                    <code>&lt;Cough &gt;</code>, or <code>hes&gt;</code> and suggests
                    the clean tag from your Allowed Paralinguistic Tags list.
                  </div>
                  <div class="help-point">
                    <strong>Punctuation:</strong> Flags invalid apostrophes like
                    <code>`</code> instead of <code>'</code> (e.g.
                    <code>don`t</code>
                    &rarr; <code>don't</code>) and multiple consecutive spaces.
                  </div>
                  <div class="help-point">
                    <strong>Acronyms:</strong> Enforces a consistent acronym
                    style across segments (e.g. <code>P_N_G_</code> vs.
                    <code>P_N_G</code>
                    vs. <code>PNG</code>).
                  </div>
                </div>
              </div>
            {/if}

            <div class="validation-rules-card">
              <div class="validation-toggles-grid">
                <!-- 1. Paralinguistic Tags Check + Allowed List directly underneath -->
                <div class="validation-rule-group">
                  <label
                    class="validation-check-item"
                    title="Catch malformed tags like < hes>, <  overlap  >, <Cough >, hes>"
                  >
                    <input type="checkbox" bind:checked={validateTags} />
                    <div class="validation-check-text">
                      <span class="validation-check-title">
                        Validate Paralinguistic Tags
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
                          <span class="lexicon-badge">{allowedTags.length}</span
                          >
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
                <label
                  class="validation-check-item"
                  title="Flag backtick ` or ´ used in place of '"
                >
                  <input type="checkbox" bind:checked={fixApostropheBacktick} />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Invalid Apostrophe (<code>`</code> &rarr; <code>'</code>)
                    </span>
                  </div>
                </label>

                <!-- 3. Multiple Spaces -->
                <label
                  class="validation-check-item"
                  title="Flag 2+ consecutive spaces inside a segment"
                >
                  <input type="checkbox" bind:checked={fixDoubleSpaces} />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Multiple Spaces
                    </span>
                  </div>
                </label>

                <!-- 4. Acronym Format -->
                <div class="validation-rule-group">
                  <label
                    class="validation-check-item"
                    title="Standardize acronyms across segments (e.g. P_N_G_, P_N_G, PNG)"
                  >
                    <input type="checkbox" bind:checked={validateAcronyms} />
                    <div class="validation-check-text">
                      <span class="validation-check-title">
                        Acronym Format
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
                  <label
                    class="validation-check-item"
                    title="Flag specific strings or regex patterns and suggest replacements"
                  >
                    <input type="checkbox" bind:checked={validateCustomRules} />
                    <div class="validation-check-text">
                      <span class="validation-check-title">
                        Custom Validation Rules
                      </span>
                    </div>
                  </label>

                  {#if validateCustomRules}
                    <div class="validation-subpanel">
                      <div class="settings-table-wrap">
                        <table class="settings-data-table custom-rules-table">
                          <thead>
                            <tr>
                              <th class="col-rule-active">Active</th>
                              <th class="col-rule-find">Pattern</th>
                              <th class="col-rule-replace">Replacement</th>
                              <th class="col-rule-type">Type</th>
                              <th class="col-rule-actions">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each customRules as rule (rule.id)}
                              <tr>
                                <td class="col-rule-active">
                                  <input
                                    type="checkbox"
                                    bind:checked={rule.enabled}
                                    title="Enable/disable rule"
                                  />
                                </td>
                                <td class="col-rule-find">
                                  <input
                                    type="text"
                                    class="form-input custom-rule-cell-input rule-find-input"
                                    bind:value={rule.find}
                                    placeholder="Invalid text or pattern..."
                                  />
                                </td>
                                <td class="col-rule-replace">
                                  <input
                                    type="text"
                                    class="form-input custom-rule-cell-input rule-replace-input"
                                    bind:value={rule.replace}
                                    placeholder="(delete)"
                                  />
                                </td>
                                <td class="col-rule-type">
                                  <button
                                    type="button"
                                    class="btn-rule-type-pill {rule.isRegex
                                      ? 'is-regex'
                                      : ''}"
                                    onclick={() =>
                                      (rule.isRegex = !rule.isRegex)}
                                    title="Toggle between Literal Text and Regular Expression"
                                  >
                                    {rule.isRegex ? 'Regex' : 'Text'}
                                  </button>
                                </td>
                                <td class="col-rule-actions">
                                  <button
                                    type="button"
                                    class="btn-delete-speaker"
                                    onclick={() =>
                                      handleRemoveCustomValidationRule(rule.id)}
                                    title="Remove custom rule"
                                  >
                                    <i class="fa-solid fa-trash-can"></i>
                                  </button>
                                </td>
                              </tr>
                            {/each}
                            <tr class="custom-rule-new-row">
                              <td class="col-rule-active">
                                <span
                                  class="new-rule-plus-indicator"
                                  title="New rule"
                                >
                                  <i class="fa-solid fa-plus"></i>
                                </span>
                              </td>
                              <td class="col-rule-find">
                                <input
                                  type="text"
                                  class="form-input custom-rule-cell-input"
                                  placeholder="New pattern to flag..."
                                  bind:value={newRuleFind}
                                  onkeydown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddCustomValidationRule();
                                    }
                                  }}
                                />
                              </td>
                              <td class="col-rule-replace">
                                <input
                                  type="text"
                                  class="form-input custom-rule-cell-input"
                                  placeholder="Suggested replacement..."
                                  bind:value={newRuleReplace}
                                  onkeydown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddCustomValidationRule();
                                    }
                                  }}
                                />
                              </td>
                              <td class="col-rule-type">
                                <button
                                  type="button"
                                  class="btn-rule-type-pill {newRuleIsRegex
                                    ? 'is-regex'
                                    : ''}"
                                  onclick={() =>
                                    (newRuleIsRegex = !newRuleIsRegex)}
                                  title="Toggle between Literal Text and Regular Expression"
                                >
                                  {newRuleIsRegex ? 'Regex' : 'Text'}
                                </button>
                              </td>
                              <td class="col-rule-actions">
                                <button
                                  type="button"
                                  class="btn-add-speaker btn-add-rule-inline"
                                  disabled={!newRuleFind.trim()}
                                  onclick={handleAddCustomValidationRule}
                                  title="Add validation rule"
                                >
                                  <i class="fa-solid fa-plus"></i>
                                  <span>Add</span>
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
    max-width: 820px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }

  @media (max-width: 560px) {
    .general-grid {
      grid-template-columns: 1fr;
    }
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
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
    gap: 6px;
    padding: 8px 10px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
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

  .help-points {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .help-point {
    font-size: 0.72rem;
    line-height: 1.4;
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

  .spk-th-color {
    width: 118px;
  }

  .spk-th-name {
    flex: 1;
  }

  .spk-th-init {
    width: 64px;
    text-align: center;
  }

  .spk-th-elantype {
    width: 150px;
  }

  .spk-th-segs {
    width: 68px;
    text-align: center;
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

  .speaker-color-picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: 118px;
    flex-shrink: 0;
  }

  .speaker-color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--swatch-color);
    color: #ffffff;
    font-size: 0.58rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition:
      transform 0.12s ease,
      opacity 0.12s ease,
      box-shadow 0.12s ease;
    flex-shrink: 0;
  }

  .speaker-color-swatch:hover:not(:disabled) {
    transform: scale(1.12);
  }

  .speaker-color-swatch.selected {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px var(--swatch-color);
  }

  :global([data-theme='dark']) .speaker-color-swatch.selected {
    border-color: #0f172a;
  }

  .speaker-color-swatch:disabled {
    opacity: 0.22;
    cursor: not-allowed;
    transform: none;
  }

  .speaker-name-field {
    flex: 1;
    min-width: 0;
  }

  .speaker-initials-field {
    width: 64px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }

  .initials-input {
    width: 52px;
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 4px;
  }

  .speaker-elantype-field {
    width: 150px;
    flex-shrink: 0;
  }

  .speaker-elantype-input {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.75rem;
  }

  .speaker-segs-field {
    width: 68px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }

  .speaker-seg-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 22px;
    padding: 0 7px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.06);
    color: var(--text-color, #334155);
    font-size: 0.72rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  :global([data-theme='dark']) .speaker-seg-count {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
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

  .settings-table-wrap {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .settings-table-wrap {
    background: #0f172a;
    border-color: #334155;
  }

  .settings-data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.76rem;
  }

  .settings-data-table thead th {
    text-align: left;
    padding: 6px 8px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted, #64748b);
    background: var(--bg-hover, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    white-space: nowrap;
  }

  :global([data-theme='dark']) .settings-data-table thead th {
    background: #1e293b;
    border-bottom-color: #334155;
    color: #94a3b8;
  }

  .settings-data-table tbody td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    vertical-align: middle;
  }

  :global([data-theme='dark']) .settings-data-table tbody td {
    border-bottom-color: #334155;
  }

  .settings-data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .col-sub-id {
    width: 34px;
    text-align: center !important;
  }

  .col-sub-name {
    width: 20%;
  }

  .col-sub-type {
    width: 26%;
  }

  .col-sub-elantype {
    width: 18%;
  }

  .col-sub-annotator {
    width: 14%;
  }

  .col-sub-config {
    width: 14%;
    white-space: nowrap;
  }

  .col-sub-actions {
    width: 36px;
    text-align: center !important;
  }

  .subtier-row.is-expanded td {
    border-bottom-color: transparent;
    background: rgba(2, 132, 199, 0.03);
  }

  :global([data-theme='dark']) .subtier-row.is-expanded td {
    background: rgba(56, 189, 248, 0.04);
  }

  .subtier-expanded-row td {
    padding: 0 8px 8px 8px !important;
    background: rgba(2, 132, 199, 0.03);
  }

  :global([data-theme='dark']) .subtier-expanded-row td {
    background: rgba(56, 189, 248, 0.04);
  }

  .subtier-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
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

  .subtier-input,
  .subtier-type-select {
    width: 100%;
  }

  .subtier-type-select {
    cursor: pointer;
    font-weight: 600;
  }

  .btn-word-config-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 8px;
    border-radius: 5px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-hover, #f8fafc);
    color: var(--text-color, #334155);
    font-size: 0.71rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-word-config-toggle:hover,
  .btn-word-config-toggle.expanded {
    background: rgba(2, 132, 199, 0.08);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-word-config-toggle {
    background: #1e293b;
    border-color: #475569;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-word-config-toggle:hover,
  :global([data-theme='dark']) .btn-word-config-toggle.expanded {
    background: rgba(56, 189, 248, 0.14);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .config-summary-sep {
    opacity: 0.55;
  }

  .config-summary-field {
    font-weight: 700;
    max-width: 70px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-caret {
    font-size: 0.62rem;
    margin-left: 2px;
    opacity: 0.8;
  }

  .sentence-config-placeholder {
    color: var(--text-muted, #94a3b8);
    font-size: 0.75rem;
    padding-left: 6px;
  }

  .subtier-word-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
  }

  :global([data-theme='dark']) .subtier-word-panel {
    background: #1e293b;
    border-color: #334155;
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

  .lexfield-select-sm {
    font-weight: 600;
    width: 100%;
  }

  .lexfield-select-sm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .validation-check-title code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.68rem;
    background: rgba(0, 0, 0, 0.05);
    padding: 0 3px;
    border-radius: 3px;
  }

  :global([data-theme='dark']) .validation-check-title code {
    background: rgba(255, 255, 255, 0.1);
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

  .col-rule-active {
    width: 48px;
    text-align: center !important;
  }

  .col-rule-find,
  .col-rule-replace {
    width: 36%;
  }

  .col-rule-type {
    width: 68px;
    text-align: center !important;
  }

  .col-rule-actions {
    width: 58px;
    text-align: center !important;
  }

  .custom-rule-cell-input {
    width: 100%;
    height: 27px;
    padding: 2px 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.74rem;
  }

  .rule-find-input {
    color: #dc2626;
  }

  :global([data-theme='dark']) .rule-find-input {
    color: #f87171;
  }

  .rule-replace-input {
    color: #059669;
  }

  :global([data-theme='dark']) .rule-replace-input {
    color: #34d399;
  }

  .btn-rule-type-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    height: 22px;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-hover, #f8fafc);
    color: var(--text-muted, #64748b);
    font-size: 0.66rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-rule-type-pill:hover {
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-rule-type-pill {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
  }

  .btn-rule-type-pill.is-regex {
    background: rgba(124, 58, 237, 0.12);
    border-color: rgba(124, 58, 237, 0.35);
    color: #7c3aed;
  }

  :global([data-theme='dark']) .btn-rule-type-pill.is-regex {
    background: rgba(139, 92, 246, 0.2);
    border-color: rgba(167, 139, 250, 0.4);
    color: #c4b5fd;
  }

  .custom-rule-new-row td {
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .custom-rule-new-row td {
    background: rgba(255, 255, 255, 0.02);
  }

  .new-rule-plus-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #94a3b8);
    font-size: 0.7rem;
  }

  .btn-add-rule-inline {
    height: 26px;
    padding: 0 7px;
    font-size: 0.7rem;
  }

  .btn-add-rule-inline:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
