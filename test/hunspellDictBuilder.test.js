import { describe, it, expect } from 'bun:test';
import {
  extractWordsFromText,
  createDefaultAffContent,
  buildHunspellDict,
} from '../src/utils/hunspellDictBuilder.js';

describe('hunspellDictBuilder utils', () => {
  it('extractWordsFromText extracts and cleans words', () => {
    expect(extractWordsFromText('apple, banana; cherry!')).toEqual(['apple', 'banana', 'cherry']);
    expect(extractWordsFromText('"roj baş"')).toEqual(['roj', 'baş']);
    expect(extractWordsFromText('')).toEqual([]);
    expect(extractWordsFromText(null)).toEqual([]);
  });

  it('createDefaultAffContent creates valid UTF-8 aff', () => {
    const aff = createDefaultAffContent();
    expect(aff).toContain('SET UTF-8');
    expect(aff).toContain('FLAG UTF-8');
    expect(aff).toContain('WORDCHARS');
  });

  it('buildHunspellDict returns empty dic for empty lexicon', () => {
    const res = buildHunspellDict(null);
    expect(res.wordCount).toBe(0);
    expect(res.dicContent).toBe('0\n');
  });

  it('buildHunspellDict builds sorted dic from lexicon entries', () => {
    const lexicon = {
      id: 'lex1',
      title: 'Kurdish Lexicon',
      languageVariety: 'Kurmanji',
      fields: [
        { id: 'f1', name: 'Word', validValues: '' },
        { id: 'f2', name: 'Meaning', validValues: '' },
      ],
      entries: [
        { id: 'e1', fields: { f1: 'kitêb', f2: 'book' } },
        { id: 'e2', fields: { f1: 'mamosta', f2: 'teacher' } },
        { id: 'e3', fields: { f1: 'roj', f2: 'day' } },
        { id: 'e4', fields: { f1: 'kitêb', f2: 'duplicate book' } }, // duplicate
      ],
    };

    const res = buildHunspellDict(lexicon);
    expect(res.wordCount).toBe(3);
    expect(res.words).toEqual(['kitêb', 'mamosta', 'roj']);
    expect(res.dicContent).toBe('3\nkitêb\nmamosta\nroj\n');
  });

  it('buildHunspellDict tokenizes phrases into individual word tokens', () => {
    const lexicon = {
      id: 'lex2',
      title: 'Greetings',
      fields: [{ id: 'f1', name: 'Phrase', validValues: '' }],
      entries: [
        { id: 'e1', fields: { f1: 'roj baş!' } },
        { id: 'e2', fields: { f1: 'şev xweş.' } },
      ],
    };

    const res = buildHunspellDict(lexicon);
    expect(res.wordCount).toBe(4);
    expect(res.words).toContain('roj');
    expect(res.words).toContain('baş');
    expect(res.words).toContain('şev');
    expect(res.words).toContain('xweş');
  });

  it('extracts exclusively from Headword and ignores other columns', () => {
    const lexicon = {
      id: 'lex_hw',
      title: 'Headword Test',
      fields: [
        { id: 'f_sense', name: 'Sense Number' },
        { id: 'f_hw', name: 'Headword' },
        { id: 'f_pos', name: 'POS' },
        { id: 'f_meaning', name: 'Meaning' },
      ],
      entries: [
        { id: 'e1', fields: { f_sense: '1', f_hw: 'kitêb', f_pos: 'noun', f_meaning: 'book' } },
        { id: 'e2', fields: { f_sense: '2', f_hw: 'mamoste', f_pos: 'noun', f_meaning: 'teacher' } },
      ],
    };

    const res = buildHunspellDict(lexicon);
    expect(res.wordCount).toBe(2);
    expect(res.words).toEqual(['kitêb', 'mamoste']);
    expect(res.resolvedFieldName).toBe('Headword');
    // Verify non-headword contents are not included
    expect(res.words).not.toContain('1');
    expect(res.words).not.toContain('noun');
    expect(res.words).not.toContain('book');
  });

  it('matches Headword case-insensitively and ignores other fields', () => {
    const lexicon = {
      id: 'lex_ci',
      title: 'Case Test',
      fields: [
        { id: 'f1', name: 'headword' },
        { id: 'f2', name: 'Gloss' },
      ],
      entries: [
        { id: 'e1', fields: { f1: 'roj', f2: 'sun' } },
      ],
    };

    const res = buildHunspellDict(lexicon);
    expect(res.wordCount).toBe(1);
    expect(res.words).toEqual(['roj']);
    expect(res.words).not.toContain('sun');
  });
});
