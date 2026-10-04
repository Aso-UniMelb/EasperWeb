/**
 * Transcript, dialogue segments, waveform rendering, export and audio pipeline coordination.
 * Svelte 5 universal reactive module (.svelte.js)
 */

import { MODEL_ID } from '../config.js';
import {
  processAudioFile,
  encodeWavBlob,
  extractWaveformPeaks,
} from '../audio.js';
import { exportToEaf } from '../elan.js';
import { buildColumns, columnValues, mergeSubTexts } from '../utils/subTiers.js';
import {
  cleanSpeechText,
  formatTimeSec,
  formatTimeSec1,
  formatTimeSec2,
  formatSrtTime,
} from '../utils/formatters.js';
import {
  SPEAKER_COLORS,
  getSpeakerColor,
  getSpeakerInitials,
  getSegmentSpeakerId,
  isSameSpeaker,
  resolveSameSpeakerOverlaps,
  adjustSameSpeakerBoundariesOnDrag,
  calculateSegmentSplit,
} from '../utils/speakers.js';
import {
  getTileCanvas as renderGetTileCanvas,
  drawTile as renderDrawTile,
  drawVerticalWaveform as renderDrawVerticalWaveform,
  drawPlayheadFrame as renderDrawPlayheadFrame,
} from '../rendering/waveformCanvasRenderer.js';
import { appState } from './appState.svelte.js';
import { modelState } from './modelState.svelte.js';
import { audioState } from './audioState.svelte.js';
import { projectState } from './projectState.svelte.js';
import { getProjectAudioBlob } from '../services/db.js';

/**
 * Single source of truth for the segmentation and speaker settings, so that the initial
 * values and "Reset to defaults" can never drift apart. They previously did: a fresh
 * project started at threshold 0.5 / max 30 s, while Reset produced 0.3 / 20 s.
 */
export const VAD_DEFAULTS = Object.freeze({
  vadThreshold: 0.5,
  vadSpeechPadMs: 60,
  vadMinSilenceMs: 300,
  vadMinSegmentS: 0.4,
  vadMinSilenceS: 0.5,
  vadMaxSegmentS: 25,
  diarizationSpeakerCount: 1,
  diarizationWindowS: 1.0,
  diarizationPeriodS: 0.5,
});

class TranscriptState {
  // Language & Timestamp settings
  language = $state('en');
  task = $state('transcribe'); // 'transcribe' | 'translate'
  timestampMode = $state('segment'); // 'segment' | 'word' | 'none'

  // Voice Activity Detection (Silero VAD) settings
  enableVad = $state(true);
  vadThreshold = $state(VAD_DEFAULTS.vadThreshold);
  vadSpeechPadMs = $state(VAD_DEFAULTS.vadSpeechPadMs);
  vadMinSilenceMs = $state(VAD_DEFAULTS.vadMinSilenceMs);

  // Segmentation & Cleanup settings
  vadMinSegmentS = $state(VAD_DEFAULTS.vadMinSegmentS);
  vadMinSilenceS = $state(VAD_DEFAULTS.vadMinSilenceS);
  vadMaxSegmentS = $state(VAD_DEFAULTS.vadMaxSegmentS);
  showMetrics = $state(true);
  hasRunVad = $state(false);

  // Speaker separation settings
  diarizationSpeakerCount = $state(VAD_DEFAULTS.diarizationSpeakerCount); // 1 (default) | 2 | 3 | 4 | 5
  diarizationWindowS = $state(VAD_DEFAULTS.diarizationWindowS);
  diarizationPeriodS = $state(VAD_DEFAULTS.diarizationPeriodS);
  isDiarizing = $state(false);

  get enableDiarization() {
    return Number(this.diarizationSpeakerCount) > 1;
  }

  set enableDiarization(val) {
    if (!val) {
      this.diarizationSpeakerCount = 1;
    } else if (Number(this.diarizationSpeakerCount) <= 1) {
      this.diarizationSpeakerCount = 2;
    }
  }

  resetVadDiarizationDefaults() {
    Object.assign(this, VAD_DEFAULTS);
  }

  // Transcript view mode: 'segments' | 'chunks' | 'plain' | 'stats'
  transcriptView = $state('segments');

  // Two-step workflow state: 'segment' (Step 1: Audio & VAD) | 'transcribe' (Step 2: Whisper)
  workflowStep = $state('segment');

  // Text writing direction: 'ltr' | 'rtl'
  textDirection = $state(
    (typeof localStorage !== 'undefined' &&
      localStorage.getItem('easper_text_direction')) ||
      'ltr',
  );

  toggleTextDirection() {
    this.textDirection = this.textDirection === 'ltr' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('easper_text_direction', this.textDirection);
    } catch (_) {}
    this.notifySegmentsChange();
  }

  setTextDirection(dir) {
    if (dir === 'ltr' || dir === 'rtl') {
      this.textDirection = dir;
      try {
        localStorage.setItem('easper_text_direction', this.textDirection);
      } catch (_) {}
      this.notifySegmentsChange();
    }
  }

  get emptySegmentsCount() {
    if (!Array.isArray(this.segments)) return 0;
    return this.segments.filter((s) => !s.text || s.text.trim() === '').length;
  }

  get transcribedSegmentsCount() {
    if (!Array.isArray(this.segments)) return 0;
    return this.segments.filter((s) => s.text && s.text.trim() !== '').length;
  }

  setWorkflowStep(step) {
    if (step === 'segment' || step === 'transcribe') {
      this.workflowStep = step;
    }
  }

  // Waveform vertical scale factor: default 150
  WAVEFORM_SCALE_PX_PER_SEC = $state(150);

  // Persistence callback hook for project management auto-saving
  onSegmentsChange = null;

  notifySegmentsChange() {
    if (typeof this.onSegmentsChange === 'function') {
      try {
        this.onSegmentsChange();
      } catch (err) {
        console.error('[TranscriptState] notifySegmentsChange failed:', err);
      }
    }
  }

  // Audio playback tracking
  isAudioPlaying = $state(false);
  activeSnippetPlayId = $state(null);
  activeLoopSegmentId = $state(null);
  activeSegmentPlayCleanup = null;

  // Vertical Waveform visualization state
  waveformState = $state(null);
  vadSpeechRegions = $state([]);
  currentTranscribingSegment = $state(null);
  activeHoverSegmentId = $state(null);
  selectedSegmentId = $state(null);
  activeDragHandle = $state(null); // 'start' | 'end' | null
  hoveredDragHandle = $state(null); // 'start' | 'end' | null
  dragMagnifier = $state({
    active: false,
    handle: null, // 'start' | 'end'
    segmentId: null,
    time: 0,
    clientY: 0,
    clientX: 0,
  });
  wasDraggingHandle = false;
  boundaryDragState = null;
  waveformHoverTime = $state(null);
  waveformHoverY = $state(0);
  waveformWrapEl = $state(null);
  waveformContainerEl = $state(null);
  segmentsContainerEl = $state(null);

  // Viewport virtualization for long audio waveforms
  containerScrollTop = $state(0);
  containerClientHeight = $state(800);

  // Interval segmentation & selective deletion state
  segmentWarningModal = $state({
    isOpen: false,
    intervalStart: 0,
    intervalEnd: 0,
    isInterval: false,
    affectedCount: 0,
    preservedCount: 0,
    resolve: null,
  });
  preservedSegments = $state([]);
  currentIntervalSegmentation = $state(null);

  requestSegmentConfirmation({
    intervalStart,
    intervalEnd,
    isInterval,
    affectedCount,
    preservedCount,
  }) {
    return new Promise((resolve) => {
      this.segmentWarningModal = {
        isOpen: true,
        intervalStart,
        intervalEnd,
        isInterval,
        affectedCount,
        preservedCount,
        resolve,
      };
    });
  }

  confirmSegmentModal() {
    if (this.segmentWarningModal.resolve) {
      this.segmentWarningModal.resolve(true);
    }
    this.segmentWarningModal.isOpen = false;
    this.segmentWarningModal.resolve = null;
  }

  closeSegmentModal() {
    if (this.segmentWarningModal.resolve) {
      this.segmentWarningModal.resolve(false);
    }
    this.segmentWarningModal.isOpen = false;
    this.segmentWarningModal.resolve = null;
  }

  handleScroll(e) {
    if (this.contextMenu.visible) {
      this.closeContextMenu();
    }
    const el = e?.currentTarget || e?.target;
    if (el) {
      this.containerScrollTop = el.scrollTop;
      this.containerClientHeight = el.clientHeight || 800;
      requestAnimationFrame(() => this.drawVerticalWaveform());
    }
  }

  get waveformCanvasEl() {
    return this.waveformWrapEl;
  }
  set waveformCanvasEl(el) {
    this.waveformWrapEl = el;
  }

  TILE_HEIGHT = 1600;
  lastPlayheadTileIndex = null;
  lastHoverTileIndex = null;

  // Waveform Context Menu state
  contextMenu = $state({
    visible: false,
    x: 0,
    y: 0,
    clientX: 0,
    clientY: 0,
    openAbove: false,
    time: 0,
    targetSegment: null,
    nextSegment: null,
  });

  // Results
  transcript = $state('');
  chunks = $state([]);
  segments = $state([]);
  fullResult = $state(null);
  metrics = $state(null);

  get waveformCalculatedHeight() {
    return this.waveformState?.duration
      ? Math.max(
          60,
          Math.round(
            (this.waveformState.duration / 60) * this.WAVEFORM_SCALE_PX_PER_SEC * 6,
          ),
        )
      : 400;
  }

  setZoomLevel(newScale, preservePlayheadInView = true) {
    const clampedScale = Math.min(1500, Math.max(50, Math.round(newScale)));
    if (clampedScale === this.WAVEFORM_SCALE_PX_PER_SEC) return;

    const container = this.waveformContainerEl;
    const waveform = this.waveformState;

    if (
      !container ||
      !waveform ||
      !waveform.duration ||
      isNaN(waveform.duration) ||
      !preservePlayheadInView
    ) {
      this.WAVEFORM_SCALE_PX_PER_SEC = clampedScale;
      requestAnimationFrame(() => this.drawVerticalWaveform());
      return;
    }

    const duration = waveform.duration;
    const startTime = waveform.startTime || 0;
    const rawTime = audioState.audioElement
      ? audioState.audioElement.currentTime
      : audioState.playerCurrentTime;
    const currentTime =
      rawTime !== null && rawTime !== undefined && !isNaN(rawTime)
        ? Number(rawTime)
        : 0;

    // Current metrics before zoom
    const oldHeight = this.waveformCalculatedHeight;
    const oldScrollTop = container.scrollTop;
    const clientHeight = container.clientHeight || 400;

    // Position of the red playhead line before zoom
    const clampedTime = Math.max(
      startTime,
      Math.min(startTime + duration, currentTime),
    );
    const timeRatio = duration > 0 ? (clampedTime - startTime) / duration : 0;
    const oldPlayY = Math.round(timeRatio * oldHeight);
    const offsetInView = oldPlayY - oldScrollTop;

    // Determine target offset in viewport:
    // If the playhead was already comfortably visible in viewport, preserve its relative offset
    // so it anchors smoothly. If it was outside or near edges, center it.
    let targetOffsetInView = clientHeight / 2;
    if (offsetInView >= 40 && offsetInView <= clientHeight - 40) {
      targetOffsetInView = offsetInView;
    }

    // Apply the new zoom scale
    this.WAVEFORM_SCALE_PX_PER_SEC = clampedScale;
    const newHeight = this.waveformCalculatedHeight;

    // Directly update DOM element styles if present so container.scrollHeight
    // reflects the new size immediately before reading/setting scrollTop
    if (this.waveformWrapEl) {
      this.waveformWrapEl.style.height = `${newHeight}px`;
      this.waveformWrapEl.style.minHeight = `${newHeight}px`;
    }

    // Position of the red playhead line after zoom
    const newPlayY = Math.round(timeRatio * newHeight);

    // Compute new scroll position to keep the red playhead line visible
    const newScrollTop = Math.max(0, newPlayY - targetOffsetInView);
    container.scrollTop = newScrollTop;
    this.containerScrollTop = container.scrollTop;
    this.containerClientHeight = clientHeight;

    requestAnimationFrame(() => {
      if (this.waveformContainerEl) {
        this.waveformContainerEl.scrollTop = newScrollTop;
      }
      this.drawVerticalWaveform();
    });
  }

  get waveformTiles() {
    const totalHeight = this.waveformCalculatedHeight;
    const tiles = [];
    const count = Math.max(1, Math.ceil(totalHeight / this.TILE_HEIGHT));
    for (let i = 0; i < count; i++) {
      const top = i * this.TILE_HEIGHT;
      const height = Math.min(this.TILE_HEIGHT, totalHeight - top);
      tiles.push({ index: i, top, height });
    }
    return tiles;
  }

  get visibleWaveformTiles() {
    const totalTiles = this.waveformTiles;
    if (totalTiles.length <= 3) return totalTiles;

    const buffer = 800;
    const viewTop = Math.max(0, this.containerScrollTop - buffer);
    const viewBottom = this.containerScrollTop + (this.containerClientHeight || 800) + buffer;

    return totalTiles.filter((t) => t.top + t.height >= viewTop && t.top <= viewBottom);
  }

  get currentActiveSegment() {
    return (
      this.segments.find(
        (s) =>
          audioState.playerCurrentTime >= (s.start ?? 0) &&
          audioState.playerCurrentTime < (s.end ?? 0),
      ) || null
    );
  }

  get activePlayingSegmentId() {
    return (
      this.activeSnippetPlayId ||
      (this.isAudioPlaying && this.currentActiveSegment
        ? this.currentActiveSegment.id
        : null)
    );
  }

  getSegmentTop(segStart, height = this.waveformCalculatedHeight) {
    if (!this.waveformState || !this.waveformState.duration) return 0;
    const startTime = this.waveformState.startTime || 0;
    const duration = this.waveformState.duration || 1;
    const ratio = (segStart - startTime) / duration;
    return Math.max(0, Math.round(ratio * height));
  }

  selectSegment(segmentId, scrollIntoView = false) {
    this.selectedSegmentId = segmentId;
    const seg = this.segments.find((s) => s.id === segmentId);
    if (
      seg &&
      scrollIntoView &&
      this.waveformContainerEl &&
      this.waveformState?.duration
    ) {
      const startTime = this.waveformState.startTime || 0;
      const targetY =
        ((seg.start - startTime) / this.waveformState.duration) *
        this.waveformCalculatedHeight;
      const currentScroll = this.waveformContainerEl.scrollTop;
      const clientHeight = this.waveformContainerEl.clientHeight;
      if (
        targetY < currentScroll + 40 ||
        targetY > currentScroll + clientHeight - 80
      ) {
        this.waveformContainerEl.scrollTo({
          top: Math.max(0, targetY - clientHeight / 3),
          behavior: 'smooth',
        });
      }
    }
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  playSegmentAudio(segment, loop = false) {
    const audioEl = audioState.audioElement;
    if (!audioEl || !segment) return;
    this.selectSegment(segment.id, false);

    const isCurrentlyPlayingThis =
      (this.activePlayingSegmentId === segment.id ||
        this.activeSnippetPlayId === segment.id) &&
      (this.isAudioPlaying || !audioEl.paused);

    const isCurrentlyLoopingThis =
      isCurrentlyPlayingThis && this.activeLoopSegmentId === segment.id;

    if (this.activeSegmentPlayCleanup) {
      this.activeSegmentPlayCleanup();
      this.activeSegmentPlayCleanup = null;
    }

    if (isCurrentlyPlayingThis) {
      // If clicking Loop while already looping, or clicking Play-once while playing-once: stop
      if (
        (loop && isCurrentlyLoopingThis) ||
        (!loop && !isCurrentlyLoopingThis)
      ) {
        audioEl.pause();
        this.activeSnippetPlayId = null;
        this.activeLoopSegmentId = null;
        this.isAudioPlaying = false;
        requestAnimationFrame(() => this.drawVerticalWaveform());
        return;
      }
    }

    this.activeSnippetPlayId = segment.id;
    this.activeLoopSegmentId = loop ? segment.id : null;
    this.isAudioPlaying = true;
    const start = Math.max(0, segment.start ?? 0);
    const end = Math.max(start + 0.05, segment.end ?? (start + 1));
    audioEl.playbackRate = audioState.playbackSpeed;
    audioEl.currentTime = start;
    audioState.playerCurrentTime = start;
    audioEl.play().catch(() => {
      stopPlayback();
    });

    let stopped = false;
    let rafId = null;
    let stopTimer = null;

    const stopPlayback = () => {
      if (stopped) return;
      stopped = true;
      if (this.activeSegmentPlayCleanup) {
        this.activeSegmentPlayCleanup = null;
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      if (audioEl) {
        audioEl.removeEventListener('timeupdate', onTimeUpdate);
        audioEl.removeEventListener('pause', onPause);
        audioEl.pause();
        audioEl.currentTime = end;
        audioState.playerCurrentTime = end;
      }
      this.activeSnippetPlayId = null;
      this.activeLoopSegmentId = null;
      this.isAudioPlaying = false;
      requestAnimationFrame(() => this.drawVerticalWaveform());
    };

    const restartLoop = () => {
      if (stopped || !audioEl) return;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      audioEl.currentTime = start;
      audioState.playerCurrentTime = start;
      if (audioEl.paused) {
        audioEl.play().catch(() => stopPlayback());
      }
      requestAnimationFrame(() => this.drawVerticalWaveform());
    };

    const onPause = () => {
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
      if (audioEl) {
        audioEl.removeEventListener('timeupdate', onTimeUpdate);
        audioEl.removeEventListener('pause', onPause);
      }
      this.activeSegmentPlayCleanup = null;
      this.activeSnippetPlayId = null;
      this.activeLoopSegmentId = null;
      this.isAudioPlaying = false;
      requestAnimationFrame(() => this.drawVerticalWaveform());
    };

    const checkFrame = () => {
      if (stopped) return;
      if (!audioEl) return;

      const cur = audioEl.currentTime;
      if (cur >= end) {
        if (loop) {
          restartLoop();
        } else {
          stopPlayback();
          return;
        }
      }

      const rate = audioEl.playbackRate || 1;
      const remainingMs = ((end - cur) / rate) * 1000;

      // When within 35ms of the segment end, schedule a micro-timeout
      if (remainingMs <= 35 && remainingMs >= 0) {
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = setTimeout(
          loop ? restartLoop : stopPlayback,
          Math.max(0, remainingMs),
        );
      }

      rafId = requestAnimationFrame(checkFrame);
    };

    const onTimeUpdate = () => {
      if (stopped || !audioEl) return;
      const cur = audioEl.currentTime;
      if (cur >= end) {
        if (loop) {
          restartLoop();
        } else {
          stopPlayback();
          return;
        }
      }
      const rate = audioEl.playbackRate || 1;
      const remainingMs = ((end - cur) / rate) * 1000;
      if (remainingMs <= 250 && remainingMs >= 0) {
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = setTimeout(
          loop ? restartLoop : stopPlayback,
          Math.max(0, remainingMs),
        );
      }
    };

    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('pause', onPause);
    rafId = requestAnimationFrame(checkFrame);

    this.activeSegmentPlayCleanup = () => {
      if (stopped) return;
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stopTimer) clearTimeout(stopTimer);
      if (audioEl) {
        audioEl.removeEventListener('timeupdate', onTimeUpdate);
        audioEl.removeEventListener('pause', onPause);
      }
      this.activeSnippetPlayId = null;
      this.activeLoopSegmentId = null;
      this.isAudioPlaying = false;
      requestAnimationFrame(() => this.drawVerticalWaveform());
    };
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  seekAudioTo(timestamp) {
    const audioEl = audioState.audioElement;
    if (!audioEl || !timestamp || !Array.isArray(timestamp)) return;
    const [start] = timestamp;
    if (start !== null && start !== undefined && !isNaN(start)) {
      audioEl.playbackRate = audioState.playbackSpeed;
      audioEl.currentTime = start;
      audioEl.play().catch(() => {});
    }
  }

  toggleWaveformPlayback() {
    const audioEl = audioState.audioElement;
    if (!audioEl) return;
    if (this.isAudioPlaying) {
      audioEl.pause();
      this.isAudioPlaying = false;
    } else {
      audioEl.playbackRate = audioState.playbackSpeed;
      if (this.waveformState) {
        const start = this.waveformState.startTime || 0;
        const end = start + (this.waveformState.duration || 0);
        if (
          audioState.playerCurrentTime < start ||
          audioState.playerCurrentTime >= end - 0.1
        ) {
          audioEl.currentTime = start;
        }
      }
      audioEl.play().catch(() => {});
      this.isAudioPlaying = true;
    }
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  addNewSegment(startTime, defaultDuration = 2.0) {
    this.closeContextMenu();
    if (!this.waveformState || !this.waveformState.duration) return null;
    const audioStart = this.waveformState.startTime || 0;
    const audioEnd = audioStart + (this.waveformState.duration || 0);

    let start = Math.max(
      audioStart,
      Math.min(audioEnd - 0.2, Number(startTime.toFixed(2))),
    );

    const futureSegments = this.segments
      .filter((s) => (s.start ?? 0) > start)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const nextStart =
      futureSegments.length > 0
        ? (futureSegments[0].start ?? audioEnd)
        : audioEnd;

    let dur = Math.min(defaultDuration, nextStart - start);
    if (dur < 0.2) {
      dur = Math.max(0.1, Math.min(defaultDuration, audioEnd - start));
    }
    let end = Number((start + dur).toFixed(2));
    if (end > audioEnd) {
      end = Number(audioEnd.toFixed(2));
      dur = Number(Math.max(0.1, end - start).toFixed(2));
    }

    let speakerId = 1;
    if (this.selectedSegmentId) {
      const sel = this.segments.find((s) => s.id === this.selectedSegmentId);
      if (sel?.speakerId) {
        speakerId = Number(sel.speakerId);
      } else if (sel?.speaker) {
        const m = String(sel.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
        if (m) speakerId = Number(m[1]);
      }
    } else if (this.segments.length > 0) {
      const last = this.segments[this.segments.length - 1];
      if (last?.speakerId) {
        speakerId = Number(last.speakerId);
      } else if (last?.speaker) {
        const m = String(last.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
        if (m) speakerId = Number(m[1]);
      }
    }

    const projectSpeakers = projectState.activeProject?.speakers || [];
    const matchedSpk = projectSpeakers.find((s) => Number(s.id) === speakerId) || projectSpeakers[0];
    if (matchedSpk) {
      speakerId = Number(matchedSpk.id);
    }
    const speaker = matchedSpk ? (matchedSpk.name || `Speaker ${speakerId}`) : `Speaker ${speakerId}`;

    const newSegment = {
      id: `seg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      start,
      end,
      duration: Number(dur.toFixed(2)),
      speakerId,
      speaker,
      text: '',
    };

    this.segments = [...this.segments, newSegment].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0),
    );

    // Rule: no segments of the same speaker can overlap
    resolveSameSpeakerOverlaps(this.segments, speakerId);

    if (this.transcriptView !== 'segments') {
      this.transcriptView = 'segments';
    }

    this.selectedSegmentId = newSegment.id;

    if (this.metrics) {
      this.metrics.totalSegments = this.segments.length;
      const speechSec = this.segments.reduce((acc, s) => acc + (s.duration || 0), 0);
      this.metrics.speechDuration = Number(speechSec.toFixed(2));
      this.metrics.silenceSkipped = Number(
        Math.max(0, (this.metrics.audioDuration || 0) - speechSec).toFixed(2),
      );
    }
    if (this.fullResult) {
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.segments = this.segments;
      }
    }

    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();

    setTimeout(() => {
      const el = document.getElementById(`segment-item-${newSegment.id}`);
      if (el) {
        const textarea = el.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }, 50);

    return newSegment;
  }

  assignSegmentSpeaker(segmentId, speakerId) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (!seg) return;

    const spkId = Math.max(1, Math.min(5, Number(speakerId) || 1));
    seg.speakerId = spkId;

    // Resolve speaker name from project speakers if available
    const projectSpeakers = projectState.activeProject?.speakers || [];
    const foundSpk = projectSpeakers.find((s) => Number(s.id) === spkId);
    if (foundSpk) {
      seg.speaker = foundSpk.name || `Speaker ${spkId}`;
    } else {
      seg.speaker = `Speaker ${spkId}`;
    }

    // Rule: no segments of the same speaker can overlap
    resolveSameSpeakerOverlaps(this.segments, spkId);

    if (this.fullResult?.segments) {
      this.fullResult.segments = this.segments;
    }
    if (this.fullResult?.output?.segments) {
      this.fullResult.output.segments = this.segments;
    }

    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();
  }

  deleteSegment(segmentId) {
    const segToDelete = this.segments.find((s) => s.id === segmentId);
    this.segments = this.segments.filter((s) => s.id !== segmentId);

    if (segToDelete && Array.isArray(this.vadSpeechRegions)) {
      this.vadSpeechRegions = this.vadSpeechRegions.filter((r) => {
        const overlapStart = Math.max(r.start, segToDelete.start);
        const overlapEnd = Math.min(r.end, segToDelete.end);
        return overlapEnd - overlapStart <= 0.05;
      });
    }

    if (this.selectedSegmentId === segmentId) {
      this.selectedSegmentId = this.segments.length > 0 ? this.segments[0].id : null;
      this.activeDragHandle = null;
      this.hoveredDragHandle = null;
    }
    if (this.activeHoverSegmentId === segmentId) {
      this.activeHoverSegmentId = null;
    }
    if (this.activeSnippetPlayId === segmentId) {
      if (this.activeSegmentPlayCleanup) {
        this.activeSegmentPlayCleanup();
        this.activeSegmentPlayCleanup = null;
      }
      this.activeSnippetPlayId = null;
    }
    if (this.currentTranscribingSegment?.id === segmentId) {
      this.currentTranscribingSegment = null;
    }
    if (this.contextMenu.targetSegment?.id === segmentId) {
      this.contextMenu.targetSegment = null;
    }

    this.transcript = this.segments
      .map((s) => cleanSpeechText(s.text))
      .filter(Boolean)
      .join(' ');

    if (this.metrics) {
      this.metrics.totalSegments = this.segments.length;
      const speechSec = this.segments.reduce((acc, s) => acc + (s.duration || 0), 0);
      this.metrics.speechDuration = Number(speechSec.toFixed(2));
      this.metrics.silenceSkipped = Number(
        Math.max(0, (this.metrics.audioDuration || 0) - speechSec).toFixed(2),
      );
    }
    if (this.fullResult) {
      this.fullResult.text = this.transcript;
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.text = this.transcript;
        this.fullResult.output.segments = this.segments;
      }
    }
    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();
  }

  updateSegmentText(segmentId, newText) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (seg) {
      seg.text = newText;
      this.transcript = this.segments
        .map((s) => cleanSpeechText(s.text))
        .filter(Boolean)
        .join(' ');
      if (this.fullResult) {
        this.fullResult.text = this.transcript;
        this.fullResult.segments = this.segments;
        if (this.fullResult.output) {
          this.fullResult.output.text = this.transcript;
          this.fullResult.output.segments = this.segments;
        }
      }
      this.notifySegmentsChange();
    }
  }

  /**
   * Writes one segment's text for a single sub-tier. Stored under `seg.subTexts`
   * keyed by the sub-tier's id, so removing or renaming a sub-tier never shifts
   * another one's content, and segments predating a sub-tier simply have no entry.
   */
  updateSegmentSubText(segmentId, tierId, newText) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (!seg) return;
    if (!seg.subTexts) seg.subTexts = {};
    seg.subTexts[String(tierId)] = newText;
    if (this.fullResult) {
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.segments = this.segments;
      }
    }
    this.notifySegmentsChange();
  }

  /**
   * Updates an annotation for a single word/morpheme in a word-level sub-tier.
   *
   * @param {string} segmentId
   * @param {number|string} tierId
   * @param {number} wordIndex
   * @param {string} annotationText
   */
  updateSegmentWordAnnotation(segmentId, tierId, wordIndex, annotationText) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (!seg) return;
    if (!seg.subTexts) seg.subTexts = {};
    const key = String(tierId);
    const current = seg.subTexts[key];
    let arr = [];
    if (Array.isArray(current)) {
      arr = [...current];
    } else if (typeof current === 'string' && current.trim()) {
      arr = current.trim().split(/\s+/);
    }
    while (arr.length <= wordIndex) {
      arr.push('');
    }
    arr[wordIndex] = annotationText;
    seg.subTexts[key] = arr;
    if (this.fullResult) {
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.segments = this.segments;
      }
    }
    this.notifySegmentsChange();
  }

  getNextSegment(segmentOrId) {
    if (!segmentOrId) return null;
    const segId =
      typeof segmentOrId === 'string' ? segmentOrId : segmentOrId.id;
    const sorted = [...this.segments].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0),
    );
    const idx = sorted.findIndex((s) => s.id === segId);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  }

  getPreviousSegment(segmentOrId) {
    if (!segmentOrId) return null;
    const segId =
      typeof segmentOrId === 'string' ? segmentOrId : segmentOrId.id;
    const sorted = [...this.segments].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0),
    );
    const idx = sorted.findIndex((s) => s.id === segId);
    return idx > 0 ? sorted[idx - 1] : null;
  }

  /**
   * @param {string|number} currentSegmentId
   * @param {number} direction -1 or +1
   * @param {boolean} [shouldPlay]
   * @param {string} [tierKey] Which text column to land in ('main' or a sub-tier id),
   *   so that tabbing down a translation column stays in that column.
   */
  navigateToSegment(currentSegmentId, direction, shouldPlay = false, tierKey = 'main') {
    const sorted = [...this.segments].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0),
    );
    const currIdx = sorted.findIndex((s) => s.id === currentSegmentId);
    if (currIdx === -1) return null;

    const targetIdx = currIdx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return null;

    const targetSeg = sorted[targetIdx];
    this.selectSegment(targetSeg.id, true);

    setTimeout(() => {
      const itemEl = document.getElementById(`segment-item-${targetSeg.id}`);
      if (itemEl) {
        const textarea =
          itemEl.querySelector(`textarea[data-tier="${tierKey}"]`) ||
          itemEl.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          const len = textarea.value.length;
          textarea.setSelectionRange(len, len);
        }
      }
    }, 30);

    if (shouldPlay) {
      this.playSegmentAudio(targetSeg);
    } else if (this.activeSegmentPlayCleanup) {
      this.activeSegmentPlayCleanup();
      this.activeSegmentPlayCleanup = null;
      if (audioState.audioElement) {
        audioState.audioElement.pause();
      }
    }

    return targetSeg;
  }

  mergeSegmentWithNext(segmentId) {
    const sorted = [...this.segments].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0),
    );
    const idx = sorted.findIndex((s) => s.id === segmentId);
    if (idx < 0 || idx >= sorted.length - 1) return null;

    const segA = sorted[idx];
    const segB = sorted[idx + 1];

    // Merged boundaries: covers segA, segB, and any space/pause between them
    const mergedStart = Math.min(segA.start ?? 0, segB.start ?? 0);
    const mergedEnd = Math.max(segA.end ?? 0, segB.end ?? 0);
    const mergedDuration = Number(
      Math.max(0.1, mergedEnd - mergedStart).toFixed(2),
    );

    // Append transcription text with a space between them if not empty
    const textA = (segA.text || '').trim();
    const textB = (segB.text || '').trim();
    let mergedText = '';
    if (textA && textB) {
      mergedText = `${textA} ${textB}`;
    } else if (textA) {
      mergedText = textA;
    } else if (textB) {
      mergedText = textB;
    }

    const mergedSpeakerId = Number(segA.speakerId || segB.speakerId) || 1;
    const projectSpeakers = projectState.activeProject?.speakers || [];
    const matchedSpk = projectSpeakers.find((s) => Number(s.id) === mergedSpeakerId);

    // Merge sub-tier contents (with a space between them if not empty)
    const mergedSubTexts = mergeSubTexts(segA.subTexts, segB.subTexts);

    const mergedSegment = {
      ...segA,
      id: segA.id,
      start: mergedStart,
      end: mergedEnd,
      duration: mergedDuration,
      speakerId: mergedSpeakerId,
      speaker: matchedSpk ? (matchedSpk.name || `Speaker ${mergedSpeakerId}`) : (segA.speaker || segB.speaker || `Speaker ${mergedSpeakerId}`),
      text: mergedText,
      subTexts: mergedSubTexts,
    };

    // Remove segB and update segA with mergedSegment
    this.segments = this.segments
      .filter((s) => s.id !== segB.id)
      .map((s) => (s.id === segA.id ? mergedSegment : s))
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    // Update active selections and trackers
    this.selectedSegmentId = mergedSegment.id;
    if (this.activeHoverSegmentId === segB.id) {
      this.activeHoverSegmentId = mergedSegment.id;
    }
    if (this.activeSnippetPlayId === segB.id) {
      this.activeSnippetPlayId = mergedSegment.id;
    }
    if (this.currentTranscribingSegment?.id === segB.id) {
      this.currentTranscribingSegment.id = mergedSegment.id;
    }

    // Recompute transcript text
    this.transcript = this.segments
      .map((s) => cleanSpeechText(s.text))
      .filter(Boolean)
      .join(' ');

    if (this.metrics) {
      this.metrics.totalSegments = this.segments.length;
      const speechSec = this.segments.reduce(
        (acc, s) => acc + (s.duration || 0),
        0,
      );
      this.metrics.speechDuration = Number(speechSec.toFixed(2));
      this.metrics.silenceSkipped = Number(
        Math.max(0, (this.metrics.audioDuration || 0) - speechSec).toFixed(2),
      );
    }

    if (this.fullResult) {
      this.fullResult.text = this.transcript;
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.text = this.transcript;
        this.fullResult.output.segments = this.segments;
      }
    }

    appState.statusMessage = `Merged segment with next: [${formatTimeSec(mergedStart)} - ${formatTimeSec(mergedEnd)}]`;

    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();

    setTimeout(() => {
      const el = document.getElementById(`segment-item-${mergedSegment.id}`);
      if (el) {
        const textarea = el.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, 50);

    return mergedSegment;
  }

  splitSegment(segmentId, splitTime = null) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (!seg) return null;

    const split = calculateSegmentSplit(seg, splitTime);
    if (!split) return null;

    const { seg1, seg2, splitPoint } = split;

    this.segments = this.segments
      .map((s) => (s.id === seg.id ? seg1 : s));
    this.segments.push(seg2);
    this.segments.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    this.selectedSegmentId = seg2.id;

    this.transcript = this.segments
      .map((s) => cleanSpeechText(s.text))
      .filter(Boolean)
      .join(' ');

    if (this.metrics) {
      this.metrics.totalSegments = this.segments.length;
      const speechSec = this.segments.reduce(
        (acc, s) => acc + (s.duration || 0),
        0,
      );
      this.metrics.speechDuration = Number(speechSec.toFixed(2));
      this.metrics.silenceSkipped = Number(
        Math.max(0, (this.metrics.audioDuration || 0) - speechSec).toFixed(2),
      );
    }

    if (this.fullResult) {
      this.fullResult.text = this.transcript;
      this.fullResult.segments = this.segments;
      if (this.fullResult.output) {
        this.fullResult.output.text = this.transcript;
        this.fullResult.output.segments = this.segments;
      }
    }

    appState.statusMessage = `Split segment into [${formatTimeSec(seg1.start)} - ${formatTimeSec(splitPoint)}] and [${formatTimeSec(splitPoint)} - ${formatTimeSec(seg2.end)}]`;

    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();

    setTimeout(() => {
      const el = document.getElementById(`segment-item-${seg2.id}`);
      if (el) {
        const textarea = el.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, 50);

    return { seg1, seg2 };
  }

  closeContextMenu() {
    if (this.contextMenu.visible) {
      this.contextMenu.visible = false;
      this.contextMenu.targetSegment = null;
      this.contextMenu.nextSegment = null;
    }
  }

  handleAddFromContextMenu() {
    const t = this.contextMenu.time;
    this.closeContextMenu();
    this.addNewSegment(t);
  }

  handlePlayFromContextMenu() {
    const t = this.contextMenu.time;
    this.closeContextMenu();
    const audioEl = audioState.audioElement;
    if (audioEl) {
      audioEl.playbackRate = audioState.playbackSpeed;
      audioEl.currentTime = t;
      audioEl.play().catch(() => {});
      this.isAudioPlaying = true;
      requestAnimationFrame(() => this.drawVerticalWaveform());
    }
  }

  handleSplitFromContextMenu() {
    if (!this.contextMenu.targetSegment) return;
    const id = this.contextMenu.targetSegment.id;
    const splitTime = this.contextMenu.time;
    this.closeContextMenu();
    this.splitSegment(id, splitTime);
  }

  handleMergeWithNextFromContextMenu() {
    if (!this.contextMenu.targetSegment) return;
    const id = this.contextMenu.targetSegment.id;
    this.closeContextMenu();
    this.mergeSegmentWithNext(id);
  }

  handleDeleteFromContextMenu() {
    if (this.contextMenu.targetSegment) {
      const id = this.contextMenu.targetSegment.id;
      this.closeContextMenu();
      this.deleteSegment(id);
      requestAnimationFrame(() => this.drawVerticalWaveform());
    }
  }

  handleTranscribeFromContextMenu(targetModel = null) {
    if (!this.contextMenu.targetSegment) return;
    const target = this.contextMenu.targetSegment;
    this.closeContextMenu();
    this.transcribeSingleSegment(target, targetModel);
  }

  getHandleAtPosition(clientY) {
    const el = this.waveformWrapEl;
    if (!el || !this.waveformState || !this.selectedSegmentId) return null;
    const selectedSeg = this.segments.find((s) => s.id === this.selectedSegmentId);
    if (!selectedSeg) return null;

    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top;
    const duration = this.waveformState.duration || 1;
    const startTime = this.waveformState.startTime || 0;
    const height = this.waveformCalculatedHeight;

    const yStart = ((selectedSeg.start - startTime) / duration) * height;
    const yEnd = ((selectedSeg.end - startTime) / duration) * height;

    const hitRadius = 9;
    if (Math.abs(y - yStart) <= hitRadius) {
      return 'start';
    }
    if (Math.abs(y - yEnd) <= hitRadius) {
      return 'end';
    }
    return null;
  }

  handleWaveformPointerDown(e) {
    if (e.button === 2) return;
    this.closeContextMenu();
    if (!this.waveformWrapEl || !this.waveformState) return;
    const handle = this.getHandleAtPosition(e.clientY);
    if (handle) {
      this.activeDragHandle = handle;
      this.wasDraggingHandle = true;
      const selectedSeg = this.segments.find(
        (s) => s.id === this.selectedSegmentId,
      );
      const currentTime = selectedSeg
        ? handle === 'start'
          ? selectedSeg.start ?? 0
          : selectedSeg.end ?? 0
        : 0;
      this.dragMagnifier = {
        active: true,
        handle,
        segmentId: this.selectedSegmentId,
        time: currentTime,
        clientY: e.clientY,
        clientX: e.clientX,
      };

      // Record neighboring segments of the same speaker for smooth boundary drag tracking
      let prevSameSpeakerSeg = null;
      let nextSameSpeakerSeg = null;
      if (selectedSeg) {
        const sortedSameSpeaker = this.segments
          .filter((s) => isSameSpeaker(s, selectedSeg))
          .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        const idx = sortedSameSpeaker.findIndex((s) => s.id === selectedSeg.id);
        if (idx > 0) {
          prevSameSpeakerSeg = sortedSameSpeaker[idx - 1];
        }
        if (idx >= 0 && idx < sortedSameSpeaker.length - 1) {
          nextSameSpeakerSeg = sortedSameSpeaker[idx + 1];
        }
      }

      this.boundaryDragState = {
        segmentId: this.selectedSegmentId,
        handle,
        initialStart: selectedSeg?.start ?? 0,
        initialEnd: selectedSeg?.end ?? 0,
        prevSegId: prevSameSpeakerSeg?.id || null,
        initialPrevEnd: prevSameSpeakerSeg?.end ?? null,
        initialPrevStart: prevSameSpeakerSeg?.start ?? null,
        nextSegId: nextSameSpeakerSeg?.id || null,
        initialNextStart: nextSameSpeakerSeg?.start ?? null,
        initialNextEnd: nextSameSpeakerSeg?.end ?? null,
      };

      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
      e.stopPropagation();
      requestAnimationFrame(() => this.drawVerticalWaveform());
      return;
    }
    this.wasDraggingHandle = false;
    this.boundaryDragState = null;
  }

  handleWaveformPointerMove(e) {
    const el = this.waveformWrapEl;
    if (!el || !this.waveformState) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    this.waveformHoverY = Math.max(0, Math.min(rect.height, y));
    const ratio = this.waveformHoverY / Math.max(1, rect.height);
    const duration = this.waveformState.duration || 1;
    const startTime = this.waveformState.startTime || 0;
    const time = startTime + ratio * duration;
    this.waveformHoverTime = Math.floor(time);

    if (this.activeDragHandle && this.selectedSegmentId) {
      const result = adjustSameSpeakerBoundariesOnDrag({
        segments: this.segments,
        selectedSegId: this.selectedSegmentId,
        handle: this.activeDragHandle,
        time,
        startTime,
        duration,
        boundaryDragState: this.boundaryDragState,
      });

      if (result?.selectedSeg) {
        this.dragMagnifier.time = result.newTime;
        this.dragMagnifier.clientY = e.clientY;
        this.dragMagnifier.clientX = e.clientX;
        this.segments = [...this.segments];
      }
      requestAnimationFrame(() => this.drawVerticalWaveform());
      return;
    }

    const handle = this.getHandleAtPosition(e.clientY);
    if (handle !== this.hoveredDragHandle) {
      this.hoveredDragHandle = handle;
      el.style.cursor = handle ? 'ns-resize' : 'crosshair';
    }

    const hoveredSeg = this.segments.find(
      (s) => time >= (s.start ?? 0) && time <= (s.end ?? 0),
    );
    this.activeHoverSegmentId = hoveredSeg ? hoveredSeg.id : null;

    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  handleWaveformPointerUp(e) {
    if (this.activeDragHandle) {
      try {
        if (
          e.target.hasPointerCapture &&
          e.target.hasPointerCapture(e.pointerId)
        ) {
          e.target.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      this.activeDragHandle = null;
      this.boundaryDragState = null;
      this.dragMagnifier = {
        active: false,
        handle: null,
        segmentId: null,
        time: 0,
        clientY: 0,
        clientX: 0,
      };

      // Safeguard: guarantee no segments of the same speaker overlap
      const selectedSeg = this.segments.find((s) => s.id === this.selectedSegmentId);
      if (selectedSeg) {
        resolveSameSpeakerOverlaps(this.segments, getSegmentSpeakerId(selectedSeg));
      }

      if (this.metrics) {
        const speechSec = this.segments.reduce(
          (acc, s) => acc + (s.duration || 0),
          0,
        );
        this.metrics.speechDuration = Number(speechSec.toFixed(2));
        this.metrics.silenceSkipped = Number(
          Math.max(0, (this.metrics.audioDuration || 0) - speechSec).toFixed(2),
        );
      }
      if (this.fullResult) {
        this.fullResult.segments = this.segments;
        if (this.fullResult.output) {
          this.fullResult.output.segments = this.segments;
        }
      }
      setTimeout(() => {
        this.wasDraggingHandle = false;
      }, 50);
      requestAnimationFrame(() => this.drawVerticalWaveform());
      this.notifySegmentsChange();
    }
  }

  handleWaveformMouseLeave() {
    this.waveformHoverTime = null;
    this.hoveredDragHandle = null;
    this.activeHoverSegmentId = null;
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  handleWaveformClick(e) {
    this.closeContextMenu();
    if (this.wasDraggingHandle) {
      this.wasDraggingHandle = false;
      return;
    }
    const audioEl = audioState.audioElement;
    if (!this.waveformWrapEl || !this.waveformState || !audioEl) return;
    const rect = this.waveformWrapEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
    const time =
      (this.waveformState.startTime ?? 0) + ratio * (this.waveformState.duration ?? 0);

    const clickedSeg = this.segments.find(
      (s) => time >= (s.start ?? 0) && time <= (s.end ?? 0),
    );
    if (clickedSeg) {
      this.selectSegment(clickedSeg.id, false);
    }

    audioEl.playbackRate = audioState.playbackSpeed;
    audioEl.currentTime = time;
    audioEl.play().catch(() => {});
    this.isAudioPlaying = true;
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  handleWaveformContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.waveformWrapEl || !this.waveformState) return;

    const rect = this.waveformWrapEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
    const time = Number(
      (
        (this.waveformState.startTime ?? 0) +
        ratio * (this.waveformState.duration ?? 0)
      ).toFixed(2),
    );

    const targetSeg = this.segments.find(
      (s) => time >= (s.start ?? 0) && time <= (s.end ?? 0),
    );
    const nextSeg = targetSeg ? this.getNextSegment(targetSeg) : null;

    const menuW = 280;
    // Estimate menu height based on content
    const modelCount = modelState.models?.length || 1;
    const baseH = 115;
    const speakerH = targetSeg ? 60 : 0;
    const actionsH = targetSeg ? (nextSeg ? 85 : 45) : 0;
    const transcribeH = targetSeg ? (28 + modelCount * 34) : 0;
    const deleteH = targetSeg ? 40 : 0;
    const estimatedH = baseH + speakerH + actionsH + transcribeH + deleteH;

    const spaceBelow = window.innerHeight - e.clientY;
    const spaceAbove = e.clientY;
    const openAbove = spaceBelow < estimatedH + 15 && spaceAbove > spaceBelow;

    const x = Math.min(window.innerWidth - menuW - 10, Math.max(10, e.clientX));
    const yPos = openAbove
      ? Math.max(10, e.clientY - estimatedH - 4)
      : Math.min(window.innerHeight - estimatedH - 10, e.clientY + 2);

    this.contextMenu = {
      visible: true,
      x,
      y: yPos,
      clientX: e.clientX,
      clientY: e.clientY,
      openAbove,
      time,
      targetSegment: targetSeg || null,
      nextSegment: nextSeg || null,
    };
  }

  getTileCanvas(index) {
    return renderGetTileCanvas(this, index);
  }

  drawTile(tileIndex) {
    renderDrawTile(this, tileIndex);
  }

  drawVerticalWaveform() {
    renderDrawVerticalWaveform(this);
  }

  drawPlayheadFrame() {
    renderDrawPlayheadFrame(this);
  }

  handleSegmentResult(payload) {
    const {
      segmentIndex,
      totalSegments,
      progress,
      segment,
      accumulatedText,
      discarded,
      isVadOnly = false,
    } = payload;
    if (accumulatedText) {
      this.transcript = cleanSpeechText(accumulatedText);
    }

    const vadMode = isVadOnly || appState.activeAction === 'segment';
    const cleanedText = cleanSpeechText(segment?.text);

    if (!vadMode && (discarded || !segment || !cleanedText)) {
      if (segment?.id) {
        this.segments = this.segments.filter((s) => s.id !== segment.id);
      }
    } else if (segment) {
      segment.text = cleanedText || '';
      const existingIdx = this.segments.findIndex((s) => s.id === segment.id);
      if (existingIdx >= 0) {
        this.segments[existingIdx] = segment;
        this.segments = [...this.segments];
      } else {
        this.segments = [...this.segments, segment];
      }
    }

    if (
      (this.enableVad || vadMode) &&
      this.segments.length > 0 &&
      this.transcriptView === 'plain'
    ) {
      this.transcriptView = 'segments';
    }

    if (!this.selectedSegmentId && this.segments.length > 0) {
      this.selectedSegmentId = this.segments[0].id;
    }

    requestAnimationFrame(() => this.drawVerticalWaveform());

    const pct = Math.round(progress * 100);
    appState.statusMessage = vadMode
      ? `Silero VAD identified segment ${segmentIndex + 1} of ${totalSegments} (${pct}%)...`
      : discarded
        ? `Segment ${segmentIndex + 1} of ${totalSegments} yielded no speech text (deleted) (${pct}%)...`
        : `Transcribed segment ${segmentIndex + 1} of ${totalSegments} (${pct}%)...`;
  }

  handleSingleSegmentTranscribed(payload) {
    if (appState.activeAction !== 'transcribe_empty') {
      appState.isProcessing = false;
    }
    this.currentTranscribingSegment = null;
    requestAnimationFrame(() => this.drawVerticalWaveform());

    const seg = this.segments.find(
      (s) =>
        s.id === payload.segmentId ||
        (Math.abs((s.start ?? 0) - payload.start) < 0.05 &&
          Math.abs((s.end ?? 0) - payload.end) < 0.05),
    );

    if (seg) {
      const cleanText = cleanSpeechText(payload.text);
      seg.text = cleanText;
      this.updateSegmentText(seg.id, cleanText);
      this.selectSegment(seg.id, false);

      const timeRange = `[${formatTimeSec(payload.start)} - ${formatTimeSec(payload.end)}]`;
      if (cleanText) {
        appState.statusMessage = `Transcribed segment ${timeRange}: "${cleanText}"`;
      } else {
        appState.statusMessage = `Segment ${timeRange} transcribed: no speech text detected.`;
      }
    } else {
      appState.statusMessage = 'Segment transcribed successfully.';
    }
    this.notifySegmentsChange();
  }

  handleSingleSegmentTranscribeError(payload) {
    if (appState.activeAction !== 'transcribe_empty') {
      appState.isProcessing = false;
      this.currentTranscribingSegment = null;
      requestAnimationFrame(() => this.drawVerticalWaveform());
      appState.errorMessage = `Segment transcription failed: ${payload?.message || 'Unknown error'}`;
      appState.statusMessage = 'Transcription failed for segment.';
    } else {
      console.warn(`[Batch] Error on segment ${payload?.segmentId}:`, payload?.message);
    }
  }

  handleBatchTranscriptionComplete(payload) {
    appState.isProcessing = false;
    this.currentTranscribingSegment = null;
    appState.downloadProgress = null;
    requestAnimationFrame(() => this.drawVerticalWaveform());
    const count = payload?.transcribedCount ?? 0;
    const total = payload?.totalSegments ?? count;
    const time = payload?.timeSec ? ` in ${payload.timeSec}s` : '';
    appState.statusMessage = `Transcription complete! Transcribed ${count} of ${total} empty segments${time}.`;
    this.notifySegmentsChange();
  }

  handleDiarizeResult(payload) {
    this.isDiarizing = false;
    appState.isProcessing = false;
    appState.downloadProgress = null;

    if (Array.isArray(payload?.segments) && payload.segments.length > 0) {
      const spkIdMap = new Map();
      const projectSpeakers = projectState.activeProject?.speakers || [];
      const defaultSpk = projectSpeakers[0] || { id: 1, name: 'Speaker 1', initials: 'S1' };
      for (const spk of projectSpeakers) {
        if (spk && spk.id != null) spkIdMap.set(Number(spk.id), spk);
      }

      this.segments = payload.segments.map((s) => {
        let spkId = Number(s.speakerId) || 1;
        const matched = spkIdMap.get(spkId) || defaultSpk;
        return {
          ...s,
          speakerId: Number(matched.id),
          speaker: matched.name || `Speaker ${matched.id}`,
        };
      });

      if (this.fullResult?.segments) {
        this.fullResult.segments = this.segments;
      }
      if (this.fullResult?.output?.segments) {
        this.fullResult.output.segments = this.segments;
      }

      const spkCount = payload.speakerCount || new Set(this.segments.map((s) => s.speakerId)).size;
      const timeStr = payload.timeSec ? ` in ${payload.timeSec}s` : '';
      appState.statusMessage = `Diarization complete! Identified ${spkCount} speaker(s) across ${this.segments.length} segments${timeStr}.`;
    } else {
      appState.statusMessage = payload?.message || 'Diarization complete.';
    }

    requestAnimationFrame(() => this.drawVerticalWaveform());
    this.notifySegmentsChange();
  }

  handleVadRegions(payload) {
    const newRegions = payload?.regions || [];
    if (this.currentIntervalSegmentation?.isInterval) {
      const { start, end } = this.currentIntervalSegmentation;
      const preserved = (this.vadSpeechRegions || []).filter(
        (r) => (r.end ?? 0) <= start + 0.05 || (r.start ?? 0) >= end - 0.05,
      );
      this.vadSpeechRegions = [...preserved, ...newRegions].sort(
        (a, b) => (a.start ?? 0) - (b.start ?? 0),
      );
    } else {
      this.vadSpeechRegions = newRegions;
    }
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  handleWorkerResult(payload) {
    const isVadOnly = Boolean(
      payload.isVadOnly ||
        payload.task === 'segment' ||
        appState.activeAction === 'segment',
    );
    if (isVadOnly || this.enableVad) {
      this.hasRunVad = true;
    }
    this.chunks = (payload.chunks || [])
      .map((c) => ({ ...c, text: cleanSpeechText(c.text) }))
      .filter((c) => c.text.length > 0);
    const projectSpeakers = projectState.activeProject?.speakers || [];
    const defaultSpk = projectSpeakers[0] || { id: 1, name: 'Speaker 1', initials: 'S1' };
    const spkIdMap = new Map();
    for (const spk of projectSpeakers) {
      if (spk && spk.id != null) spkIdMap.set(Number(spk.id), spk);
    }

    const isIntervalSegmentation = isVadOnly && Boolean(this.currentIntervalSegmentation?.isInterval);
    const preserved = isIntervalSegmentation ? (this.preservedSegments || []) : [];

    const rawNewSegments = (payload.segments || [])
      .map((s) => {
        let spkId = Number(s.speakerId);
        if (!spkId && s.speaker) {
          const m = String(s.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
          if (m) spkId = Number(m[1]);
        }
        if (!spkId) spkId = 1;
        const matched = spkIdMap.get(spkId) || defaultSpk;
        return {
          ...s,
          speakerId: Number(matched.id),
          speaker: matched.name || `Speaker ${matched.id}`,
          text: cleanSpeechText(s.text),
        };
      })
      .filter((s) => isVadOnly || s.text.length > 0);

    // Merge preserved segments (outside the interval) with newly detected segments
    let combinedSegments = isIntervalSegmentation
      ? [...preserved, ...rawNewSegments]
      : rawNewSegments;

    // Chronologically sort all segments by start time
    combinedSegments.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    // Re-index sequential numeric IDs so all segments across all portions are valid and unique
    combinedSegments = combinedSegments.map((s, idx) => ({
      ...s,
      id: idx + 1,
    }));

    this.segments = combinedSegments;
    this.preservedSegments = [];
    this.currentIntervalSegmentation = null;

    if (isVadOnly) {
      this.transcript = this.segments
        .map((s) => cleanSpeechText(s.text))
        .filter(Boolean)
        .join(' ');
    } else {
      this.transcript = cleanSpeechText(payload.text);
    }

    this.fullResult = payload.output || payload;
    if (!isVadOnly) {
      modelState.isModelLoaded = true;
    }

    appState.fallbackNotice = payload.fallbackWarning || '';

    if ((isVadOnly || this.enableVad) && this.segments.length > 0) {
      this.transcriptView = 'segments';
      if (!this.selectedSegmentId || !this.segments.some((s) => s.id === this.selectedSegmentId)) {
        this.selectedSegmentId = this.segments[0].id;
      }
    } else if (this.chunks.length > 0) {
      this.transcriptView = 'chunks';
    } else if (this.transcript) {
      this.transcriptView = 'plain';
    }

    const audioDuration = payload.audioDuration || 0;
    const fullAudioDuration = payload.fullAudioDuration || audioState.totalAudioDuration || audioDuration;
    const transcriptionTime = payload.transcriptionTime || 0;
    const realTimeFactor =
      audioDuration > 0 ? transcriptionTime / audioDuration : 0;

    const speechSec = this.segments.reduce((acc, s) => acc + (s.duration || 0), 0);
    const silenceSkipped = Math.max(0, fullAudioDuration - speechSec);

    this.metrics = {
      task: payload.task || (isVadOnly ? 'segment' : this.task),
      modelLoadTime: payload.modelLoadTime ?? 0,
      transcriptionTime,
      audioDuration,
      fullAudioDuration,
      timeOffset: payload.timeOffset || 0,
      realTimeFactor,
      hardwareConcurrency: payload.hardwareConcurrency,
      crossOriginIsolated: payload.crossOriginIsolated,
      timestampMode: payload.timestampMode || this.timestampMode,
      totalChunks: this.chunks.length,
      totalSegments: this.segments.length,
      speechDuration: Number(speechSec.toFixed(2)),
      silenceSkipped: Number(silenceSkipped.toFixed(2)),
      enableVad: this.enableVad,
    };

    requestAnimationFrame(() => this.drawVerticalWaveform());

    const actionNounCap = isVadOnly
      ? 'VAD Segmentation'
      : (payload.task || this.task) === 'translate'
        ? 'Translation'
        : 'Transcription';
    const intervalMsg =
      payload.timeOffset > 0 ||
      (payload.fullAudioDuration &&
        payload.audioDuration < payload.fullAudioDuration - 0.1)
        ? ` for interval [${formatTimeSec1(payload.timeOffset)} - ${formatTimeSec1(payload.timeOffset + payload.audioDuration)}]`
        : '';
    if (isVadOnly) {
      if (this.segments.length > 0) {
        this.workflowStep = 'transcribe';
        const skipMsg =
          silenceSkipped > 0
            ? `, ${silenceSkipped.toFixed(1)}s non-speech skipped`
            : '';
        const countInfo = isIntervalSegmentation
          ? `${rawNewSegments.length} detected in interval, ${this.segments.length} total segments`
          : `${this.segments.length} speech segments identified`;
        appState.statusMessage = `${actionNounCap} complete${intervalMsg}! (${countInfo}${skipMsg}).`;
      } else {
        appState.statusMessage = `VAD complete${intervalMsg}: No speech activity detected (try lowering VAD threshold).`;
      }
    } else if (this.enableVad && this.segments.length > 0) {
      const skipMsg =
        silenceSkipped > 0
          ? `, ${silenceSkipped.toFixed(1)}s silence skipped`
          : '';
      appState.statusMessage = `${actionNounCap} complete${intervalMsg}! (${this.segments.length} dialogue segments${skipMsg})`;
    } else {
      appState.statusMessage = `${actionNounCap} complete${intervalMsg}! (${this.chunks.length} ${payload.timestampMode === 'word' ? 'words' : 'segments'} aligned)`;
    }
    appState.downloadProgress = null;
    appState.isProcessing = false;
    this.notifySegmentsChange();
  }

  async transcribeSingleSegment(seg, targetModel = null) {
    if (!seg) return;
    if (appState.isProcessing) {
      appState.statusMessage =
        'A transcription or segmentation process is already running.';
      return;
    }

    if (targetModel) {
      await modelState.selectModel(targetModel.id);
    }

    let audioTarget = null;
    if (audioState.audioSource === 'file') {
      if (!audioState.selectedFile) {
        appState.errorMessage = 'Please select a WAV audio file first.';
        return;
      }
      audioTarget = audioState.selectedFile;
    } else {
      if (!audioState.recordedBlob) {
        appState.errorMessage = 'Please record audio from the microphone first.';
        return;
      }
      audioTarget = audioState.recordedBlob;
    }

    if (modelState.modelSource === 'folder' && modelState.rawLocalFiles.length === 0) {
      appState.errorMessage =
        'Please select a model folder containing Whisper ONNX files.';
      return;
    }

    const activeModelTitle = targetModel?.title || modelState.selectedModel?.title || 'Whisper';

    appState.isProcessing = true;
    appState.activeAction = 'transcribe';
    appState.errorMessage = '';
    this.currentTranscribingSegment = {
      start: seg.start,
      end: seg.end,
      id: seg.id,
    };
    this.selectSegment(seg.id, false);
    appState.statusMessage = `Preparing audio for segment [${formatTimeSec(seg.start)} - ${formatTimeSec(seg.end)}] using ${activeModelTitle}...`;
    requestAnimationFrame(() => this.drawVerticalWaveform());

    try {
      if (
        !audioState.cachedDecodedAudio ||
        audioState.cachedDecodedAudio.target !== audioTarget ||
        !audioState.cachedDecodedAudio.audioData ||
        audioState.cachedDecodedAudio.audioData.byteLength === 0 ||
        audioState.cachedDecodedAudio.audioData.length === 0
      ) {
        appState.statusMessage = 'Decoding audio for Whisper transcription...';
        const decoded = await processAudioFile(audioTarget);
        audioState.cachedDecodedAudio = {
          target: audioTarget,
          audioData: decoded.audioData,
          duration: decoded.duration,
        };
      }

      const totalLen = audioState.cachedDecodedAudio.audioData.length;
      const segStartSec = Math.max(0, seg.start ?? 0);
      const segEndSec = Math.max(segStartSec + 0.1, seg.end ?? (segStartSec + 1));

      const startSample = Math.max(0, Math.min(totalLen - 1, Math.floor(segStartSec * 16000)));
      let endSample = Math.min(
        totalLen,
        Math.ceil(segEndSec * 16000),
      );

      // Ensure at least 0.2s duration (3200 samples)
      if (endSample <= startSample) {
        endSample = Math.min(totalLen, startSample + 3200);
      }

      if (endSample <= startSample) {
        throw new Error('Segment duration is too short or invalid.');
      }

      const segAudio = audioState.cachedDecodedAudio.audioData.slice(
        startSample,
        endSample,
      );

      appState.statusMessage = `Sending segment [${formatTimeSec(seg.start)} - ${formatTimeSec(seg.end)}] to Whisper (${activeModelTitle})...`;

      appState.worker.postMessage(
        {
          type: 'transcribe_segment',
          payload: {
            audioData: segAudio,
            segmentId: seg.id,
            start: seg.start,
            end: seg.end,
            modelSource: modelState.modelSource,
            modelId: modelState.hubModelId.trim() || MODEL_ID,
            folderName: modelState.localFolderName,
            files: modelState.rawLocalFiles,
            dtype: modelState.modelDtype,
            device: modelState.preferredDevice,
            task: this.task,
            language: (targetModel?.language || this.language || 'en').trim(),
          },
        },
        [segAudio.buffer],
      );
    } catch (err) {
      console.error('[Main UI] Single segment transcription failed:', err);
      appState.isProcessing = false;
      this.currentTranscribingSegment = null;
      requestAnimationFrame(() => this.drawVerticalWaveform());
      appState.errorMessage = `Segment transcription failed: ${err.message || String(err)}`;
      appState.statusMessage = 'Failed to transcribe segment.';
    }
  }

  /**
   * Ensures the entire audio waveform is decoded and rendered spanning the complete
   * recording timeline (from 0 to totalAudioDuration), regardless of whether an interval is active.
   */
  async ensureFullWaveform(audioTarget) {
    if (!audioTarget) return;
    if (
      !audioState.cachedDecodedAudio ||
      audioState.cachedDecodedAudio.target !== audioTarget
    ) {
      const decoded = await processAudioFile(audioTarget);
      audioState.cachedDecodedAudio = {
        target: audioTarget,
        audioData: decoded.audioData,
        duration: decoded.duration,
      };
    }
    const { audioData, duration } = audioState.cachedDecodedAudio;
    if (
      audioState.totalAudioDuration === 0 ||
      Math.abs(audioState.totalAudioDuration - duration) > 1
    ) {
      audioState.totalAudioDuration = Number(duration.toFixed(2));
    }
    if (
      !this.waveformState ||
      !this.waveformState.peaks ||
      this.waveformState.peaks.length === 0 ||
      this.waveformState.startTime !== 0 ||
      Math.abs((this.waveformState.duration || 0) - duration) > 0.1
    ) {
      const targetBuckets = Math.max(
        800,
        Math.min(200000, Math.round(duration * 50)),
      );
      const { peaks, minVals, maxVals } = extractWaveformPeaks(
        audioData,
        targetBuckets,
      );
      this.waveformState = {
        peaks,
        minVals,
        maxVals,
        startTime: 0,
        duration,
        totalDuration: duration,
      };
      setTimeout(() => {
        requestAnimationFrame(() => this.drawVerticalWaveform());
      }, 40);
    }
  }

  async handleTranscribe() {
    let audioTarget = null;
    if (audioState.audioSource === 'file') {
      if (!audioState.selectedFile) {
        appState.errorMessage = 'Please select a WAV audio file first.';
        return;
      }
      audioTarget = audioState.selectedFile;
    } else {
      if (!audioState.recordedBlob) {
        appState.errorMessage = 'Please record audio from the microphone first.';
        return;
      }
      audioTarget = audioState.recordedBlob;
    }

    if (modelState.modelSource === 'folder' && modelState.rawLocalFiles.length === 0) {
      appState.errorMessage =
        'Please select a model folder containing Whisper ONNX files.';
      return;
    }

    if (appState.isProcessing) return;

    appState.isProcessing = true;
    appState.activeAction = 'transcribe';
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    this.transcript = '';
    this.chunks = [];
    this.segments = [];
    this.fullResult = null;
    this.metrics = null;
    appState.downloadProgress = null;

    try {
      const actionNoun = this.task === 'translate' ? 'translation' : 'transcription';
      appState.statusMessage = this.enableVad
        ? `Decoding audio & preparing Silero VAD speech detection for ${actionNoun}...`
        : `Decoding audio & preparing Whisper ${actionNoun}...`;

      if (!audioState.cachedDecodedAudio || audioState.cachedDecodedAudio.target !== audioTarget) {
        const decoded = await processAudioFile(audioTarget);
        audioState.cachedDecodedAudio = {
          target: audioTarget,
          audioData: decoded.audioData,
          duration: decoded.duration,
        };
      }
      const audioData = audioState.cachedDecodedAudio.audioData;
      const duration = audioState.cachedDecodedAudio.duration;

      if (
        audioState.totalAudioDuration === 0 ||
        Math.abs(audioState.totalAudioDuration - duration) > 1
      ) {
        audioState.totalAudioDuration = Number(duration.toFixed(2));
      }

      const effectiveStart = Math.max(
        0,
        Math.min(audioState.audioRangeStart, duration - 0.5),
      );
      const effectiveEnd =
        audioState.audioRangeEnd > effectiveStart && audioState.audioRangeEnd <= duration
          ? audioState.audioRangeEnd
          : duration;
      const isInterval =
        effectiveStart > 0.05 || effectiveEnd < duration - 0.05;

      let targetAudioData;
      let targetDuration;
      let timeOffset;

      if (isInterval) {
        const startSample = Math.floor(effectiveStart * 16000);
        const endSample = Math.min(
          audioData.length,
          Math.ceil(effectiveEnd * 16000),
        );
        targetAudioData = audioData.slice(startSample, endSample);
        targetDuration = Number(((endSample - startSample) / 16000).toFixed(2));
        timeOffset = effectiveStart;
      } else {
        targetAudioData = audioData;
        targetDuration = duration;
        timeOffset = 0;
      }

      if (audioState.audioSource === 'mic' && !audioState.recordedWavDownloadUrl) {
        const wavBlob = encodeWavBlob(audioData, 16000);
        audioState.recordedWavDownloadUrl = URL.createObjectURL(wavBlob);
      }

      const rangeLabel = isInterval
        ? ` interval [${formatTimeSec1(effectiveStart)} - ${formatTimeSec1(effectiveEnd)}] (${targetDuration.toFixed(1)}s)`
        : '';

      // Always maintain the complete audio waveform in the transcribing area
      await this.ensureFullWaveform(audioTarget);
      this.vadSpeechRegions = [];
      this.currentTranscribingSegment = null;
      this.activeSnippetPlayId = null;
      this.activeHoverSegmentId = null;
      this.transcriptView = 'segments';

      setTimeout(() => {
        requestAnimationFrame(() => this.drawVerticalWaveform());
      }, 40);

      appState.statusMessage = this.enableVad
        ? `Sending${rangeLabel} to Silero VAD & Whisper ${actionNoun}...`
        : `Sending${rangeLabel} to Whisper ${actionNoun} (Timestamps: ${this.timestampMode})...`;

      appState.worker.postMessage(
        {
          type: 'transcribe',
          payload: {
            audioData: targetAudioData,
            duration: targetDuration,
            timeOffset,
            fullAudioDuration: duration,
            modelSource: modelState.modelSource,
            modelId: modelState.hubModelId.trim() || MODEL_ID,
            folderName: modelState.localFolderName,
            files: modelState.rawLocalFiles,
            dtype: modelState.modelDtype,
            device: modelState.preferredDevice,
            task: this.task,
            language: this.language.trim() || 'en',
            timestampMode: this.timestampMode,
            enableVad: this.enableVad,
            vadOptions: {
              threshold: Number(this.vadThreshold),
              minSilenceDurationMs: Number(this.vadMinSilenceMs),
              speechPadMs: Number(this.vadSpeechPadMs),
              minSegment: Number(this.vadMinSegmentS),
              minSilence: Number(this.vadMinSilenceS),
              maxSegmentDuration: Number(this.vadMaxSegmentS),
            },
          },
        }
      );
    } catch (err) {
      console.error('[Main UI] Transcription initiation failed:', err);
      appState.handleWorkerError(
        err.message || 'Failed to process audio or start transcription.',
      );
    }
  }

  async handleSegmentOnly() {
    let audioTarget = null;
    if (audioState.audioSource === 'file') {
      if (!audioState.selectedFile) {
        appState.errorMessage = 'Please select a WAV audio file first.';
        return;
      }
      audioTarget = audioState.selectedFile;
    } else {
      if (!audioState.recordedBlob) {
        appState.errorMessage = 'Please record audio from the microphone first.';
        return;
      }
      audioTarget = audioState.recordedBlob;
    }

    if (appState.isProcessing) return;

    // Decode audio first if not cached so exact duration is known
    if (!audioState.cachedDecodedAudio || audioState.cachedDecodedAudio.target !== audioTarget) {
      try {
        const decoded = await processAudioFile(audioTarget);
        audioState.cachedDecodedAudio = {
          target: audioTarget,
          audioData: decoded.audioData,
          duration: decoded.duration,
        };
      } catch (err) {
        console.error('[Main UI] Audio file decode failed:', err);
        appState.handleWorkerError(err.message || 'Failed to decode audio.');
        return;
      }
    }

    const duration = audioState.cachedDecodedAudio.duration;
    if (
      audioState.totalAudioDuration === 0 ||
      Math.abs(audioState.totalAudioDuration - duration) > 1
    ) {
      audioState.totalAudioDuration = Number(duration.toFixed(2));
    }

    const effectiveStart = Math.max(
      0,
      Math.min(audioState.audioRangeStart, duration > 0.5 ? duration - 0.5 : 0),
    );
    const effectiveEnd =
      audioState.audioRangeEnd > effectiveStart && audioState.audioRangeEnd <= duration
        ? audioState.audioRangeEnd
        : duration;
    const isInterval =
      effectiveStart > 0.05 || effectiveEnd < duration - 0.05;

    // Detect existing segments inside the interval (or all segments if full audio)
    const affectedSegments = this.segments.filter(
      (s) => (s.end ?? 0) > effectiveStart + 0.05 && (s.start ?? 0) < effectiveEnd - 0.05,
    );
    const preservedSegments = isInterval
      ? this.segments.filter(
          (s) => !((s.end ?? 0) > effectiveStart + 0.05 && (s.start ?? 0) < effectiveEnd - 0.05),
        )
      : [];

    if (affectedSegments.length > 0) {
      const confirmed = await this.requestSegmentConfirmation({
        intervalStart: effectiveStart,
        intervalEnd: effectiveEnd,
        isInterval,
        affectedCount: affectedSegments.length,
        preservedCount: preservedSegments.length,
      });
      if (!confirmed) {
        return;
      }
    }

    // User confirmed or no existing segments in interval:
    // Delete ONLY the existing segments in the selected portion; keep outside segments intact
    this.segments = preservedSegments;
    this.preservedSegments = preservedSegments;
    this.currentIntervalSegmentation = {
      start: effectiveStart,
      end: effectiveEnd,
      isInterval,
    };
    this.notifySegmentsChange();

    appState.isProcessing = true;
    appState.activeAction = 'segment';
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    this.fullResult = null;
    this.metrics = null;
    appState.downloadProgress = null;

    try {
      appState.statusMessage =
        'Decoding audio & preparing Silero VAD speech detection...';

      const audioData = audioState.cachedDecodedAudio.audioData;

      let targetAudioData;
      let targetDuration;
      let timeOffset;

      if (isInterval) {
        const startSample = Math.floor(effectiveStart * 16000);
        const endSample = Math.min(
          audioData.length,
          Math.ceil(effectiveEnd * 16000),
        );
        targetAudioData = audioData.slice(startSample, endSample);
        targetDuration = Number(((endSample - startSample) / 16000).toFixed(2));
        timeOffset = effectiveStart;
      } else {
        targetAudioData = audioData;
        targetDuration = duration;
        timeOffset = 0;
      }

      if (audioState.audioSource === 'mic' && !audioState.recordedWavDownloadUrl) {
        const wavBlob = encodeWavBlob(audioData, 16000);
        audioState.recordedWavDownloadUrl = URL.createObjectURL(wavBlob);
      }

      const rangeLabel = isInterval
        ? ` interval [${formatTimeSec1(effectiveStart)} - ${formatTimeSec1(effectiveEnd)}] (${targetDuration.toFixed(1)}s)`
        : '';

      // In transcribing area, ALWAYS display the entire audio waveform
      await this.ensureFullWaveform(audioTarget);

      this.currentTranscribingSegment = null;
      this.activeSnippetPlayId = null;
      this.activeHoverSegmentId = null;
      this.transcriptView = 'segments';

      setTimeout(() => {
        requestAnimationFrame(() => this.drawVerticalWaveform());
      }, 40);

      const targetSpeakerCount = Math.max(1, Math.min(5, Number(this.diarizationSpeakerCount) || 1));
      let diarizationSpeakers = projectState.activeProject?.speakers || [];
      if (this.enableDiarization && targetSpeakerCount > 1) {
        diarizationSpeakers = await projectState.ensureSpeakerCount(targetSpeakerCount);
      }

      appState.statusMessage = `Scanning audio${rangeLabel} with Silero VAD...`;

      appState.worker.postMessage(
        {
          type: 'segment',
          payload: {
            audioData: targetAudioData,
            duration: targetDuration,
            timeOffset,
            fullAudioDuration: duration,
            files: modelState.rawLocalFiles,
            vadOptions: {
              threshold: Number(this.vadThreshold),
              minSilenceDurationMs: Number(this.vadMinSilenceMs),
              speechPadMs: Number(this.vadSpeechPadMs),
              minSegment: Number(this.vadMinSegmentS),
              minSilence: Number(this.vadMinSilenceS),
              maxSegmentDuration: Number(this.vadMaxSegmentS),
            },
            enableDiarization: this.enableDiarization,
            speakerCount: targetSpeakerCount,
            diarizationOptions: {
              windowSec: Number(this.diarizationWindowS),
              periodSec: Number(this.diarizationPeriodS),
            },
            projectSpeakers: $state.snapshot(diarizationSpeakers),
          },
        }
      );
    } catch (err) {
      console.error('[Main UI] Segmentation initiation failed:', err);
      this.preservedSegments = [];
      this.currentIntervalSegmentation = null;
      appState.handleWorkerError(
        err.message || 'Failed to process audio or start segmentation.',
      );
    }
  }

  async handleDiarizeSegments() {
    if (!this.segments || this.segments.length === 0) {
      appState.errorMessage = 'No segments found to diarize. Run VAD segmentation first or create segments.';
      return;
    }
    if (appState.isProcessing || this.isDiarizing) return;

    let audioTarget = null;
    if (audioState.audioSource === 'file') {
      if (!audioState.selectedFile) {
        appState.errorMessage = 'Please select a WAV audio file first.';
        return;
      }
      audioTarget = audioState.selectedFile;
    } else {
      if (!audioState.recordedBlob) {
        appState.errorMessage = 'Please record audio from the microphone first.';
        return;
      }
      audioTarget = audioState.recordedBlob;
    }

    this.isDiarizing = true;
    appState.isProcessing = true;
    appState.activeAction = 'diarize';
    try {
      const targetSpeakerCount = Math.max(2, Math.min(5, Number(this.diarizationSpeakerCount) || 2));
      const diarizationSpeakers = await projectState.ensureSpeakerCount(targetSpeakerCount);
      appState.statusMessage = `Preparing audio for speaker diarization on ${this.segments.length} segments (${targetSpeakerCount} speakers)...`;

      if (!audioState.cachedDecodedAudio || audioState.cachedDecodedAudio.target !== audioTarget) {
        const decoded = await processAudioFile(audioTarget);
        audioState.cachedDecodedAudio = {
          target: audioTarget,
          audioData: decoded.audioData,
          duration: decoded.duration,
        };
      }
      const audioData = audioState.cachedDecodedAudio.audioData;

      appState.worker.postMessage({
        type: 'diarize',
        payload: {
          audioData,
          segments: $state.snapshot(this.segments),
          files: modelState.rawLocalFiles,
          speakerCount: targetSpeakerCount,
          diarizationOptions: {
            windowSec: Number(this.diarizationWindowS),
            periodSec: Number(this.diarizationPeriodS),
          },
          cleanupOptions: {
            minSegment: Number(this.vadMinSegmentS),
            minSilence: Number(this.vadMinSilenceS),
            maxSegmentDuration: Number(this.vadMaxSegmentS),
          },
          projectSpeakers: $state.snapshot(diarizationSpeakers),
        },
      });
    } catch (err) {
      console.error('[Main UI] Diarization failed to initiate:', err);
      this.isDiarizing = false;
      appState.isProcessing = false;
      appState.errorMessage = `Diarization failed: ${err.message || String(err)}`;
    }
  }

  async handleTranscribeEmptySegments() {
    let audioTarget = null;
    if (audioState.audioSource === 'file') {
      if (!audioState.selectedFile) {
        appState.errorMessage = 'Please select a WAV audio file first.';
        return;
      }
      audioTarget = audioState.selectedFile;
    } else {
      if (!audioState.recordedBlob) {
        appState.errorMessage = 'Please record audio from the microphone first.';
        return;
      }
      audioTarget = audioState.recordedBlob;
    }

    if (modelState.modelSource === 'folder' && modelState.rawLocalFiles.length === 0) {
      appState.errorMessage =
        'Please select a model folder containing Whisper ONNX files.';
      return;
    }

    if (this.segments.length === 0) {
      appState.errorMessage =
        'No segments found to transcribe. Please run Step 1 (Segmentation) first or add segments manually on the waveform.';
      return;
    }

    const emptySegments = this.segments.filter((s) => !s.text || s.text.trim() === '');
    if (emptySegments.length === 0) {
      appState.statusMessage =
        'All segments are already transcribed! (Edit or clear any segment text to re-transcribe it).';
      return;
    }

    if (appState.isProcessing) return;

    appState.isProcessing = true;
    appState.activeAction = 'transcribe_empty';
    appState.errorMessage = '';
    appState.fallbackNotice = '';
    appState.downloadProgress = null;

    try {
      appState.statusMessage = `Preparing ${emptySegments.length} empty segments for Whisper transcription...`;

      if (!audioState.cachedDecodedAudio || audioState.cachedDecodedAudio.target !== audioTarget) {
        const decoded = await processAudioFile(audioTarget);
        audioState.cachedDecodedAudio = {
          target: audioTarget,
          audioData: decoded.audioData,
          duration: decoded.duration,
        };
      }

      const audioData = audioState.cachedDecodedAudio.audioData;
      const duration = audioState.cachedDecodedAudio.duration;

      if (
        audioState.totalAudioDuration === 0 ||
        Math.abs(audioState.totalAudioDuration - duration) > 1
      ) {
        audioState.totalAudioDuration = Number(duration.toFixed(2));
      }

      if (!this.waveformState) {
        const targetBuckets = Math.max(
          800,
          Math.min(200000, Math.round(duration * 50)),
        );
        const { peaks, minVals, maxVals } = extractWaveformPeaks(
          audioData,
          targetBuckets,
        );
        this.waveformState = {
          peaks,
          minVals,
          maxVals,
          startTime: 0,
          duration,
          totalDuration: duration,
        };
        setTimeout(() => {
          requestAnimationFrame(() => this.drawVerticalWaveform());
        }, 40);
      }

      appState.statusMessage = `Initializing Whisper model & transcribing ${emptySegments.length} empty segments...`;

      appState.worker.postMessage({
        type: 'transcribe_empty_segments',
        payload: {
          segments: emptySegments.map((s) => ({
            id: s.id,
            start: Number(s.start ?? 0),
            end: Number(s.end ?? 0),
          })),
          audioData,
          modelSource: modelState.modelSource,
          modelId: modelState.hubModelId.trim() || MODEL_ID,
          folderName: modelState.localFolderName,
          files: modelState.rawLocalFiles,
          dtype: modelState.modelDtype,
          device: modelState.preferredDevice,
          language: this.language.trim() || 'en',
          task: this.task,
        },
      });
    } catch (err) {
      console.error('[Main UI] Batch empty segments transcription failed:', err);
      appState.isProcessing = false;
      this.currentTranscribingSegment = null;
      requestAnimationFrame(() => this.drawVerticalWaveform());
      appState.errorMessage = `Transcription failed: ${err.message || String(err)}`;
      appState.statusMessage = 'Failed to transcribe empty segments.';
    }
  }

  stopTranscription(onWorkerReset) {
    if (!appState.isProcessing && !modelState.isModelLoading) return;

    if (onWorkerReset) {
      onWorkerReset();
    }

    appState.isProcessing = false;
    modelState.isModelLoading = false;
    appState.downloadProgress = null;
    modelState.isModelLoaded = false;
    this.currentTranscribingSegment = null;
    this.activeSnippetPlayId = null;
    this.preservedSegments = [];
    this.currentIntervalSegmentation = null;
    requestAnimationFrame(() => this.drawVerticalWaveform());

    if (audioState.isPlayingInterval && audioState.audioElement) {
      audioState.audioElement.pause();
      if (audioState.intervalPlayCleanup) {
        audioState.intervalPlayCleanup();
        audioState.intervalPlayCleanup = null;
      }
      audioState.isPlayingInterval = false;
    }

    const actionNoun =
      appState.activeAction === 'segment'
        ? 'Segmentation'
        : 'Transcription';
    if (this.segments.length > 0) {
      appState.statusMessage = `${actionNoun} stopped by user (${this.segments.length} segments preserved).`;
    } else if (this.transcript) {
      appState.statusMessage = `${actionNoun} stopped by user (partial text preserved).`;
    } else {
      appState.statusMessage = `${actionNoun} stopped by user.`;
    }
  }

  /**
   * One segment per line, with every tier tab separated in the order shown in the
   * legend, so the file opens as columns in a spreadsheet and still reads as plain
   * text.
   */
  segmentTextLine(seg) {
    // Follows the column order arranged in the legend. Collapsed columns are still
    // written: hiding one is a viewing choice, and an export that dropped a
    // translation because its column was collapsed would lose the user's work.
    const columns = buildColumns(projectState.activeProject?.subTiers, {
      columnOrder: projectState.activeProject?.columnOrder,
    });
    const oneLine = (v) => cleanSpeechText(v).replace(/\r?\n+/g, ' ').trim();
    const cols = columnValues(seg, columns).map(oneLine);
    // Trailing empty columns add nothing; interior ones stay so the remaining
    // columns keep their position.
    while (cols.length > 1 && cols[cols.length - 1] === '') cols.pop();
    return cols.join('\t');
  }

  /** True when a segment has text in the main tier or in any sub-tier. */
  segmentHasAnyText(seg) {
    return this.segmentTextLine(seg).split('\t').some((c) => c.length > 0);
  }

  exportTxt() {
    if (!this.transcript && (!this.segments || this.segments.length === 0)) return;
    let textContent = '';
    const validSegments = (this.segments || []).filter((s) =>
      this.segmentHasAnyText(s),
    );
    if (validSegments.length > 0) {
      textContent = validSegments
        .map((s) => this.segmentTextLine(s))
        .join('\n');
    } else if (this.transcript) {
      textContent = cleanSpeechText(this.transcript);
    }
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioState.getBaseFileName()}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportSrt() {
    let srt = '';
    const validSegments = (this.segments || [])
      .map((s) => ({ ...s, srtLine: this.segmentTextLine(s) }))
      .filter((s) => this.segmentHasAnyText(s));
    const validChunks = (this.chunks || [])
      .map((c) => ({ ...c, text: cleanSpeechText(c.text) }))
      .filter((c) => c.text.length > 0);

    if (validSegments.length > 0) {
      validSegments.forEach((seg, index) => {
        const startSec = seg.start ?? 0;
        const endSec = seg.end ?? startSec + 1;
        srt += `${index + 1}\n`;
        srt += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
        srt += `${seg.srtLine}\n\n`;
      });
    } else if (validChunks.length > 0) {
      validChunks.forEach((chunk, index) => {
        const [start, end] = chunk.timestamp || [0, 0];
        const startSec = start !== null && start !== undefined ? start : 0;
        const endSec = end !== null && end !== undefined ? end : startSec + 0.5;
        srt += `${index + 1}\n`;
        srt += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
        srt += `${chunk.text}\n\n`;
      });
    } else {
      return;
    }
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioState.getBaseFileName()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportEaf() {
    const validSegments = (this.segments || [])
      .map((s) => ({ ...s, text: cleanSpeechText(s.text || '') }));
    const validChunks = (this.chunks || [])
      .map((c) => ({ ...c, text: cleanSpeechText(c.text || '') }));

    if (validSegments.length === 0 && validChunks.length === 0) return;

    const audioFileName =
      audioState.audioSource === 'file' && audioState.selectedFile
        ? audioState.selectedFile.name
        : 'recording-16khz.wav';

    const xml = exportToEaf({
      audioFileName,
      segments: validSegments,
      chunks: validChunks,
      includeWordTier: this.timestampMode === 'word',
      speakers: projectState.activeProject?.speakers || [],
      subTiers: buildColumns(projectState.activeProject?.subTiers, {
        columnOrder: projectState.activeProject?.columnOrder,
      })
        .filter((c) => !c.isMain)
        .map((c) => ({
          id: Number(c.key),
          name: c.name,
          type: c.type,
          lexicon: c.lexicon,
        })),
      author: projectState.activeProject?.transcriber || 'Easper',
    });

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioState.getBaseFileName()}.eaf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportJson() {
    if (!this.fullResult && (!this.segments || this.segments.length === 0) && !this.transcript) return;
    const isVadOnly = Boolean(
      this.fullResult?.isVadOnly || this.fullResult?.task === 'segment',
    );
    const validSegments = (this.segments || [])
      .map((s) => ({ ...s, text: cleanSpeechText(s.text) }))
      .filter((s) => isVadOnly || s.text.length > 0 || (s.subTiers && Object.keys(s.subTiers).length > 0));
    const validChunks = (this.chunks || [])
      .map((c) => ({ ...c, text: cleanSpeechText(c.text) }))
      .filter((c) => c.text.length > 0);

    const activeProj = projectState.activeProject;
    const cleanedResult = {
      easperVersion: '1.0',
      exportedAt: new Date().toISOString(),
      project: {
        id: activeProj?.id,
        numericId: activeProj?.numericId,
        title: activeProj?.title || audioState.getBaseFileName(),
        transcriber: activeProj?.transcriber || 'Transcriber',
        audioFileName: activeProj?.audioFileName || `${audioState.getBaseFileName()}.wav`,
        audioDuration: activeProj?.audioDuration || audioState.totalAudioDuration || 0,
        audioFormat: activeProj?.audioFormat || 'WAV 16kHz Mono',
        speakers: activeProj?.speakers || [{ id: 1, name: 'Speaker 1', initials: 'S1' }],
        subTiers: activeProj?.subTiers || [],
        columnOrder: activeProj?.columnOrder || [],
        hiddenColumns: activeProj?.hiddenColumns || [],
        segments: validSegments,
        transcript: cleanSpeechText(this.transcript || this.fullResult?.text || ''),
        chunks: validChunks,
        textDirection: this.textDirection || 'ltr',
      },
      ...(this.fullResult || {}),
      text: cleanSpeechText(this.transcript || this.fullResult?.text || ''),
      segments: validSegments,
      chunks: validChunks,
    };
    if (cleanedResult.output) {
      cleanedResult.output = {
        ...cleanedResult.output,
        text: cleanSpeechText(cleanedResult.output.text),
        segments: validSegments,
        chunks: validChunks,
      };
    }
    const blob = new Blob([JSON.stringify(cleanedResult, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioState.getBaseFileName()}-result.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appState.statusMessage = 'Exported .json file successfully.';
  }

  async exportAudio() {
    let audioBlob = null;
    if (projectState.activeProjectId) {
      audioBlob = await getProjectAudioBlob(projectState.activeProjectId);
    }
    if (!audioBlob && audioState.selectedFile) {
      audioBlob = audioState.selectedFile;
    }
    if (!audioBlob && audioState.recordedBlob) {
      audioBlob = audioState.recordedBlob;
    }
    if (!audioBlob) {
      appState.errorMessage = 'No audio file available to export.';
      return;
    }

    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioState.getBaseFileName()}-16khz.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appState.statusMessage = 'Exported 16kHz audio (.wav) successfully.';
  }

  async loadProjectState(projectDoc, audioBlob) {
    if (!projectDoc || !audioBlob) return;

    // 1. Load audio file into audioState player
    audioState.loadBlobAudio(
      audioBlob,
      projectDoc.audioFileName || 'audio-16khz.wav',
      projectDoc.audioDuration || 0,
    );

    // 2. Process audio to extract waveform visualization peaks
    const { audioData, duration } = await processAudioFile(audioBlob);
    audioState.cachedDecodedAudio = {
      target: audioState.selectedFile,
      audioData,
      duration,
    };

    const targetBuckets = Math.max(
      800,
      Math.min(200000, Math.round(duration * 50)),
    );
    const { peaks, minVals, maxVals } = extractWaveformPeaks(
      audioData,
      targetBuckets,
    );

    this.waveformState = {
      peaks,
      minVals,
      maxVals,
      startTime: 0,
      duration,
      totalDuration: duration,
    };

    // 3. Load segments & transcript
    const projectSpeakers = projectDoc.speakers || [];
    const defaultSpk = projectSpeakers[0] || { id: 1, name: 'Speaker 1', initials: 'S1' };
    const spkIdMap = new Map();
    for (const spk of projectSpeakers) {
      if (spk && spk.id != null) spkIdMap.set(Number(spk.id), spk);
    }

    this.segments = (projectDoc.segments ? [...projectDoc.segments] : []).map((seg) => {
      let spkId = Number(seg.speakerId);
      if (!spkId && seg.speaker) {
        const m = String(seg.speaker).match(/^(?:speaker|spk)?[_\s]*([1-5])$/i);
        if (m) spkId = Number(m[1]);
      }
      if (!spkId) spkId = 1;
      const matched = spkIdMap.get(spkId) || defaultSpk;
      return {
        ...seg,
        speakerId: Number(matched.id),
        speaker: matched.name || `Speaker ${matched.id}`,
      };
    });
    this.transcript = projectDoc.transcript || '';
    if (projectDoc.textDirection) {
      this.textDirection = projectDoc.textDirection;
    }
    this.vadSpeechRegions = [];
    this.hasRunVad = false;
    this.currentTranscribingSegment = null;
    this.activeSnippetPlayId = null;
    this.selectedSegmentId = this.segments.length > 0 ? this.segments[0].id : null;
    this.transcriptView = 'segments';

    // Route workflow step: if project is already segmented go to transcription, otherwise go to segmentation
    if (this.segments && this.segments.length > 0) {
      this.workflowStep = 'transcribe';
    } else {
      this.workflowStep = 'segment';
    }

    // Reset transcription metrics from any previous project
    this.metrics = null;

    // 4. Trigger vertical waveform redraw
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }

  resetState() {
    this.segments = [];
    this.transcript = '';
    this.waveformState = null;
    this.vadSpeechRegions = [];
    this.hasRunVad = false;
    this.currentTranscribingSegment = null;
    this.selectedSegmentId = null;
    this.activeSnippetPlayId = null;
    this.workflowStep = 'segment';
    this.metrics = null;
    if (audioState.fileAudioUrl) {
      URL.revokeObjectURL(audioState.fileAudioUrl);
      audioState.fileAudioUrl = null;
    }
    audioState.selectedFile = null;
    audioState.totalAudioDuration = 0;
    requestAnimationFrame(() => this.drawVerticalWaveform());
  }
}

export const transcriptState = new TranscriptState();

