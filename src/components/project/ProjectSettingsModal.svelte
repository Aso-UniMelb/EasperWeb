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
  let tokensTierName = $state('tokens');
  let lexiconId = $state('');
  let speakers = $state([]);
  let subTiers = $state([]);
  let activeTab = $state('main'); // 'main' | 'subtiers' | 'validation'
  let showSubTierHelp = $state(false);
  let showValidationHelp = $state(false);
  let expandedWordTierIds = $state({});
  let speakerRowUid = 0;
  let draggedSpeakerIdx = $state(null);
  let dragOverSpeakerIdx = $state(null);

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
  let validateEmptySegments = $state(false);
  let checkEmptyMainTier = $state(true);
  let checkEmptySubTiers = $state(true);
  let validateSubTierTags = $state(true);
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
          tokensTierName =
            (projectState.activeProject.tokensTierName || '').trim() ||
            'tokens';
          lexiconId = projectState.activeProject.lexiconId || '';
          const fallbackPrefix = projectState.activeProject.mainTierTitle || '';
          const fallbackTranscriber =
            projectState.activeProject.transcriber || '';
          const existingSpeakers = projectState.activeProject.speakers;
          speakers = ensureDefaultSpeakers(existingSpeakers).map((s) => ({
            ...s,
            id: Number(s.id) || 1,
            originalId: Number(s.id) || 1,
            tierPrefix:
              s.tierPrefix !== undefined
                ? s.tierPrefix
                : s.isNoteTier
                  ? ''
                  : fallbackPrefix,
            transcriber:
              s.transcriber !== undefined ? s.transcriber : fallbackTranscriber,
            elanTierType: s.elanTierType || '',
            isNoteTier: Boolean(s.isNoteTier),
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
          validateEmptySegments = Boolean(vRules.validateEmptySegments);
          checkEmptyMainTier =
            vRules.checkEmptyMainTier !== undefined
              ? Boolean(vRules.checkEmptyMainTier)
              : true;
          checkEmptySubTiers =
            vRules.checkEmptySubTiers !== undefined
              ? Boolean(vRules.checkEmptySubTiers)
              : true;
          validateSubTierTags =
            vRules.validateSubTierTags !== undefined
              ? Boolean(vRules.validateSubTierTags)
              : true;
          validateCustomRules = Boolean(vRules.validateCustomRules);
          customRules = vRules.customRules.map((r) => ({ ...r }));
          newRuleFind = '';
          newRuleReplace = '';
          newRuleIsRegex = false;
        }
        activeTab =
          projectState.projectSettingsInitialTab === 'subtiers' ||
          projectState.projectSettingsInitialTab === 'validation'
            ? projectState.projectSettingsInitialTab
            : 'main';
        projectState.projectSettingsInitialTab = 'main';
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

  function handleAddSpeaker(isNote = false) {
    errorMessage = '';
    if (speakers.length >= 5) {
      errorMessage = 'Maximum of 5 main tiers allowed per project.';
      return;
    }

    // Find smallest available ID between 1 and 5
    const existingIds = new Set(speakers.map((s) => Number(s.id)));
    let nextId = 1;
    while (nextId <= 5 && existingIds.has(nextId)) {
      nextId++;
    }

    if (nextId > 5) {
      errorMessage = 'Maximum of 5 main tiers reached.';
      return;
    }

    const noteCount = speakers.filter((s) => s.isNoteTier).length;
    const defaultName = isNote
      ? noteCount === 0
        ? 'Notes'
        : `Notes ${noteCount + 1}`
      : `Speaker ${nextId}`;
    const defaultInitials = isNote
      ? noteCount === 0
        ? 'NT'
        : `N${noteCount + 1}`
      : `S${nextId}`;

    const firstSpk = speakers[0];
    speakers = [
      ...speakers,
      {
        id: nextId,
        originalId: null,
        _uid: ++speakerRowUid,
        name: defaultName,
        initials: defaultInitials,
        tierPrefix: isNote ? '' : firstSpk?.tierPrefix || '',
        transcriber: firstSpk?.transcriber || transcriber || '',
        elanTierType: '',
        isNoteTier: Boolean(isNote),
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

  function moveSpeaker(fromIdx, toIdx) {
    if (
      fromIdx < 0 ||
      fromIdx >= speakers.length ||
      toIdx < 0 ||
      toIdx >= speakers.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const next = [...speakers];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    speakers = next;
  }

  function handleSpeakerDragStart(e, idx) {
    draggedSpeakerIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch {}
  }

  function handleSpeakerDragOver(e, idx) {
    if (draggedSpeakerIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverSpeakerIdx = idx;
  }

  function handleSpeakerDrop(e, idx) {
    e.preventDefault();
    if (draggedSpeakerIdx !== null && draggedSpeakerIdx !== idx) {
      moveSpeaker(draggedSpeakerIdx, idx);
    }
    draggedSpeakerIdx = null;
    dragOverSpeakerIdx = null;
  }

  function handleSpeakerDragEnd() {
    draggedSpeakerIdx = null;
    dragOverSpeakerIdx = null;
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

    if (val === ELAN_STEREOTYPE_SYM_SUBDIV || val === SUB_TIER_TYPE_WORD) {
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
    speaker.initials = (val || '').replace(/[@\s]/g, '').slice(0, 8);
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

  const hasDividedLexiconInSettings = $derived(
    subTiers.some(
      (t) =>
        (t.type === SUB_TIER_TYPE_WORD ||
          t.stereotype === ELAN_STEREOTYPE_SYM_SUBDIV ||
          t.stereotype === ELAN_STEREOTYPE_TIME_SUBDIV) &&
        ((Array.isArray(t.lexicon) && t.lexicon.length > 0) ||
          (t.lexiconInput && t.lexiconInput.trim().length > 0)),
    ),
  );

  const activeValidationCount = $derived(
    (validateTags ? 1 : 0) +
      (fixApostropheBacktick ? 1 : 0) +
      (fixDoubleSpaces ? 1 : 0) +
      (validateAcronyms ? 1 : 0) +
      (validateEmptySegments && (checkEmptyMainTier || checkEmptySubTiers)
        ? 1
        : 0) +
      (validateSubTierTags && hasDividedLexiconInSettings ? 1 : 0) +
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
      const isNoteTier = Boolean(s.isNoteTier);
      const cleanName = (
        s.name || (isNoteTier ? 'Notes' : `Speaker ${spkId}`)
      ).trim();
      let cleanInitials = (s.initials || '')
        .trim()
        .replace(/[@\s]/g, '')
        .slice(0, 8);
      if (!cleanInitials) {
        cleanInitials = isNoteTier ? 'NT' : `S${spkId}`;
      }
      const cleanPrefix = (s.tierPrefix || '').trim().replace(/@+$/, '');
      const cleanTranscriber = (s.transcriber || '').trim();
      return {
        id: spkId,
        name: cleanName,
        initials: cleanInitials,
        tierPrefix: cleanPrefix,
        transcriber: cleanTranscriber,
        elanTierType: (s.elanTierType || '').trim(),
        ...(isNoteTier ? { isNoteTier: true } : {}),
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

    const cleanTokensTierName = (tokensTierName || '')
      .trim()
      .replace(/@+$/, '');
    const firstWordSubTier = sanitizedSubTiers.find(
      (t) => t.type === SUB_TIER_TYPE_WORD,
    );
    if (firstWordSubTier && !cleanTokensTierName) {
      activeTab = 'subtiers';
      expandedWordTierIds = {
        ...expandedWordTierIds,
        [firstWordSubTier.id]: true,
      };
      errorMessage = 'Tokenised Tier Name cannot be empty for tokenised sub-tiers.';
      return;
    }

    const sanitizedValidationRules = normalizeValidationRules({
      validateTags,
      allowedTags: parseAllowedTags(allowedTagsInput),
      fixApostropheBacktick,
      fixDoubleSpaces,
      validateAcronyms,
      acronymMode: validateAcronyms ? acronymMode : ACRONYM_MODES.DISABLED,
      validateEmptySegments,
      checkEmptyMainTier,
      checkEmptySubTiers,
      validateSubTierTags,
      validateCustomRules,
      customRules,
    });

    const primarySpkWithPrefix = sanitizedSpeakers.find(
      (s) => !s.isNoteTier && s.tierPrefix,
    );
    const primarySpkWithTranscriber = sanitizedSpeakers.find(
      (s) => s.transcriber,
    );

    try {
      await projectState.updateProjectSettings(projectState.activeProject.id, {
        title: cleanTitle,
        transcriber:
          primarySpkWithTranscriber?.transcriber || transcriber.trim(),
        mainTierTitle: primarySpkWithPrefix?.tierPrefix || '',
        tokensTierName: cleanTokensTierName || 'tokens',
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
            </div>
          </div>

          <div class="form-section">
            <div class="section-header-row">
              <div class="section-title-group">
                <h4 class="section-title">Speakers / Main Tiers</h4>
                <span class="elan-naming-hint">
                  ELAN tier name: <code>&lt;prefix&gt;@&lt;initials&gt;</code>
                  &bull; Sub-tiers: <code>&lt;name&gt;@&lt;initials&gt;</code>
                </span>
              </div>
              {#if speakers.length < 5}
                <button
                  type="button"
                  class="btn-add-speaker"
                  onclick={() => handleAddSpeaker(false)}
                >
                  <i class="fa-solid fa-user-plus"></i>
                  <span>Add Speaker</span>
                </button>
              {/if}
            </div>

            <div class="speakers-list">
              <div class="speakers-header-bar">
                <span class="spk-th-drag" title="Drag or use arrows to reorder"
                ></span>
                <span class="spk-th-color">Color</span>
                <span
                  class="spk-th-prefix"
                  title="Optional prefix in ELAN export: <prefix>@<initials>"
                >
                  Tier Prefix
                </span>
                <span class="spk-th-name">Speaker / Tier Name</span>
                <span
                  class="spk-th-init"
                  title="Up to 8 chars (used in ELAN tier names <name>@<initials>; first 3 chars shown in studio)"
                >
                  Initials
                </span>
                <span
                  class="spk-th-transcriber"
                  title="Transcriber / Annotator name saved in ELAN ANNOTATOR attribute"
                >
                  Transcriber
                </span>
                <span class="spk-th-elantype">ELAN Tier Type</span>
                <span
                  class="spk-th-subtiers"
                  title="Whether this tier has dependent sub-tiers (uncheck for standalone note tiers)"
                >
                  Sub-tiers
                </span>
                <span class="spk-th-segs">Segments</span>
                <span class="spk-th-act">Del!</span>
              </div>
              {#each speakers as spk, spkIdx (spk._uid || spk.id)}
                {@const col = SPEAKER_COLORS[spk.id] || SPEAKER_COLORS[1]}
                {@const segCount =
                  speakerSegmentCounts[spk.originalId ?? spk.id] || 0}
                {@const cleanPref = (spk.tierPrefix || '')
                  .trim()
                  .replace(/@+$/, '')}
                {@const cleanSpkName = (spk.name || `Speaker ${spk.id}`).trim()}
                {@const cleanSpkInit = (
                  (spk.initials || '').trim() ||
                  (spk.isNoteTier ? 'NT' : `S${spk.id}`)
                ).slice(0, 8)}
                {@const previewElanId = cleanPref
                  ? `${cleanPref}@${cleanSpkInit}`
                  : spk.isNoteTier
                    ? cleanSpkName
                    : cleanSpkInit}
                <div
                  class="speaker-row {draggedSpeakerIdx === spkIdx
                    ? 'is-dragging'
                    : ''} {dragOverSpeakerIdx === spkIdx &&
                  draggedSpeakerIdx !== spkIdx
                    ? 'is-drag-over'
                    : ''}"
                  style="--spk-color: {col.primary}; --spk-bg: {col.bg}; --spk-border: {col.border}"
                  ondragover={(e) => handleSpeakerDragOver(e, spkIdx)}
                  ondrop={(e) => handleSpeakerDrop(e, spkIdx)}
                  role="listitem"
                >
                  <div
                    class="speaker-drag-handle"
                    draggable="true"
                    ondragstart={(e) => handleSpeakerDragStart(e, spkIdx)}
                    ondragend={handleSpeakerDragEnd}
                    title="Drag to reorder tier (also reorders columns on waveform)"
                    role="button"
                    tabindex="-1"
                  >
                    <i class="fa-solid fa-grip-vertical"></i>
                  </div>
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
                          ? `${colorOpt.label} (used by ${takenBy.name || 'another tier'})`
                          : colorOpt.label}
                      >
                        {#if isSelected}
                          <i class="fa-solid fa-check"></i>
                        {/if}
                      </button>
                    {/each}
                  </div>

                  <div class="speaker-field speaker-prefix-field">
                    <input
                      id="spk-prefix-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input"
                      bind:value={spk.tierPrefix}
                      placeholder="e.g. BIS"
                      title="ELAN root tier ID will be: {previewElanId}"
                    />
                  </div>

                  <div class="speaker-field speaker-name-field">
                    <input
                      id="spk-name-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input"
                      bind:value={spk.name}
                      placeholder={spk.isNoteTier ? 'Notes' : 'Speaker Name'}
                      title="ELAN root tier ID: {previewElanId}{!spk.isNoteTier
                        ? ` | Sub-tiers: <name>@${cleanSpkInit}`
                        : ' (no sub-tiers)'}"
                    />
                  </div>

                  <div class="speaker-field speaker-initials-field">
                    <input
                      id="spk-init-{spk._uid || spk.id}"
                      type="text"
                      maxlength="8"
                      class="form-input speaker-input initials-input"
                      value={spk.initials}
                      oninput={(e) => handleInitialsInput(spk, e.target.value)}
                      placeholder="S{spk.id}"
                      title="Up to 8 chars (used in ELAN tier names <name>@<initials>; first 3 chars shown in studio)"
                    />
                  </div>

                  <div class="speaker-field speaker-transcriber-field">
                    <input
                      id="spk-transcriber-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input"
                      bind:value={spk.transcriber}
                      placeholder="Transcriber"
                      title="Transcriber / Annotator name for {previewElanId}"
                    />
                  </div>

                  <div class="speaker-field speaker-elantype-field">
                    <input
                      id="spk-elantype-{spk._uid || spk.id}"
                      type="text"
                      class="form-input speaker-input speaker-elantype-input"
                      bind:value={spk.elanTierType}
                      placeholder="default-lt"
                      title="ELAN Tier Type (LINGUISTIC_TYPE_REF) for this root tier"
                    />
                  </div>

                  <div
                    class="speaker-field speaker-subtiers-field"
                    title={!spk.isNoteTier
                      ? 'Checked: This tier includes project sub-tiers'
                      : 'Unchecked: This tier has no sub-tiers (e.g. for notes)'}
                  >
                    <input
                      id="spk-subtiers-{spk._uid || spk.id}"
                      type="checkbox"
                      class="speaker-subtiers-checkbox"
                      checked={!spk.isNoteTier}
                      onchange={(e) => {
                        spk.isNoteTier = !e.currentTarget.checked;
                      }}
                      aria-label="Has sub-tiers for {spk.name || 'tier'}"
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
                    <strong>Symbolic Association (Untokenised):</strong> Single
                    full-utterance text field per segment for translations,
                    comments, or notes (1-to-1 ELAN
                    <code>REF_ANNOTATION</code>).
                  </div>
                  <div class="help-point">
                    <strong>Symbolic / Time Subdivision (Tokenised):</strong>
                    Token-level annotation split by whitespace and custom
                    <strong>Token Delimiters</strong> (e.g. <code>-</code>,
                    <code>=</code>), with autocomplete <strong>Allowed Tags</strong>.
                  </div>
                  <div class="help-point">
                    <strong>ELAN Tier Type:</strong> Custom
                    <code>LINGUISTIC_TYPE_ID</code> name preserved when
                    importing and exporting ELAN (<code>.eaf</code>) files.
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
                            title="ELAN Constraint Stereotype and Easper tokenisation behavior"
                          >
                            <option value={ELAN_STEREOTYPE_SYM_ASSOC}>
                              Symbolic Association (Untokenised)
                            </option>
                            <option value={ELAN_STEREOTYPE_SYM_SUBDIV}>
                              Symbolic Subdivision (Tokenised)
                            </option>
                            <option value={ELAN_STEREOTYPE_TIME_SUBDIV}>
                              Time Subdivision (Tokenised)
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
                              ? currentStereotype ===
                                ELAN_STEREOTYPE_TIME_SUBDIV
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
                                ? 'Hide tokenised tier configuration'
                                : 'Configure dynamic tokenisation, delimiters, and allowed tags'}
                            >
                              <span>
                                {tier.lexicon.length > 0
                                  ? `${tier.lexicon.length} tags`
                                  : 'Free text'}
                              </span>
                              <i
                                class="fa-solid fa-chevron-{isExpanded
                                  ? 'up'
                                  : 'down'} config-caret"
                              ></i>
                            </button>
                          {:else}
                            <span
                              class="sentence-config-placeholder"
                              title="Untokenised tier (single text per segment)"
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
                              <!-- Box 1: Dynamic Tokenisation -->
                              <div class="word-config-section">
                                <div class="word-config-section-title">
                                  Dynamic Tokenisation
                                </div>
                                <div class="word-tier-meta-row">
                                  <div class="tokens-tier-col">
                                    <label
                                      for="tokens-tier-input-{tier.id}"
                                      class="sub-label compact-sub-label"
                                    >
                                      Tokenised Tier Name (when exported to
                                      ELAN)
                                    </label>
                                    <input
                                      id="tokens-tier-input-{tier.id}"
                                      type="text"
                                      class="form-input"
                                      placeholder="e.g. tokens, words, morphemes"
                                      bind:value={tokensTierName}
                                    />
                                  </div>

                                  <div class="splitters-col">
                                    <label
                                      for="splitters-input-{tier.id}"
                                      class="sub-label compact-sub-label"
                                    >
                                      Token Delimiters
                                    </label>
                                    <input
                                      id="splitters-input-{tier.id}"
                                      type="text"
                                      class="form-input splitters-input"
                                      placeholder="e.g. - = <overlap>"
                                      bind:value={tier.splitters}
                                    />
                                    <span class="field-caption">
                                      Space always separates words. Add
                                      <code>-</code> <code>=</code> to split
                                      morphemes, or <code>&lt;overlap&gt;</code>
                                      to skip tags.
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <!-- Box 2: Controlled Vocabulary / Allowed Tags (Optional) -->
                              <div class="word-config-section">
                                <div class="lexicon-header">
                                  <div class="lexicon-title-area">
                                    <label
                                      for="lexicon-input-{tier.id}"
                                      class="sub-label"
                                    >
                                      Allowed Tags / Controlled Vocabulary
                                      (Optional)
                                    </label>
                                    {#if tier.lexicon.length > 0}
                                      <span class="lexicon-badge">
                                        {tier.lexicon.length}
                                      </span>
                                    {/if}
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
                                    placeholder="e.g. n {'{'}Noun{'}'}, v {'{'}Verb{'}'}, adj {'{'}Adjective{'}'}"
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
                                          typeof tag === 'object' &&
                                          tag !== null
                                            ? tag.value
                                            : tag}
                                        {@const tagLabel =
                                          typeof tag === 'object' &&
                                          tag !== null
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
                                <span class="field-caption">
                                  Leave empty for free-text glossing, or define
                                  allowed tags for autocomplete &amp; validation
                                  (optional description in braces:
                                  <code>n {'{'}Noun{'}'}, v {'{'}Verb{'}'}</code
                                  >).
                                </span>
                              </div>
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

                <!-- 5. Empty Segments (Main Transcription or Sub-Tiers) -->
                <div class="validation-rule-group">
                  <label
                    class="validation-check-item"
                    title="Flag empty segments in main transcription tiers or sub-tiers"
                  >
                    <input
                      type="checkbox"
                      bind:checked={validateEmptySegments}
                    />
                    <div class="validation-check-text">
                      <span class="validation-check-title">
                        Empty Segments (Main Transcription or Sub-Tiers)
                      </span>
                    </div>
                  </label>

                  {#if validateEmptySegments}
                    <div class="validation-subpanel empty-scope-subpanel">
                      <label class="empty-scope-option">
                        <input
                          type="checkbox"
                          bind:checked={checkEmptyMainTier}
                        />
                        <span>Main transcription tiers</span>
                      </label>
                      <label class="empty-scope-option">
                        <input
                          type="checkbox"
                          bind:checked={checkEmptySubTiers}
                        />
                        <span>Sub-tiers (untokenised &amp; tokenised)</span>
                      </label>
                    </div>
                  {/if}
                </div>

                <!-- 6. Invalid Tags in Tokenised Sub-Tiers -->
                <label
                  class="validation-check-item"
                  title="Report word/morpheme annotations in tokenised sub-tiers that do not match the sub-tier's allowed lexicon tags"
                >
                  <input type="checkbox" bind:checked={validateSubTierTags} />
                  <div class="validation-check-text">
                    <span class="validation-check-title">
                      Invalid Tags in Tokenised Sub-Tiers
                    </span>
                  </div>
                </label>

                <!-- 7. Custom Validation Rules -->
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
    max-width: 920px;
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
    display: grid;
    grid-template-columns:
      16px 115px 82px minmax(110px, 1.25fr) 76px minmax(96px, 1fr)
      106px 56px 52px 32px;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    font-size: 0.66rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .spk-th-drag,
  .spk-th-color,
  .spk-th-prefix,
  .spk-th-name,
  .spk-th-transcriber,
  .spk-th-elantype {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-title-group {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
  }

  .elan-naming-hint {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    font-weight: 500;
  }

  .elan-naming-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.7rem;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .elan-naming-hint code {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .speaker-field {
    min-width: 0;
    width: 100%;
  }

  .speaker-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 3px 6px;
    font-size: 0.76rem;
  }

  .spk-th-subtiers {
    text-align: center;
    white-space: nowrap;
  }

  .speaker-subtiers-field {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .speaker-subtiers-checkbox {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--primary-color, #0284c7);
    margin: 0;
  }

  .spk-th-init {
    text-align: center;
  }

  .spk-th-segs {
    text-align: center;
  }

  .spk-th-act {
    text-align: center;
  }

  .speaker-row {
    display: grid;
    grid-template-columns:
      16px 115px 82px minmax(110px, 1.25fr) 76px minmax(96px, 1fr)
      106px 56px 52px 32px;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: var(--spk-bg, #f8fafc);
    border: 1px solid var(--spk-border, #e2e8f0);
    border-radius: 5px;
    height: 36px;
    box-sizing: border-box;
    transition:
      opacity 0.12s ease,
      border-color 0.12s ease;
  }

  .speaker-row.is-dragging {
    opacity: 0.45;
  }

  .speaker-row.is-drag-over {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
  }

  :global([data-theme='dark']) .speaker-row {
    background: rgba(255, 255, 255, 0.03);
  }

  .speaker-drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #94a3b8);
    cursor: grab;
    font-size: 0.72rem;
    user-select: none;
  }

  .speaker-drag-handle:hover {
    color: var(--text-heading, #334155);
  }

  :global([data-theme='dark']) .speaker-drag-handle:hover {
    color: #e2e8f0;
  }

  .speaker-color-picker {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
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
    min-width: 0;
  }

  .speaker-initials-field {
    display: flex;
    justify-content: center;
  }

  .initials-input {
    width: 100%;
    text-align: center;
    font-weight: 700;
    padding: 2px 4px;
  }

  .speaker-elantype-field {
    min-width: 0;
  }

  .speaker-elantype-input {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.73rem;
  }

  .speaker-segs-field {
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
    justify-content: flex-end;
    gap: 2px;
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
    gap: 8px;
    padding: 8px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
  }

  :global([data-theme='dark']) .subtier-word-panel {
    background: #1e293b;
    border-color: #334155;
  }

  .word-config-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
  }

  :global([data-theme='dark']) .word-config-section {
    background: #0f172a;
    border-color: #334155;
  }

  .word-config-section-title {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .word-config-section-title {
    color: #38bdf8;
  }

  .word-tier-meta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: start;
  }

  .tokens-tier-col,
  .splitters-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .tokens-tier-col .form-input,
  .splitters-col .form-input {
    width: 100%;
  }

  .field-caption {
    font-size: 0.69rem;
    color: var(--text-muted, #64748b);
    line-height: 1.35;
  }

  .field-caption code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.66rem;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .field-caption code {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .splitters-input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    font-size: 0.78rem;
    font-weight: 600;
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

  .empty-scope-subpanel {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    padding: 6px 12px;
  }

  .empty-scope-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    cursor: pointer;
  }

  :global([data-theme='dark']) .empty-scope-option {
    color: #cbd5e1;
  }

  .empty-scope-option input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
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
