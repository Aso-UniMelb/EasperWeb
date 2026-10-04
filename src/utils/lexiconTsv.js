/**
 * Utilities for importing and exporting Lexicons to and from TSV (Tab-Separated Values).
 * Supports RFC-compliant quoting (handling newlines and quotes inside cells)
 * as well as plain tab-delimited formats common in linguistic and lexicographic workflows.
 */

import { parseLexicon, formatLexicon } from './subTiers.js';

/**
 * Generates a clean unique ID for fields and entries.
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Escapes a cell value for TSV export.
 * Wraps in double quotes if it contains tabs, quotes, or newlines.
 *
 * @param {any} val
 * @returns {string}
 */
export function escapeTsvCell(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Retrieves an entry's value for a specified field, checking multiple potential locations
 * (fields[id], fields[name], direct property).
 *
 * @param {Object} entry
 * @param {Object} field
 * @returns {string}
 */
export function getEntryFieldValue(entry, field) {
  if (!entry || !field) return '';
  if (entry.fields) {
    if (entry.fields[field.id] !== undefined) return String(entry.fields[field.id] ?? '');
    if (entry.fields[field.name] !== undefined) return String(entry.fields[field.name] ?? '');
  }
  if (entry[field.id] !== undefined) return String(entry[field.id] ?? '');
  if (entry[field.name] !== undefined) return String(entry[field.name] ?? '');
  return '';
}

/**
 * Sets an entry's value for a specified field.
 *
 * @param {Object} entry
 * @param {Object} field
 * @param {string} value
 */
export function setEntryFieldValue(entry, field, value) {
  if (!entry) return;
  if (!entry.fields) entry.fields = {};
  entry.fields[field.id] = String(value ?? '');
}

/**
 * Exports a lexicon to TSV string.
 * First line contains field names as column headers.
 * Subsequent lines contain entry values.
 *
 * @param {Object} lexicon
 * @returns {string}
 */
export function exportLexiconToTsv(lexicon) {
  if (!lexicon) return '';
  const fields = lexicon.fields || [];
  const entries = lexicon.entries || [];

  if (fields.length === 0 && entries.length === 0) {
    return '';
  }

  // Header row
  const headerRow = fields.map((f) => escapeTsvCell(f.name || 'Untitled')).join('\t');

  // Data rows
  const dataRows = entries.map((entry) => {
    return fields.map((f) => escapeTsvCell(getEntryFieldValue(entry, f))).join('\t');
  });

  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Parses raw TSV text into an array of headers and an array of row data arrays.
 * Handles both plain TSV and quoted TSV cells.
 *
 * @param {string} tsvString
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseTsv(tsvString) {
  if (!tsvString || typeof tsvString !== 'string') {
    return { headers: [], rows: [] };
  }

  const normalized = tsvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allRows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === '\t') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        // Skip completely empty lines
        if (currentRow.some((c) => c.length > 0)) {
          allRows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  // Push final cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = allRows[0];
  const headers = rawHeaders.map((h, idx) => (h ? h.trim() : `Column ${idx + 1}`));
  const rows = allRows.slice(1);

  return { headers, rows };
}

/**
 * Imports TSV data into a lexicon object.
 *
 * @param {Object} lexicon - Existing lexicon object
 * @param {string} tsvString - Raw TSV content
 * @param {Object} [options]
 * @param {'append'|'replace'} [options.mode='append'] - Append to or replace existing entries
 * @param {boolean} [options.createMissingFields=true] - Whether to create fields for unmatched TSV headers
 * @returns {{
 *   updatedLexicon: Object,
 *   importedCount: number,
 *   createdFieldsCount: number,
 *   headers: string[]
 * }}
 */
export function importTsvToLexicon(lexicon, tsvString, options = {}) {
  const { mode = 'append', createMissingFields = true } = options;

  if (!lexicon) {
    throw new Error('A target lexicon must be provided.');
  }

  const { headers, rows } = parseTsv(tsvString);
  if (headers.length === 0) {
    throw new Error('No headers or columns detected in TSV.');
  }

  // Deep clone to ensure immutability
  const updatedLexicon = JSON.parse(JSON.stringify(lexicon));
  const currentFields = updatedLexicon.fields ? [...updatedLexicon.fields] : [];
  let createdFieldsCount = 0;

  // Map each TSV column index to a field ID
  const colIndexToFieldId = new Map();

  headers.forEach((header, colIdx) => {
    const cleanHeader = header.trim();
    if (!cleanHeader) return;

    // Check for existing field (exact match or case-insensitive)
    let matchedField = currentFields.find(
      (f) => f.name.trim().toLowerCase() === cleanHeader.toLowerCase(),
    );

    if (!matchedField && createMissingFields) {
      // Auto-create missing field
      matchedField = {
        id: generateId('field'),
        name: cleanHeader,
        validValues: '',
      };
      currentFields.push(matchedField);
      createdFieldsCount++;
    }

    if (matchedField) {
      colIndexToFieldId.set(colIdx, matchedField.id);
    }
  });

  updatedLexicon.fields = currentFields;

  // Generate new entry objects
  const now = new Date().toISOString();
  const newEntries = [];

  for (const row of rows) {
    // Skip empty rows
    if (!row || row.every((c) => !c || c.trim() === '')) continue;

    const entryFields = {};
    row.forEach((cellVal, colIdx) => {
      const fieldId = colIndexToFieldId.get(colIdx);
      if (fieldId) {
        entryFields[fieldId] = cellVal != null ? String(cellVal).trim() : '';
      }
    });

    newEntries.push({
      id: generateId('entry'),
      fields: entryFields,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (mode === 'replace') {
    updatedLexicon.entries = newEntries;
  } else {
    updatedLexicon.entries = [...(updatedLexicon.entries || []), ...newEntries];
  }

  updatedLexicon.updatedAt = now;

  return {
    updatedLexicon,
    importedCount: newEntries.length,
    createdFieldsCount,
    headers,
  };
}

/**
 * Triggers a browser file download of TSV text content.
 *
 * @param {string} filename
 * @param {string} tsvContent
 */
export function downloadTsvFile(filename, tsvContent) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([tsvContent], {
    type: 'text/tab-separated-values;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.tsv') ? filename : `${filename}.tsv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

