/**
 * Audio Dataset Slicer and JSZip Archive Builder.
 * Slices 16kHz mono audio Float32Array buffers corresponding to valid annotations,
 * encodes standard 16-bit PCM WAV clips, compiles metadata.tsv, and packages into JSZip.
 */

import JSZip from 'jszip';
import { encodeWavBlob } from '../audio.js';

/**
 * Builds the complete ASR dataset ZIP package.
 *
 * @param {Object} options
 * @param {Array<{ fileBaseName: string, audioSamples: Float32Array, offsetMs: number, segments: Array<{ start: number, end: number, text: string }> }>} options.fileItems
 * @param {Array<{ rawPattern: string, replacement: string }>} [options.rules=[]]
 * @param {boolean} [options.lowercaseTranscripts=false] - Whether to lowercase exported transcripts
 * @param {Function} [options.onProgress] - Progress callback receiving { current, total, percent, status }
 * @returns {Promise<{ zipBlob: Blob, totalSegments: number, metadataCount: number }>}
 */
export async function buildDatasetZip({
  fileItems = [],
  rules = [],
  lowercaseTranscripts = false,
  onProgress = null,
}) {
  const zip = new JSZip();
  let metadataTsv = '';

  const compiledRules = (rules || []).map((r) => ({
    pattern: new RegExp(r.rawPattern, 'g'),
    replacement: r.replacement,
  }));

  // Count total valid segments
  let totalValidSegments = 0;
  for (const item of fileItems) {
    for (const seg of item.segments || []) {
      let text = seg.text || '';
      for (const rule of compiledRules) {
        rule.pattern.lastIndex = 0;
        text = text.replace(rule.pattern, rule.replacement);
      }
      if (lowercaseTranscripts) {
        text = text.toLowerCase();
      }
      text = text.trim();
      const dur = seg.end - seg.start;
      if (text && dur > 0 && dur <= 30000) {
        totalValidSegments++;
      }
    }
  }

  let processedCount = 0;

  for (const item of fileItems) {
    const { fileBaseName, audioSamples, offsetMs, segments } = item;
    const folder = zip.folder(fileBaseName);
    const offsetSamples = Math.max(0, Math.floor((offsetMs || 0) * 16));

    let fileIndex = 1;

    for (const seg of segments || []) {
      let text = seg.text || '';
      for (const rule of compiledRules) {
        rule.pattern.lastIndex = 0;
        text = text.replace(rule.pattern, rule.replacement);
      }
      if (lowercaseTranscripts) {
        text = text.toLowerCase();
      }
      text = text.trim();

      const dur = seg.end - seg.start;
      if (!text || dur <= 0 || dur > 30000) {
        continue;
      }

      // Compute sample indexes: start and end in ms -> 16kHz samples (16 samples/ms)
      const startSample = Math.max(
        0,
        offsetSamples + Math.floor((seg.start * 16000) / 1000)
      );
      const endSample = Math.min(
        audioSamples.length,
        offsetSamples + Math.floor((seg.end * 16000) / 1000)
      );

      if (endSample > startSample) {
        const slice = audioSamples.subarray(startSample, endSample);
        const wavBlob = encodeWavBlob(slice, 16000);
        const clipName = `${String(fileIndex).padStart(4, '0')}.wav`;
        folder.file(clipName, wavBlob);

        metadataTsv += `${fileBaseName}/${clipName}\t${text}\n`;
        fileIndex++;
      }

      processedCount++;
      if (onProgress && (processedCount % 5 === 0 || processedCount === totalValidSegments)) {
        const percent = totalValidSegments
          ? Math.round((processedCount / totalValidSegments) * 100)
          : 0;
        onProgress({
          current: processedCount,
          total: totalValidSegments,
          percent,
          status: `Slicing and packaging audio clips: ${processedCount}/${totalValidSegments} (${percent}%)`,
        });
      }
    }
  }

  // Add metadata.tsv
  zip.file('metadata.tsv', metadataTsv);

  if (onProgress) {
    onProgress({
      current: totalValidSegments,
      total: totalValidSegments,
      percent: 100,
      status: 'Compressing asr_training_dataset.zip package...',
    });
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress({
          current: totalValidSegments,
          total: totalValidSegments,
          percent: Math.round(metadata.percent),
          status: `Compressing ZIP archive: ${Math.round(metadata.percent)}%`,
        });
      }
    }
  );

  return {
    zipBlob,
    totalSegments: totalValidSegments,
    metadataCount: processedCount,
  };
}

