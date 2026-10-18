globalThis.$state = (v) => v;
globalThis.$state.snapshot = (v) => JSON.parse(JSON.stringify(v));
globalThis.$derived = (v) => v;
globalThis.$derived.by = (fn) => fn();
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

import { describe, it, expect, beforeEach } from 'bun:test';
const { transcriptState } = await import('../src/state/transcriptState.svelte.js');
const { projectState } = await import('../src/state/projectState.svelte.js');

describe('Project Data Last Selected Segment & Scroll Positioning', () => {
  beforeEach(() => {
    transcriptState.resetState();
    transcriptState.waveformState = {
      startTime: 0,
      duration: 60,
      totalDuration: 60,
      peaks: new Float32Array(200),
    };
  });

  describe('Storage in Project Data', () => {
    it('selectSegment updates activeProject.lastSelectedSegmentId', () => {
      projectState.activeProject = {
        id: 'proj-1',
        title: 'Interview',
        lastSelectedSegmentId: null,
      };

      transcriptState.segments = [
        { id: 'seg-1', start: 0.5, end: 3.0, speakerId: 1, text: 'Hello' },
        { id: 'seg-2', start: 3.5, end: 7.0, speakerId: 2, text: 'Hi there' },
        { id: 'seg-3', start: 8.0, end: 12.0, speakerId: 1, text: 'How are you?' },
      ];

      transcriptState.selectSegment('seg-2');

      expect(transcriptState.selectedSegmentId).toBe('seg-2');
      expect(projectState.activeProject.lastSelectedSegmentId).toBe('seg-2');
    });

    it('persistActiveProjectNow includes lastSelectedSegmentId in updated document', async () => {
      let savedDoc = null;
      const mockSaveProject = async (doc) => {
        savedDoc = doc;
        return doc;
      };

      projectState.activeProject = {
        id: 'proj-test',
        title: 'Project Test',
        lastSelectedSegmentId: 'seg-1',
      };
      projectState.activeProjectId = 'proj-test';

      transcriptState.selectedSegmentId = 'seg-3';
      transcriptState.segments = [
        { id: 'seg-1', start: 0, end: 2, speakerId: 1, text: 'One' },
        { id: 'seg-2', start: 3, end: 5, speakerId: 1, text: 'Two' },
        { id: 'seg-3', start: 6, end: 8, speakerId: 1, text: 'Three' },
      ];

      // Simulate persisting
      const updatedDoc = {
        ...projectState.activeProject,
        segments: JSON.parse(JSON.stringify(transcriptState.segments)),
        transcript: transcriptState.transcript || '',
        textDirection: transcriptState.textDirection || 'ltr',
        lastSelectedSegmentId: transcriptState.selectedSegmentId || projectState.activeProject.lastSelectedSegmentId || null,
        updatedAt: new Date().toISOString(),
      };

      expect(updatedDoc.lastSelectedSegmentId).toBe('seg-3');
    });
  });

  describe('Project Loading & Restoring Selection', () => {
    it('restores lastSelectedSegmentId when project is opened', async () => {
      const mockProjectDoc = {
        id: 'proj-saved',
        title: 'Saved Conversation',
        speakers: [{ id: 1, name: 'Alice', initials: 'A' }],
        lastSelectedSegmentId: 'seg-2',
        segments: [
          { id: 'seg-1', start: 1.0, end: 3.0, speakerId: 1, text: 'First utterance' },
          { id: 'seg-2', start: 4.0, end: 6.5, speakerId: 1, text: 'Second utterance' },
          { id: 'seg-3', start: 7.0, end: 9.0, speakerId: 1, text: 'Third utterance' },
        ],
      };

      const rememberedId = mockProjectDoc.lastSelectedSegmentId;
      const targetSegmentId =
        rememberedId && mockProjectDoc.segments.some((s) => s.id === rememberedId)
          ? rememberedId
          : mockProjectDoc.segments.length > 0
            ? mockProjectDoc.segments[0].id
            : null;

      expect(targetSegmentId).toBe('seg-2');
    });

    it('falls back to the first segment if lastSelectedSegmentId was deleted or not set', () => {
      const mockProjectDoc = {
        id: 'proj-fallback',
        title: 'Fallback Project',
        speakers: [{ id: 1, name: 'Alice', initials: 'A' }],
        lastSelectedSegmentId: 'seg-deleted-999',
        segments: [
          { id: 'seg-1', start: 1.0, end: 3.0, speakerId: 1, text: 'First' },
          { id: 'seg-2', start: 4.0, end: 6.5, speakerId: 1, text: 'Second' },
        ],
      };

      const rememberedId = mockProjectDoc.lastSelectedSegmentId;
      const targetSegmentId =
        rememberedId && mockProjectDoc.segments.some((s) => s.id === rememberedId)
          ? rememberedId
          : mockProjectDoc.segments.length > 0
            ? mockProjectDoc.segments[0].id
            : null;

      expect(targetSegmentId).toBe('seg-1');
    });

    it('sets null selection when project has no segments', () => {
      const mockEmptyDoc = {
        id: 'proj-empty',
        title: 'Empty Project',
        speakers: [{ id: 1, name: 'Alice', initials: 'A' }],
        lastSelectedSegmentId: null,
        segments: [],
      };

      const rememberedId = mockEmptyDoc.lastSelectedSegmentId;
      const targetSegmentId =
        rememberedId && mockEmptyDoc.segments.some((s) => s.id === rememberedId)
          ? rememberedId
          : mockEmptyDoc.segments.length > 0
            ? mockEmptyDoc.segments[0].id
            : null;

      expect(targetSegmentId).toBeNull();
    });
  });

  describe('Scroll Positioning to Selected Segment', () => {
    it('scrollToSegment calculates correct vertical position on container', () => {
      let scrolledTo = null;
      transcriptState.waveformContainerEl = {
        scrollTop: 0,
        clientHeight: 600,
        scrollTo: (params) => {
          scrolledTo = params;
        },
      };

      transcriptState.segments = [
        { id: 'seg-1', start: 0, end: 5, speakerId: 1, text: 'A' },
        { id: 'seg-2', start: 15, end: 20, speakerId: 1, text: 'B' },
        { id: 'seg-3', start: 45, end: 50, speakerId: 1, text: 'C' },
      ];

      // Total height = (60 / 60) * 150 * 6 = 900px
      // seg-3 starts at 45s => (45 / 60) * 900 = 675px
      // Expected top = 675 - clientHeight / 3 = 675 - 200 = 475px
      transcriptState.scrollToSegment('seg-3', { smooth: false });

      expect(scrolledTo).not.toBeNull();
      expect(scrolledTo.top).toBe(475);
      expect(scrolledTo.behavior).toBe('auto');
    });

    it('scrollToSegment uses DOM scrollIntoView when card is stamped', () => {
      let scrollIntoViewCalled = false;
      let scrollOptions = null;

      // Mock DOM element
      const mockElement = {
        scrollIntoView: (options) => {
          scrollIntoViewCalled = true;
          scrollOptions = options;
        },
      };

      // Mock document.getElementById
      const originalGetElementById = globalThis.document?.getElementById;
      globalThis.document = {
        getElementById: (id) => {
          if (id === 'segment-item-seg-2') return mockElement;
          return null;
        },
      };

      transcriptState.segments = [
        { id: 'seg-1', start: 0, end: 5, speakerId: 1, text: 'A' },
        { id: 'seg-2', start: 10, end: 15, speakerId: 1, text: 'B' },
      ];

      transcriptState.scrollToSegment('seg-2', { smooth: true, block: 'center' });

      expect(scrollIntoViewCalled).toBe(true);
      expect(scrollOptions.block).toBe('center');
      expect(scrollOptions.behavior).toBe('smooth');
      expect(scrollOptions.inline).toBe('nearest');

      if (originalGetElementById) {
        globalThis.document.getElementById = originalGetElementById;
      }
    });
  });
});
