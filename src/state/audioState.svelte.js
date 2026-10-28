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
  _cachedDecodedAudio = null;

  // Web Audio API state for sample-accurate segment/interval playback
  _audioCtx = null;
  _cachedAudioBuffer = null;
  _cachedAudioBufferSourceData = null;
  _webAudioSession = null;

  get cachedDecodedAudio() {
    return this._cachedDecodedAudio;
  }

  set cachedDecodedAudio(val) {
    this._cachedDecodedAudio = val;
    this._cachedAudioBuffer = null;
    this._cachedAudioBufferSourceData = null;
    this.stopWebAudioRange(false);
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this._audioCtx = new AudioCtx();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    return this._audioCtx;
  }

  getDecodedAudioBuffer() {
    const audioData = this._cachedDecodedAudio?.audioData;
    if (!audioData || !audioData.length) return null;
    if (this._cachedAudioBuffer && this._cachedAudioBufferSourceData === audioData) {
      return this._cachedAudioBuffer;
    }
    const ctx = this.getAudioContext();
    if (!ctx) return null;
    try {
      const buffer = ctx.createBuffer(1, audioData.length, 16000);
      if (typeof buffer.copyToChannel === 'function') {
        buffer.copyToChannel(audioData, 0);
      } else {
        buffer.getChannelData(0).set(audioData);
      }
      this._cachedAudioBuffer = buffer;
      this._cachedAudioBufferSourceData = audioData;
      return buffer;
    } catch (e) {
      console.warn('[AudioState] Failed to create AudioBuffer:', e);
      return null;
    }
  }

  get isWebAudioPlaying() {
    return Boolean(this._webAudioSession);
  }

  /**
   * Returns the live playback time in seconds (from the hardware Web Audio clock
   * when playing a sample-accurate snippet, or from the HTML5 <audio> element).
   */
  getCurrentPlaybackTime() {
    if (this._webAudioSession && this._audioCtx) {
      const { start, end, duration, loop, rate, ctxStartTime } = this._webAudioSession;
      const elapsed = Math.max(0, (this._audioCtx.currentTime - ctxStartTime) * rate);
      if (loop && duration > 0) {
        return start + (elapsed % duration);
      }
      return Math.min(end, start + elapsed);
    }
    return this.audioElement ? this.audioElement.currentTime : this.playerCurrentTime;
  }

  stopWebAudioRange(syncTime = true) {
    if (!this._webAudioSession) return;
    const session = this._webAudioSession;
    const curTime = this.getCurrentPlaybackTime();
    this._webAudioSession = null;
    try {
      session.source.onended = null;
      session.source.stop();
      session.source.disconnect();
    } catch (_) {}
    if (syncTime) {
      this.playerCurrentTime = curTime;
      if (this.audioElement) {
        this.audioElement.currentTime = curTime;
      }
    }
  }

  /**
   * Plays [start, end] with hardware-scheduled sample accuracy using Web Audio API
   * when decoded 16kHz PCM data is available and playbackSpeed is 1.0x.
   * Returns a cleanup function if started via Web Audio, or null to fall back to <audio>.
   */
  playWebAudioRange(start, end, { loop = false, onEnded = null } = {}) {
    if (Math.abs((this._playbackSpeed || 1) - 1.0) > 0.01) {
      return null;
    }
    const buffer = this.getDecodedAudioBuffer();
    const ctx = this.getAudioContext();
    if (!buffer || !ctx) return null;

    this.stopWebAudioRange(false);
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }

    const clampedStart = Math.max(0, Math.min(start, buffer.duration - 0.01));
    const clampedEnd = Math.max(clampedStart + 0.02, Math.min(end, buffer.duration));
    const duration = clampedEnd - clampedStart;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1.0;

    if (loop) {
      source.loop = true;
      source.loopStart = clampedStart;
      source.loopEnd = clampedEnd;
    }

    source.connect(ctx.destination);

    const session = {
      source,
      start: clampedStart,
      end: clampedEnd,
      duration,
      loop,
      rate: 1.0,
      ctxStartTime: ctx.currentTime,
    };
    this._webAudioSession = session;
    this.playerCurrentTime = clampedStart;

    source.onended = () => {
      if (this._webAudioSession !== session) return;
      this._webAudioSession = null;
      try {
        source.disconnect();
      } catch (_) {}
      this.playerCurrentTime = clampedEnd;
      if (this.audioElement) {
        this.audioElement.currentTime = clampedEnd;
      }
      if (typeof onEnded === 'function') {
        onEnded(true);
      }
    };

    try {
      if (loop) {
        source.start(0, clampedStart);
      } else {
        source.start(0, clampedStart, duration);
      }
    } catch (e) {
      this._webAudioSession = null;
      return null;
    }

    return (reachEnd = false) => {
      if (this._webAudioSession !== session) return;
      const finalTime = reachEnd ? clampedEnd : this.getCurrentPlaybackTime();
      this._webAudioSession = null;
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (_) {}
      this.playerCurrentTime = finalTime;
      if (this.audioElement) {
        this.audioElement.currentTime = finalTime;
      }
    };
  }

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
    if (this._webAudioSession?.source) {
      this._webAudioSession.source.playbackRate.value = this._playbackSpeed;
      this._webAudioSession.rate = this._playbackSpeed;
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
    if (!this.audioElement && !this._cachedDecodedAudio) return;
    if (this.isPlayingInterval) {
      this.stopWebAudioRange(true);
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }
      if (this.intervalPlayCleanup) {
        this.intervalPlayCleanup();
        this.intervalPlayCleanup = null;
      }
      this.isPlayingInterval = false;
      return;
    }

    const start = Math.max(0, this.audioRangeStart || 0);
    const end = Math.max(start + 0.05, this.audioRangeEnd || this.totalAudioDuration || 0);

    // Prefer sample-accurate Web Audio API playback when available at 1.0x speed
    const stopWebAudio = this.playWebAudioRange(start, end, {
      loop: false,
      onEnded: () => {
        this.intervalPlayCleanup = null;
        this.isPlayingInterval = false;
      },
    });

    if (stopWebAudio) {
      this.isPlayingInterval = true;
      this.intervalPlayCleanup = () => {
        stopWebAudio(false);
        this.intervalPlayCleanup = null;
        this.isPlayingInterval = false;
      };
      return;
    }

    if (!this.audioElement) return;
    this.audioElement.playbackRate = this.playbackSpeed;
    this.audioElement.currentTime = start;
    this.playerCurrentTime = start;
    this.isPlayingInterval = true;

    let stopped = false;
    let rafId = null;
    let stopTimer = null;

    const stopIntervalPlayback = (reachEnd = false) => {
      if (stopped) return;
      stopped = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      if (this.audioElement) {
        this.audioElement.removeEventListener('timeupdate', onTimeUpdate);
        this.audioElement.removeEventListener('pause', onPause);
        if (!this.audioElement.paused) {
          this.audioElement.pause();
        }
        if (reachEnd) {
          this.audioElement.currentTime = end;
          this.playerCurrentTime = end;
        }
      }
      this.intervalPlayCleanup = null;
      this.isPlayingInterval = false;
    };

    const onPause = () => {
      stopIntervalPlayback(false);
    };

    const checkFrame = () => {
      if (stopped || !this.audioElement) return;
      const cur = this.audioElement.currentTime;
      const curEnd = Math.max(start + 0.05, this.audioRangeEnd || end);
      if (cur >= curEnd) {
        stopIntervalPlayback(true);
        return;
      }
      const rate = this.audioElement.playbackRate || 1;
      const remainingMs = ((curEnd - cur) / rate) * 1000;
      if (remainingMs <= 35 && remainingMs >= 0 && !stopTimer) {
        stopTimer = setTimeout(() => stopIntervalPlayback(true), Math.max(0, remainingMs));
      }
      rafId = requestAnimationFrame(checkFrame);
    };

    const onTimeUpdate = () => {
      if (stopped || !this.audioElement) return;
      const cur = this.audioElement.currentTime;
      const curEnd = Math.max(start + 0.05, this.audioRangeEnd || end);
      if (cur >= curEnd) {
        stopIntervalPlayback(true);
      }
    };

    this.audioElement.addEventListener('timeupdate', onTimeUpdate);
    this.audioElement.addEventListener('pause', onPause);
    rafId = requestAnimationFrame(checkFrame);

    this.intervalPlayCleanup = () => {
      stopIntervalPlayback(false);
    };

    this.audioElement.play().catch(() => {
      stopIntervalPlayback(false);
    });
  }

  resetInterval() {
    this.audioRangeStart = 0;
    this.audioRangeEnd = this.totalAudioDuration;
    if (this.isPlayingInterval) {
      this.stopWebAudioRange(true);
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }
      if (this.intervalPlayCleanup) {
        this.intervalPlayCleanup();
        this.intervalPlayCleanup = null;
      }
      this.isPlayingInterval = false;
    }
  }
}

export const audioState = new AudioState();

