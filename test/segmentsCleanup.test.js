import { describe, it, expect } from 'bun:test';
import { segmentsCleanup } from '../src/vad.js';

describe('segmentsCleanup Pipeline', () => {
  describe('Single-Speaker Segment Tidying', () => {
    it('merges adjacent same-speaker segments closer than minSilence', () => {
      const input = [
        { start: 1.0, end: 2.0, speakerId: 1, text: 'Hello' },
        { start: 2.3, end: 3.5, speakerId: 1, text: 'world' },
      ];

      // minSilence is 0.5s; gap is 0.3s -> should merge into [1.0, 3.5]
      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(1);
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(3.5);
      expect(result[0].duration).toBe(2.5);
      expect(result[0].text).toBe('Hello world');
      expect(result[0].speakerId).toBe(1);
    });

    it('does not merge segments separated by more than minSilence', () => {
      const input = [
        { start: 1.0, end: 2.0, speakerId: 1 },
        { start: 2.8, end: 4.0, speakerId: 1 },
      ];

      // minSilence is 0.5s; gap is 0.8s -> should remain 2 separate segments
      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(2);
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(2.0);
      expect(result[1].start).toBe(2.8);
      expect(result[1].end).toBe(4.0);
    });

    it('drops brief noise spikes shorter than minSegment', () => {
      const input = [
        { start: 1.0, end: 1.3, speakerId: 1 }, // 0.3s < minSegment 0.5s
        { start: 3.0, end: 5.0, speakerId: 1 }, // 2.0s >= 0.5s
      ];

      const result = segmentsCleanup(input, { minSegment: 0.5, minSilence: 0.5 });
      expect(result.length).toBe(1);
      expect(result[0].start).toBe(3.0);
      expect(result[0].end).toBe(5.0);
    });

    it('splits segments longer than maxSegmentDuration', () => {
      const input = [
        { start: 0.0, end: 25.0, speakerId: 1 },
      ];

      // maxSegmentDuration 10.0s -> should split into 10.0s chunks
      const result = segmentsCleanup(input, { maxSegmentDuration: 10.0, minSegment: 0.5 });
      expect(result.length).toBe(3);
      expect(result[0].start).toBe(0.0);
      expect(result[0].end).toBe(10.0);
      expect(result[1].start).toBe(10.0);
      expect(result[1].end).toBe(20.0);
      expect(result[2].start).toBe(20.0);
      expect(result[2].end).toBe(25.0);
    });

    it('removes completely enclosed segments within the same speaker', () => {
      const input = [
        { start: 1.0, end: 6.0, speakerId: 1 },
        { start: 2.0, end: 4.0, speakerId: 1 }, // enclosed within [1.0, 6.0]
      ];

      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(1);
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(6.0);
    });

    it('resolves partial overlaps between same-speaker segments at midpoint', () => {
      const input = [
        { start: 0.0, end: 12.0, speakerId: 1 },
        { start: 10.0, end: 22.0, speakerId: 1 },
      ];

      // Overlap from 10.0 to 12.0 (length 2.0s); with maxSegmentDuration=15.0 they don't merge into one
      const result = segmentsCleanup(input, { maxSegmentDuration: 15.0, minSegment: 0.5 });
      expect(result.length).toBe(2);
      expect(result[0].start).toBe(0.0);
      expect(result[0].end).toBe(11.0);
      expect(result[1].start).toBe(11.0);
      expect(result[1].end).toBe(22.0);
    });
  });

  describe('Multi-Speaker Segment Tidying & Overlap Preservation', () => {
    it('PRESERVES enclosed overlapping segments of DIFFERENT speakers', () => {
      // Speaker 1 speaks a long sentence; Speaker 2 says "mhm" in the middle
      const input = [
        { start: 1.0, end: 6.0, speakerId: 1, speaker: 'Speaker 1', text: 'I was thinking about our plans' },
        { start: 3.0, end: 4.0, speakerId: 2, speaker: 'Speaker 2', text: 'mhm' },
      ];

      const result = segmentsCleanup(input, { minSegment: 0.5, minSilence: 0.5 });
      expect(result.length).toBe(2);
      // Both speakers must be preserved
      expect(result[0].speakerId).toBe(1);
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(6.0);
      expect(result[0].text).toBe('I was thinking about our plans');

      expect(result[1].speakerId).toBe(2);
      expect(result[1].start).toBe(3.0);
      expect(result[1].end).toBe(4.0);
      expect(result[1].text).toBe('mhm');
    });

    it('PRESERVES partial cross-talk overlaps between DIFFERENT speakers without midpoint truncation', () => {
      // Speaker 1 starts, Speaker 2 overlaps and continues
      const input = [
        { start: 0.0, end: 4.0, speakerId: 1, speaker: 'Speaker 1' },
        { start: 2.5, end: 6.0, speakerId: 2, speaker: 'Speaker 2' },
      ];

      const result = segmentsCleanup(input, { minSegment: 0.5, minSilence: 0.5 });
      expect(result.length).toBe(2);

      expect(result[0].speakerId).toBe(1);
      expect(result[0].start).toBe(0.0);
      expect(result[0].end).toBe(4.0); // Not truncated at 3.25!

      expect(result[1].speakerId).toBe(2);
      expect(result[1].start).toBe(2.5); // Not truncated at 3.25!
      expect(result[1].end).toBe(6.0);
    });

    it('tidies each speaker independently while preserving cross-speaker structure', () => {
      // Speaker 1 has two close turns that should merge
      // Speaker 2 interjects during the silence
      const input = [
        { start: 1.0, end: 3.0, speakerId: 1, text: 'Hello' },
        { start: 2.5, end: 4.5, speakerId: 2, text: 'Hi there' },
        { start: 3.3, end: 5.5, speakerId: 1, text: 'how are you?' },
      ];

      // For Speaker 1: [1.0, 3.0] and [3.3, 5.5] have gap 0.3s < minSilence 0.5s -> merges into [1.0, 5.5]
      // For Speaker 2: [2.5, 4.5] is kept intact
      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(2);

      const spk1 = result.find(s => s.speakerId === 1);
      const spk2 = result.find(s => s.speakerId === 2);

      expect(spk1).toBeDefined();
      expect(spk1.start).toBe(1.0);
      expect(spk1.end).toBe(5.5);
      expect(spk1.text).toBe('Hello how are you?');

      expect(spk2).toBeDefined();
      expect(spk2.start).toBe(2.5);
      expect(spk2.end).toBe(4.5);
      expect(spk2.text).toBe('Hi there');
    });

    it('merges multiple micro-turns of the same speaker across cross-talk', () => {
      const input = [
        { start: 0.0, end: 10.0, speakerId: 1 },
        { start: 2.0, end: 2.4, speakerId: 2 }, // 0.4s
        { start: 2.6, end: 3.1, speakerId: 2 }, // 0.5s (gap 0.2s < 0.5s -> merges with previous to 1.1s!)
      ];

      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(2);

      const spk1 = result.find(s => s.speakerId === 1);
      const spk2 = result.find(s => s.speakerId === 2);

      expect(spk1.start).toBe(0.0);
      expect(spk1.end).toBe(10.0);

      expect(spk2.start).toBe(2.0);
      expect(spk2.end).toBe(3.1);
      expect(spk2.duration).toBe(1.1);
    });

    it('sorts all output segments chronologically and indexes sequentially 1..N', () => {
      const input = [
        { start: 5.0, end: 8.0, speakerId: 2 },
        { start: 1.0, end: 3.0, speakerId: 1 },
        { start: 2.0, end: 4.0, speakerId: 2 },
      ];

      const result = segmentsCleanup(input, { minSegment: 0.5, minSilence: 0.5 });
      expect(result.length).toBe(3);

      expect(result[0].id).toBe(1);
      expect(result[0].start).toBe(1.0);
      expect(result[0].speakerId).toBe(1);

      expect(result[1].id).toBe(2);
      expect(result[1].start).toBe(2.0);
      expect(result[1].speakerId).toBe(2);

      expect(result[2].id).toBe(3);
      expect(result[2].start).toBe(5.0);
      expect(result[2].speakerId).toBe(2);
    });

    it('preserves word-level timestamp arrays when merging same-speaker segments', () => {
      const input = [
        {
          start: 1.0,
          end: 2.0,
          speakerId: 1,
          text: 'Good',
          words: [{ word: 'Good', start: 1.1, end: 1.9 }],
        },
        {
          start: 2.2,
          end: 3.2,
          speakerId: 1,
          text: 'morning',
          words: [{ word: 'morning', start: 2.3, end: 3.1 }],
        },
      ];

      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(1);
      expect(result[0].text).toBe('Good morning');
      expect(result[0].words.length).toBe(2);
      expect(result[0].words[0].word).toBe('Good');
      expect(result[0].words[1].word).toBe('morning');
    });
  });

  describe('Input Normalization and Edge Cases', () => {
    it('returns empty array for empty or null inputs', () => {
      expect(segmentsCleanup([])).toEqual([]);
      expect(segmentsCleanup(null)).toEqual([]);
      expect(segmentsCleanup(undefined)).toEqual([]);
    });

    it('supports array tuples [start, end, speaker]', () => {
      const input = [
        [1.0, 3.0, 'Speaker 2'],
        [3.2, 5.0, 'Speaker 2'],
      ];

      const result = segmentsCleanup(input, { minSilence: 0.5, minSegment: 0.5 });
      expect(result.length).toBe(1);
      expect(result[0].speakerId).toBe(2);
      expect(result[0].speaker).toBe('Speaker 2');
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(5.0);
    });

    it('preserves custom speaker names and handles non-sequential speaker IDs', () => {
      const input = [
        { start: 1.0, end: 3.0, speakerId: 4, speaker: 'Linguist Interviewer' },
        { start: 2.0, end: 4.0, speakerId: 5, speaker: 'Informant' },
      ];

      const result = segmentsCleanup(input, { minSegment: 0.5 });
      expect(result.length).toBe(2);
      expect(result[0].speaker).toBe('Linguist Interviewer');
      expect(result[0].speakerId).toBe(4);
      expect(result[1].speaker).toBe('Informant');
      expect(result[1].speakerId).toBe(5);
    });
  });
});

