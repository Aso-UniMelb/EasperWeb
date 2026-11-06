globalThis.$state = (v) => v;
globalThis.$state.raw = (v) => v;
globalThis.$state.snapshot = (v) => JSON.parse(JSON.stringify(v));
globalThis.$derived = (v) => v;
globalThis.$derived.by = (fn) => fn();
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

import { describe, it, expect, beforeEach } from 'bun:test';

const { transcriptState } = await import('../src/state/transcriptState.svelte.js');
const { audioState } = await import('../src/state/audioState.svelte.js');

describe('Waveform Vertical Zoom', () => {
  beforeEach(() => {
    transcriptState.resetState();
    transcriptState.waveformState = {
      startTime: 0,
      duration: 60, // 60 seconds
      peaks: [0.1, 0.2],
    };
    transcriptState.WAVEFORM_SCALE_PX_PER_SEC = 100;
  });

  it('clamps zoom level to minimum 50 and maximum 1500', () => {
    transcriptState.setZoomLevel(10, false);
    expect(transcriptState.WAVEFORM_SCALE_PX_PER_SEC).toBe(50);

    transcriptState.setZoomLevel(2000, false);
    expect(transcriptState.WAVEFORM_SCALE_PX_PER_SEC).toBe(1500);

    transcriptState.setZoomLevel(250, false);
    expect(transcriptState.WAVEFORM_SCALE_PX_PER_SEC).toBe(250);
  });

  it('uses the middle of the current view frame as the time pivot regardless of playhead position', () => {
    // 60s at 100px/s => height = (60/60) * 100 * 6 = 600px
    expect(transcriptState.waveformCalculatedHeight).toBe(600);

    // Mock container with clientHeight = 200, scrolled to 200 (viewing 200px to 400px)
    // Middle of the view frame = 200 + 200/2 = 300px (which is 30s, exactly 50% through the 60s track)
    const mockContainer = {
      scrollTop: 200,
      clientHeight: 200,
    };
    transcriptState.waveformContainerEl = mockContainer;

    // Simulate playhead (red line) at 0s (very beginning of audio, far away from current viewport)
    audioState.playerCurrentTime = 0;

    // Zoom in from 100 to 200 px/s
    // New total height = (60/60) * 200 * 6 = 1200px
    transcriptState.setZoomLevel(200, true);

    // The time pivot (30s, 50%) in the new layout is at 0.5 * 1200 = 600px.
    // To keep it in the middle of the current view frame (clientHeight = 200),
    // new scrollTop should be 600 - (200 / 2) = 500px.
    expect(mockContainer.scrollTop).toBe(500);
    expect(transcriptState.WAVEFORM_SCALE_PX_PER_SEC).toBe(200);
    expect(transcriptState.waveformCalculatedHeight).toBe(1200);

    // Verify that middle of new view frame (500 + 100 = 600px) represents the exact same 30s:
    // (600 / 1200) * 60s = 30s.
  });

  it('does not scroll back to the red playhead line when user is in another part of the project', () => {
    // Height at 100 px/s is 600px
    // User is viewing near the end of the project: scrollTop = 350, clientHeight = 200
    // Middle of viewport = 350 + 100 = 450px => 450/600 = 0.75 (45s into audio)
    const mockContainer = {
      scrollTop: 350,
      clientHeight: 200,
    };
    transcriptState.waveformContainerEl = mockContainer;

    // Playhead is paused at 5 seconds (far from the user's viewport)
    audioState.playerCurrentTime = 5;

    // Zoom from 100 to 150 px/s
    // New height = (60/60) * 150 * 6 = 900px
    transcriptState.setZoomLevel(150, true);

    // Middle of view frame should still correspond to 45s (0.75 ratio):
    // 0.75 * 900 = 675px
    // Expected new scrollTop = 675 - 100 = 575px
    expect(mockContainer.scrollTop).toBe(575);

    // If it had anchored to the red line (5s => 5/60 = 0.0833 => 75px),
    // scrollTop would have incorrectly jumped back to 0.
    expect(mockContainer.scrollTop).not.toBe(0);
  });
});
