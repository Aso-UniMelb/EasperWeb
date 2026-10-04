import { describe, expect, it } from 'bun:test';
import { importTsvToLexicon } from '../src/utils/lexiconTsv.js';
import { formatEntryDateTime, formatFullDateTime } from '../src/utils/formatters.js';

describe('Lexicon internal updatedAt timestamps', () => {
  const baseLexicon = {
    id: 'lex_time_test',
    title: 'Timestamp Lexicon',
    languageVariety: 'Kurmanji',
    fields: [
      { id: 'f_headword', name: 'Headword', validValues: '' },
      { id: 'f_pos', name: 'POS', validValues: '' },
    ],
    entries: [],
  };

  it('sets createdAt and updatedAt on imported entries to the import timestamp', () => {
    const tsv = 'Headword\tPOS\nroj\tn\nşev\tn';
    const before = new Date().toISOString();
    const result = importTsvToLexicon(baseLexicon, tsv, { mode: 'replace' });
    const after = new Date().toISOString();

    expect(result.importedCount).toBe(2);
    expect(result.updatedLexicon.entries.length).toBe(2);

    for (const entry of result.updatedLexicon.entries) {
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
      expect(typeof entry.updatedAt).toBe('string');
      // The timestamp is an ISO string within the execution window
      expect(entry.updatedAt >= before).toBe(true);
      expect(entry.updatedAt <= after).toBe(true);
      expect(entry.createdAt).toBe(entry.updatedAt);
    }
  });

  it('formats entry timestamps nicely as YY/MM/DD hh:mm and full tooltip', () => {
    const pastIso = '2025-05-15T14:30:00.000Z';
    const displayPast = formatEntryDateTime(pastIso);
    // Regex matching YY/MM/DD hh:mm format: 25/05/15 HH:mm
    expect(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(displayPast)).toBe(true);
    expect(displayPast.startsWith('25/05/15')).toBe(true);

    const fullTooltip = formatFullDateTime(pastIso);
    expect(fullTooltip.length).toBeGreaterThan(0);
    expect(fullTooltip).toContain('2025');

    expect(formatEntryDateTime(null)).toBe('—');
    expect(formatEntryDateTime('')).toBe('—');
    expect(formatFullDateTime(null)).toBe('');
  });

  it('sorts entries by __updatedAt properly in descending and ascending order', () => {
    const entries = [
      { id: 'e1', fields: { f_headword: 'old' }, updatedAt: '2026-01-01T10:00:00.000Z' },
      { id: 'e2', fields: { f_headword: 'middle' }, updatedAt: '2026-05-01T12:00:00.000Z' },
      { id: 'e3', fields: { f_headword: 'newest' }, updatedAt: '2026-10-01T08:00:00.000Z' },
    ];

    // Descending sort (newest first - default for Updated column)
    const sortedDesc = [...entries].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    expect(sortedDesc.map((e) => e.fields.f_headword)).toEqual(['newest', 'middle', 'old']);

    // Ascending sort (oldest first)
    const sortedAsc = [...entries].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    expect(sortedAsc.map((e) => e.fields.f_headword)).toEqual(['old', 'middle', 'newest']);
  });
});
