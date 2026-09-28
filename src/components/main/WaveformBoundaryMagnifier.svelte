<script>
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { formatTimeSec3 } from '../../utils/formatters.js';
  import { getSpeakerColor } from '../../utils/speakers.js';

  let canvasEl = $state(null);

  let drag = $derived(transcriptState.dragMagnifier);
  let handle = $derived(drag.handle); // 'start' | 'end'
  let currentTime = $derived(drag.time || 0);

  let selectedSeg = $derived(
    transcriptState.segments.find((s) => s.id === drag.segmentId) || null,
  );

  let speakerId = $derived(Number(selectedSeg?.speakerId) || 1);
  let speakerColor = $derived(getSpeakerColor(speakerId));
  let speakerObj = $derived(
    projectState.activeProject?.speakers?.find(
      (sp) => Number(sp.id) === speakerId,
    ) || null,
  );
  let speakerName = $derived(speakerObj?.name || `Speaker ${speakerId}`);

  let liveDuration = $derived(
    selectedSeg
      ? Math.max(0, (selectedSeg.end ?? 0) - (selectedSeg.start ?? 0))
      : 0,
  );

  // Position the floating magnifier card near the waveform sidebar column,
  // clamped vertically inside the visible viewport so it never goes off-screen
  let cardTop = $state(100);
  let cardLeft = $state(175);

  $effect(() => {
    if (transcriptState.waveformWrapEl && drag.active) {
      const wrapRect = transcriptState.waveformWrapEl.getBoundingClientRect();
      const cardHeight = 270;

      // Position immediately to the right of the vertical waveform timeline
      cardLeft = Math.max(160, wrapRect.right + 14);

      // Clamp vertically within the container's visible bounds
      const minTop = Math.max(60, wrapRect.top + 8);
      const maxTop = Math.max(
        minTop,
        Math.min(
          window.innerHeight - cardHeight - 16,
          wrapRect.bottom - cardHeight - 8,
        ),
      );
      const targetTop = drag.clientY - cardHeight / 2;
      cardTop = Math.max(minTop, Math.min(maxTop, targetTop));
    }
  });

  // Redraw magnifier canvas whenever currentTime, handle, or window changes
  $effect(() => {
    if (!canvasEl || !drag.active) return;
    const time = currentTime;
    const currentHandle = handle;
    const spkCol = speakerColor;

    renderMagnifier(canvasEl, time, currentHandle, spkCol);
  });

  function renderMagnifier(canvas, centerTime, boundaryHandle, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = 240;
    const cssHeight = 180;

    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const totalDuration =
      transcriptState.waveformState?.duration ||
      audioState.totalAudioDuration ||
      1;
    const windowSpan = 1.2; // ±0.6 seconds around boundary
    const halfSpan = windowSpan / 2;
    const winStart = centerTime - halfSpan;

    const rulerWidth = 44;
    const waveLeft = rulerWidth;
    const waveWidth = cssWidth - waveLeft;
    const centerX = waveLeft + waveWidth / 2;
    const maxBarWidth = (waveWidth / 2) * 0.92;
    const centerY = cssHeight / 2;

    // Segment interior region shading:
    // If handle is 'start': region below centerY (time >= centerTime) is inside segment
    // If handle is 'end': region above centerY (time <= centerTime) is inside segment
    ctx.save();
    if (boundaryHandle === 'start') {
      ctx.fillStyle = `${color.primary}18`;
      ctx.fillRect(waveLeft, centerY, waveWidth, cssHeight - centerY);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(waveLeft, 0, waveWidth, centerY);
    } else {
      ctx.fillStyle = `${color.primary}18`;
      ctx.fillRect(waveLeft, 0, waveWidth, centerY);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(waveLeft, centerY, waveWidth, cssHeight - centerY);
    }
    ctx.restore();

    // Waveform Zero-Crossing center axis line
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, cssHeight);
    ctx.stroke();

    // Subtle gridlines and millisecond offsets on ruler: -400ms, -200ms, +200ms, +400ms
    const gridOffsets = [-0.4, -0.2, 0.2, 0.4];
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    gridOffsets.forEach((dt) => {
      const gridY = centerY + (dt / halfSpan) * (cssHeight / 2);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(waveLeft, gridY);
      ctx.lineTo(cssWidth, gridY);
      ctx.stroke();
      ctx.setLineDash([]);

      const sign = dt > 0 ? '+' : '';
      const label = `${sign}${Math.round(dt * 1000)}ms`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, rulerWidth - 5, gridY);
    });

    // Draw high-resolution waveform amplitude peaks
    const audioData = audioState.cachedDecodedAudio?.audioData;
    const peaks = transcriptState.waveformState?.peaks;

    ctx.lineWidth = 1.5;

    for (let y = 0; y < cssHeight; y += 1.5) {
      const ratio = y / cssHeight;
      const t = winStart + ratio * windowSpan;

      let amp = 0;
      if (audioData && audioData.length > 0) {
        if (t >= 0 && t <= totalDuration) {
          const sampleRate = 16000;
          const s1 = Math.max(0, Math.floor(t * sampleRate));
          const s2 = Math.min(
            audioData.length,
            Math.ceil((t + windowSpan / cssHeight) * sampleRate),
          );
          let localMax = 0;
          for (let s = s1; s < s2; s += 2) {
            const val = Math.abs(audioData[s]);
            if (val > localMax) localMax = val;
          }
          amp = Math.min(1.0, localMax * 1.5);
        }
      } else if (peaks && peaks.length > 0) {
        if (t >= 0 && t <= totalDuration) {
          const pIdx = Math.floor((t / totalDuration) * peaks.length);
          if (pIdx >= 0 && pIdx < peaks.length) {
            amp = peaks[pIdx];
          }
        }
      }

      if (amp > 0.015) {
        const barW = maxBarWidth * amp;
        const isInside =
          boundaryHandle === 'start' ? t >= centerTime : t <= centerTime;
        ctx.strokeStyle = isInside ? color.primary : '#475569';
        ctx.beginPath();
        ctx.moveTo(centerX - barW, y);
        ctx.lineTo(centerX + barW, y);
        ctx.stroke();
      }
    }

    // High-contrast neon cyan center cut line (at centerY)
    ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(waveLeft - 4, centerY);
    ctx.lineTo(cssWidth, centerY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cut indicator arrow notches
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(waveLeft, centerY - 4);
    ctx.lineTo(waveLeft + 5, centerY);
    ctx.lineTo(waveLeft, centerY + 4);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cssWidth - 1, centerY - 4);
    ctx.lineTo(cssWidth - 6, centerY);
    ctx.lineTo(cssWidth - 1, centerY + 4);
    ctx.closePath();
    ctx.fill();

    // Center timestamp label on ruler
    ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('CUT', rulerWidth - 5, centerY);

    // Region watermark tags (subtle orientation labels)
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    if (boundaryHandle === 'start') {
      ctx.fillText('PREVIOUS AUDIO', waveLeft + 6, 6);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `${color.primary}aa`;
      ctx.fillText('SEGMENT START', waveLeft + 6, cssHeight - 6);
    } else {
      ctx.fillStyle = `${color.primary}aa`;
      ctx.fillText('SEGMENT END', waveLeft + 6, 6);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.fillText('NEXT AUDIO', waveLeft + 6, cssHeight - 6);
    }

    ctx.restore();
  }
</script>

<div
  class="waveform-boundary-magnifier"
  style="top: {cardTop}px; left: {cardLeft}px;"
  role="tooltip"
  aria-live="polite"
>
  <div class="magnifier-header">
    <div class="magnifier-header-left">
      <span
        class="magnifier-handle-badge"
        style="background: {speakerColor.primary};"
      >
        <i
          class="fa-solid {handle === 'start'
            ? 'fa-arrow-right-to-line'
            : 'fa-arrow-left-to-line'}"
        ></i>
        {handle === 'start' ? 'START' : 'END'}
      </span>
      <span class="magnifier-speaker-label" title={speakerName}>
        {speakerName}
      </span>
    </div>
    <span class="magnifier-time-display">
      {formatTimeSec3(currentTime)}
    </span>
  </div>

  <div class="magnifier-canvas-container">
    <canvas
      bind:this={canvasEl}
      class="magnifier-canvas"
      style="width: 240px; height: 180px;"
    ></canvas>
  </div>

  <div class="magnifier-footer">
    <span class="magnifier-dur-label">
      Duration: <strong>{liveDuration.toFixed(2)}s</strong>
    </span>
    <span class="magnifier-hint">
      <i class="fa-solid fa-arrows-up-down"></i> Release to set
    </span>
  </div>
</div>
