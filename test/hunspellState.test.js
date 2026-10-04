import { describe, it, expect, beforeEach } from 'bun:test';
import { HunspellService } from '../src/services/hunspellService.js';

describe('HunspellService dynamic dictionary lifecycle', () => {
  let service;

  beforeEach(async () => {
    service = new HunspellService();
    await service.init();
  });

  it('dynamically builds dictionary from lexicon and checks spellings', async () => {
    const lexicon = {
      id: 'lex-test-1',
      title: 'Kurdish Vocab',
      languageVariety: 'Kurmanji',
      fields: [
        { id: 'f_word', name: 'Headword' },
        { id: 'f_meaning', name: 'Meaning' },
      ],
      entries: [
        { id: 'e1', fields: { f_word: 'roj' } },
        { id: 'e2', fields: { f_word: 'kitêb' } },
        { id: 'e3', fields: { f_word: 'mamoste' } },
      ],
    };

    const success = await service.rebuildFromLexicon(lexicon);
    expect(success).toBe(true);

    expect(service.isReady).toBe(true);
    expect(service.wordCount).toBe(3);
    expect(service.spell('kitêb')).toBe(true);
    expect(service.spell('roj')).toBe(true);
    expect(service.spell('ziman')).toBe(false);

    expect(service.dictContent).toContain('3\n');
    expect(service.dictContent).toContain('kitêb');
    expect(service.dictContent).toContain('mamoste');

    service.destroy();
  });

  it('rebuilds dict dynamically when lexicon entries are added or removed', async () => {
    const lexiconV1 = {
      id: 'lex-dyn-2',
      title: 'Dynamic Test',
      fields: [{ id: 'f1', name: 'Headword' }],
      entries: [
        { id: 'e1', fields: { f1: 'apple' } },
        { id: 'e2', fields: { f1: 'banana' } },
      ],
    };

    await service.rebuildFromLexicon(lexiconV1);
    expect(service.spell('apple')).toBe(true);
    expect(service.spell('orange')).toBe(false);

    // Now update lexicon entries (add orange, remove apple)
    const lexiconV2 = {
      ...lexiconV1,
      entries: [
        { id: 'e2', fields: { f1: 'banana' } },
        { id: 'e3', fields: { f1: 'orange' } },
      ],
    };

    await service.rebuildFromLexicon(lexiconV2);
    expect(service.wordCount).toBe(2);
    expect(service.spell('apple')).toBe(false);
    expect(service.spell('orange')).toBe(true);
    expect(service.spell('banana')).toBe(true);

    const suggestions = service.suggest('ornge');
    expect(suggestions).toContain('orange');

    service.destroy();
  });
});
