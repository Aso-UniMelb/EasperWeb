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

  // Proximity to nearest boundary of any other segment (for snap/gap feedback)
  let nearestOtherBoundary = $derived.by(() => {
    let closest = null;
    let minDiff = Infinity;
    for (const s of transcriptState.segments) {
      if (s.id === drag.segmentId) continue;
      const sStart = s.start ?? 0;
      const sEnd = s.end ?? sStart + 0.5;
      const d1 = Math.abs(currentTime - sStart);
      const d2 = Math.abs(currentTime - sEnd);
      const sSpkId = Number(s.speakerId) || 1;
      if (d1 < minDiff) {
        minDiff = d1;
        closest = {
          seg: s,
          type: 'start',
          time: sStart,
          diff: d1,
          speakerId: sSpkId,
        };
      }
      if (d2 < minDiff) {
        minDiff = d2;
        closest = {
          seg: s,
          type: 'end',
          time: sEnd,
          diff: d2,
          speakerId: sSpkId,
        };
      }
    }
    return closest;
  });

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

  // Redraw magnifier canvas whenever currentTime, handle, or segments change
  $effect(() => {
    if (!canvasEl || !drag.active) return;
    const time = currentTime;
    const currentHandle = handle;
    const spkCol = speakerColor;
    const allSegs = transcriptState.segments;
    const projSpeakers = projectState.activeProject?.speakers;

    renderMagnifier(
      canvasEl,
      time,
      currentHandle,
      spkCol,
      allSegs,
      projSpeakers,
    );
  });

  function renderMagnifier(
    canvas,
    centerTime,
    boundaryHandle,
    color,
    allSegments = [],
    projectSpeakers = [],
  ) {
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
    const winEnd = centerTime + halfSpan;

    const rulerWidth = 44;
    const waveLeft = rulerWidth;
    const waveWidth = cssWidth - waveLeft;
    const centerX = waveLeft + waveWidth / 2;
    const maxBarWidth = (waveWidth / 2) * 0.92;
    const centerY = cssHeight / 2;

    // Subtle background for ruler column
    ctx.fillStyle = '#0b101b';
    ctx.fillRect(0, 0, rulerWidth, cssHeight);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerWidth, 0);
    ctx.lineTo(rulerWidth, cssHeight);
    ctx.stroke();

    // Map all segments intersecting this window
    const visibleSegs = allSegments
      .map((s) => {
        const isCurrent = s.id === drag.segmentId;
        const spkId = Number(s.speakerId) || 1;
        const spkCol = getSpeakerColor(spkId);
        const spkObj = (projectSpeakers || []).find(
          (sp) => Number(sp.id) === spkId,
        );
        const spkInitials = spkObj?.initials || `S${spkId}`;

        const sStart =
          isCurrent && boundaryHandle === 'start'
            ? centerTime
            : (s.start ?? 0);
        const sEnd =
          isCurrent && boundaryHandle === 'end'
            ? centerTime
            : (s.end ?? sStart + 0.5);

        return {
          id: s.id,
          text: s.text || '',
          isCurrent,
          speakerId: spkId,
          speakerColor: spkCol,
          speakerInitials: spkInitials,
          speakerName: spkObj?.name || `Speaker ${spkId}`,
          start: sStart,
          end: sEnd,
          y1: ((sStart - winStart) / windowSpan) * cssHeight,
          y2: ((sEnd - winStart) / windowSpan) * cssHeight,
        };
      })
      .filter((s) => s.end >= winStart && s.start <= winEnd);

    // 1. Shading: Draw segment background regions for all visible segments
    for (const s of visibleSegs) {
      const topY = Math.max(0, Math.min(cssHeight, s.y1));
      const botY = Math.max(0, Math.min(cssHeight, s.y2));
      const h = botY - topY;
      if (h <= 0) continue;

      if (s.isCurrent) {
        // Active segment interior: noticeable tint with speaker color
        ctx.fillStyle = `${color.primary}22`;
        ctx.fillRect(waveLeft, topY, waveWidth, h);

        // Highlight stripe along left boundary of wave track
        ctx.fillStyle = color.primary;
        ctx.fillRect(waveLeft, topY, 3, h);
      } else {
        // Existing other segment: distinct speaker tint
        ctx.fillStyle =
          s.speakerColor.waveformBg || `${s.speakerColor.primary}22`;
        ctx.fillRect(waveLeft, topY, waveWidth, h);

        // Left boundary stripe with this speaker's color
        ctx.fillStyle = s.speakerColor.primary;
        ctx.fillRect(waveLeft, topY, 2.5, h);

        // Right edge indicator rail
        ctx.fillStyle = `${s.speakerColor.primary}88`;
        ctx.fillRect(cssWidth - 3, topY, 3, h);
      }
    }

    // 2. Segment label & text watermark inside the region
    for (const s of visibleSegs) {
      const topY = Math.max(0, Math.min(cssHeight, s.y1));
      const botY = Math.max(0, Math.min(cssHeight, s.y2));
      const h = botY - topY;
      if (h >= 18) {
        ctx.save();
        ctx.font = 'bold 8.5px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const labelText = s.text
          ? s.text.length > 20
            ? s.text.slice(0, 19) + '…'
            : s.text
          : s.isCurrent
            ? 'Current'
            : `Seg #${s.id}`;

        ctx.fillStyle = s.isCurrent ? '#ffffff' : s.speakerColor.primary;
        ctx.fillText(
          `[${s.speakerInitials}] ${labelText}`,
          waveLeft + 8,
          topY + 4,
        );
        ctx.restore();
      }
    }

    // 3. Waveform Zero-Crossing center axis line
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, cssHeight);
    ctx.stroke();

    // 4. Subtle gridlines and millisecond offsets on ruler: -400ms, -200ms, +200ms, +400ms
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

    // 5. Draw high-resolution waveform amplitude peaks
    const audioData = audioState.cachedDecodedAudio?.audioData;
    const peaks = transcriptState.waveformState?.peaks;
    const hZoom = Math.max(0.5, Number(transcriptState.waveformHorizontalZoom) || 1);

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
          amp = Math.min(1.0, localMax * 1.5 * hZoom);
        }
      } else if (peaks && peaks.length > 0) {
        if (t >= 0 && t <= totalDuration) {
          const pIdx = Math.floor((t / totalDuration) * peaks.length);
          if (pIdx >= 0 && pIdx < peaks.length) {
            amp = Math.min(1.0, peaks[pIdx] * hZoom);
          }
        }
      }

      if (amp > 0.015) {
        const barW = maxBarWidth * amp;

        // Check which segment covers time t
        const coveringCurrent = visibleSegs.find(
          (s) => s.isCurrent && t >= s.start && t <= s.end,
        );
        const coveringOther =
          !coveringCurrent &&
          visibleSegs.find((s) => !s.isCurrent && t >= s.start && t <= s.end);

        if (coveringCurrent) {
          ctx.strokeStyle = color.primary;
        } else if (coveringOther) {
          ctx.strokeStyle = coveringOther.speakerColor.primary;
        } else {
          ctx.strokeStyle = '#475569';
        }

        ctx.beginPath();
        ctx.moveTo(centerX - barW, y);
        ctx.lineTo(centerX + barW, y);
        ctx.stroke();
      }
    }

    // 6. Draw boundary lines and tags for other existing segments
    for (const s of visibleSegs) {
      if (s.isCurrent) continue;

      // Start boundary of other existing segment
      if (s.y1 >= 2 && s.y1 <= cssHeight - 2) {
        ctx.save();
        ctx.strokeStyle = s.speakerColor.primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(waveLeft, s.y1);
        ctx.lineTo(cssWidth, s.y1);
        ctx.stroke();
        ctx.restore();

        // Tick on ruler
        ctx.fillStyle = s.speakerColor.primary;
        ctx.fillRect(rulerWidth - 4, s.y1 - 3, 4, 6);

        // Badge at right edge
        ctx.font = 'bold 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = s.speakerColor.primary;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          `${s.speakerInitials} ▶ ${formatTimeSec3(s.start)}`,
          cssWidth - 5,
          s.y1 - 2,
        );
      }

      // End boundary of other existing segment
      if (s.y2 >= 2 && s.y2 <= cssHeight - 2) {
        ctx.save();
        ctx.strokeStyle = s.speakerColor.primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(waveLeft, s.y2);
        ctx.lineTo(cssWidth, s.y2);
        ctx.stroke();
        ctx.restore();

        // Tick on ruler
        ctx.fillStyle = s.speakerColor.primary;
        ctx.fillRect(rulerWidth - 4, s.y2 - 3, 4, 6);

        // Badge at right edge
        ctx.font = 'bold 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = s.speakerColor.primary;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(
          `${s.speakerInitials} ◀ ${formatTimeSec3(s.end)}`,
          cssWidth - 5,
          s.y2 + 2,
        );
      }
    }

    // 7. High-contrast neon cyan center cut line (at centerY)
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

    // 8. Region watermark tags (subtle orientation labels)
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    if (boundaryHandle === 'start') {
      ctx.fillText('PREVIOUS AUDIO', waveLeft + 6, 6);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `${color.primary}bb`;
      ctx.fillText('SEGMENT START', waveLeft + 6, cssHeight - 6);
    } else {
      ctx.fillStyle = `${color.primary}bb`;
      ctx.fillText('SEGMENT END', waveLeft + 6, 6);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
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
    {#if nearestOtherBoundary && nearestOtherBoundary.diff <= 0.08}
      {@const spkCol = getSpeakerColor(nearestOtherBoundary.speakerId)}
      <span
        class="magnifier-proximity-pill"
        style="color: {spkCol.primary}; border-color: {spkCol.primary}66;"
        title="Proximity to Speaker {nearestOtherBoundary.speakerId} {nearestOtherBoundary.type}"
      >
        {Math.round(nearestOtherBoundary.diff * 1000)}ms to S{nearestOtherBoundary.speakerId} {nearestOtherBoundary.type}
      </span>
    {:else}
      <span class="magnifier-hint">
        <i class="fa-solid fa-arrows-up-down"></i> Release to set
      </span>
    {/if}
  </div>
</div>
