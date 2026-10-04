<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { appState } from '../../state/appState.svelte.js';
  import { parseEaf, matchAudioAndEaf } from '../../utils/elanParser.js';
  import {
    detectTierDefaults,
    compileElanToProject,
  } from '../../utils/elanImporter.js';
  import {
    SPEAKER_COLORS,
    getSpeakerColor,
    getSpeakerInitials,
  } from '../../utils/speakers.js';
  import {
    MAX_SUB_TIERS,
    SUB_TIER_PRESETS,
    normalizeSubTiers,
  } from '../../utils/subTiers.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';

  let eafFile = $state(null);
  let audioFile = $state(null);
  let parsedEaf = $state(null);
  let audioMatch = $state(null);

  let title = $state('');
  let lexiconId = $state('');
  let transcriber = $state(
    typeof window !== 'undefined'
      ? localStorage.getItem('easper_last_transcriber') || ''
      : '',
  );

  let speakers = $state([]);
  let subTiers = $state([]);
  let tierConfigs = $state([]);

  let errorMessage = $state('');
  let isConverting = $state(false);
  let convertingMessage = $state('');

  let eafInputEl = $state(null);
  let audioInputEl = $state(null);
  let comboInputEl = $state(null);
  let isDropZoneHover = $state(false);

  function resetState() {
    eafFile = null;
    audioFile = null;
    parsedEaf = null;
    audioMatch = null;
    title = '';
    lexiconId = '';
    speakers = [];
    subTiers = [];
    tierConfigs = [];
    errorMessage = '';
    isConverting = false;
    convertingMessage = '';
  }

  function handleClose() {
    if (isConverting) return;
    projectState.isImportElanOpen = false;
    resetState();
  }

  $effect(() => {
    if (projectState.isImportElanOpen) {
      if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
        lexiconState.init();
      }
    }
  });

  async function handleEafSelected(file) {
    if (!file) return;
    try {
      errorMessage = '';
      eafFile = file;
      const text = await file.text();
      parsedEaf = parseEaf(text, file.name);

      // Auto-detect tier defaults
      const detected = detectTierDefaults(parsedEaf);
      if (!title.trim()) {
        title = detected.suggestedTitle;
      }
      if (!transcriber.trim() && detected.suggestedTranscriber) {
        transcriber = detected.suggestedTranscriber;
      }
      speakers = detected.speakers;
      subTiers = detected.subTiers;
      tierConfigs = detected.tierConfigs;

      checkAudioMatch();
    } catch (err) {
      console.error('[ElanImportModal] Failed to parse EAF file:', err);
      errorMessage = `Failed to parse ELAN file: ${err.message || err}`;
      eafFile = null;
      parsedEaf = null;
    }
  }

  function handleAudioSelected(file) {
    if (!file) return;
    audioFile = file;
    errorMessage = '';
    checkAudioMatch();
  }

  function checkAudioMatch() {
    if (parsedEaf && audioFile) {
      audioMatch = matchAudioAndEaf(
        parsedEaf.mediaDescriptors,
        parsedEaf.fileName || eafFile?.name || '',
        audioFile.name,
      );
    } else {
      audioMatch = null;
    }
  }

  function handleComboFiles(files) {
    if (!files || files.length === 0) return;
    let foundEaf = null;
    let foundAudio = null;

    for (const f of Array.from(files)) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.eaf')) {
        foundEaf = f;
      } else if (
        lower.endsWith('.wav') ||
        lower.endsWith('.mp3') ||
        lower.endsWith('.m4a') ||
        lower.endsWith('.ogg') ||
        lower.endsWith('.flac')
      ) {
        foundAudio = f;
      }
    }

    if (foundEaf) handleEafSelected(foundEaf);
    if (foundAudio) handleAudioSelected(foundAudio);
  }

  function handleDrop(e) {
    e.preventDefault();
    isDropZoneHover = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleComboFiles(files);
    }
  }

  function handleAddSpeaker() {
    if (speakers.length >= 5) {
      errorMessage = 'Maximum of 5 speakers allowed.';
      return;
    }
    const usedIds = new Set(speakers.map((s) => Number(s.id)));
    let nextId = 1;
    while (nextId <= 5 && usedIds.has(nextId)) nextId++;
    if (nextId > 5) return;

    speakers = [
      ...speakers,
      {
        id: nextId,
        name: `Speaker ${nextId}`,
        initials: `S${nextId}`,
      },
    ].sort((a, b) => a.id - b.id);
  }

  function handleAddSubTier() {
    if (subTiers.length >= MAX_SUB_TIERS) {
      errorMessage = `Maximum of ${MAX_SUB_TIERS} sub-tiers allowed.`;
      return;
    }
    const used = new Set(subTiers.map((t) => Number(t.id)));
    let nextId = 1;
    while (nextId <= MAX_SUB_TIERS && used.has(nextId)) nextId++;
    if (nextId > MAX_SUB_TIERS) return;

    const taken = new Set(
      subTiers.map((t) => (t.name || '').trim().toLowerCase()),
    );
    const preset =
      SUB_TIER_PRESETS.find((p) => !taken.has(p.toLowerCase())) ||
      `Sub-tier ${nextId}`;

    subTiers = [...subTiers, { id: nextId, name: preset }].sort(
      (a, b) => a.id - b.id,
    );
  }

  let selectedSpeakerTierCount = $derived(
    tierConfigs.filter((t) => t.included && t.role === 'speaker').length,
  );
  let selectedSubTierCount = $derived(
    tierConfigs.filter((t) => t.included && t.role === 'subtier').length,
  );
  let estimatedSegments = $derived(
    tierConfigs
      .filter((t) => t.included && t.role === 'speaker')
      .reduce((acc, t) => acc + (t.annotationCount || 0), 0),
  );

  async function handleImport() {
    errorMessage = '';
    if (!eafFile || !parsedEaf) {
      errorMessage = 'Please select a valid ELAN (.eaf) file.';
      return;
    }
    if (!audioFile) {
      errorMessage = 'Please select the matching audio file (.wav).';
      return;
    }
    if (selectedSpeakerTierCount === 0) {
      errorMessage =
        'Please select at least one tier as "Speaker Utterance" to generate segments.';
      return;
    }

    try {
      isConverting = true;
      convertingMessage =
        'Compiling dialogue segments from ELAN annotations...';

      // 1. Compile segments and transcript
      const compiled = compileElanToProject({
        eafData: parsedEaf,
        tierConfigs,
        speakers,
        subTiers,
      });

      convertingMessage =
        'Converting audio to 16kHz mono WAV and saving project...';

      // 2. Delegate to projectState to encode audio and persist in IndexedDB
      await projectState.createProjectFromElan({
        title: title.trim() || eafFile.name.replace(/\.[^/.]+$/, ''),
        transcriber: transcriber.trim() || 'Transcriber',
        audioFileOrBlob: audioFile,
        audioFileName: audioFile.name,
        speakers: compiled.speakers,
        subTiers: compiled.subTiers,
        lexiconId: lexiconId || null,
        segments: compiled.segments,
        transcript: compiled.transcript,
      });

      handleClose();
    } catch (err) {
      console.error('[ElanImportModal] Import failed:', err);
      errorMessage = err.message || 'Import failed.';
      isConverting = false;
      convertingMessage = '';
    }
  }
</script>

{#if projectState.isImportElanOpen}
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
    role="presentation"
  >
    <div class="modal-dialog elan-import-dialog">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-solid fa-file-waveform modal-title-icon"></i>
          <div>
            <h3>Import from ELAN (.eaf + .wav)</h3>
            <p class="modal-subtitle">
              Convert multi-tier ELAN annotations into Easper dialogue segments
            </p>
          </div>
        </div>
        <button
          type="button"
          class="btn-modal-close"
          onclick={handleClose}
          disabled={isConverting}
          aria-label="Close modal"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        {#if isConverting}
          <!-- Converting / Processing Indicator -->
          <div class="converting-overlay">
            <div class="converting-spinner">
              <i class="fa-solid fa-circle-notch fa-spin"></i>
            </div>
            <h4>Importing ELAN Project...</h4>
            <p class="converting-subtext">
              {convertingMessage ||
                'Converting audio to 16kHz mono WAV and building segments...'}
            </p>
          </div>
        {:else}
          {#if errorMessage}
            <div class="modal-alert modal-alert-danger">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          {/if}

          <!-- Step 1: File Selection Area -->
          <div class="elan-files-section">
            <div
              class="combo-dropzone {isDropZoneHover
                ? 'drag-over'
                : ''} {eafFile && audioFile ? 'files-ready' : ''}"
              ondragover={(e) => {
                e.preventDefault();
                isDropZoneHover = true;
              }}
              ondragleave={() => (isDropZoneHover = false)}
              ondrop={handleDrop}
              role="region"
              aria-label="ELAN and Audio drop zone"
            >
              <div class="dropzone-header">
                <i class="fa-solid fa-cloud-arrow-up drop-icon"></i>
                <div class="drop-text-wrap">
                  <strong>Drop .eaf and audio file together here</strong>
                  <span>or select files individually below</span>
                </div>
                <button
                  type="button"
                  class="btn-select-both"
                  onclick={() => comboInputEl?.click()}
                >
                  <i class="fa-solid fa-folder-open"></i> Browse Pair
                </button>
                <input
                  type="file"
                  multiple
                  accept=".eaf,.wav,.mp3,.m4a,.ogg,.flac"
                  bind:this={comboInputEl}
                  onchange={(e) => handleComboFiles(e.target.files)}
                  style="display: none;"
                />
              </div>

              <!-- Individual File Slots -->
              <div class="file-slots-grid">
                <!-- Slot 1: EAF File -->
                <div class="file-slot {eafFile ? 'slot-loaded' : ''}">
                  <div class="slot-icon">
                    <i class="fa-solid fa-file-code"></i>
                  </div>
                  <div class="slot-info">
                    <span class="slot-label">ELAN Annotation File</span>
                    {#if eafFile}
                      <strong class="slot-filename" title={eafFile.name}>
                        {eafFile.name}
                      </strong>
                      <span class="slot-meta">
                        {parsedEaf?.tiers?.length || 0} tiers, {parsedEaf
                          ?.allAnnotations?.length || 0} annotations
                      </span>
                    {:else}
                      <span class="slot-placeholder">No .eaf file selected</span
                      >
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="btn-slot-choose"
                    onclick={() => eafInputEl?.click()}
                  >
                    {eafFile ? 'Replace' : 'Choose .eaf'}
                  </button>
                  <input
                    type="file"
                    accept=".eaf"
                    bind:this={eafInputEl}
                    onchange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleEafSelected(f);
                    }}
                    style="display: none;"
                  />
                </div>

                <!-- Slot 2: Audio File -->
                <div class="file-slot {audioFile ? 'slot-loaded' : ''}">
                  <div class="slot-icon">
                    <i class="fa-solid fa-file-audio"></i>
                  </div>
                  <div class="slot-info">
                    <span class="slot-label">Audio Recording</span>
                    {#if audioFile}
                      <strong class="slot-filename" title={audioFile.name}>
                        {audioFile.name}
                      </strong>
                      <span class="slot-meta">
                        {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    {:else}
                      <span class="slot-placeholder"
                        >No audio file selected</span
                      >
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="btn-slot-choose"
                    onclick={() => audioInputEl?.click()}
                  >
                    {audioFile ? 'Replace' : 'Choose Audio'}
                  </button>
                  <input
                    type="file"
                    accept=".wav,.mp3,.m4a,.ogg,.flac"
                    bind:this={audioInputEl}
                    onchange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAudioSelected(f);
                    }}
                    style="display: none;"
                  />
                </div>
              </div>
            </div>

            <!-- Audio Verification Status Badge -->
            {#if audioMatch}
              {#if audioMatch.matched}
                <div class="match-badge match-success">
                  <i class="fa-solid fa-circle-check"></i>
                  <span
                    ><strong>Audio Verified:</strong> {audioMatch.reason}</span
                  >
                </div>
              {:else}
                <div class="match-badge match-warning">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span
                    ><strong>Filename Note:</strong>
                    {audioMatch.reason} You can still proceed if this is the matching
                    audio recording.</span
                  >
                </div>
              {/if}
            {/if}
          </div>

          {#if parsedEaf}
            <!-- Step 2: Project Metadata -->
            <div class="project-meta-grid">
              <div class="form-group">
                <label for="elan-proj-title"
                  >Project Title <span class="label-required">*</span></label
                >
                <input
                  id="elan-proj-title"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Field Interview - Session 1"
                  bind:value={title}
                />
              </div>
              <div class="form-group">
                <label for="elan-proj-transcriber">Transcriber Name</label>
                <input
                  id="elan-proj-transcriber"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Dr. Aris"
                  bind:value={transcriber}
                />
              </div>
              <div class="form-group">
                <label for="elan-proj-lexicon">Spellcheck Lexicon (Optional)</label>
                <select
                  id="elan-proj-lexicon"
                  class="form-control"
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

            <!-- Step 3: Speakers & Sub-Tiers Configuration -->
            <div class="mapping-config-section">
              <div class="config-columns">
                <!-- Speakers Column -->
                <div class="config-card">
                  <div class="config-card-header">
                    <div class="header-left">
                      <i class="fa-solid fa-users"></i>
                      <strong>Project Speakers ({speakers.length}/5)</strong>
                    </div>
                    {#if speakers.length < 5}
                      <button
                        type="button"
                        class="btn-add-item"
                        onclick={handleAddSpeaker}
                      >
                        <i class="fa-solid fa-plus"></i> Add Speaker
                      </button>
                    {/if}
                  </div>
                  <div class="items-list">
                    {#each speakers as spk (spk.id)}
                      {@const color = getSpeakerColor(spk.id)}
                      <div class="item-row speaker-item">
                        <span
                          class="speaker-dot"
                          style="background: {color.primary}; border-color: {color.border};"
                        ></span>
                        <input
                          type="text"
                          class="form-control form-control-sm spk-name-input"
                          bind:value={spk.name}
                          oninput={() => {
                            spk.initials = getSpeakerInitials(spk.name, spk.id);
                          }}
                          placeholder="Speaker {spk.id} Name"
                        />
                        <span class="spk-initials-badge" title="Initials">
                          {spk.initials || `S${spk.id}`}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Sub-Tiers Column -->
                <div class="config-card">
                  <div class="config-card-header">
                    <div class="header-left">
                      <i class="fa-solid fa-layer-group"></i>
                      <strong
                        >Sub-Tiers ({subTiers.length}/{MAX_SUB_TIERS})</strong
                      >
                    </div>
                    {#if subTiers.length < MAX_SUB_TIERS}
                      <button
                        type="button"
                        class="btn-add-item"
                        onclick={handleAddSubTier}
                      >
                        <i class="fa-solid fa-plus"></i> Add Sub-Tier
                      </button>
                    {/if}
                  </div>
                  <div class="items-list">
                    {#if subTiers.length === 0}
                      <p class="empty-subtiers-note">
                        No sub-tiers detected. Click "Add Sub-Tier" if you have
                        translation or gloss layers.
                      </p>
                    {:else}
                      {#each subTiers as st (st.id)}
                        <div class="item-row subtier-item">
                          <span class="subtier-num-badge">#{st.id}</span>
                          <input
                            type="text"
                            class="form-control form-control-sm subtier-name-input"
                            bind:value={st.name}
                            placeholder="Sub-tier {st.id} Name"
                          />
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Step 4: Tiers Mapping Table -->
              <div class="tiers-table-container">
                <div class="table-header-title">
                  <i class="fa-solid fa-table-list"></i>
                  <span
                    >ELAN Tiers to Import ({tierConfigs.length} Tiers Found)</span
                  >
                </div>

                <div class="tiers-table-wrapper">
                  <table class="tiers-table">
                    <thead>
                      <tr>
                        <th class="th-check">
                          <input
                            type="checkbox"
                            checked={tierConfigs.every((t) => t.included)}
                            onchange={(e) => {
                              const checked = e.target.checked;
                              tierConfigs = tierConfigs.map((t) => ({
                                ...t,
                                included: checked,
                              }));
                            }}
                            title="Toggle all tiers"
                          />
                        </th>
                        <th class="th-tier">ELAN Tier</th>
                        <th class="th-annotations">Annotations</th>
                        <th class="th-role">Import As</th>
                        <th class="th-target">Assigned Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each tierConfigs as tier, idx (tier.tierId)}
                        <tr
                          class={tier.included ? 'row-active' : 'row-ignored'}
                        >
                          <td class="td-check">
                            <input
                              type="checkbox"
                              bind:checked={tier.included}
                            />
                          </td>
                          <td class="td-tier">
                            <div class="tier-id-wrap">
                              <strong class="tier-name">{tier.tierId}</strong>
                              {#if tier.parentRef}
                                <span
                                  class="badge-parent"
                                  title="Child of {tier.parentRef}"
                                >
                                  <i class="fa-solid fa-turn-up fa-rotate-90"
                                  ></i>
                                  child of {tier.parentRef}
                                </span>
                              {:else}
                                <span class="badge-root">Root Tier</span>
                              {/if}
                              {#if tier.participant}
                                <span class="badge-participant">
                                  <i class="fa-solid fa-user"></i>
                                  {tier.participant}
                                </span>
                              {/if}
                            </div>
                            {#if tier.sampleText}
                              <p class="tier-sample" title={tier.sampleText}>
                                "{tier.sampleText.slice(0, 75)}{tier.sampleText
                                  .length > 75
                                  ? '...'
                                  : ''}"
                              </p>
                            {/if}
                          </td>
                          <td class="td-annotations">
                            <span class="ann-count-badge">
                              {tier.annotationCount}
                            </span>
                          </td>
                          <td class="td-role">
                            <select
                              class="form-select form-select-sm"
                              bind:value={tier.role}
                              disabled={!tier.included}
                            >
                              <option value="speaker"
                                >🗣️ Speaker Utterance</option
                              >
                              <option value="subtier">📝 Sub-Tier Layer</option>
                              <option value="ignore">🚫 Ignore Tier</option>
                            </select>
                          </td>
                          <td class="td-target">
                            {#if !tier.included || tier.role === 'ignore'}
                              <span class="target-disabled">—</span>
                            {:else if tier.role === 'speaker'}
                              <select
                                class="form-select form-select-sm spk-selector"
                                bind:value={tier.speakerId}
                              >
                                {#each speakers as spk}
                                  <option value={spk.id}>
                                    Speaker {spk.id}: {spk.name}
                                  </option>
                                {/each}
                              </select>
                            {:else if tier.role === 'subtier'}
                              {#if subTiers.length > 0}
                                <select
                                  class="form-select form-select-sm subtier-selector"
                                  bind:value={tier.subTierId}
                                >
                                  {#each subTiers as st}
                                    <option value={st.id}>
                                      Sub-Tier {st.id}: {st.name}
                                    </option>
                                  {/each}
                                </select>
                              {:else}
                                <button
                                  type="button"
                                  class="btn-create-subtier-inline"
                                  onclick={handleAddSubTier}
                                >
                                  + Create Sub-Tier
                                </button>
                              {/if}
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="modal-footer">
        <div class="footer-summary">
          {#if parsedEaf}
            <span>
              <strong>{selectedSpeakerTierCount}</strong> utterance tier{selectedSpeakerTierCount ===
              1
                ? ''
                : 's'} (~{estimatedSegments} segments),
              <strong>{selectedSubTierCount}</strong>
              sub-tier{selectedSubTierCount === 1 ? '' : 's'}
            </span>
          {:else}
            <span>Select both files to configure tier mappings.</span>
          {/if}
        </div>
        <div class="footer-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleClose}
            disabled={isConverting}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary btn-import"
            onclick={handleImport}
            disabled={!eafFile ||
              !audioFile ||
              selectedSpeakerTierCount === 0 ||
              isConverting}
          >
            <i class="fa-solid fa-file-import"></i>
            <span>Import Project</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
    padding: 16px;
  }

  .elan-import-dialog {
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 14px;
    width: 100%;
    max-width: 860px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.2),
      0 10px 10px -5px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  :global([data-theme='dark']) .elan-import-dialog {
    background: #1e293b;
    border-color: #334155;
    color: #f8fafc;
  }

  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  :global([data-theme='dark']) .modal-header {
    border-bottom-color: #334155;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .modal-title-icon {
    font-size: 1.6rem;
    color: var(--primary-color, #0284c7);
  }

  .modal-title h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
  }

  .modal-subtitle {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-modal-close {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .btn-modal-close:hover {
    color: var(--text-heading, #0f172a);
    background: var(--bg-hover, #f1f5f9);
  }

  :global([data-theme='dark']) .btn-modal-close:hover {
    background: #334155;
    color: #ffffff;
  }

  .modal-body {
    padding: 18px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-alert {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-alert-danger {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  :global([data-theme='dark']) .modal-alert-danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  /* File Dropzone & Slots */
  .elan-files-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .combo-dropzone {
    border: 2px dashed var(--border-color, #cbd5e1);
    border-radius: 10px;
    padding: 14px;
    background: var(--bg-hover, #f8fafc);
    transition: all 0.2s;
  }

  :global([data-theme='dark']) .combo-dropzone {
    border-color: #475569;
    background: rgba(15, 23, 42, 0.4);
  }

  .combo-dropzone.drag-over {
    border-color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .combo-dropzone.files-ready {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.04);
  }

  .dropzone-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .drop-icon {
    font-size: 1.5rem;
    color: var(--primary-color, #0284c7);
  }

  .drop-text-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    font-size: 0.84rem;
  }

  .drop-text-wrap span {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .btn-select-both {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }

  .btn-select-both:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-select-both {
    background: #334155;
    border-color: #475569;
    color: #f8fafc;
  }

  .file-slots-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  @media (max-width: 640px) {
    .file-slots-grid {
      grid-template-columns: 1fr;
    }
  }

  .file-slot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-card, #ffffff);
  }

  :global([data-theme='dark']) .file-slot {
    background: #1e293b;
    border-color: #334155;
  }

  .file-slot.slot-loaded {
    border-color: #93c5fd;
  }

  :global([data-theme='dark']) .file-slot.slot-loaded {
    border-color: #1d4ed8;
  }

  .slot-icon {
    font-size: 1.3rem;
    color: var(--primary-color, #0284c7);
  }

  .slot-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .slot-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    color: var(--text-muted, #64748b);
  }

  .slot-filename {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slot-placeholder {
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
    font-style: italic;
  }

  .slot-meta {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
  }

  .btn-slot-choose {
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-slot-choose:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
  }

  :global([data-theme='dark']) .btn-slot-choose {
    border-color: #475569;
    color: #f8fafc;
  }

  /* Match Badges */
  .match-badge {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .match-success {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
  }

  :global([data-theme='dark']) .match-success {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }

  .match-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }

  :global([data-theme='dark']) .match-warning {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.3);
    color: #fcd34d;
  }

  /* Project Meta Grid */
  .project-meta-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }

  @media (max-width: 640px) {
    .project-meta-grid {
      grid-template-columns: 1fr;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .label-required {
    color: #ef4444;
  }

  .form-control {
    padding: 7px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .form-control {
    background: #0f172a;
    border-color: #334155;
    color: #f8fafc;
  }

  .form-control:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .form-control-sm {
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  /* Mapping Config Columns */
  .mapping-config-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .config-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  @media (max-width: 640px) {
    .config-columns {
      grid-template-columns: 1fr;
    }
  }

  .config-card {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .config-card {
    background: rgba(15, 23, 42, 0.4);
    border-color: #334155;
  }

  .config-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .config-card-header {
    border-bottom-color: #334155;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
  }

  .btn-add-item {
    background: transparent;
    border: none;
    color: var(--primary-color, #0284c7);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .btn-add-item:hover {
    background: rgba(2, 132, 199, 0.1);
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .speaker-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid;
    flex-shrink: 0;
  }

  .spk-name-input,
  .subtier-name-input {
    flex: 1;
  }

  .spk-initials-badge {
    background: var(--bg-hover, #e2e8f0);
    color: var(--text-muted, #475569);
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  :global([data-theme='dark']) .spk-initials-badge {
    background: #334155;
    color: #94a3b8;
  }

  .subtier-num-badge {
    background: #ede9fe;
    color: #7c3aed;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .empty-subtiers-note {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
    font-style: italic;
    margin: 4px 0;
  }

  /* Tiers Table */
  .tiers-table-container {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
  }

  :global([data-theme='dark']) .tiers-table-container {
    border-color: #334155;
  }

  .table-header-title {
    background: var(--bg-hover, #f1f5f9);
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .table-header-title {
    background: #1e293b;
    border-bottom-color: #334155;
  }

  .tiers-table-wrapper {
    max-height: 260px;
    overflow-y: auto;
  }

  .tiers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .tiers-table th {
    background: var(--bg-card, #ffffff);
    padding: 7px 10px;
    text-align: left;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted, #64748b);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  :global([data-theme='dark']) .tiers-table th {
    background: #0f172a;
    border-bottom-color: #334155;
  }

  .tiers-table td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    vertical-align: middle;
  }

  :global([data-theme='dark']) .tiers-table td {
    border-bottom-color: rgba(255, 255, 255, 0.05);
  }

  .row-ignored {
    opacity: 0.5;
  }

  .th-check,
  .td-check {
    width: 32px;
    text-align: center;
  }

  .tier-id-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tier-name {
    font-size: 0.84rem;
  }

  .badge-root {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .badge-parent {
    background: #f1f5f9;
    color: #475569;
    font-size: 0.68rem;
    padding: 1px 5px;
    border-radius: 4px;
  }

  :global([data-theme='dark']) .badge-parent {
    background: #334155;
    color: #cbd5e1;
  }

  .badge-participant {
    background: #fef3c7;
    color: #92400e;
    font-size: 0.68rem;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .tier-sample {
    margin: 2px 0 0 0;
    font-size: 0.74rem;
    color: var(--text-muted, #64748b);
    font-style: italic;
  }

  .ann-count-badge {
    background: var(--bg-hover, #f1f5f9);
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  :global([data-theme='dark']) .ann-count-badge {
    background: #334155;
  }

  .form-select {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    font-size: 0.8rem;
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    width: 100%;
  }

  :global([data-theme='dark']) .form-select {
    background: #0f172a;
    border-color: #334155;
    color: #f8fafc;
  }

  .target-disabled {
    color: var(--text-muted, #94a3b8);
    font-size: 0.8rem;
  }

  .btn-create-subtier-inline {
    background: #ede9fe;
    border: 1px dashed #c084fc;
    color: #7c3aed;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  /* Converting / Spinner */
  .converting-overlay {
    padding: 40px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .converting-spinner {
    font-size: 2.2rem;
    color: var(--primary-color, #0284c7);
  }

  .converting-subtext {
    font-size: 0.85rem;
    color: var(--text-muted, #64748b);
  }

  /* Modal Footer */
  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .modal-footer {
    background: rgba(15, 23, 42, 0.6);
    border-top-color: #334155;
  }

  .footer-summary {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
    border: none;
  }

  .btn-secondary {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
  }

  :global([data-theme='dark']) .btn-secondary {
    background: #334155;
    border-color: #475569;
    color: #f8fafc;
  }

  .btn-primary {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
