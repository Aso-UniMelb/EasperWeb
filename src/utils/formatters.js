/**
 * Utility formatting functions for EasperWeb
 */

export function cleanSpeechText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[BLANK_AUDIO\]/g, '')
    .trim();
}

export function formatTimeSec(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '--:--';
  const totalSeconds = Math.floor(sec);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatDurationHms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function formatMsPrecise(milliseconds) {
  const totalSeconds = Math.floor((milliseconds || 0) / 1000);
  const ms = Math.floor((milliseconds || 0) % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatTimeSec1(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '00:00.0';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
}

export function formatTimeSec2(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '00:00.00';
  const totalSec = Math.max(0, Number(sec));
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(2);
  return `${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
}

export function formatTimeSec3(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '00:00.000';
  const totalSec = Math.max(0, Number(sec));
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(3);
  return `${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
}

export function formatSrtTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds))
    seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Formats ISO date-time into a human-friendly string for table rows.
 * E.g., "Today, 14:32" or "Oct 3, 14:32"
 * @param {string} isoString
 * @returns {string}
 */
export function formatEntryDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';

    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    return `${yy}/${mm}/${dd} ${hh}:${min}`;
  } catch {
    return '—';
  }
}

/**
 * Formats ISO date-time into full detailed localized string for tooltips.
 * E.g., "Oct 3, 2026, 2:32:15 PM"
 * @param {string} isoString
 * @returns {string}
 */
export function formatFullDateTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  } catch {
    return '';
  }
}



