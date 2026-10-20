import { describe, it, expect } from 'bun:test';
import { diarizeSegmentsWithPyannote } from '../src/pyannote.js';

describe('PyAnnote Diarization Engine', () => {
  it('assigns speakers to existing segments without altering non-split boundaries', async () => {
    const segments = [
      { id: 1, start: 0.0, end: 3.0, text: 'First speaker turn' },
      { id: 2, start: 3.5, end: 5.5, text: 'Second speaker turn' },
    ];

    // Synthetic audio buffer (6 seconds at 16kHz)
    const audio = new Float32Array(16000 * 6);
    // Add audio signal
    for (let i = 0; i < audio.length; i++) {
      audio[i] = 0.2 * Math.sin(2 * Math.PI * 180 * (i / 16000));
    }

    const projectSpeakers = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const result = await diarizeSegmentsWithPyannote(segments, audio, {
      speakerCount: 2,
      projectSpeakers,
    });

    expect(result.length).toBe(2);
    expect(result[0].start).toBe(0.0);
    expect(result[0].end).toBe(3.0);
    expect(result[0].text).toBe('First speaker turn');
    expect(result[0].speakerId).toBeGreaterThanOrEqual(1);
    expect(result[0].speakerId).toBeLessThanOrEqual(2);

    expect(result[1].start).toBe(3.5);
    expect(result[1].end).toBe(5.5);
    expect(result[1].text).toBe('Second speaker turn');
    expect(result[1].speakerId).toBeGreaterThanOrEqual(1);
    expect(result[1].speakerId).toBeLessThanOrEqual(2);
  }, 20000);

  it('handles empty segments or audio safely', async () => {
    const empty = await diarizeSegmentsWithPyannote([], new Float32Array(100));
    expect(empty).toEqual([]);

    const noAudio = await diarizeSegmentsWithPyannote(
      [{ id: 1, start: 0, end: 1, text: 'hello' }],
      new Float32Array(0),
    );
    expect(noAudio.length).toBe(1);
  });

  it('detects concurrent overlapping speech and extracts overlap intervals', async () => {
    const { detectSpeakerTurnInAudio } = await import('../src/pyannote.js');

    const fakeEngine = {
      model: async () => {
        const numFrames = 60;
        const data = new Float32Array(numFrames * 7).fill(-15);
        for (let f = 0; f < numFrames; f++) {
          data[f * 7 + 1] = 0.0; // Speaker 1 dominant
          if (f >= 10 && f <= 35) {
            data[f * 7 + 4] = 0.0; // Overlap class S1+S2 (exp(0) = 1.0)
            data[f * 7 + 2] = -0.2; // Speaker 2 active
          }
        }
        return { logits: { dims: [1, numFrames, 7], data } };
      },
      processor: async () => ({ input_values: {} }),
    };

    const audio = new Float32Array(16000 * 2);
    const turnResult = await detectSpeakerTurnInAudio(audio, fakeEngine, {
      speechThreshold: 0.4,
      overlapThreshold: 0.35,
      minOverlapDuration: 0.2,
    });

    expect(turnResult.overlaps.length).toBeGreaterThan(0);
    expect(turnResult.overlaps[0].startSec).toBeCloseTo(0.33, 1);
    expect(turnResult.overlaps[0].endSec).toBeCloseTo(1.20, 1);
  });
});

