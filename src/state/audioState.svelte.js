/**
 * Audio input, recording, playback, and interval scrubber state.
 * Svelte 5 universal reactive module (.svelte.js)
 */

import { appState } from './appState.svelte.js';
import { parseWavInfo } from '../audio.js';

class AudioState {
  audioSource = $state('file'); // 'file' | 'mic'

  // File upload state
  selectedFile = $state(null);
  fileAudioUrl = $state(null);

  // Microphone recording state
  isRecording = $state(false);
  recordingSeconds = $state(0);
  recordedBlob = $state(null);
  recordedAudioUrl = $state(null);
  recordedWavDownloadUrl = $state(null);
  mediaRecorder = null;
  recordingTimer = null;
  micStream = null;
  cachedDecodedAudio = null;

  // Audio element reference for timestamp seeking & playback
  audioElement = $state(null);

  // Playback speed state (0.5 to 1.5)
  _playbackSpeed = $state(1.0);

  get playbackSpeed() {
    return this._playbackSpeed;
  }

  set playbackSpeed(val) {
    const num = Math.max(0.5, Math.min(1.5, Number(val) || 1.0));
    this._playbackSpeed = Number(num.toFixed(2));
    if (this.audioElement) {
      this.audioElement.playbackRate = this._playbackSpeed;
      this.audioElement.defaultPlaybackRate = this._playbackSpeed;
    }
  }

  // Audio interval selection state
  totalAudioDuration = $state(0);
  audioRangeStart = $state(0);
  audioRangeEnd = $state(0);
  playerCurrentTime = $state(0);
  isPlayingInterval = $state(false);
  intervalPlayCleanup = null;
  activeThumb = $state('start');

  get currentAudioUrl() {
    return this.audioSource === 'mic' ? this.recordedAudioUrl : this.fileAudioUrl;
  }

  get isIntervalSelected() {
    return (
      this.totalAudioDuration > 0 &&
      (this.audioRangeStart > 0.05 || this.audioRangeEnd < this.totalAudioDuration - 0.05)
    );
  }

  getBaseFileName() {
    if (this.audioSource === 'file' && this.selectedFile) {
      return this.selectedFile.name.replace(/\.[^/.]+$/, '');
    }
    return 'mic-recording';
  }

  onFileChange(event) {
    const files = event.target.files;
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    if (this.fileAudioUrl) {
      URL.revokeObjectURL(this.fileAudioUrl);
      this.fileAudioUrl = null;
    }
    this.totalAudioDuration = 0;
    this.audioRangeStart = 0;
    this.audioRangeEnd = 0;
    this.playerCurrentTime = 0;
    if (this.isPlayingInterval && this.audioElement) {
      this.audioElement.pause();
      this.isPlayingInterval = false;
    }
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.wav')) {
        appState.errorMessage = 'Please select a valid .wav file.';
        this.selectedFile = null;
        event.target.value = '';
        return;
      }
      this.selectedFile = file;
      this.cachedDecodedAudio = null;
      this.fileAudioUrl = URL.createObjectURL(file);
      appState.statusMessage = `Selected audio: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;

      // Instant WAV header parse (reads only 4KB, 0 memory overhead, <1ms)
      parseWavInfo(file)
        .then((info) => {
          if (info && info.duration > 0) {
            const dur = Number(info.duration.toFixed(2));
            if (this.totalAudioDuration === 0) {
              this.totalAudioDuration = dur;
              this.audioRangeStart = 0;
              this.audioRangeEnd = dur;
            }
          }
        })
        .catch(() => {
          // Fallback handled by <audio onloadedmetadata>
        });
    } else {
      this.selectedFile = null;
      this.cachedDecodedAudio = null;
    }
  }

  loadBlobAudio(blob, fileName = 'audio-16khz.wav', duration = 0) {
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    if (this.fileAudioUrl) {
      URL.revokeObjectURL(this.fileAudioUrl);
      this.fileAudioUrl = null;
    }
    if (this.recordedAudioUrl) {
      URL.revokeObjectURL(this.recordedAudioUrl);
      this.recordedAudioUrl = null;
    }
    this.audioSource = 'file';
    this.totalAudioDuration = duration || 0;
    this.audioRangeStart = 0;
    this.audioRangeEnd = duration || 0;
    this.playerCurrentTime = 0;
    if (this.isPlayingInterval && this.audioElement) {
      this.audioElement.pause();
      this.isPlayingInterval = false;
    }
    this.selectedFile = new File([blob], fileName, { type: 'audio/wav' });
    this.cachedDecodedAudio = null;
    this.fileAudioUrl = URL.createObjectURL(blob);
    appState.statusMessage = `Loaded project audio: ${fileName}`;
    if (duration === 0) {
      parseWavInfo(blob).then((info) => {
        if (info && info.duration > 0) {
          const dur = Number(info.duration.toFixed(2));
          this.totalAudioDuration = dur;
          this.audioRangeEnd = dur;
        }
      }).catch(() => {});
    }
  }

  async startRecording() {
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    if (appState.isProcessing) return;

    if (this.recordedAudioUrl) {
      URL.revokeObjectURL(this.recordedAudioUrl);
      this.recordedAudioUrl = null;
    }
    if (this.recordedWavDownloadUrl) {
      URL.revokeObjectURL(this.recordedWavDownloadUrl);
      this.recordedWavDownloadUrl = null;
    }
    this.recordedBlob = null;
    this.cachedDecodedAudio = null;
    this.recordingSeconds = 0;
    this.totalAudioDuration = 0;
    this.audioRangeStart = 0;
    this.audioRangeEnd = 0;
    this.playerCurrentTime = 0;
    if (this.isPlayingInterval && this.audioElement) {
      this.audioElement.pause();
      this.isPlayingInterval = false;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const supportedType =
        [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
          'audio/wav',
        ].find((type) => MediaRecorder.isTypeSupported(type)) || '';

      this.mediaRecorder = new MediaRecorder(
        this.micStream,
        supportedType ? { mimeType: supportedType } : undefined,
      );
      const chunksData = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksData.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder.mimeType || 'audio/webm';
        this.recordedBlob = new Blob(chunksData, { type: mime });
        this.recordedAudioUrl = URL.createObjectURL(this.recordedBlob);
        this.totalAudioDuration = this.recordingSeconds;
        this.audioRangeStart = 0;
        this.audioRangeEnd = this.recordingSeconds;
        appState.statusMessage = `Microphone recording finished (${this.recordingSeconds}s). Click Transcribe!`;

        if (this.micStream) {
          this.micStream.getTracks().forEach((track) => track.stop());
          this.micStream = null;
        }
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;
      appState.statusMessage = 'Recording audio from microphone...';

      this.recordingTimer = setInterval(() => {
        this.recordingSeconds += 1;
      }, 1000);
    } catch (err) {
      console.error('[Main UI] Microphone access error:', err);
      appState.errorMessage = `Microphone error: ${err.message || 'Permission denied or microphone unavailable.'}`;
      this.stopRecordingCleanup();
    }
  }

  stopRecording() {
    if (!this.isRecording) return;
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
  }

  stopRecordingCleanup() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.isRecording = false;
  }

  handleAudioMetadata(e) {
    const dur = e?.target?.duration || this.audioElement?.duration;
    if (dur && isFinite(dur) && dur > 0) {
      const fixedDur = Number(dur.toFixed(2));
      const isNewAudio =
        this.totalAudioDuration === 0 || Math.abs(this.totalAudioDuration - fixedDur) > 1;
      this.totalAudioDuration = fixedDur;
      if (
        isNewAudio ||
        this.audioRangeEnd === 0 ||
        this.audioRangeEnd > this.totalAudioDuration
      ) {
        this.audioRangeStart = 0;
        this.audioRangeEnd = fixedDur;
      }
    }
    if (this.audioElement) {
      this.audioElement.playbackRate = this.playbackSpeed;
      this.audioElement.defaultPlaybackRate = this.playbackSpeed;
    }
  }

  handleAudioTimeUpdate(e) {
    const cur = e?.target?.currentTime ?? this.audioElement?.currentTime ?? 0;
    this.playerCurrentTime = cur;
  }

  handleContainerPointerMove(e) {
    if (this.totalAudioDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    const hoverTime = ratio * this.totalAudioDuration;
    const distToStart = Math.abs(hoverTime - this.audioRangeStart);
    const distToEnd = Math.abs(hoverTime - this.audioRangeEnd);
    this.activeThumb = distToStart <= distToEnd ? 'start' : 'end';
  }

  handleStartSlider() {
    this.audioRangeStart = Number(this.audioRangeStart);
    if (this.audioRangeStart > this.audioRangeEnd - 0.5) {
      this.audioRangeStart = Math.max(0, Number((this.audioRangeEnd - 0.5).toFixed(1)));
    }
  }

  handleEndSlider() {
    this.audioRangeEnd = Number(this.audioRangeEnd);
    if (this.audioRangeEnd < this.audioRangeStart + 0.5) {
      this.audioRangeEnd = Math.min(
        this.totalAudioDuration,
        Number((this.audioRangeStart + 0.5).toFixed(1)),
      );
    }
  }

  handleStartInput(e) {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    val = Math.max(0, Math.min(val, this.totalAudioDuration - 0.5));
    this.audioRangeStart = val;
    if (this.audioRangeStart >= this.audioRangeEnd - 0.5) {
      this.audioRangeEnd = Math.min(
        this.totalAudioDuration,
        Number((this.audioRangeStart + 0.5).toFixed(1)),
      );
    }
  }

  handleEndInput(e) {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    val = Math.min(this.totalAudioDuration, Math.max(val, this.audioRangeStart + 0.5));
    this.audioRangeEnd = val;
    if (this.audioRangeEnd <= this.audioRangeStart + 0.5) {
      this.audioRangeStart = Math.max(0, Number((this.audioRangeEnd - 0.5).toFixed(1)));
    }
  }

  setStartToCurrent() {
    if (!this.audioElement) return;
    const cur = Number(this.audioElement.currentTime.toFixed(1));
    this.audioRangeStart = Math.min(cur, Math.max(0, this.totalAudioDuration - 0.5));
    if (this.audioRangeStart >= this.audioRangeEnd - 0.5) {
      this.audioRangeEnd = Math.min(
        this.totalAudioDuration,
        Number((this.audioRangeStart + 0.5).toFixed(1)),
      );
    }
  }

  setEndToCurrent() {
    if (!this.audioElement) return;
    const cur = Number(this.audioElement.currentTime.toFixed(1));
    this.audioRangeEnd = Math.max(0.5, Math.min(cur, this.totalAudioDuration));
    if (this.audioRangeEnd <= this.audioRangeStart + 0.5) {
      this.audioRangeStart = Math.max(0, Number((this.audioRangeEnd - 0.5).toFixed(1)));
    }
  }

  togglePlayInterval() {
    if (!this.audioElement) return;
    if (this.isPlayingInterval) {
      this.audioElement.pause();
      if (this.intervalPlayCleanup) {
        this.intervalPlayCleanup();
        this.intervalPlayCleanup = null;
      }
      this.isPlayingInterval = false;
      return;
    }

    this.audioElement.playbackRate = this.playbackSpeed;
    this.audioElement.currentTime = this.audioRangeStart;
    this.audioElement
      .play()
      .then(() => {
        this.isPlayingInterval = true;
      })
      .catch(() => {});

    const onTimeUpdate = () => {
      if (this.audioElement && this.audioElement.currentTime >= this.audioRangeEnd) {
        this.audioElement.pause();
        if (this.intervalPlayCleanup) {
          this.intervalPlayCleanup();
          this.intervalPlayCleanup = null;
        }
        this.isPlayingInterval = false;
      }
    };

    this.audioElement.addEventListener('timeupdate', onTimeUpdate);
    this.intervalPlayCleanup = () => {
      if (this.audioElement) {
        this.audioElement.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
  }

  resetInterval() {
    this.audioRangeStart = 0;
    this.audioRangeEnd = this.totalAudioDuration;
    if (this.isPlayingInterval && this.audioElement) {
      this.audioElement.pause();
      this.isPlayingInterval = false;
    }
  }
}

export const audioState = new AudioState();

