import { describe, it, expect, beforeEach } from 'bun:test';
import { HunspellService } from '../src/services/hunspellService.js';
import { extractWordsFromText } from '../src/utils/hunspellDictBuilder.js';

describe('Project Lexicon and Transcription Spellchecking Integration', () => {
  let hunspell;

  beforeEach(async () => {
    hunspell = new HunspellService();
    await hunspell.init();
  });

  it('binds project lexicon to hunspell, detects misspelled segment words and supports single-click headword addition', async () => {
    // 1. Setup a project lexicon with Headword field
    const projectLexicon = {
      id: 'lex-proj-001',
      name: 'Field Corpus Lexicon',
      fields: [
        { id: 'f_hw', name: 'Headword' },
        { id: 'f_pos', name: 'Part of Speech' },
      ],
      entries: [
        { id: 'e1', fields: { f_hw: 'silav' } },
        { id: 'e2', fields: { f_hw: 'çawa' } },
        { id: 'e3', fields: { f_hw: 'yî' } },
      ],
    };

    // 2. Project activates this lexicon and builds Hunspell dictionary
    await hunspell.rebuildFromLexicon(projectLexicon);

    expect(hunspell.isReady).toBe(true);
    expect(hunspell.wordCount).toBe(3);
    expect(hunspell.activeLexiconId).toBe('lex-proj-001');

    // 3. User types a transcript segment: "Silav, tu çawa yî?"
    const segmentText = 'Silav, tu çawa yî?';
    const words = extractWordsFromText(segmentText);
    expect(words).toEqual(['Silav', 'tu', 'çawa', 'yî']);

    // Check spelling of words against the project lexicon
    const misspelled = words.filter((w) => !hunspell.spell(w));
    // 'tu' is not in the lexicon yet
    expect(misspelled).toEqual(['tu']);

    // 4. User clicks "+ Add to Lexicon" for 'tu'
    const newEntry = { id: 'e4', fields: { f_hw: 'tu' } };
    const updatedLexicon = {
      ...projectLexicon,
      entries: [...projectLexicon.entries, newEntry],
    };

    // Rebuild triggers automatically when headword is added
    await hunspell.rebuildFromLexicon(updatedLexicon);

    expect(hunspell.wordCount).toBe(4);
    expect(hunspell.spell('tu')).toBe(true);

    // Re-check the segment
    const recheckedMisspelled = words.filter((w) => !hunspell.spell(w));
    expect(recheckedMisspelled).toEqual([]);

    hunspell.destroy();
  });

  it('handles switching projects with different lexicons', async () => {
    const lexiconA = {
      id: 'lex-A',
      name: 'English Lexicon',
      fields: [{ id: 'f1', name: 'Headword' }],
      entries: [
        { id: 'ea1', fields: { f1: 'hello' } },
        { id: 'ea2', fields: { f1: 'world' } },
      ],
    };

    const lexiconB = {
      id: 'lex-B',
      name: 'Kurdish Lexicon',
      fields: [{ id: 'f1', name: 'Headword' }],
      entries: [
        { id: 'eb1', fields: { f1: 'rojbaş' } },
        { id: 'eb2', fields: { f1: 'dinya' } },
      ],
    };

    // Switch to Project A
    await hunspell.rebuildFromLexicon(lexiconA);
    expect(hunspell.activeLexiconId).toBe('lex-A');
    expect(hunspell.spell('hello')).toBe(true);
    expect(hunspell.spell('rojbaş')).toBe(false);

    // Switch to Project B
    await hunspell.rebuildFromLexicon(lexiconB);
    expect(hunspell.activeLexiconId).toBe('lex-B');
    expect(hunspell.spell('hello')).toBe(false);
    expect(hunspell.spell('rojbaş')).toBe(true);

    // Disable spellcheck (null lexicon)
    await hunspell.rebuildFromLexicon(null);
    expect(hunspell.activeLexiconId).toBe(null);
    expect(hunspell.wordCount).toBe(0);

    hunspell.destroy();
  });
});
