<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { parseEaf, matchAudioAndEaf } from '../../utils/elanParser.js';
  import {
    detectTierDefaults,
    compileElanToProject,
  } from '../../utils/elanImporter.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';

  let isTargetActiveProject = $derived(
    projectState.elanImportTarget === 'active' &&
      Boolean(projectState.activeProject),
  );

  let eafFile = $state(null);
  let audioFile = $state(null);
  let parsedEaf = $state(null);
  let audioMatch = $state(null);

  let title = $state('');
  let lexiconId = $state('');
  let mainTierTitle = $state('');
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
    mainTierTitle = '';
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
    projectState.elanImportTarget = 'new';
    resetState();
  }

  $effect(() => {
    if (projectState.isImportElanOpen) {
      if (!lexiconState.lexicons || lexiconState.lexicons.length === 0) {
        lexiconState.init();
      }
      if (isTargetActiveProject && projectState.activeProject) {
        title = projectState.activeProject.title || '';
        lexiconId = projectState.activeProject.lexiconId || '';
        mainTierTitle = projectState.activeProject.mainTierTitle || '';
        if (projectState.activeProject.transcriber) {
          transcriber = projectState.activeProject.transcriber;
        }
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
      title = detected.suggestedTitle || title;
      if (detected.suggestedTranscriber) {
        transcriber = detected.suggestedTranscriber;
      }
      if (detected.suggestedMainTierTitle) {
        mainTierTitle = detected.suggestedMainTierTitle;
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
    const targetAudioName = isTargetActiveProject
      ? projectState.activeProject?.audioFileName || ''
      : audioFile?.name || '';

    if (parsedEaf && targetAudioName) {
      audioMatch = matchAudioAndEaf(
        parsedEaf.mediaDescriptors,
        parsedEaf.fileName || eafFile?.name || '',
        targetAudioName,
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
        !isTargetActiveProject &&
        (lower.endsWith('.wav') ||
          lower.endsWith('.mp3') ||
          lower.endsWith('.m4a') ||
          lower.endsWith('.ogg') ||
          lower.endsWith('.flac'))
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

  function formatStereotypeShort(stereotype) {
    if (!stereotype || stereotype === 'None') return 'Root';
    if (stereotype === 'Symbolic_Subdivision') return 'Sym Subdiv';
    if (stereotype === 'Symbolic_Association') return 'Sym Assoc';
    if (stereotype === 'Time_Subdivision') return 'Time Subdiv';
    if (stereotype === 'Included_In') return 'Included In';
    return stereotype;
  }

  let includedTierCount = $derived(
    tierConfigs.filter((t) => t.included).length,
  );
  let skippedTierCount = $derived(
    tierConfigs.filter((t) => !t.included).length,
  );
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
    if (!isTargetActiveProject && !audioFile) {
      errorMessage = 'Please select the matching audio file (.wav).';
      return;
    }
    if (selectedSpeakerTierCount === 0) {
      errorMessage =
        'Please include at least one tier mapped to a Speaker to generate segments.';
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

      if (isTargetActiveProject) {
        convertingMessage =
          'Importing speakers, sub-tiers, and segments into active project...';
        await projectState.importElanToActiveProject({
          mainTierTitle: mainTierTitle.trim(),
          transcriber: transcriber.trim() || 'Transcriber',
          speakers: compiled.speakers,
          subTiers: compiled.subTiers,
          segments: compiled.segments,
          transcript: compiled.transcript,
        });
      } else {
        convertingMessage =
          'Converting audio to 16kHz mono WAV and saving project...';

        // 2. Delegate to projectState to encode audio and persist in IndexedDB
        await projectState.createProjectFromElan({
          title: title.trim() || eafFile.name.replace(/\.[^/.]+$/, ''),
          transcriber: transcriber.trim() || 'Transcriber',
          mainTierTitle: mainTierTitle.trim(),
          audioFileOrBlob: audioFile,
          audioFileName: audioFile.name,
          speakers: compiled.speakers,
          subTiers: compiled.subTiers,
          lexiconId: lexiconId || null,
          segments: compiled.segments,
          transcript: compiled.transcript,
        });
      }

      handleClose();
    } catch (err) {
      console.error('[ElanImportModal] Import failed:', err);
      errorMessage = err.message || 'Import failed.';
      isConverting = false;
      convertingMessage = '';
    }
  }
</script>

{#if projectState.isElanOverwriteWarningOpen && projectState.activeProject}
  <div class="modal-backdrop" role="presentation">
    <div
      class="modal-dialog elan-warning-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="elan-overwrite-warning-title"
    >
      <div class="modal-header elan-warning-header">
        <div class="modal-title">
          <i class="fa-solid fa-triangle-exclamation elan-warning-icon"></i>
          <div>
            <h3 id="elan-overwrite-warning-title">
              Import ELAN (.eaf) into Current Project?
            </h3>
            <p class="modal-subtitle">
              Project: <strong>{projectState.activeProject.title}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          class="btn-modal-close"
          onclick={() => projectState.cancelImportElanToActiveProject()}
          aria-label="Cancel"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-body elan-warning-body">
        <div class="elan-warning-card">
          <div class="elan-warning-card-icon">
            <i class="fa-solid fa-trash-can"></i>
          </div>
          <div class="elan-warning-card-content">
            <p class="elan-warning-primary">
              {#if transcriptState.segments.length > 0}
                All <strong>{transcriptState.segments.length}</strong> existing
                segment{transcriptState.segments.length === 1 ? '' : 's'} in this
                project will be deleted.
              {:else}
                Any existing segments in this project will be cleared.
              {/if}
            </p>
            <p class="elan-warning-secondary">
              Proceeding will delete all current segments in
              <strong>{projectState.activeProject.title}</strong> and open the ELAN
              (.eaf) import dialog so you can configure and import speakers, sub-tiers,
              and utterances directly into the loaded audio recording without re-converting
              the audio or rebuilding the waveform.
            </p>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div class="footer-summary">
          <span>Audio &amp; waveform will be preserved.</span>
        </div>
        <div class="footer-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={() => projectState.cancelImportElanToActiveProject()}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-warning-confirm"
            onclick={() => projectState.confirmImportElanToActiveProject()}
          >
            <i class="fa-solid fa-file-waveform"></i>
            <span>Delete Segments &amp; Continue</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if projectState.isImportElanOpen}
  <div class="modal-backdrop" role="presentation">
    <div class="modal-dialog elan-import-dialog">
      <!-- Hidden file inputs -->
      <input
        type="file"
        multiple
        accept=".eaf,.wav,.mp3,.m4a,.ogg,.flac"
        bind:this={comboInputEl}
        onchange={(e) => handleComboFiles(e.target.files)}
        style="display: none;"
      />
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

      <!-- Modal Header -->
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-solid fa-file-waveform modal-title-icon"></i>
          <div class="modal-title-text">
            {#if isTargetActiveProject}
              <h3>
                Import ELAN (.eaf) into "{projectState.activeProject.title}"
              </h3>
            {:else}
              <h3>Import from ELAN (.eaf + Audio)</h3>
            {/if}
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
          <div class="converting-overlay">
            <div class="converting-spinner">
              <i class="fa-solid fa-circle-notch fa-spin"></i>
            </div>
            <h4>Importing ELAN Annotations...</h4>
            <p class="converting-subtext">
              {convertingMessage || 'Building segments and updating project...'}
            </p>
          </div>
        {:else}
          {#if errorMessage}
            <div class="modal-alert modal-alert-danger">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          {/if}

          <!-- File Selection Area (Compact strip when loaded, full dropzone when empty) -->
          <div
            class="elan-files-section {parsedEaf
              ? 'is-compact'
              : ''} {isDropZoneHover ? 'drag-over' : ''} {eafFile &&
            (isTargetActiveProject || audioFile)
              ? 'files-ready'
              : ''}"
            ondragover={(e) => {
              e.preventDefault();
              isDropZoneHover = true;
            }}
            ondragleave={() => (isDropZoneHover = false)}
            ondrop={handleDrop}
            role="region"
            aria-label="ELAN file drop zone"
          >
            {#if !parsedEaf && !isTargetActiveProject}
              <div class="dropzone-header">
                <i class="fa-solid fa-cloud-arrow-up drop-icon"></i>
                <div class="drop-text-wrap">
                  <strong>Drop .eaf and audio file together here</strong>
                  <span>or select files below</span>
                </div>
                <button
                  type="button"
                  class="btn-select-both"
                  onclick={() => comboInputEl?.click()}
                >
                  <i class="fa-solid fa-folder-open"></i> Browse Pair
                </button>
              </div>
            {/if}

            <div class="file-slots-grid">
              <!-- Slot 1: EAF File -->
              <div class="file-slot {eafFile ? 'slot-loaded' : ''}">
                <i class="fa-solid fa-file-code slot-icon"></i>
                <div class="slot-info">
                  <span class="slot-label">ELAN (.eaf)</span>
                  {#if eafFile}
                    <div class="slot-file-row">
                      <strong class="slot-filename" title={eafFile.name}>
                        {eafFile.name}
                      </strong>
                      <span class="slot-meta">
                        ({parsedEaf?.tiers?.length || 0} tiers, {parsedEaf
                          ?.allAnnotations?.length || 0} ann.)
                      </span>
                    </div>
                  {:else}
                    <span class="slot-placeholder">Drop or choose .eaf</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="btn-slot-choose"
                  onclick={() => eafInputEl?.click()}
                >
                  {eafFile ? 'Change' : 'Choose .eaf'}
                </button>
              </div>

              <!-- Slot 2: Audio File -->
              {#if isTargetActiveProject}
                <div class="file-slot slot-loaded">
                  <i class="fa-solid fa-file-audio slot-icon"></i>
                  <div class="slot-info">
                    <span class="slot-label">Active Audio</span>
                    <div class="slot-file-row">
                      <strong
                        class="slot-filename"
                        title={projectState.activeProject.audioFileName}
                      >
                        {projectState.activeProject.audioFileName ||
                          'recording-16khz.wav'}
                      </strong>
                      <span class="slot-meta">
                        ({projectState.activeProject.audioDuration || 0}s)
                      </span>
                    </div>
                  </div>
                </div>
              {:else}
                <div class="file-slot {audioFile ? 'slot-loaded' : ''}">
                  <i class="fa-solid fa-file-audio slot-icon"></i>
                  <div class="slot-info">
                    <span class="slot-label">Audio</span>
                    {#if audioFile}
                      <div class="slot-file-row">
                        <strong class="slot-filename" title={audioFile.name}>
                          {audioFile.name}
                        </strong>
                        <span class="slot-meta">
                          ({(audioFile.size / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </div>
                    {:else}
                      <span class="slot-placeholder">Choose matching audio</span
                      >
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="btn-slot-choose"
                    onclick={() => audioInputEl?.click()}
                  >
                    {audioFile ? 'Change' : 'Choose Audio'}
                  </button>
                </div>
              {/if}
            </div>

            {#if audioMatch}
              <div
                class="match-badge {audioMatch.matched
                  ? 'match-success'
                  : 'match-warning'}"
              >
                <i
                  class="fa-solid {audioMatch.matched
                    ? 'fa-circle-check'
                    : 'fa-triangle-exclamation'}"
                ></i>
                <span>
                  <strong>
                    {audioMatch.matched ? 'Audio Verified:' : 'Filename Note:'}
                  </strong>
                  {audioMatch.reason}
                </span>
              </div>
            {/if}
          </div>

          {#if parsedEaf}
            <!-- ELAN Tiers Summary Table -->
            <div class="tiers-table-container">
              <div class="table-header-title">
                <div class="table-header-left">
                  <i class="fa-solid fa-table-list"></i>
                  <span>
                    ELAN Tiers ({includedTierCount} importing{skippedTierCount >
                    0
                      ? `, ${skippedTierCount} not imported`
                      : ''})
                  </span>
                </div>
                <span class="table-header-hint">
                  Speakers, sub-tiers, and tier types can be edited in Project
                  Settings after import
                </span>
              </div>

              <div class="tiers-table-wrapper">
                <table class="tiers-table">
                  <thead>
                    <tr>
                      <th class="th-tier">Tier Name</th>
                      <th class="th-parent">Parent Tier</th>
                      <th class="th-participant">Participant</th>
                      <th class="th-annotator">Annotator</th>
                      <th class="th-type">Type &amp; Stereotype</th>
                      <th class="th-annotations">Segments</th>
                      <th class="th-sample">Sample</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each tierConfigs as tier (tier.tierId)}
                      <tr class={tier.included ? 'row-active' : 'row-ignored'}>
                        <td class="td-tier">
                          <strong class="tier-name" title={tier.tierId}>
                            {tier.tierId}
                          </strong>
                        </td>
                        <td class="td-parent">
                          {#if tier.parentRef}
                            <span
                              class="tier-plain-cell"
                              title={tier.parentRef}
                            >
                              {tier.parentRef}
                            </span>
                          {:else}
                            <span class="sample-empty">&mdash;</span>
                          {/if}
                        </td>
                        <td class="td-participant">
                          {#if tier.participant}
                            <span
                              class="tier-plain-cell"
                              title={tier.participant}
                            >
                              {tier.participant}
                            </span>
                          {:else}
                            <span class="sample-empty">&mdash;</span>
                          {/if}
                        </td>
                        <td class="td-annotator">
                          {#if tier.annotator}
                            <span
                              class="tier-plain-cell"
                              title={tier.annotator}
                            >
                              {tier.annotator}
                            </span>
                          {:else}
                            <span class="sample-empty">&mdash;</span>
                          {/if}
                        </td>
                        <td class="td-type">
                          <div class="type-cell-wrap">
                            {#if tier.linguisticType}
                              <span
                                class="badge-linguistic-type"
                                title="ELAN Tier Type (LINGUISTIC_TYPE_REF): {tier.linguisticType}"
                              >
                                {tier.linguisticType}
                              </span>
                            {/if}
                            {#if tier.stereotype && tier.stereotype !== 'None'}
                              <span
                                class="badge-stereotype badge-stereotype-{tier.stereotype.toLowerCase()}"
                                title="ELAN Stereotype: {tier.stereotype}"
                              >
                                {formatStereotypeShort(tier.stereotype)}
                              </span>
                            {:else}
                              <span
                                class="badge-root"
                                title="Root time-alignable tier"
                              >
                                Root
                              </span>
                            {/if}
                          </div>
                        </td>
                        <td class="td-annotations">
                          <span
                            class="ann-count-badge {tier.annotationCount === 0
                              ? 'is-zero'
                              : ''}"
                          >
                            {tier.annotationCount}
                          </span>
                        </td>
                        <td class="td-sample">
                          {#if tier.sampleText}
                            <span
                              class="tier-sample-cell"
                              title={tier.sampleText}
                            >
                              {tier.sampleText}
                            </span>
                          {:else}
                            <span class="sample-empty">&mdash;</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
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
            <span>
              {isTargetActiveProject
                ? 'Select an .eaf file to configure tier mappings.'
                : 'Select .eaf and audio files to configure tier mappings.'}
            </span>
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
              (!isTargetActiveProject && !audioFile) ||
              selectedSpeakerTierCount === 0 ||
              isConverting}
          >
            <i class="fa-solid fa-file-import"></i>
            <span>
              {isTargetActiveProject ? 'Import into Project' : 'Import Project'}
            </span>
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
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
    padding: 10px;
    box-sizing: border-box;
  }

  .elan-import-dialog {
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    width: 100%;
    max-width: 1200px;
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
    display: flex;
    flex-direction: column;
    box-shadow:
      0 16px 24px -4px rgba(0, 0, 0, 0.18),
      0 6px 8px -4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  :global([data-theme='dark']) .elan-import-dialog {
    background: #1e293b;
    border-color: #334155;
    color: #f8fafc;
  }

  .modal-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .modal-header {
    border-bottom-color: #334155;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .modal-title-icon {
    font-size: 1.1rem;
    color: var(--primary-color, #0284c7);
    flex-shrink: 0;
  }

  .modal-title h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .modal-subtitle {
    margin: 2px 0 0 0;
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
  }

  .btn-modal-close {
    background: transparent;
    border: none;
    font-size: 1rem;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 5px;
    transition: all 0.15s;
    flex-shrink: 0;
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
    padding: 12px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }

  .modal-alert {
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 8px;
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

  /* File Dropzone & Compact Strip */
  .elan-files-section {
    border: 1.5px dashed var(--border-color, #cbd5e1);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--bg-hover, #f8fafc);
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .elan-files-section.is-compact {
    border-style: solid;
    padding: 6px 10px;
    gap: 6px;
  }

  :global([data-theme='dark']) .elan-files-section {
    border-color: #475569;
    background: rgba(15, 23, 42, 0.4);
  }

  .elan-files-section.drag-over {
    border-color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .elan-files-section.files-ready {
    border-color: rgba(16, 185, 129, 0.45);
    background: rgba(16, 185, 129, 0.03);
  }

  .dropzone-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .drop-icon {
    font-size: 1.25rem;
    color: var(--primary-color, #0284c7);
  }

  .drop-text-wrap {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
  }

  .drop-text-wrap span {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
  }

  .btn-select-both {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
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
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 8px;
  }

  .file-slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-card, #ffffff);
    min-width: 0;
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
    font-size: 1rem;
    color: var(--primary-color, #0284c7);
    flex-shrink: 0;
  }

  .slot-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .slot-label {
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    line-height: 1.1;
  }

  .slot-file-row {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
  }

  .slot-filename {
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slot-placeholder {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    font-style: italic;
  }

  .slot-meta {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-slot-choose {
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-heading, #0f172a);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.71rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
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
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 0.73rem;
    display: flex;
    align-items: center;
    gap: 6px;
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

  /* Compact Tiers Table */
  .tiers-table-container {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 7px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 140px;
    flex: 1;
  }

  :global([data-theme='dark']) .tiers-table-container {
    border-color: #334155;
  }

  .table-header-title {
    background: var(--bg-hover, #f1f5f9);
    padding: 6px 10px;
    font-size: 0.76rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .table-header-title {
    background: #1e293b;
    border-bottom-color: #334155;
  }

  .table-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .table-header-hint {
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--text-muted, #64748b);
  }

  .tiers-table-wrapper {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 360px;
  }

  .tiers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .tiers-table th {
    background: var(--bg-card, #ffffff);
    padding: 5px 8px;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted, #64748b);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    position: sticky;
    top: 0;
    z-index: 2;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .tiers-table th {
    background: #0f172a;
    border-bottom-color: #334155;
  }

  .tiers-table td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    vertical-align: middle;
  }

  :global([data-theme='dark']) .tiers-table td {
    border-bottom-color: rgba(255, 255, 255, 0.05);
  }

  .tiers-table tbody tr:last-child td {
    border-bottom: none;
  }

  .row-ignored {
    opacity: 0.55;
  }

  .th-annotations,
  .td-annotations {
    text-align: center;
  }

  .tier-name {
    font-size: 0.77rem;
    white-space: nowrap;
  }

  .tier-plain-cell {
    display: block;
    font-size: 0.74rem;
    color: var(--text-heading, #0f172a);
    white-space: nowrap;
  }

  :global([data-theme='dark']) .tier-plain-cell {
    color: #e2e8f0;
  }

  .tier-sample-cell {
    display: block;
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
    font-style: italic;
    white-space: nowrap;
  }

  .sample-empty {
    color: var(--text-muted, #94a3b8);
    font-size: 0.72rem;
  }

  .type-cell-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
  }

  .badge-linguistic-type {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
    font-size: 0.65rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .badge-linguistic-type {
    background: #334155;
    color: #e2e8f0;
    border-color: #475569;
  }

  .badge-root {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.64rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .badge-root {
    background: rgba(2, 132, 199, 0.25);
    color: #7dd3fc;
  }

  .badge-stereotype {
    font-size: 0.64rem;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    font-weight: 600;
    flex-shrink: 0;
  }

  .badge-stereotype-symbolic_subdivision {
    background: #f3e8ff;
    color: #7e22ce;
    border: 1px solid rgba(147, 51, 234, 0.25);
  }

  :global([data-theme='dark']) .badge-stereotype-symbolic_subdivision {
    background: rgba(147, 51, 234, 0.2);
    color: #d8b4fe;
    border-color: rgba(168, 85, 247, 0.35);
  }

  .badge-stereotype-symbolic_association {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  :global([data-theme='dark']) .badge-stereotype-symbolic_association {
    background: rgba(59, 130, 246, 0.2);
    color: #93c5fd;
    border-color: rgba(96, 165, 250, 0.35);
  }

  .badge-stereotype-time_subdivision {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  :global([data-theme='dark']) .badge-stereotype-time_subdivision {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border-color: rgba(52, 211, 153, 0.35);
  }

  .badge-stereotype-included_in {
    background: #fffbeb;
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  :global([data-theme='dark']) .badge-stereotype-included_in {
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    border-color: rgba(251, 191, 36, 0.35);
  }

  .ann-count-badge {
    background: var(--bg-hover, #f1f5f9);
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .ann-count-badge.is-zero {
    opacity: 0.5;
    font-weight: 500;
  }

  :global([data-theme='dark']) .ann-count-badge {
    background: #334155;
  }

  /* Converting / Spinner */
  .converting-overlay {
    padding: 32px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .converting-spinner {
    font-size: 2rem;
    color: var(--primary-color, #0284c7);
  }

  .converting-subtext {
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  /* Modal Footer */
  .modal-footer {
    padding: 9px 16px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--bg-hover, #f8fafc);
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .modal-footer {
    background: rgba(15, 23, 42, 0.6);
    border-top-color: #334155;
  }

  .footer-summary {
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .btn {
    padding: 5px 12px;
    border-radius: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s;
    border: none;
    white-space: nowrap;
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

  /* Warning Dialog for Active Project ELAN Import */
  .elan-warning-dialog {
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    border: 1px solid var(--border-color, #e2e8f0);
    border-top: 4px solid #f59e0b;
    border-radius: 10px;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.2),
      0 10px 10px -5px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  :global([data-theme='dark']) .elan-warning-dialog {
    background: #1e293b;
    border-color: #334155;
    border-top-color: #f59e0b;
    color: #f8fafc;
  }

  .elan-warning-header {
    background: #fffbeb;
    border-bottom: 1px solid #fef3c7;
  }

  :global([data-theme='dark']) .elan-warning-header {
    background: rgba(245, 158, 11, 0.12);
    border-bottom-color: rgba(245, 158, 11, 0.25);
  }

  .elan-warning-icon {
    color: #d97706;
    font-size: 1.15rem;
  }

  .elan-warning-body {
    padding: 14px 16px;
  }

  .elan-warning-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border-radius: 8px;
    background: #fffbeb;
    border: 1px solid #fde68a;
  }

  :global([data-theme='dark']) .elan-warning-card {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .elan-warning-card-icon {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    background: rgba(217, 119, 6, 0.15);
    color: #d97706;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.88rem;
    flex-shrink: 0;
  }

  .elan-warning-card-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .elan-warning-primary {
    margin: 0;
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .elan-warning-primary {
    color: #f8fafc;
  }

  .elan-warning-secondary {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--text-muted, #475569);
  }

  :global([data-theme='dark']) .elan-warning-secondary {
    color: #cbd5e1;
  }

  .btn-warning-confirm {
    background: #d97706;
    color: #ffffff;
  }

  .btn-warning-confirm:hover:not(:disabled) {
    background: #b45309;
  }

  @media (max-width: 540px) {
    .modal-backdrop {
      padding: 6px;
    }

    .modal-header,
    .modal-body,
    .modal-footer {
      padding-left: 10px;
      padding-right: 10px;
    }

    .footer-summary {
      width: 100%;
    }

    .footer-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
