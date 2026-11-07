import { describe, expect, it } from 'bun:test';
import {
  computeTrimmedBoundsFromProbs,
  trimSegmentsWithVad,
} from '../src/vad.js';

describe('VAD Segment Silence Trimming (computeTrimmedBoundsFromProbs & trimSegmentsWithVad)', () => {
  it('trims leading and trailing silence from a segment while respecting speechPadMs', () => {
    // 100 frames of 512 samples at 16kHz = 3.20 seconds total (0.00s to 3.20s)
    // Speech is active from frame 25 (0.80s) to frame 75 (2.40s)
    const probs = new Float32Array(100).fill(0.02);
    for (let i = 25; i < 75; i++) {
      probs[i] = 0.92;
    }

    const res = computeTrimmedBoundsFromProbs(probs, 10.0, 13.2, {
      threshold: 0.5,
      speechPadMs: 60, // 0.06s padding on each side -> [10.74, 12.46]
      frameSize: 512,
      samplingRate: 16000,
    });

    expect(res).not.toBeNull();
    expect(res.start).toBeCloseTo(10.74, 2);
    expect(res.end).toBeCloseTo(12.46, 2);
    expect(res.trimmedSec).toBeCloseTo(1.48, 2);
  });

  it('returns null when no speech is detected so the original segment is preserved untouched', () => {
    const probs = new Float32Array(80).fill(0.05);
    const res = computeTrimmedBoundsFromProbs(probs, 0, 2.56, {
      threshold: 0.5,
      speechPadMs: 60,
    });
    expect(res).toBeNull();
  });

  it('returns null when segment is already tightly aligned to speech boundaries', () => {
    const probs = new Float32Array(60).fill(0.95);
    const res = computeTrimmedBoundsFromProbs(probs, 2.0, 3.92, {
      threshold: 0.5,
      speechPadMs: 60,
    });
    expect(res).toBeNull();
  });

  it('trims adjacent ELAN-style segments while preserving IDs, text, speakers, and subTexts', async () => {
    const samplingRate = 16000;
    // 10 seconds of audio (160,000 samples)
    // Segment 1: [0.0, 5.0] -> actual speech in [1.0, 3.5]
    // Segment 2: [5.0, 10.0] -> actual speech in [6.0, 8.5]
    const audio = new Float32Array(10 * samplingRate);
    for (let i = 1.0 * samplingRate; i < 3.5 * samplingRate; i++) {
      audio[i] = 0.8;
    }
    for (let i = 6.0 * samplingRate; i < 8.5 * samplingRate; i++) {
      audio[i] = 0.8;
    }

    // Mock Silero VAD session that outputs high probability when frame has high amplitude
    const mockVadSession = {
      async run({ input, state }) {
        const data = input.data;
        let maxAbs = 0;
        // Skip first 64 context samples, inspect the 512 frame samples
        for (let i = 64; i < data.length; i++) {
          const v = Math.abs(data[i]);
          if (v > maxAbs) maxAbs = v;
        }
        const prob = maxAbs > 0.5 ? 0.95 : 0.01;
        return {
          output: { data: new Float32Array([prob]), dispose() {} },
          stateN: state,
        };
      },
    };

    const segments = [
      {
        id: 'seg-1',
        start: 0.0,
        end: 5.0,
        duration: 5.0,
        speakerId: 1,
        speaker: 'Alice',
        text: 'hello there',
        subTexts: { '1': ['INTJ', 'ADV'], '2': 'Greeting' },
      },
      {
        id: 'seg-2',
        start: 5.0,
        end: 10.0,
        duration: 5.0,
        speakerId: 2,
        speaker: 'Bob',
        text: 'general kenobi',
        subTexts: { '1': ['NOUN', 'PROPN'], '2': 'Reply' },
      },
    ];

    const result = await trimSegmentsWithVad(
      audio,
      segments,
      mockVadSession,
      {
        threshold: 0.5,
        speechPadMs: 60,
        minSegment: 0.25,
        samplingRate,
      },
    );

    expect(result.trimmedCount).toBe(2);
    expect(result.inspectedCount).toBe(2);
    expect(result.totalTrimmedSec).toBeGreaterThan(4.5);

    const [s1, s2] = result.segments;
    // Segment 1 tightened around [1.0, 3.5] +/- 0.06s
    expect(s1.id).toBe('seg-1');
    expect(s1.speaker).toBe('Alice');
    expect(s1.text).toBe('hello there');
    expect(s1.subTexts).toEqual({ '1': ['INTJ', 'ADV'], '2': 'Greeting' });
    expect(s1.start).toBeGreaterThanOrEqual(0.9);
    expect(s1.start).toBeLessThanOrEqual(1.0);
    expect(s1.end).toBeGreaterThanOrEqual(3.5);
    expect(s1.end).toBeLessThanOrEqual(3.6);

    // Segment 2 tightened around [6.0, 8.5] +/- 0.06s
    expect(s2.id).toBe('seg-2');
    expect(s2.speaker).toBe('Bob');
    expect(s2.text).toBe('general kenobi');
    expect(s2.subTexts).toEqual({ '1': ['NOUN', 'PROPN'], '2': 'Reply' });
    expect(s2.start).toBeGreaterThanOrEqual(5.9);
    expect(s2.start).toBeLessThanOrEqual(6.0);
    expect(s2.end).toBeGreaterThanOrEqual(8.5);
    expect(s2.end).toBeLessThanOrEqual(8.6);
  });

  it('respects targetSegmentIds when trimming a single segment from the context menu', async () => {
    const samplingRate = 16000;
    const audio = new Float32Array(10 * samplingRate);
    for (let i = 1.0 * samplingRate; i < 3.0 * samplingRate; i++) audio[i] = 0.8;
    for (let i = 6.0 * samplingRate; i < 8.0 * samplingRate; i++) audio[i] = 0.8;

    const mockVadSession = {
      async run({ input, state }) {
        let maxAbs = 0;
        for (let i = 64; i < input.data.length; i++) {
          maxAbs = Math.max(maxAbs, Math.abs(input.data[i]));
        }
        return {
          output: { data: new Float32Array([maxAbs > 0.5 ? 0.95 : 0.01]), dispose() {} },
          stateN: state,
        };
      },
    };

    const segments = [
      { id: 'seg-1', start: 0.0, end: 5.0, duration: 5.0, text: 'first' },
      { id: 'seg-2', start: 5.0, end: 10.0, duration: 5.0, text: 'second' },
    ];

    const result = await trimSegmentsWithVad(audio, segments, mockVadSession, {
      targetSegmentIds: ['seg-2'],
      speechPadMs: 60,
    });

    expect(result.inspectedCount).toBe(1);
    expect(result.trimmedCount).toBe(1);
    // First segment untouched
    expect(result.segments[0].start).toBe(0.0);
    expect(result.segments[0].end).toBe(5.0);
    // Second segment trimmed
    expect(result.segments[1].start).toBeGreaterThan(5.8);
    expect(result.segments[1].end).toBeLessThan(8.2);
  });
});

