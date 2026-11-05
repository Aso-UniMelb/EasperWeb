/**
 * Whistle speech recognition model supported languages.
 * Whistle natively supports 7 European languages with auto-detection.
 */

export const WHISTLE_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
];

export function isWhistleLanguage(code) {
  if (!code || code === 'auto') return true;
  const clean = String(code).toLowerCase().trim();
  return ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl'].includes(clean);
}

export function getWhistleLanguageName(code) {
  if (!code || code === 'auto') return 'Auto-detect';
  const match = WHISTLE_LANGUAGES.find(
    (l) => l.code === String(code).toLowerCase().trim(),
  );
  return match ? match.name : code;
}

