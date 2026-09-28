<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { formatTimeSec } from '../../utils/formatters.js';

  let title = $state('');
  let transcriber = $state(
    typeof window !== 'undefined'
      ? localStorage.getItem('easper_last_transcriber') || ''
      : '',
  );
  let selectedFile = $state(null);
  let audioInputMode = $state('upload'); // 'upload' | 'mic'
  let isDragOver = $state(false);
  let errorMessage = $state('');

  function handleFileSelected(file) {
    if (!file) return;
    selectedFile = file;
    if (!title.trim()) {
      title = file.name.replace(/\.[^/.]+$/, '');
    }
    errorMessage = '';
  }

  function handleFileInputChange(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragOver = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  }

  async function handleCreateProject() {
    errorMessage = '';
    let targetBlob = null;
    let targetName = '';

    if (audioInputMode === 'upload') {
      if (!selectedFile) {
        errorMessage = 'Please select or drop an audio file for the project.';
        return;
      }
      targetBlob = selectedFile;
      targetName = selectedFile.name;
    } else {
      if (!audioState.recordedBlob) {
        errorMessage =
          'No microphone recording found. Record audio in the sidebar first.';
        return;
      }
      targetBlob = audioState.recordedBlob;
      targetName = `mic-recording-${Date.now()}.wav`;
    }

    try {
      await projectState.createProject({
        title,
        transcriber,
        audioFileOrBlob: targetBlob,
        audioFileName: targetName,
      });
      // Reset form
      title = '';
      selectedFile = null;
      errorMessage = '';
    } catch (err) {
      errorMessage = err.message || 'Project creation failed.';
    }
  }

  function handleClose() {
    if (projectState.isConverting) return;
    projectState.isNewProjectOpen = false;
    errorMessage = '';
  }
</script>

{#if projectState.isNewProjectOpen}
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
    role="presentation"
  >
    <div class="modal-dialog new-project-dialog">
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-solid fa-folder-plus"></i>
          <span>Create New Project</span>
        </div>
        <button
          type="button"
          class="btn-modal-close"
          onclick={handleClose}
          disabled={projectState.isConverting}
          aria-label="Close modal"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-body">
        {#if projectState.isConverting}
          <!-- Converting / Processing Indicator -->
          <div class="converting-overlay">
            <div class="converting-spinner">
              <i class="fa-solid fa-circle-notch fa-spin"></i>
            </div>
            <h4>Converting Audio &amp; Saving Project...</h4>
            <p class="converting-subtext">
              {projectState.convertingMessage ||
                'Converting audio into 16kHz mono 16-bit PCM WAV for Whisper and storing locally...'}
            </p>
          </div>
        {:else}
          {#if errorMessage}
            <div class="modal-alert modal-alert-danger">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          {/if}

          <!-- Project Title -->
          <div class="form-group">
            <label for="new-project-title">
              Project Title <span class="label-required">*</span>
            </label>
            <input
              id="new-project-title"
              type="text"
              class="form-control"
              placeholder="e.g. Field Interview - Session 1"
              bind:value={title}
            />
          </div>

          <!-- Transcriber Name -->
          <div class="form-group">
            <label for="new-project-transcriber">
              Transcriber Name <span class="label-required">*</span>
            </label>
            <input
              id="new-project-transcriber"
              type="text"
              class="form-control"
              placeholder="e.g. Alex Smith"
              bind:value={transcriber}
            />
          </div>

          <!-- Audio Input Source Selection -->
          <div class="form-group">
            <span class="form-label">Audio Source</span>
            <div class="segmented-control audio-source-tabs">
              <button
                type="button"
                class="segment-btn {audioInputMode === 'upload'
                  ? 'active'
                  : ''}"
                onclick={() => (audioInputMode = 'upload')}
              >
                <i class="fa-solid fa-file-arrow-up"></i> Audio File (WAV, MP3, M4A,
                etc.)
              </button>
              <button
                type="button"
                class="segment-btn {audioInputMode === 'mic' ? 'active' : ''}"
                onclick={() => (audioInputMode = 'mic')}
              >
                <i class="fa-solid fa-microphone"></i> Microphone Recording
              </button>
            </div>
          </div>

          {#if audioInputMode === 'upload'}
            <!-- Drag and drop zone -->
            <div
              class="audio-dropzone {isDragOver
                ? 'drag-over'
                : ''} {selectedFile ? 'file-selected' : ''}"
              ondragover={(e) => {
                e.preventDefault();
                isDragOver = true;
              }}
              ondragleave={() => (isDragOver = false)}
              ondrop={handleDrop}
              role="region"
              aria-label="Audio file upload zone"
            >
              {#if selectedFile}
                <div class="selected-file-preview">
                  <i class="fa-solid fa-file-audio selected-file-icon"></i>
                  <div class="selected-file-details">
                    <span class="file-name">{selectedFile.name}</span>
                    <span class="file-size">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB &bull; Will
                      be converted to 16kHz mono WAV
                    </span>
                  </div>
                  <label for="modal-audio-file" class="btn-change-file">
                    Change
                  </label>
                </div>
              {:else}
                <div class="dropzone-empty">
                  <i class="fa-solid fa-cloud-arrow-up dropzone-icon"></i>
                  <p class="dropzone-main">Drag &amp; drop audio file here</p>
                  <p class="dropzone-sub">
                    Supports WAV, MP3, M4A, AAC, OGG, FLAC
                  </p>
                  <label for="modal-audio-file" class="btn-browse-file">
                    <i class="fa-solid fa-folder-open"></i> Browse Files
                  </label>
                </div>
              {/if}
              <input
                id="modal-audio-file"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                class="hidden-file-input"
                onchange={handleFileInputChange}
              />
            </div>
          {:else}
            <!-- In-Modal Microphone Recorder -->
            <div
              class="card p-12 bg-light radius-8 border-subtle"
              style="margin-top: 8px;"
            >
              <div class="d-flex align-center justify-between gap-10 flex-wrap">
                {#if !audioState.isRecording}
                  <button
                    type="button"
                    class="btn-danger"
                    onclick={() => {
                      errorMessage = '';
                      audioState.startRecording();
                    }}
                    disabled={projectState.isConverting}
                  >
                    <i class="fa-solid fa-circle-dot"></i>
                    {audioState.recordedBlob
                      ? 'Record New Take'
                      : 'Start Recording'}
                  </button>
                {:else}
                  <button
                    type="button"
                    class="btn-danger-active"
                    onclick={() => audioState.stopRecording()}
                  >
                    <i class="fa-solid fa-stop"></i> Stop Recording
                  </button>
                  <div class="recording-badge">
                    <span class="pulse-dot"></span>
                    <strong
                      >Recording: {formatTimeSec(
                        audioState.recordingSeconds,
                      )}</strong
                    >
                  </div>
                {/if}

                {#if audioState.recordedBlob && !audioState.isRecording}
                  <span class="badge badge-success">
                    <i class="fa-solid fa-check"></i> Recording ready ({formatTimeSec(
                      audioState.recordingSeconds,
                    )})
                  </span>
                {/if}
              </div>

              {#if audioState.recordedAudioUrl && !audioState.isRecording}
                <div style="margin-top: 10px;">
                  <audio
                    controls
                    src={audioState.recordedAudioUrl}
                    class="audio-player w-full"
                  ></audio>
                </div>
              {/if}
            </div>
          {/if}

          <div class="info-callout">
            <i class="fa-solid fa-circle-info"></i>
            <span>
              The audio will be resampled to <strong
                >16,000 Hz single-channel mono 16-bit PCM WAV</strong
              > (optimal for Whisper &amp; Silero VAD) and stored in your browser's
              persistent IndexedDB local storage.
            </span>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={handleClose}
          disabled={projectState.isConverting}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleCreateProject}
          disabled={projectState.isConverting ||
            audioState.isRecording ||
            (audioInputMode === 'upload' && !selectedFile) ||
            (audioInputMode === 'mic' && !audioState.recordedBlob)}
        >
          <i class="fa-solid fa-bolt"></i>
          <span>Create &amp; Convert Project</span>
        </button>
      </div>
    </div>
  </div>
{/if}
