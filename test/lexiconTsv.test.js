import { describe, expect, it } from 'bun:test';
import {
  escapeTsvCell,
  getEntryFieldValue,
  setEntryFieldValue,
  exportLexiconToTsv,
  parseTsv,
  importTsvToLexicon,
} from '../src/utils/lexiconTsv.js';

describe('lexiconTsv utils', () => {
  describe('escapeTsvCell', () => {
    it('returns empty string for null or undefined', () => {
      expect(escapeTsvCell(null)).toBe('');
      expect(escapeTsvCell(undefined)).toBe('');
    });

    it('leaves plain string untouched', () => {
      expect(escapeTsvCell('hello world')).toBe('hello world');
    });

    it('quotes string with tab character', () => {
      expect(escapeTsvCell('first\tsecond')).toBe('"first\tsecond"');
    });

    it('quotes string with newline and escapes quotes', () => {
      expect(escapeTsvCell('line 1\nline 2 "quoted"')).toBe('"line 1\nline 2 ""quoted"""');
    });
  });

  describe('getEntryFieldValue and setEntryFieldValue', () => {
    const field = { id: 'f_lemma', name: 'Lemma' };

    it('gets value from entry.fields[id]', () => {
      const entry = { fields: { f_lemma: 'kitêb' } };
      expect(getEntryFieldValue(entry, field)).toBe('kitêb');
    });

    it('gets value from entry.fields[name] as fallback', () => {
      const entry = { fields: { Lemma: 'xwendin' } };
      expect(getEntryFieldValue(entry, field)).toBe('xwendin');
    });

    it('sets value on entry.fields[id]', () => {
      const entry = {};
      setEntryFieldValue(entry, field, 'dar');
      expect(entry.fields.f_lemma).toBe('dar');
    });
  });

  describe('parseTsv', () => {
    it('parses simple tab-separated text', () => {
      const tsv = 'Headword\tPOS\tGloss\nkitêb\tn\tbook\nxwendin\tv\tto read';
      const { headers, rows } = parseTsv(tsv);
      expect(headers).toEqual(['Headword', 'POS', 'Gloss']);
      expect(rows).toEqual([
        ['kitêb', 'n', 'book'],
        ['xwendin', 'v', 'to read'],
      ]);
    });

    it('handles Windows CRLF line endings', () => {
      const tsv = 'Headword\tPOS\r\nkitêb\tn\r\nxwendin\tv';
      const { headers, rows } = parseTsv(tsv);
      expect(headers).toEqual(['Headword', 'POS']);
      expect(rows).toEqual([
        ['kitêb', 'n'],
        ['xwendin', 'v'],
      ]);
    });

    it('handles quoted cells with embedded newlines and quotes', () => {
      const tsv = 'Headword\tMeaning\nkitêb\t"a bound volume\nused for ""reading"""';
      const { headers, rows } = parseTsv(tsv);
      expect(headers).toEqual(['Headword', 'Meaning']);
      expect(rows.length).toBe(1);
      expect(rows[0][0]).toBe('kitêb');
      expect(rows[0][1]).toBe('a bound volume\nused for "reading"');
    });

    it('ignores blank lines', () => {
      const tsv = 'Headword\tPOS\n\nkitêb\tn\n\n\n';
      const { headers, rows } = parseTsv(tsv);
      expect(headers).toEqual(['Headword', 'POS']);
      expect(rows).toEqual([['kitêb', 'n']]);
    });
  });

  describe('exportLexiconToTsv', () => {
    it('exports fields and entries to clean TSV', () => {
      const lexicon = {
        title: 'Kurdish',
        languageVariety: 'Sorani',
        fields: [
          { id: 'f1', name: 'Headword' },
          { id: 'f2', name: 'POS' },
          { id: 'f3', name: 'Meaning' },
        ],
        entries: [
          {
            id: 'e1',
            fields: { f1: 'kitêb', f2: 'n', f3: 'book' },
          },
          {
            id: 'e2',
            fields: { f1: 'xwendin', f2: 'v', f3: 'to read' },
          },
        ],
      };

      const result = exportLexiconToTsv(lexicon);
      const lines = result.split('\r\n');
      expect(lines[0]).toBe('Headword\tPOS\tMeaning');
      expect(lines[1]).toBe('kitêb\tn\tbook');
      expect(lines[2]).toBe('xwendin\tv\tto read');
    });
  });

  describe('importTsvToLexicon', () => {
    const baseLexicon = {
      id: 'lex_1',
      title: 'Sorani',
      languageVariety: 'Central Kurdish',
      fields: [
        { id: 'f1', name: 'Headword', validValues: '' },
        { id: 'f2', name: 'POS', validValues: 'n {Noun}, v {Verb}' },
      ],
      entries: [
        { id: 'e1', fields: { f1: 'dest', f2: 'n' } },
      ],
    };

    it('appends entries to existing lexicon and creates missing fields', () => {
      const tsv = 'Headword\tPOS\tEtymology\nçav\tn\tProto-Iranian *čaxšma\ngotin\tv\tOld Persian';
      const result = importTsvToLexicon(baseLexicon, tsv, {
        mode: 'append',
        createMissingFields: true,
      });

      expect(result.importedCount).toBe(2);
      expect(result.createdFieldsCount).toBe(1);
      expect(result.updatedLexicon.fields.length).toBe(3);
      expect(result.updatedLexicon.fields[2].name).toBe('Etymology');
      expect(result.updatedLexicon.entries.length).toBe(3); // 1 existing + 2 imported

      const newEntry = result.updatedLexicon.entries[1];
      expect(newEntry.fields.f1).toBe('çav');
      expect(newEntry.fields.f2).toBe('n');
      expect(newEntry.fields[result.updatedLexicon.fields[2].id]).toBe('Proto-Iranian *čaxšma');
    });

    it('replaces entries in replace mode', () => {
      const tsv = 'Headword\tPOS\nnû\tadj';
      const result = importTsvToLexicon(baseLexicon, tsv, {
        mode: 'replace',
        createMissingFields: false,
      });

      expect(result.importedCount).toBe(1);
      expect(result.updatedLexicon.entries.length).toBe(1);
      expect(result.updatedLexicon.entries[0].fields.f1).toBe('nû');
    });

    it('roundtrip export and import preserves data', () => {
      const originalLexicon = {
        id: 'lex_roundtrip',
        title: 'Hawrami Lexicon',
        languageVariety: 'Gorani / Hawrami',
        fields: [
          { id: 'f_lemma', name: 'Headword', validValues: '' },
          { id: 'f_pos', name: 'POS', validValues: 'n {Noun}, v {Verb}' },
          { id: 'f_gloss', name: 'Gloss', validValues: '' },
        ],
        entries: [
          { id: 'e1', fields: { f_lemma: 'kiteb', f_pos: 'n', f_gloss: 'book' } },
          { id: 'e2', fields: { f_lemma: 'wanay', f_pos: 'v', f_gloss: 'to read' } },
        ],
      };

      const exportedTsv = exportLexiconToTsv(originalLexicon);
      const imported = importTsvToLexicon(
        { ...originalLexicon, entries: [] },
        exportedTsv,
        { mode: 'replace' },
      );

      expect(imported.importedCount).toBe(2);
      expect(imported.updatedLexicon.entries.length).toBe(2);
      expect(getEntryFieldValue(imported.updatedLexicon.entries[0], originalLexicon.fields[0])).toBe('kiteb');
      expect(getEntryFieldValue(imported.updatedLexicon.entries[1], originalLexicon.fields[2])).toBe('to read');
    });

    it('handles blank lexicon with 0 fields and 0 entries in TSV export', () => {
      const blankLexicon = {
        id: 'lex_blank',
        title: 'Blank Lexicon',
        languageVariety: 'Tok Pisin',
        fields: [],
        entries: [],
      };
      const exported = exportLexiconToTsv(blankLexicon);
      expect(exported).toBe('');
    });
  });
});

