import { describe, it, expect } from 'bun:test';
import { ensureDefaultSpeakers, SPEAKER_COLORS } from '../src/utils/speakers.js';

describe('ProjectSettingsModal Speaker Management', () => {
  function createAddSpeakerHandler(getSpeakers, setSpeakers, setErrorMessage) {
    return () => {
      setErrorMessage('');
      const speakers = getSpeakers();
      if (speakers.length >= 5) {
        setErrorMessage('Maximum of 5 speakers allowed per project.');
        return;
      }

      const existingIds = new Set(speakers.map((s) => Number(s.id)));
      let nextId = 1;
      while (nextId <= 5 && existingIds.has(nextId)) {
        nextId++;
      }

      if (nextId > 5) {
        setErrorMessage('Maximum of 5 speakers reached.');
        return;
      }

      setSpeakers(
        [
          ...speakers,
          {
            id: nextId,
            name: `Speaker ${nextId}`,
            initials: `S${nextId}`,
          },
        ].sort((a, b) => Number(a.id) - Number(b.id)),
      );
    };
  }

  function createRemoveSpeakerHandler(getSpeakers, setSpeakers, setErrorMessage) {
    return (idToRemove) => {
      setErrorMessage('');
      const speakers = getSpeakers();
      if (speakers.length <= 1) {
        setErrorMessage('A project must have at least one speaker.');
        return;
      }
      setSpeakers(speakers.filter((s) => Number(s.id) !== Number(idToRemove)));
    };
  }

  it('adds next available sequential speaker when initial 1 speaker is present', () => {
    let speakers = [{ id: 1, name: 'Speaker 1', initials: 'S1' }];
    let errorMessage = '';

    const handleAdd = createAddSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    handleAdd();

    expect(speakers.length).toBe(2);
    expect(speakers[0]).toEqual({ id: 1, name: 'Speaker 1', initials: 'S1' });
    expect(speakers[1]).toEqual({ id: 2, name: 'Speaker 2', initials: 'S2' });
    expect(errorMessage).toBe('');
  });

  it('adds speakers up to the maximum limit of 5 and prevents adding a 6th', () => {
    let speakers = [{ id: 1, name: 'Speaker 1', initials: 'S1' }];
    let errorMessage = '';

    const handleAdd = createAddSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    // Add up to 5 speakers
    handleAdd(); // 2
    handleAdd(); // 3
    handleAdd(); // 4
    handleAdd(); // 5

    expect(speakers.length).toBe(5);
    expect(speakers.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);

    // Try adding a 6th speaker
    handleAdd();
    expect(speakers.length).toBe(5);
    expect(errorMessage).toBe('Maximum of 5 speakers allowed per project.');
  });

  it('reuses the lowest available gap ID when an intermediate speaker was removed', () => {
    let speakers = [
      { id: 1, name: 'Speaker 1', initials: 'S1' },
      { id: 2, name: 'Speaker 2', initials: 'S2' },
      { id: 3, name: 'Speaker 3', initials: 'S3' },
    ];
    let errorMessage = '';

    const handleRemove = createRemoveSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    const handleAdd = createAddSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    // Remove speaker 2
    handleRemove(2);
    expect(speakers.map((s) => s.id)).toEqual([1, 3]);

    // Add speaker: should reuse ID 2 and keep sorted
    handleAdd();
    expect(speakers.length).toBe(3);
    expect(speakers.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(speakers[1].name).toBe('Speaker 2');
    expect(speakers[1].initials).toBe('S2');
  });

  it('handles remove speaker correctly with string ID representations', () => {
    let speakers = [
      { id: '1', name: 'Speaker 1', initials: 'S1' },
      { id: '2', name: 'Speaker 2', initials: 'S2' },
    ];
    let errorMessage = '';

    const handleRemove = createRemoveSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    handleRemove(2); // numeric parameter against string id
    expect(speakers.length).toBe(1);
    expect(speakers[0].id).toBe('1');
  });

  it('preserves custom names and initials when adding new speakers', () => {
    let speakers = [
      { id: 1, name: 'Alice Smith', initials: 'AS' },
    ];
    let errorMessage = '';

    const handleAdd = createAddSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    handleAdd();
    expect(speakers.length).toBe(2);
    expect(speakers[0]).toEqual({ id: 1, name: 'Alice Smith', initials: 'AS' });
    expect(speakers[1]).toEqual({ id: 2, name: 'Speaker 2', initials: 'S2' });
  });

  it('does not allow removing the last remaining speaker', () => {
    let speakers = [{ id: 1, name: 'Speaker 1', initials: 'S1' }];
    let errorMessage = '';

    const handleRemove = createRemoveSpeakerHandler(
      () => speakers,
      (val) => { speakers = val; },
      (msg) => { errorMessage = msg; },
    );

    handleRemove(1);
    expect(speakers.length).toBe(1);
    expect(errorMessage).toBe('A project must have at least one speaker.');
  });
});

