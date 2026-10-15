globalThis.$state = (v) => v;
globalThis.$state.snapshot = (v) => JSON.parse(JSON.stringify(v));
globalThis.$derived = (v) => v;
globalThis.$derived.by = (fn) => fn();
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

import { describe, it, expect, beforeEach } from 'bun:test';
const { transcriptState } = await import('../src/state/transcriptState.svelte.js');

describe('Segment Editing Undo / Redo Stack', () => {
  beforeEach(() => {
    transcriptState.resetState();
    transcriptState.clearUndoHistory();
    transcriptState.waveformState = {
      startTime: 0,
      duration: 30,
      totalDuration: 30,
      peaks: new Float32Array(100),
    };
  });

  describe('Stack Mechanics', () => {
    it('initializes with empty undo and redo stacks', () => {
      expect(transcriptState.canUndo).toBe(false);
      expect(transcriptState.canRedo).toBe(false);
      expect(transcriptState.undoActionName).toBe('');
      expect(transcriptState.redoActionName).toBe('');
    });

    it('pushUndo records prior state and enables canUndo', () => {
      transcriptState.segments = [
        { id: 'seg-1', start: 1.0, end: 4.0, speakerId: 1, text: 'Hello' },
      ];

      transcriptState.pushUndo('Test Action');

      expect(transcriptState.canUndo).toBe(true);
      expect(transcriptState.canRedo).toBe(false);
      expect(transcriptState.undoActionName).toBe('Test Action');
    });

    it('pushUndo invalidates any existing redo stack', () => {
      transcriptState.segments = [{ id: 'seg-1', start: 1.0, end: 4.0 }];
      transcriptState.pushUndo('Step 1');

      transcriptState.segments = [{ id: 'seg-1', start: 1.0, end: 6.0 }];
      transcriptState.pushUndo('Step 2');

      // Undo once -> redo stack has Step 2
      transcriptState.undo();
      expect(transcriptState.canRedo).toBe(true);

      // Perform a new operation -> redo stack must be cleared
      transcriptState.segments = [{ id: 'seg-1', start: 1.0, end: 8.0 }];
      transcriptState.pushUndo('Step 3');
      expect(transcriptState.canRedo).toBe(false);
    });

    it('caps undo stack to MAX_UNDO_STEPS (50)', () => {
      for (let i = 0; i < 60; i++) {
        transcriptState.segments = [{ id: `seg-${i}`, start: i, end: i + 1 }];
        transcriptState.pushUndo(`Action ${i}`);
      }

      expect(transcriptState.undoStack.length).toBe(50);
      expect(transcriptState.undoActionName).toBe('Action 59');
    });
  });

  describe('Segment Operations Undo / Redo', () => {
    it('undos and redos addNewSegment', () => {
      transcriptState.segments = [];

      const newSeg = transcriptState.addNewSegment(5.0, 3.0);
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.canUndo).toBe(true);
      expect(transcriptState.undoActionName).toBe('Add segment');

      // Undo addition
      const undone = transcriptState.undo();
      expect(undone).toBe(true);
      expect(transcriptState.segments.length).toBe(0);
      expect(transcriptState.canRedo).toBe(true);
      expect(transcriptState.redoActionName).toBe('Add segment');

      // Redo addition
      const redone = transcriptState.redo();
      expect(redone).toBe(true);
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].id).toBe(newSeg.id);
    });

    it('undos and redos deleteSegment', () => {
      const seg1 = { id: 'seg-1', start: 2.0, end: 5.0, speakerId: 1, text: 'Keep me' };
      const seg2 = { id: 'seg-2', start: 6.0, end: 9.0, speakerId: 2, text: 'Delete me' };
      transcriptState.segments = [seg1, seg2];

      transcriptState.deleteSegment('seg-2');
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].id).toBe('seg-1');
      expect(transcriptState.canUndo).toBe(true);
      expect(transcriptState.undoActionName).toBe('Delete segment');

      // Undo deletion
      transcriptState.undo();
      expect(transcriptState.segments.length).toBe(2);
      expect(transcriptState.segments.some((s) => s.id === 'seg-2')).toBe(true);

      // Redo deletion
      transcriptState.redo();
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].id).toBe('seg-1');
    });

    it('undos and redos assignSegmentSpeaker', () => {
      const seg = { id: 'seg-1', start: 2.0, end: 5.0, speakerId: 1, speaker: 'Speaker 1' };
      transcriptState.segments = [seg];

      transcriptState.assignSegmentSpeaker('seg-1', 2);
      expect(transcriptState.segments[0].speakerId).toBe(2);
      expect(transcriptState.canUndo).toBe(true);
      expect(transcriptState.undoActionName).toBe('Change speaker');

      // Undo speaker change
      transcriptState.undo();
      expect(transcriptState.segments[0].speakerId).toBe(1);

      // Redo speaker change
      transcriptState.redo();
      expect(transcriptState.segments[0].speakerId).toBe(2);
    });

    it('undos and redos splitSegment', () => {
      const seg = {
        id: 'seg-1',
        start: 2.0,
        end: 8.0,
        duration: 6.0,
        speakerId: 1,
        text: 'First half second half',
      };
      transcriptState.segments = [seg];

      const splitRes = transcriptState.splitSegment('seg-1', 5.0);
      expect(splitRes).not.toBeNull();
      expect(transcriptState.segments.length).toBe(2);
      expect(transcriptState.undoActionName).toBe('Split segment');

      // Undo split
      transcriptState.undo();
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].id).toBe('seg-1');
      expect(transcriptState.segments[0].start).toBe(2.0);
      expect(transcriptState.segments[0].end).toBe(8.0);

      // Redo split
      transcriptState.redo();
      expect(transcriptState.segments.length).toBe(2);
    });

    it('undos and redos mergeSegmentWithNext', () => {
      const seg1 = { id: 'seg-1', start: 2.0, end: 5.0, duration: 3.0, speakerId: 1, text: 'Hello' };
      const seg2 = { id: 'seg-2', start: 6.0, end: 9.0, duration: 3.0, speakerId: 1, text: 'World' };
      transcriptState.segments = [seg1, seg2];

      const merged = transcriptState.mergeSegmentWithNext('seg-1');
      expect(merged).not.toBeNull();
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].start).toBe(2.0);
      expect(transcriptState.segments[0].end).toBe(9.0);
      expect(transcriptState.undoActionName).toBe('Merge segment');

      // Undo merge
      transcriptState.undo();
      expect(transcriptState.segments.length).toBe(2);
      expect(transcriptState.segments[0].id).toBe('seg-1');
      expect(transcriptState.segments[0].end).toBe(5.0);
      expect(transcriptState.segments[1].id).toBe('seg-2');
      expect(transcriptState.segments[1].start).toBe(6.0);

      // Redo merge
      transcriptState.redo();
      expect(transcriptState.segments.length).toBe(1);
      expect(transcriptState.segments[0].end).toBe(9.0);
    });

    it('undos boundary modifications using prior gesture snapshot', () => {
      const seg = { id: 'seg-1', start: 2.0, end: 5.0, duration: 3.0, speakerId: 1 };
      transcriptState.segments = [seg];

      // Simulate pointerdown snapshot
      const snapshotBefore = JSON.parse(JSON.stringify(transcriptState.segments));

      // Simulate dragging start boundary to 1.0s
      transcriptState.segments[0].start = 1.0;
      transcriptState.segments[0].duration = 4.0;

      // Simulate pointerup commit
      transcriptState.pushUndo('Move boundary', snapshotBefore);

      expect(transcriptState.segments[0].start).toBe(1.0);
      expect(transcriptState.undoActionName).toBe('Move boundary');

      // Undo boundary move
      transcriptState.undo();
      expect(transcriptState.segments[0].start).toBe(2.0);
      expect(transcriptState.segments[0].duration).toBe(3.0);

      // Redo boundary move
      transcriptState.redo();
      expect(transcriptState.segments[0].start).toBe(1.0);
    });

    it('clearUndoHistory resets stacks', () => {
      transcriptState.segments = [{ id: 'seg-1', start: 1.0, end: 3.0 }];
      transcriptState.pushUndo('Action 1');
      transcriptState.undo();

      expect(transcriptState.canUndo).toBe(false);
      expect(transcriptState.canRedo).toBe(true);

      transcriptState.clearUndoHistory();
      expect(transcriptState.canUndo).toBe(false);
      expect(transcriptState.canRedo).toBe(false);
    });
  });
});
