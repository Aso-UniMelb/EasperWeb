import { describe, it, expect } from 'bun:test';
import {
  getSegmentSpeakerId,
  isSameSpeaker,
  resolveSameSpeakerOverlaps,
  adjustSameSpeakerBoundariesOnDrag,
  calculateSegmentSplit,
  getWaveformPillarLayout,
  calculateSidebarColWidth,
  calculateStaggeredSegmentPositions,
  sortSegmentsChronologically,
} from '../src/utils/speakers.js';

describe('Same-Speaker Overlap Prevention Rules', () => {
  describe('getSegmentSpeakerId & isSameSpeaker', () => {
    it('extracts speakerId accurately from various representations', () => {
      expect(getSegmentSpeakerId({ speakerId: 1 })).toBe(1);
      expect(getSegmentSpeakerId({ speakerId: '2' })).toBe(2);
      expect(getSegmentSpeakerId({ speaker: 'Speaker 3' })).toBe(3);
      expect(getSegmentSpeakerId({ speaker: 'spk_4' })).toBe(4);
      expect(getSegmentSpeakerId({ speaker: 'Speaker 5' })).toBe(5);
      expect(getSegmentSpeakerId({})).toBe(1);
    });

    it('identifies segments of the same speaker', () => {
      expect(isSameSpeaker({ speakerId: 1 }, { speakerId: 1 })).toBe(true);
      expect(isSameSpeaker({ speakerId: 1 }, { speakerId: 2 })).toBe(false);
      expect(isSameSpeaker({ speaker: 'Speaker 1' }, { speakerId: 1 })).toBe(true);
      expect(isSameSpeaker({ speaker: 'Alice' }, { speaker: 'alice' })).toBe(true);
      expect(isSameSpeaker({ speaker: 'Alice' }, { speaker: 'Bob' })).toBe(false);
    });
  });

  describe('adjustSameSpeakerBoundariesOnDrag - start boundary modification', () => {
    it('pushes back the ending boundary of the previous segment of the same speaker when new start is smaller', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 6.0, end: 9.0, duration: 3.0 };
      const segments = [segA, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 4.2,
        startTime: 0,
        duration: 20,
      });

      expect(result.selectedSeg.start).toBe(4.2);
      expect(result.selectedSeg.duration).toBe(4.8);
      // segA was ending at 5.0; since 4.2 < 5.0, segA's end is pushed back to 4.2
      expect(result.prevSeg.id).toBe('seg-1');
      expect(result.prevSeg.end).toBe(4.2);
      expect(result.prevSeg.duration).toBe(2.2);
      // No overlap: segA ends at 4.2, segB starts at 4.2
      expect(segA.end).toBeLessThanOrEqual(segB.start);
    });

    it('does not modify previous segment when new start is greater than or equal to previous end time', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 7.0, end: 10.0, duration: 3.0 };
      const segments = [segA, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 5.8,
        startTime: 0,
        duration: 20,
      });

      expect(result.selectedSeg.start).toBe(5.8);
      // segA end remains 5.0
      expect(result.prevSeg.end).toBe(5.0);
      expect(result.prevSeg.duration).toBe(3.0);
    });

    it('smoothly restores previous segment ending boundary if user drags back during the same drag gesture', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 6.0, end: 9.0, duration: 3.0 };
      const segments = [segA, segB];

      const boundaryDragState = {
        segmentId: 'seg-2',
        handle: 'start',
        initialStart: 6.0,
        initialEnd: 9.0,
        prevSegId: 'seg-1',
        initialPrevEnd: 5.0,
        initialPrevStart: 2.0,
      };

      // Drag earlier to 4.0 -> pushes back to 4.0
      adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 4.0,
        startTime: 0,
        duration: 20,
        boundaryDragState,
      });
      expect(segA.end).toBe(4.0);

      // Drag back to 4.8 -> pushes back only to 4.8
      adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 4.8,
        startTime: 0,
        duration: 20,
        boundaryDragState,
      });
      expect(segA.end).toBe(4.8);

      // Drag back to 5.5 -> restored to initial baseline 5.0
      adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 5.5,
        startTime: 0,
        duration: 20,
        boundaryDragState,
      });
      expect(segA.end).toBe(5.0);
    });

    it('preserves intervening segments of different speakers and pushes back only the preceding segment of the same speaker', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segOther = { id: 'seg-other', speakerId: 2, start: 3.5, end: 6.5, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 7.0, end: 10.0, duration: 3.0 };
      const segments = [segA, segOther, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 4.5,
        startTime: 0,
        duration: 20,
      });

      expect(result.selectedSeg.start).toBe(4.5);
      // Preceding segment of the SAME speaker is segA, not segOther
      expect(result.prevSeg.id).toBe('seg-1');
      expect(segA.end).toBe(4.5);
      // segOther (Speaker 2) is untouched
      expect(segOther.start).toBe(3.5);
      expect(segOther.end).toBe(6.5);
    });

    it('enforces minimum duration limit and does not allow dragging start past previous segment start + 0.1s', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 6.0, end: 9.0, duration: 3.0 };
      const segments = [segA, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-2',
        handle: 'start',
        time: 1.0, // Attempt to drag before segA.start
        startTime: 0,
        duration: 20,
      });

      // Clamped to segA.start + 0.1 = 2.1
      expect(result.selectedSeg.start).toBe(2.1);
      expect(segA.end).toBe(2.1);
      expect(segA.duration).toBe(0.1);
    });
  });

  describe('adjustSameSpeakerBoundariesOnDrag - end boundary modification', () => {
    it('pushes forward the starting boundary of the succeeding segment of the same speaker when new end is greater', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 6.0, end: 9.0, duration: 3.0 };
      const segments = [segA, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-1',
        handle: 'end',
        time: 6.8,
        startTime: 0,
        duration: 20,
      });

      expect(result.selectedSeg.end).toBe(6.8);
      expect(result.nextSeg.id).toBe('seg-2');
      // segB was starting at 6.0; since 6.8 > 6.0, segB's start is pushed forward to 6.8
      expect(result.nextSeg.start).toBe(6.8);
      expect(result.nextSeg.duration).toBe(2.2);
      expect(segA.end).toBeLessThanOrEqual(segB.start);
    });

    it('enforces minimum duration limit and does not allow dragging end past next segment end - 0.1s', () => {
      const segA = { id: 'seg-1', speakerId: 1, start: 2.0, end: 5.0, duration: 3.0 };
      const segB = { id: 'seg-2', speakerId: 1, start: 6.0, end: 9.0, duration: 3.0 };
      const segments = [segA, segB];

      const result = adjustSameSpeakerBoundariesOnDrag({
        segments,
        selectedSegId: 'seg-1',
        handle: 'end',
        time: 9.5, // Attempt to drag past segB.end
        startTime: 0,
        duration: 20,
      });

      // Clamped to segB.end - 0.1 = 8.9
      expect(result.selectedSeg.end).toBe(8.9);
      expect(segB.start).toBe(8.9);
      expect(segB.duration).toBe(0.1);
    });
  });

  describe('resolveSameSpeakerOverlaps', () => {
    it('resolves overlaps between segments of the same speaker by pushing back previous end boundary', () => {
      const segments = [
        { id: 's1', speakerId: 1, start: 1.0, end: 4.0, duration: 3.0 },
        { id: 's2', speakerId: 1, start: 3.0, end: 6.0, duration: 3.0 },
        { id: 's3', speakerId: 2, start: 2.0, end: 5.0, duration: 3.0 }, // Different speaker cross-talk
      ];

      resolveSameSpeakerOverlaps(segments);

      const s1 = segments.find((s) => s.id === 's1');
      const s2 = segments.find((s) => s.id === 's2');
      const s3 = segments.find((s) => s.id === 's3');

      // s1.end was 4.0, overlapping s2.start at 3.0 -> pushed back to 3.0
      expect(s1.end).toBe(3.0);
      expect(s1.duration).toBe(2.0);
      expect(s2.start).toBe(3.0);
      expect(s2.end).toBe(6.0);
      // Different speaker s3 is untouched
      expect(s3.start).toBe(2.0);
      expect(s3.end).toBe(5.0);
    });
  });

  describe('calculateSegmentSplit - split at specific time', () => {
    it('splits segment at the specified timestamp instead of the midpoint', () => {
      const seg = { id: 'seg-1', speakerId: 1, start: 2.0, end: 6.0, text: 'Hello world' };
      const splitTime = 3.5;

      const result = calculateSegmentSplit(seg, splitTime);
      expect(result).not.toBeNull();
      expect(result.splitPoint).toBe(3.5);
      expect(result.seg1.start).toBe(2.0);
      expect(result.seg1.end).toBe(3.5);
      expect(result.seg1.duration).toBe(1.5);
      expect(result.seg1.text).toBe('Hello world');

      expect(result.seg2.start).toBe(3.5);
      expect(result.seg2.end).toBe(6.0);
      expect(result.seg2.duration).toBe(2.5);
      expect(result.seg2.text).toBe('');
      expect(result.seg2.speakerId).toBe(1);
    });

    it('falls back to midpoint if splitTime is not provided', () => {
      const seg = { id: 'seg-1', speakerId: 1, start: 2.0, end: 6.0, text: 'Hello' };
      const result = calculateSegmentSplit(seg);
      expect(result).not.toBeNull();
      expect(result.splitPoint).toBe(4.0);
      expect(result.seg1.end).toBe(4.0);
      expect(result.seg2.start).toBe(4.0);
    });

    it('clamps split point near edges to maintain minimum duration of 0.05s', () => {
      const seg = { id: 'seg-1', speakerId: 1, start: 2.0, end: 6.0 };
      // Request split at 2.01s (too close to start)
      const resultLow = calculateSegmentSplit(seg, 2.01);
      expect(resultLow.splitPoint).toBe(2.05);
      expect(resultLow.seg1.duration).toBe(0.05);

      // Request split at 5.99s (too close to end)
      const resultHigh = calculateSegmentSplit(seg, 5.99);
      expect(resultHigh.splitPoint).toBe(5.95);
      expect(resultHigh.seg2.duration).toBe(0.05);
    });

    it('returns null for segments shorter than minimum splittable duration', () => {
      const seg = { id: 'seg-short', speakerId: 1, start: 2.0, end: 2.08 };
      expect(calculateSegmentSplit(seg, 2.04)).toBeNull();
    });
  });

  describe('Speaker Pillar Layout and Responsive Sidebar Width', () => {
    it('calculateSidebarColWidth produces responsive widths for 1 to 5 speakers', () => {
      // 1 speaker
      expect(calculateSidebarColWidth([{ id: 1, name: 'S1' }])).toBe(146);
      // 2 speakers
      expect(
        calculateSidebarColWidth([
          { id: 1, name: 'S1' },
          { id: 2, name: 'S2' },
        ]),
      ).toBe(166);
      // 3 speakers
      expect(
        calculateSidebarColWidth([
          { id: 1, name: 'S1' },
          { id: 2, name: 'S2' },
          { id: 3, name: 'S3' },
        ]),
      ).toBe(186);
      // Fallback with empty array
      expect(calculateSidebarColWidth([])).toBe(146);
    });

    it('getWaveformPillarLayout calculates correct ruler, waveform, and pillar coordinates for 3 overlapping speakers', () => {
      const speakers = [
        { id: 1, name: 'Alice', initials: 'AL' },
        { id: 2, name: 'Bob', initials: 'BO' },
        { id: 3, name: 'Charlie', initials: 'CH' },
      ];
      const totalWidth = 186;
      const layout = getWaveformPillarLayout(totalWidth, speakers);

      expect(layout.rulerWidth).toBe(38);
      expect(layout.waveLeft).toBe(38);
      expect(layout.pillars.length).toBe(3);

      // Verify pillars are placed adjacent to each other without horizontal collision
      const [p1, p2, p3] = layout.pillars;
      expect(p1.speakerId).toBe(1);
      expect(p2.speakerId).toBe(2);
      expect(p3.speakerId).toBe(3);

      expect(p1.left).toBe(layout.waveRight);
      expect(p1.right).toBe(p2.left);
      expect(p2.right).toBe(p3.left);
      expect(p3.right).toBeLessThanOrEqual(totalWidth);

      // Verify waveform track remains visible and distinct
      expect(layout.waveWidth).toBeGreaterThanOrEqual(60);
      expect(layout.waveRight).toBe(layout.waveLeft + layout.waveWidth);
    });

    it('enables collision-free hit testing for 3 simultaneous overlapping segments', () => {
      const speakers = [
        { id: 1, name: 'Speaker 1' },
        { id: 2, name: 'Speaker 2' },
        { id: 3, name: 'Speaker 3' },
      ];
      const totalWidth = 186;
      const layout = getWaveformPillarLayout(totalWidth, speakers);

      // 3 distinct speakers speaking simultaneously between 10.0s and 15.0s
      const seg1 = { id: 's1', speakerId: 1, start: 10.0, end: 15.0 };
      const seg2 = { id: 's2', speakerId: 2, start: 10.0, end: 15.0 };
      const seg3 = { id: 's3', speakerId: 3, start: 10.0, end: 15.0 };
      const segments = [seg1, seg2, seg3];

      const startTime = 0;
      const duration = 20;
      const totalHeight = 1000;
      const yStart = (10.0 / duration) * totalHeight; // 500px

      // Target Speaker 2's pillar horizontally
      const p2 = layout.pillars[1];
      const clickXInPillar2 = p2.left + p2.width / 2;
      const clickY = yStart; // Exactly at the start boundary

      // Find pillar under pointer
      const matchedPillar = layout.pillars.find(
        (p) => clickXInPillar2 >= p.left - 2 && clickXInPillar2 <= p.right + 2,
      );
      expect(matchedPillar).toBeDefined();
      expect(matchedPillar.speakerId).toBe(2);

      // Find matching segment in this pillar
      const segInPillar = segments.find(
        (s) => (Number(s.speakerId) || 1) === matchedPillar.speakerId,
      );
      expect(segInPillar.id).toBe('s2');

      // Boundary handle hit testing resolves cleanly to Speaker 2's segment handle
      const segYStart = ((segInPillar.start - startTime) / duration) * totalHeight;
      const isStartHit = Math.abs(clickY - segYStart) <= 10;
      expect(isStartHit).toBe(true);
    });
  });

  describe('Solution 2: Vertical Waterfall Staggering for Overlapping Segments', () => {
    it('sortSegmentsChronologically sorts by start time and breaks ties by speakerId', () => {
      const segs = [
        { id: 'c', speakerId: 2, start: 5.0 },
        { id: 'b', speakerId: 1, start: 5.0 },
        { id: 'a', speakerId: 1, start: 1.0 },
      ];
      const sorted = sortSegmentsChronologically(segs);
      expect(sorted[0].id).toBe('a');
      expect(sorted[1].id).toBe('b'); // S1 starts at 5.0
      expect(sorted[2].id).toBe('c'); // S2 starts at 5.0
    });

    it('places non-overlapping segments at their exact timeline trueTop', () => {
      const segments = [
        { id: 'seg-1', speakerId: 1, start: 2.0, end: 4.0 },
        { id: 'seg-2', speakerId: 2, start: 10.0, end: 12.0 },
      ];
      const positions = calculateStaggeredSegmentPositions(segments, {
        startTime: 0,
        duration: 20,
        totalHeight: 2000, // 100px per second
        defaultCardHeight: 48,
        gap: 6,
      });

      // Seg 1 at 2.0s -> 200px
      expect(positions['seg-1'].trueTop).toBe(200);
      expect(positions['seg-1'].top).toBe(200);
      expect(positions['seg-1'].isPushed).toBe(false);
      expect(positions['seg-1'].offset).toBe(0);

      // Seg 2 at 10.0s -> 1000px (far after 200 + 48 = 248px)
      expect(positions['seg-2'].trueTop).toBe(1000);
      expect(positions['seg-2'].top).toBe(1000);
      expect(positions['seg-2'].isPushed).toBe(false);
      expect(positions['seg-2'].offset).toBe(0);
    });

    it('staggers 2 overlapping segments starting at the exact same timestamp without covering each other', () => {
      const segments = [
        { id: 'seg-1', speakerId: 1, start: 5.0, end: 8.0 },
        { id: 'seg-2', speakerId: 2, start: 5.0, end: 8.0 },
      ];
      const positions = calculateStaggeredSegmentPositions(segments, {
        startTime: 0,
        duration: 20,
        totalHeight: 2000, // 100px per sec -> 5.0s = 500px
        defaultCardHeight: 50,
        gap: 6,
      });

      // Seg 1 sits at true timeline level 500px
      expect(positions['seg-1'].trueTop).toBe(500);
      expect(positions['seg-1'].top).toBe(500);
      expect(positions['seg-1'].isPushed).toBe(false);
      expect(positions['seg-1'].offset).toBe(0);

      // Seg 2 is pushed immediately below Seg 1: 500 + 50 (card height) + 6 (gap) = 556px
      expect(positions['seg-2'].trueTop).toBe(500);
      expect(positions['seg-2'].top).toBe(556);
      expect(positions['seg-2'].isPushed).toBe(true);
      expect(positions['seg-2'].offset).toBe(56);

      // Verify Seg 1 and Seg 2 do not collide or cover each other
      const seg1Bottom = positions['seg-1'].top + positions['seg-1'].cardH;
      expect(positions['seg-2'].top).toBeGreaterThanOrEqual(seg1Bottom + 6);
    });

    it('handles 3 simultaneous overlapping speakers with waterfall push-down', () => {
      const segments = [
        { id: 'seg-1', speakerId: 1, start: 5.0, end: 9.0 },
        { id: 'seg-2', speakerId: 2, start: 5.0, end: 9.0 },
        { id: 'seg-3', speakerId: 3, start: 5.1, end: 9.0 },
        { id: 'seg-4', speakerId: 1, start: 12.0, end: 15.0 },
      ];
      const positions = calculateStaggeredSegmentPositions(segments, {
        startTime: 0,
        duration: 20,
        totalHeight: 2000,
        defaultCardHeight: 50,
        gap: 6,
      });

      // Seg 1 at 500px
      expect(positions['seg-1'].top).toBe(500);
      expect(positions['seg-1'].isPushed).toBe(false);

      // Seg 2 pushed to 556px
      expect(positions['seg-2'].top).toBe(556);
      expect(positions['seg-2'].isPushed).toBe(true);

      // Seg 3 pushed to 556 + 50 + 6 = 612px
      expect(positions['seg-3'].top).toBe(612);
      expect(positions['seg-3'].isPushed).toBe(true);
      expect(positions['seg-3'].offset).toBe(612 - 510); // 102px offset from 5.1s (510px)

      // Seg 4 at 12.0s (1200px) is far below 612 + 50 = 662px, so it returns to its true timeline position
      expect(positions['seg-4'].trueTop).toBe(1200);
      expect(positions['seg-4'].top).toBe(1200);
      expect(positions['seg-4'].isPushed).toBe(false);
      expect(positions['seg-4'].offset).toBe(0);
    });

    it('respects dynamic measured card heights', () => {
      const segments = [
        { id: 'seg-1', speakerId: 1, start: 4.0, end: 7.0 },
        { id: 'seg-2', speakerId: 2, start: 4.0, end: 7.0 },
      ];
      // Seg 1 has multiline translation text and measured height is 80px
      const cardHeights = {
        'seg-1': 80,
        'seg-2': 50,
      };
      const positions = calculateStaggeredSegmentPositions(segments, {
        startTime: 0,
        duration: 10,
        totalHeight: 1000, // 4.0s = 400px
        cardHeights,
        defaultCardHeight: 48,
        gap: 8,
      });

      expect(positions['seg-1'].cardH).toBe(80);
      expect(positions['seg-1'].top).toBe(400);

      // Seg 2 pushed below 80px card: 400 + 80 + 8 = 488px
      expect(positions['seg-2'].top).toBe(488);
      expect(positions['seg-2'].cardH).toBe(50);
      expect(positions['seg-2'].isPushed).toBe(true);
    });
  });
});
