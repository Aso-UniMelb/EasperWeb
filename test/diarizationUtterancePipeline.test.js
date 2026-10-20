import { describe, it, expect } from 'bun:test';
import {
  calculateAudioRms,
  prepareUtteranceChunks,
  reconcileUtteranceSegments,
  diarizeUtterances,
  l2Normalize,
} from '../src/utils/diarization.js';

describe('Utterance-Level Diarization Pipeline', () => {
  describe('calculateAudioRms', () => {
    it('returns 0 for empty or null audio', () => {
      expect(calculateAudioRms(null)).toBe(0);
      expect(calculateAudioRms([])).toBe(0);
    });

    it('computes RMS energy correctly for DC and sine-like signals', () => {
      const dc = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      expect(calculateAudioRms(dc)).toBeCloseTo(0.5, 5);

      const silence = new Float32Array([0.0001, -0.0001, 0, 0]);
      expect(calculateAudioRms(silence)).toBeLessThan(0.001);
    });
  });

  describe('prepareUtteranceChunks', () => {
    it('keeps normal utterances (<= 6.0s) as single chunks for stable embedding', () => {
      const segments = [
        { id: 'seg-1', start: 1.0, end: 3.5, text: 'Hello world' },
        { id: 'seg-2', start: 4.0, end: 7.2, text: 'This is speaker two' },
      ];

      const chunks = prepareUtteranceChunks(segments, { maxChunkDuration: 6.0 });
      expect(chunks.length).toBe(2);
      expect(chunks[0].isSubChunk).toBe(false);
      expect(chunks[0].duration).toBeCloseTo(2.5, 2);
      expect(chunks[0].segIdx).toBe(0);
      expect(chunks[1].isSubChunk).toBe(false);
      expect(chunks[1].duration).toBeCloseTo(3.2, 2);
      expect(chunks[1].segIdx).toBe(1);
    });

    it('slices long utterances (> 6.0s) into sub-chunks for turn-taking detection', () => {
      const segments = [
        { id: 'seg-1', start: 0.0, end: 9.0, text: 'Long dialogue with possible turn' },
      ];

      const chunks = prepareUtteranceChunks(segments, {
        maxChunkDuration: 6.0,
        subChunkDuration: 3.0,
      });

      // 9.0s should produce 3 sub-chunks of ~3.0s each
      expect(chunks.length).toBe(3);
      expect(chunks[0].isSubChunk).toBe(true);
      expect(chunks[0].start).toBe(0.0);
      expect(chunks[0].end).toBe(3.0);
      expect(chunks[1].start).toBe(3.0);
      expect(chunks[1].end).toBe(6.0);
      expect(chunks[2].start).toBe(6.0);
      expect(chunks[2].end).toBe(9.0);
    });
  });

  describe('reconcileUtteranceSegments', () => {
    it('keeps segment intact when sub-chunks share the same cluster', () => {
      const segments = [
        { id: 'seg-1', start: 0.0, end: 9.0, text: 'All one speaker here across 9s' },
      ];
      const chunks = [
        { start: 0, end: 3, segIdx: 0 },
        { start: 3, end: 6, segIdx: 0 },
        { start: 6, end: 9, segIdx: 0 },
      ];
      // All 3 chunks classified as cluster 0
      const labels = [0, 0, 0];

      const result = reconcileUtteranceSegments(chunks, labels, segments);
      expect(result.length).toBe(1);
      expect(result[0].start).toBe(0.0);
      expect(result[0].end).toBe(9.0);
      expect(result[0].cluster).toBe(0);
    });

    it('splits segment when sub-chunks have different clusters (turn detection)', () => {
      const segments = [
        { id: 'seg-1', start: 0.0, end: 6.0, text: 'Speaker one talking. Speaker two replies.' },
      ];
      const chunks = [
        { start: 0, end: 3, segIdx: 0 },
        { start: 3, end: 6, segIdx: 0 },
      ];
      // Chunk 0 is cluster 0, chunk 1 is cluster 1
      const labels = [0, 1];

      const result = reconcileUtteranceSegments(chunks, labels, segments);
      expect(result.length).toBe(2);
      expect(result[0].start).toBe(0.0);
      expect(result[0].end).toBe(3.0);
      expect(result[0].cluster).toBe(0);

      expect(result[1].start).toBe(3.0);
      expect(result[1].end).toBe(6.0);
      expect(result[1].cluster).toBe(1);
    });
  });

  describe('diarizeUtterances end-to-end', () => {
    it('accurately clusters and assigns speakers to speech turns', () => {
      const segments = [
        { id: 'seg-1', start: 0.0, end: 3.0, text: 'Alice utterance 1' },
        { id: 'seg-2', start: 4.0, end: 7.0, text: 'Bob utterance 1' },
        { id: 'seg-3', start: 8.0, end: 11.0, text: 'Alice utterance 2' },
      ];

      const chunks = prepareUtteranceChunks(segments);

      // Create synthetic embeddings: Alice (dim 0 high), Bob (dim 1 high)
      const embAlice1 = new Float32Array(512);
      embAlice1[0] = 1.0;
      const embBob1 = new Float32Array(512);
      embBob1[1] = 1.0;
      const embAlice2 = new Float32Array(512);
      embAlice2[0] = 0.95;
      embAlice2[2] = 0.05;

      const embeddings = [
        l2Normalize(embAlice1),
        l2Normalize(embBob1),
        l2Normalize(embAlice2),
      ];

      const projectSpeakers = [
        { id: 1, name: 'Alice', initials: 'A' },
        { id: 2, name: 'Bob', initials: 'B' },
      ];

      const result = diarizeUtterances({
        chunks,
        chunkEmbeddings: embeddings,
        originalSegments: segments,
        speakerCount: 2,
        projectSpeakers,
      });

      expect(result.length).toBe(3);
      // Segment 1 and Segment 3 should share Speaker 1 (Alice)
      expect(result[0].speakerId).toBe(1);
      expect(result[0].speaker).toBe('Alice');
      expect(result[2].speakerId).toBe(1);
      expect(result[2].speaker).toBe('Alice');

      // Segment 2 should be Speaker 2 (Bob)
      expect(result[1].speakerId).toBe(2);
      expect(result[1].speaker).toBe('Bob');
    });
  });
});

