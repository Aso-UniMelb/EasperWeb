/**
 * Canvas drawing for the vertical waveform tiles in TranscriptState.
 *
 * Extracted out of transcriptState.svelte.js, which used to own this ~600-line
 * imperative drawing routine directly. These functions are pure with respect to
 * canvas pixels: they read waveform/segment/UI fields off the passed-in
 * `state` (a TranscriptState instance) and paint the DOM canvas it points to;
 * the only field they write back is `state.lastPlayheadTileIndex`, which is
 * drawing bookkeeping, not reactive UI state.
 */

import { audioState } from '../state/audioState.svelte.js';
import { appState } from '../state/appState.svelte.js';
import { projectState } from '../state/projectState.svelte.js';
import { formatTimeSec, formatTimeSec2 } from '../utils/formatters.js';
import {
  getSpeakerColor,
  getWaveformPillarLayout,
  getSpeakerInitials,
} from '../utils/speakers.js';

export function getTileCanvas(state, index) {
  if (!state.waveformWrapEl) return null;
  return state.waveformWrapEl.querySelector(
    `.waveform-tile-canvas[data-tile-index="${index}"]`,
  );
}

export function drawTile(state, tileIndex) {
  if (!state.waveformWrapEl) return;
  const canvas = getTileCanvas(state, tileIndex);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const totalHeight = state.waveformCalculatedHeight;
  const tiles = state.waveformTiles;
  const tile = tiles[tileIndex];
  if (!tile) return;

  const tileTop = tile.top;
  const tileHeight = tile.height;
  const tileBottom = tileTop + tileHeight;

  const rect = state.waveformWrapEl.getBoundingClientRect();
  const width = rect.width || 145;
  const dpr = window.devicePixelRatio || 1;

  const targetPxWidth = Math.round(width * dpr);
  const targetPxHeight = Math.round(tileHeight * dpr);

  if (canvas.width !== targetPxWidth || canvas.height !== targetPxHeight) {
    canvas.width = targetPxWidth;
    canvas.height = targetPxHeight;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(0, -tileTop);

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, tileTop, width, tileHeight);

  if (
    !state.waveformState ||
    !state.waveformState.peaks ||
    state.waveformState.peaks.length === 0
  ) {
    if (tileIndex === 0) {
      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting audio waveform...', width / 2, tileHeight / 2);
    }
    ctx.restore();
    return;
  }

  const { peaks, startTime = 0, duration = 1 } = state.waveformState;
  const endTime = startTime + duration;

  const speakers = projectState.activeProject?.speakers || [
    { id: 1, name: 'Speaker 1', initials: 'S1' },
  ];
  const pillarLayout = getWaveformPillarLayout(width, speakers);
  const rulerWidth = pillarLayout.rulerWidth;
  const trackLeft = pillarLayout.waveLeft;
  const trackWidth = pillarLayout.waveWidth;
  const centerX = trackLeft + trackWidth / 2;
  const maxAmpWidth = (trackWidth / 2) * 0.92;

  // Ruler sidebar background & divider line
  ctx.fillStyle = '#070b13';
  ctx.fillRect(0, tileTop, rulerWidth, tileHeight);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rulerWidth, tileTop);
  ctx.lineTo(rulerWidth, tileBottom);
  ctx.stroke();

  // Waveform track boundary divider line between waveform and first speaker pillar
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pillarLayout.waveRight, tileTop);
  ctx.lineTo(pillarLayout.waveRight, tileBottom);
  ctx.stroke();

  // Ruler timestamps
  const pxPerSec = totalHeight / Math.max(0.001, duration);
  let tickInterval = 10;
  if (pxPerSec < 0.4) tickInterval = 60;
  else if (pxPerSec < 1.2) tickInterval = 30;
  else if (pxPerSec < 2.5) tickInterval = 15;
  else if (pxPerSec < 6) tickInterval = 5;
  else if (pxPerSec < 12) tickInterval = 2;
  else tickInterval = 1;

  const tTileStart = Math.max(
    startTime,
    startTime + ((tileTop - 30) / totalHeight) * duration,
  );
  const tTileEnd = Math.min(
    endTime,
    startTime + ((tileBottom + 30) / totalHeight) * duration,
  );
  const firstTick = Math.ceil(tTileStart / tickInterval) * tickInterval;

  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let t = firstTick; t <= tTileEnd; t += tickInterval) {
    const y = ((t - startTime) / Math.max(0.001, duration)) * totalHeight;
    if (y < 2 || y > totalHeight - 2) continue;

    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(rulerWidth - 4, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(formatTimeSec(t), rulerWidth - 5, y);
  }

  // Interval selection indicator on waveform track
  if (audioState.isIntervalSelected && duration > 0) {
    const selStart = Math.max(0, audioState.audioRangeStart);
    const selEnd = Math.min(duration, audioState.audioRangeEnd);
    const ySel1 = ((selStart - startTime) / duration) * totalHeight;
    const ySel2 = ((selEnd - startTime) / duration) * totalHeight;

    if (ySel2 >= tileTop && ySel1 <= tileBottom) {
      ctx.save();

      // Very light red background fill inside the selected range on the waveform track
      const fillStart = Math.max(tileTop, ySel1);
      const fillEnd = Math.min(tileBottom, ySel2);
      if (fillEnd > fillStart) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fillRect(trackLeft, fillStart, trackWidth, fillEnd - fillStart);
      }

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);

      if (ySel1 >= tileTop && ySel1 <= tileBottom) {
        ctx.beginPath();
        ctx.moveTo(trackLeft, ySel1);
        ctx.lineTo(width, ySel1);
        ctx.stroke();

        ctx.fillStyle = '#f87171';
        ctx.font = `bold ${width < 100 ? '8px' : '9px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`▶ ${formatTimeSec(selStart)}`, rulerWidth - (width < 100 ? 2 : 4), ySel1 - 1);
      }

      if (ySel2 >= tileTop && ySel2 <= tileBottom) {
        ctx.beginPath();
        ctx.moveTo(trackLeft, ySel2);
        ctx.lineTo(width, ySel2);
        ctx.stroke();

        ctx.fillStyle = '#f87171';
        ctx.font = `bold ${width < 100 ? '8px' : '9px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`◀ ${formatTimeSec(selEnd)}`, rulerWidth - (width < 100 ? 2 : 4), ySel2 + 1);
      }

      ctx.restore();
    }
  }

  // Draw Speaker Pillars (one column per project speaker to the right of the waveform)
  if (pillarLayout && Array.isArray(pillarLayout.pillars)) {
    for (const p of pillarLayout.pillars) {
      // Background for speaker pillar
      ctx.fillStyle = '#080c14';
      ctx.fillRect(p.left, tileTop, p.width, tileHeight);

      // Vertical separator line on the right edge of this pillar
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.right, tileTop);
      ctx.lineTo(p.right, tileBottom);
      ctx.stroke();

      // Draw all segments belonging to this speaker in this pillar
      const pillarSegs = (state.segments || []).filter(
        (s) => (Number(s.speakerId) || 1) === p.speakerId,
      );

      for (const seg of pillarSegs) {
        const segStart = seg.start ?? 0;
        const segEnd = seg.end ?? segStart + 0.5;
        const y1 = Math.max(0, ((segStart - startTime) / duration) * totalHeight);
        const y2 = Math.min(totalHeight, ((segEnd - startTime) / duration) * totalHeight);
        if (y2 < tileTop - 20 || y1 > tileBottom + 20) continue;
        const h = Math.max(4, y2 - y1);

        const isSelected = state.selectedSegmentId === seg.id;
        const isHovered = state.activeHoverSegmentId === seg.id;
        const isStartActive =
          (state.activeDragHandle === 'start' && state.selectedSegmentId === seg.id) ||
          (state.hoveredDragHandle === 'start' && state.hoveredSegmentId === seg.id);
        const isEndActive =
          (state.activeDragHandle === 'end' && state.selectedSegmentId === seg.id) ||
          (state.hoveredDragHandle === 'end' && state.hoveredSegmentId === seg.id);

        const spkCol = getSpeakerColor(p.speakerId);

        // Segment block in pillar
        ctx.fillStyle = isSelected
          ? (spkCol.darkBg || 'rgba(2, 132, 199, 0.65)')
          : isHovered
            ? (spkCol.waveformBg || 'rgba(2, 132, 199, 0.42)')
            : (spkCol.waveformBg || 'rgba(2, 132, 199, 0.28)');
        ctx.fillRect(p.left + 1.5, y1, p.width - 3, h);

        // Vertical borders (left & right) always retain speaker's identity color
        ctx.strokeStyle = isHovered ? '#ffffff' : spkCol.primary;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Left border
        ctx.moveTo(p.left + 1.5, y1);
        ctx.lineTo(p.left + 1.5, y1 + h);
        // Right border
        ctx.moveTo(p.left + p.width - 1.5, y1);
        ctx.lineTo(p.left + p.width - 1.5, y1 + h);
        ctx.stroke();

        // Horizontal borders (top & bottom): only change border color of top and bottom on selection
        ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#ffffff' : spkCol.primary;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        // Top border
        ctx.moveTo(p.left + 1, y1);
        ctx.lineTo(p.left + p.width - 1, y1);
        // Bottom border
        ctx.moveTo(p.left + 1, y1 + h);
        ctx.lineTo(p.left + p.width - 1, y1 + h);
        ctx.stroke();

        // Start boundary handle in this speaker's pillar
        ctx.fillStyle = isStartActive ? '#ffffff' : isSelected ? '#38bdf8' : spkCol.primary;
        ctx.fillRect(p.left, y1 - 2, p.width, 4);
        if (isSelected || isStartActive) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(p.left + p.width / 2 - 3, y1 - 3, 6, 2);
        }

        // End boundary handle in this speaker's pillar
        const yBottom = Math.max(y2, y1 + h);
        ctx.fillStyle = isEndActive ? '#ffffff' : isSelected ? '#38bdf8' : spkCol.primary;
        ctx.fillRect(p.left, yBottom - 2, p.width, 4);
        if (isSelected || isEndActive) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(p.left + p.width / 2 - 3, yBottom + 1, 6, 2);
        }

        // Initials / duration inside pillar
        if (h >= 24) {
          ctx.font = 'bold 8px ui-monospace, sans-serif';
          ctx.fillStyle = isSelected ? '#ffffff' : spkCol.primary;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            getSpeakerInitials(p.speaker, p.speakerId),
            p.left + p.width / 2,
            y1 + 10,
          );
          if (h >= 45) {
            ctx.font = '7px ui-monospace, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(
              Number(segEnd - segStart).toFixed(1) + 's',
              p.left + p.width / 2,
              y1 + 22,
            );
          }
        }
      }
    }
  }

  // Draw VAD regions if no segments exist yet
  if ((!state.segments || state.segments.length === 0) && Array.isArray(state.vadSpeechRegions)) {
    for (const r of state.vadSpeechRegions) {
      const segStart = r.start ?? 0;
      const segEnd = r.end ?? segStart + 0.5;
      const y1 = Math.max(0, ((segStart - startTime) / duration) * totalHeight);
      const y2 = Math.min(totalHeight, ((segEnd - startTime) / duration) * totalHeight);
      if (y2 < tileTop || y1 > tileBottom) continue;
      const h = Math.max(2, y2 - y1);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.fillRect(trackLeft, y1, trackWidth, h);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(trackLeft, y1, 3.5, h);
    }
  }

  // Active transcribing scan animation
  if (appState.isProcessing && state.currentTranscribingSegment) {
    const { start: scanStart, end: scanEnd } = state.currentTranscribingSegment;
    const y1 = Math.max(0, ((scanStart - startTime) / duration) * totalHeight);
    const y2 = Math.min(totalHeight, ((scanEnd - startTime) / duration) * totalHeight);
    if (y2 >= tileTop && y1 <= tileBottom) {
      const h = Math.max(4, y2 - y1);
      const scanGrad = ctx.createLinearGradient(0, y1, 0, y2);
      scanGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      scanGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.15)');
      scanGrad.addColorStop(1, 'rgba(56, 189, 248, 0.35)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(trackLeft, y1, trackWidth, h);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(trackLeft, y1, trackWidth, h);

      const now = Date.now();
      const cycle = (now % 1000) / 1000;
      const scanLineY = y1 + h * cycle;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trackLeft, scanLineY);
      ctx.lineTo(width, scanLineY);
      ctx.stroke();
    }
  }

  // Waveform peak amplitude bars
  const numPeaks = peaks.length;
  const iStart = Math.max(0, Math.floor(((tileTop - 2) / totalHeight) * numPeaks));
  const iEnd = Math.min(numPeaks, Math.ceil(((tileBottom + 2) / totalHeight) * numPeaks));
  const barThickness = totalHeight / numPeaks;
  const hZoom = Math.max(0.5, Number(state.waveformHorizontalZoom) || 1);

  const segs = state.segments || [];
  const vads = state.vadSpeechRegions || [];
  let segCursor = 0;
  let vadCursor = 0;

  if (barThickness >= 1.2) {
    // Zoomed in: each peak gets distinct bar with proportional thickness
    ctx.lineWidth = Math.min(4, Math.max(1, Math.round(barThickness)));
    for (let i = iStart; i < iEnd; i++) {
      const amp = Math.min(1, peaks[i] * hZoom);
      if (amp < 0.01) continue;

      const y = Math.round((i / numPeaks) * totalHeight);
      const halfBarWidth = maxAmpWidth * amp;
      const x1 = centerX - halfBarWidth;
      const x2 = centerX + halfBarWidth;

      const t = startTime + (i / numPeaks) * duration;
      while (segCursor < segs.length && (segs[segCursor].end ?? 0) < t) {
        segCursor++;
      }
      const inSegment =
        segCursor < segs.length &&
        t >= (segs[segCursor].start ?? 0) &&
        t <= (segs[segCursor].end ?? 0);

      let inSpeech = inSegment;
      if (!inSpeech && segs.length === 0) {
        while (vadCursor < vads.length && (vads[vadCursor].end ?? 0) < t) {
          vadCursor++;
        }
        inSpeech =
          vadCursor < vads.length &&
          t >= (vads[vadCursor].start ?? 0) &&
          t <= (vads[vadCursor].end ?? 0);
      }

      const currentSeg = inSegment ? segs[segCursor] : null;
      const peakColor = currentSeg ? getSpeakerColor(currentSeg.speakerId || 1).primary : (inSpeech ? '#10b981' : '#64748b');
      ctx.strokeStyle = peakColor;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
  } else {
    // Zoomed out / long audio: pixel row consolidation for razor-sharp rendering & 60fps performance
    ctx.lineWidth = 1;
    let prevY = -1;
    let maxAmp = 0;
    let anyInSegment = false;
    let anyInSpeech = false;
    let lastSpeakerId = 1;

    const drawRow = (rowY, ampVal, inSeg, inSp, spkId) => {
      if (ampVal < 0.01) return;
      const halfBarWidth = maxAmpWidth * ampVal;
      const peakColor = inSeg ? getSpeakerColor(spkId).primary : (inSp ? '#10b981' : '#64748b');
      ctx.strokeStyle = peakColor;
      ctx.beginPath();
      ctx.moveTo(centerX - halfBarWidth, rowY + 0.5);
      ctx.lineTo(centerX + halfBarWidth, rowY + 0.5);
      ctx.stroke();
    };

    for (let i = iStart; i < iEnd; i++) {
      const y = Math.floor((i / numPeaks) * totalHeight);
      const amp = Math.min(1, peaks[i] * hZoom);
      const t = startTime + (i / numPeaks) * duration;

      while (segCursor < segs.length && (segs[segCursor].end ?? 0) < t) {
        segCursor++;
      }
      const inSegment =
        segCursor < segs.length &&
        t >= (segs[segCursor].start ?? 0) &&
        t <= (segs[segCursor].end ?? 0);

      let inSpeech = inSegment;
      if (!inSpeech && segs.length === 0) {
        while (vadCursor < vads.length && (vads[vadCursor].end ?? 0) < t) {
          vadCursor++;
        }
        inSpeech =
          vadCursor < vads.length &&
          t >= (vads[vadCursor].start ?? 0) &&
          t <= (vads[vadCursor].end ?? 0);
      }

      if (y !== prevY) {
        if (prevY >= 0) {
          drawRow(prevY, maxAmp, anyInSegment, anyInSpeech, lastSpeakerId);
        }
        prevY = y;
        maxAmp = amp;
        anyInSegment = inSegment;
        anyInSpeech = inSpeech;
        if (inSegment && segs[segCursor]) {
          lastSpeakerId = segs[segCursor].speakerId || 1;
        }
      } else {
        if (amp > maxAmp) maxAmp = amp;
        if (inSegment) {
          anyInSegment = true;
          if (segs[segCursor]) lastSpeakerId = segs[segCursor].speakerId || 1;
        }
        if (inSpeech) anyInSpeech = true;
      }
    }
    if (prevY >= 0) {
      drawRow(prevY, maxAmp, anyInSegment, anyInSpeech, lastSpeakerId);
    }
  }

  // Center baseline track
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, tileTop);
  ctx.lineTo(centerX, tileBottom);
  ctx.stroke();

  // Playhead
  const currentTime = audioState.getCurrentPlaybackTime();

  if (currentTime >= startTime && currentTime <= endTime) {
    const playY = ((currentTime - startTime) / duration) * totalHeight;
    if (playY >= tileTop - 15 && playY <= tileBottom + 15) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trackLeft, playY);
      ctx.lineTo(width, playY);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(trackLeft + 3, playY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `bold ${width < 100 ? '8px' : '9px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatTimeSec(currentTime), rulerWidth - (width < 100 ? 3 : 6), playY);
    }
  }

  // Top Layer: Active speech segment start & end timing handles, boundary lines, and badges
  if (state.selectedSegmentId && Array.isArray(state.segments)) {
    const selectedSeg = state.segments.find((s) => s.id === state.selectedSegmentId);
    if (selectedSeg) {
      const segStart = selectedSeg.start ?? 0;
      const segEnd = selectedSeg.end ?? segStart + 0.5;
      const y1 = Math.max(0, ((segStart - startTime) / duration) * totalHeight);
      const y2 = Math.min(totalHeight, ((segEnd - startTime) / duration) * totalHeight);

      const isStartActive =
        state.activeDragHandle === 'start' || state.hoveredDragHandle === 'start';
      const isEndActive =
        state.activeDragHandle === 'end' || state.hoveredDragHandle === 'end';

      const selectedPillar = pillarLayout.pillars?.find(
        (p) => p.speakerId === (Number(selectedSeg.speakerId) || 1),
      );
      const lineRight = selectedPillar ? selectedPillar.right : width;

      // 1. Start boundary line and start timing pill/badge
      if (y1 >= tileTop - 20 && y1 <= tileBottom + 20) {
        // Connector line across waveform to the speaker's pillar
        ctx.save();
        ctx.strokeStyle = isStartActive ? '#38bdf8' : 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = isStartActive ? 1.5 : 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(rulerWidth, y1);
        ctx.lineTo(lineRight, y1);
        ctx.stroke();
        ctx.restore();

        // Timestamp badge in ruler sidebar for start boundary
        const startBadgeText = formatTimeSec2(segStart);
        ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        const startBadgeW = Math.min(rulerWidth - 4, 50);
        const startBadgeH = 13;
        const startBadgeX = rulerWidth - 2 - startBadgeW;
        const startBadgeY = Math.max(
          0,
          Math.min(totalHeight - startBadgeH, y1 - startBadgeH / 2),
        );

        ctx.save();
        ctx.fillStyle = isStartActive ? 'rgba(56, 189, 248, 0.35)' : '#070b13';
        ctx.strokeStyle = isStartActive ? '#38bdf8' : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(startBadgeX, startBadgeY, startBadgeW, startBadgeH, 3);
        } else {
          ctx.rect(startBadgeX, startBadgeY, startBadgeW, startBadgeH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(startBadgeText, rulerWidth - (width < 100 ? 3 : 5), y1);
      }

      // 2. End boundary line and end timing pill/badge
      if (y2 >= tileTop - 20 && y2 <= tileBottom + 20) {
        // Connector line across waveform to the speaker's pillar
        ctx.save();
        ctx.strokeStyle = isEndActive ? '#38bdf8' : 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = isEndActive ? 1.5 : 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(rulerWidth, y2);
        ctx.lineTo(lineRight, y2);
        ctx.stroke();
        ctx.restore();

        // Timestamp badge in ruler sidebar for end boundary
        const endBadgeText = formatTimeSec2(segEnd);
        ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        const endBadgeW = Math.min(rulerWidth - 4, 50);
        const endBadgeH = 13;
        const endBadgeX = rulerWidth - 2 - endBadgeW;
        const endBadgeY = Math.max(
          0,
          Math.min(totalHeight - endBadgeH, y2 - endBadgeH / 2),
        );

        ctx.save();
        ctx.fillStyle = isEndActive ? 'rgba(56, 189, 248, 0.35)' : '#070b13';
        ctx.strokeStyle = isEndActive ? '#38bdf8' : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(endBadgeX, endBadgeY, endBadgeW, endBadgeH, 3);
        } else {
          ctx.rect(endBadgeX, endBadgeY, endBadgeW, endBadgeH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(endBadgeText, rulerWidth - (width < 100 ? 3 : 5), y2);
      }
    }
  }

  ctx.restore();
}

export function drawVerticalWaveform(state) {
  if (!state.waveformWrapEl) return;
  const tiles = state.visibleWaveformTiles;
  for (let i = 0; i < tiles.length; i++) {
    drawTile(state, tiles[i].index);
  }
}

export function drawPlayheadFrame(state) {
  if (!state.waveformWrapEl || !state.waveformState) return;
  const { startTime = 0, duration = 1 } = state.waveformState;
  const totalHeight = state.waveformCalculatedHeight;
  const currentTime = audioState.getCurrentPlaybackTime();

  const playY = ((currentTime - startTime) / duration) * totalHeight;
  const tiles = state.waveformTiles;
  if (tiles.length === 0) return;

  const curTileIdx = Math.max(
    0,
    Math.min(tiles.length - 1, Math.floor(playY / state.TILE_HEIGHT)),
  );

  const tilesToRedraw = new Set();
  if (state.lastPlayheadTileIndex !== null) {
    tilesToRedraw.add(state.lastPlayheadTileIndex);
    if (state.lastPlayheadTileIndex > 0) {
      tilesToRedraw.add(state.lastPlayheadTileIndex - 1);
    }
    if (state.lastPlayheadTileIndex < tiles.length - 1) {
      tilesToRedraw.add(state.lastPlayheadTileIndex + 1);
    }
  }
  tilesToRedraw.add(curTileIdx);
  if (curTileIdx > 0 && playY % state.TILE_HEIGHT < 20) {
    tilesToRedraw.add(curTileIdx - 1);
  }
  if (curTileIdx < tiles.length - 1 && state.TILE_HEIGHT - (playY % state.TILE_HEIGHT) < 20) {
    tilesToRedraw.add(curTileIdx + 1);
  }

  for (const idx of tilesToRedraw) {
    drawTile(state, idx);
  }
  state.lastPlayheadTileIndex = curTileIdx;
}
