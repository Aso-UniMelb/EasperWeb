/**
 * Browser-side ELAN (.eaf) XML Parser.
 * Uses native DOMParser to parse ELAN annotation format version 2.8 - 3.0.
 */

/**
 * Parses an EAF XML string into structured tier and annotation data.
 *
 * @param {string} xmlString - Raw XML content of the .eaf file
 * @param {string} [fileName='unknown.eaf'] - Filename for tracking
 * @returns {{
 *   fileName: string,
 *   mediaDescriptors: Array<{ mediaUrl: string, relativeUrl: string, mimeType: string, timeOrigin: number }>,
 *   tiers: Array<{ tierId: string, parentRef: string|null, annotations: Array<{ id: string, start: number, end: number, text: string }> }>,
 *   allAnnotations: Array<{ tier: string, start: number, end: number, text: string }>
 * }}
 */
class SimpleXmlNode {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.children = [];
    this.textContent = '';
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    let current = [this];
    for (const part of parts) {
      const next = [];
      const matchTag = part.toUpperCase();
      const search = (node) => {
        for (const child of node.children) {
          if (child.tagName.toUpperCase() === matchTag) {
            next.push(child);
          }
          search(child);
        }
      };
      for (const node of current) {
        search(node);
      }
      current = next;
    }
    return current;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function parseSimpleXml(xmlString) {
  const root = new SimpleXmlNode('DOCUMENT');
  const stack = [root];
  const tagRegex = /<(\/?)([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;

  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(xmlString)) !== null) {
    const [fullMatch, isClosing, tagName, rawAttrs, isSelfClosing] = match;
    const textBetween = xmlString.slice(lastIndex, match.index);
    if (textBetween && stack.length > 0) {
      const unescaped = textBetween
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      stack[stack.length - 1].textContent += unescaped;
    }
    lastIndex = tagRegex.lastIndex;

    if (tagName.startsWith('?') || tagName.startsWith('!')) continue;

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tagName.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
    } else {
      const attrs = {};
      const attrRegex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let aMatch;
      while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
        const val = aMatch[2] ?? aMatch[3] ?? aMatch[4] ?? '';
        attrs[aMatch[1]] = val
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }

      const node = new SimpleXmlNode(tagName, attrs);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }

      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return root;
}

export function parseEaf(xmlString, fileName = 'unknown.eaf') {
  let xmlDoc;
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML Parse Error in ${fileName}: ${parserError.textContent}`);
    }
  } else {
    xmlDoc = parseSimpleXml(xmlString);
  }

  const rootDoc = xmlDoc.querySelector('ANNOTATION_DOCUMENT');
  const author = rootDoc?.getAttribute('AUTHOR') || '';
  const date = rootDoc?.getAttribute('DATE') || '';

  // 1. Extract Media Descriptors from <HEADER>
  const mediaDescriptors = [];
  const mediaElements = xmlDoc.querySelectorAll('HEADER MEDIA_DESCRIPTOR');
  mediaElements.forEach((el) => {
    mediaDescriptors.push({
      mediaUrl: el.getAttribute('MEDIA_URL') || '',
      relativeUrl: el.getAttribute('RELATIVE_MEDIA_URL') || '',
      mimeType: el.getAttribute('MIME_TYPE') || '',
      timeOrigin: parseInt(el.getAttribute('TIME_ORIGIN') || '0', 10) || 0,
    });
  });

  // 2. Extract Time Slots from <TIME_ORDER>
  const timeSlots = new Map(); // timeSlotId -> milliseconds
  const timeSlotElements = xmlDoc.querySelectorAll('TIME_ORDER TIME_SLOT');
  timeSlotElements.forEach((el) => {
    const id = el.getAttribute('TIME_SLOT_ID');
    const val = el.getAttribute('TIME_VALUE');
    if (id && val !== null) {
      timeSlots.set(id, parseInt(val, 10));
    }
  });

  // Map of annotationId -> { start, end, text } for resolving REF_ANNOTATION
  const annotationMap = new Map();

  // 3. Extract Tiers
  const tierElements = xmlDoc.querySelectorAll('TIER');
  const tiers = [];
  const allAnnotations = [];

  tierElements.forEach((tierEl) => {
    const tierId = tierEl.getAttribute('TIER_ID') || 'default';
    const parentRef = tierEl.getAttribute('PARENT_REF') || null;
    const linguisticType = tierEl.getAttribute('LINGUISTIC_TYPE_REF') || '';
    const participant = tierEl.getAttribute('PARTICIPANT') || '';

    const rawAnnotations = [];
    const annotationNodes = tierEl.querySelectorAll('ANNOTATION');

    annotationNodes.forEach((annNode) => {
      const alignable = annNode.querySelector('ALIGNABLE_ANNOTATION');
      if (alignable) {
        const aid = alignable.getAttribute('ANNOTATION_ID');
        const ts1 = alignable.getAttribute('TIME_SLOT_REF1');
        const ts2 = alignable.getAttribute('TIME_SLOT_REF2');
        const textValEl = alignable.querySelector('ANNOTATION_VALUE');
        const text = textValEl ? textValEl.textContent || '' : '';

        const start = ts1 && timeSlots.has(ts1) ? timeSlots.get(ts1) : null;
        const end = ts2 && timeSlots.has(ts2) ? timeSlots.get(ts2) : null;

        if (start !== null && end !== null) {
          const annObj = { id: aid, start, end, text, isRef: false, parentAid: null };
          rawAnnotations.push(annObj);
          if (aid) annotationMap.set(aid, annObj);
        }
      } else {
        const ref = annNode.querySelector('REF_ANNOTATION');
        if (ref) {
          const aid = ref.getAttribute('ANNOTATION_ID');
          const parentAid = ref.getAttribute('ANNOTATION_REF');
          const textValEl = ref.querySelector('ANNOTATION_VALUE');
          const text = textValEl ? textValEl.textContent || '' : '';

          const parentAnn = parentAid ? annotationMap.get(parentAid) : null;
          if (parentAnn) {
            const annObj = {
              id: aid,
              start: parentAnn.start,
              end: parentAnn.end,
              text,
              isRef: true,
              parentAid,
            };
            rawAnnotations.push(annObj);
            if (aid) annotationMap.set(aid, annObj);
          }
        }
      }
    });

    // 4. Handle Parent-Child sub-tier alignment / interval concatenation
    // When sub-tiers share the same interval, concatenate text
    const processedAnnotations = [];
    let tempAnn = null;

    for (const ann of rawAnnotations) {
      if (!ann.isRef) {
        processedAnnotations.push({
          id: ann.id,
          start: ann.start,
          end: ann.end,
          text: ann.text,
          isRef: false,
          parentAid: null,
        });
      } else {
        // Child tier annotation
        if (!tempAnn) {
          tempAnn = { id: ann.id, start: ann.start, end: ann.end, text: ann.text, isRef: true, parentAid: ann.parentAid };
        } else if (ann.start === tempAnn.start && ann.end === tempAnn.end) {
          tempAnn.text = `${tempAnn.text} ${ann.text}`.trim();
        } else {
          processedAnnotations.push(tempAnn);
          tempAnn = { id: ann.id, start: ann.start, end: ann.end, text: ann.text, isRef: true, parentAid: ann.parentAid };
        }
      }
    }
    if (tempAnn) {
      processedAnnotations.push(tempAnn);
    }

    // Sort chronologically
    processedAnnotations.sort((a, b) => a.start - b.start);

    for (const ann of processedAnnotations) {
      allAnnotations.push({
        tier: tierId,
        start: ann.start,
        end: ann.end,
        text: ann.text,
      });
    }

    tiers.push({
      tierId,
      parentRef,
      linguisticType,
      participant,
      sampleText: processedAnnotations.find((a) => a.text && a.text.trim())?.text || '',
      annotations: processedAnnotations,
    });
  });

  return {
    fileName,
    author,
    date,
    mediaDescriptors,
    tiers,
    allAnnotations,
  };
}

/**
 * Extracts the file basename from a URL, URI or path string.
 * @param {string} url
 * @returns {string}
 */
export function extractFileNameFromUrl(url) {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const clean = decoded.replace(/^file:\/{2,3}/i, '').replace(/\\/g, '/');
    return clean.split('/').pop() || '';
  } catch {
    return url.split(/[\/\\]/).pop() || '';
  }
}

/**
 * Checks if a provided audio filename matches an ELAN document's media descriptors
 * or filename base.
 *
 * @param {Array<{ mediaUrl: string, relativeUrl: string }>} [mediaDescriptors=[]]
 * @param {string} [eafFileName='']
 * @param {string} [audioFileName='']
 * @returns {{ matched: boolean, isExactDescriptor: boolean, descriptorAudioName: string, reason: string }}
 */
export function matchAudioAndEaf(mediaDescriptors = [], eafFileName = '', audioFileName = '') {
  if (!audioFileName) {
    return {
      matched: false,
      isExactDescriptor: false,
      descriptorAudioName: '',
      reason: 'No audio file selected.',
    };
  }

  const cleanAudioName = audioFileName.trim().toLowerCase();
  const audioBaseName = cleanAudioName.replace(/\.[^/.]+$/, '');
  const cleanEafName = (eafFileName || '').trim().toLowerCase();
  const eafBaseName = cleanEafName.replace(/\.[^/.]+$/, '');

  const descriptorNames = [];
  for (const md of mediaDescriptors || []) {
    const rel = extractFileNameFromUrl(md.relativeUrl);
    const med = extractFileNameFromUrl(md.mediaUrl);
    if (rel && !descriptorNames.includes(rel)) descriptorNames.push(rel);
    if (med && !descriptorNames.includes(med)) descriptorNames.push(med);
  }

  // 1. Exact filename or base name in media descriptors
  for (const dName of descriptorNames) {
    const dClean = dName.toLowerCase();
    const dBase = dClean.replace(/\.[^/.]+$/, '');
    if (dClean === cleanAudioName || dBase === audioBaseName) {
      return {
        matched: true,
        isExactDescriptor: true,
        descriptorAudioName: dName,
        reason: `Audio file matches ELAN media descriptor (${dName}).`,
      };
    }
  }

  // 2. Base name match between .eaf and .wav
  if (eafBaseName && eafBaseName === audioBaseName) {
    return {
      matched: true,
      isExactDescriptor: false,
      descriptorAudioName: descriptorNames[0] || '',
      reason: `Audio base name matches ELAN file name (${audioFileName}).`,
    };
  }

  // 3. Fallback / mismatch
  const expected = descriptorNames[0] || (eafBaseName ? `${eafBaseName}.wav` : 'audio file');
  return {
    matched: false,
    isExactDescriptor: false,
    descriptorAudioName: expected,
    reason: `Audio filename "${audioFileName}" differs from expected descriptor "${expected}".`,
  };
}

/**
 * Classifies a character using Unicode General Category properties.
 * - 'letter': \p{L} (Letter) or \p{M} (Combining Mark / Diacritic)
 * - 'punctuation': \p{P} (Punctuation)
 * - 'number': \p{N} (Number)
 * - 'symbol': \p{S} (Symbol)
 * - 'space': \p{Z} (Separator / Whitespace)
 * - 'other': any unclassified character
 *
 * @param {string} ch - Single character / codepoint
 * @returns {'letter' | 'punctuation' | 'number' | 'symbol' | 'space' | 'other'}
 */
export function classifyUnicodeChar(ch) {
  if (!ch) return 'other';
  if (/^[\p{L}\p{M}]$/u.test(ch)) return 'letter';
  if (/^\p{P}$/u.test(ch)) return 'punctuation';
  if (/^\p{N}$/u.test(ch)) return 'number';
  if (/^\p{S}$/u.test(ch)) return 'symbol';
  if (/^[\p{Z}\s]$/u.test(ch)) return 'space';
  return 'other';
}

/**
 * Automatically extracts and categorizes unique characters from annotations
 * into letters, punctuation, numbers, and symbols using Unicode categorization.
 *
 * @param {Array<{ text: string }>} annotations
 * @returns {{ letters: string, punctuation: string, numbers: string, symbols: string }}
 */
export function extractUnicodeInventory(annotations) {
  const letters = new Set();
  const punctuation = new Set();
  const numbers = new Set();
  const symbols = new Set();

  for (const ann of annotations || []) {
    if (!ann || !ann.text) continue;
    for (const ch of ann.text) {
      if (!ch.trim()) continue;
      const cat = classifyUnicodeChar(ch);
      if (cat === 'letter') {
        letters.add(ch);
      } else if (cat === 'punctuation') {
        punctuation.add(ch);
      } else if (cat === 'number') {
        numbers.add(ch);
      } else if (cat === 'symbol' || cat === 'other') {
        symbols.add(ch);
      }
    }
  }

  return {
    letters: Array.from(letters).sort((a, b) => a.localeCompare(b)).join(' '),
    punctuation: Array.from(punctuation).sort((a, b) => a.localeCompare(b)).join(' '),
    numbers: Array.from(numbers).sort((a, b) => a.localeCompare(b)).join(' '),
    symbols: Array.from(symbols).sort((a, b) => a.localeCompare(b)).join(' '),
  };
}

/**
 * Extracts unique non-punctuation characters from a set of tiers.
 *
 * @param {Array<{ text: string }>} annotations
 * @param {string} punctuationText - Punctuation to exclude
 * @returns {string} Space-separated sorted unique characters
 */
export function extractUniqueLetters(annotations, punctuationText = '- . , ; : ! ? "') {
  const punctSet = new Set(
    Array.from(punctuationText).concat(
      Array.from('-.,;:!?"\t\n\r '),
      ['\u00A0', '\u200B']
    )
  );

  const extracted = new Set();
  for (const ann of annotations || []) {
    if (!ann || !ann.text) continue;
    for (const ch of ann.text) {
      if (!ch.trim()) continue;
      // Skip if explicitly marked in punctuation or if Unicode classifies it as punctuation
      if (punctSet.has(ch) || classifyUnicodeChar(ch) === 'punctuation') {
        continue;
      }
      extracted.add(ch);
    }
  }

  return Array.from(extracted).sort((a, b) => a.localeCompare(b)).join(' ');
}


