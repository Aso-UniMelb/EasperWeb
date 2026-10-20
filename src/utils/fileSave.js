/**
 * Utility for saving exported files using the native File System Access API
 * (`window.showSaveFilePicker`) so the user can choose the destination folder
 * and filename, with a fallback to standard browser anchor download when unsupported.
 */

/**
 * Prompts the user with a native "Save As" file dialog (when supported by the browser)
 * and writes the resulting Blob to the selected location.
 *
 * Accepts either a Blob or an async factory `() => Promise<Blob>` so the file picker
 * can be opened synchronously within the user's click gesture before any async
 * packaging (such as ZIP compression or IndexedDB reads) takes place.
 *
 * @param {Blob | (() => Promise<Blob> | Blob)} blobOrFactory
 * @param {Object} options
 * @param {string} options.suggestedName - Default file name (e.g. "interview.eaf")
 * @param {string} [options.description] - File type description (e.g. "ELAN Annotation File")
 * @param {Record<string, string[]>} [options.accept] - MIME type to extensions map
 * @returns {Promise<{ saved: boolean, cancelled?: boolean, filename?: string }>}
 */
export async function saveFileWithDialog(
  blobOrFactory,
  { suggestedName = 'export', description = '', accept = null } = {},
) {
  if (
    typeof window !== 'undefined' &&
    typeof window.showSaveFilePicker === 'function'
  ) {
    let fileHandle;
    try {
      const pickerOptions = { suggestedName };
      if (description && accept) {
        pickerOptions.types = [{ description, accept }];
      }
      fileHandle = await window.showSaveFilePicker(pickerOptions);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { saved: false, cancelled: true };
      }
      console.warn(
        '[fileSave] showSaveFilePicker failed, falling back to anchor download:',
        err,
      );
      fileHandle = null;
    }

    if (fileHandle) {
      const blob =
        typeof blobOrFactory === 'function'
          ? await blobOrFactory()
          : blobOrFactory;
      if (!blob) {
        return { saved: false };
      }
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, filename: fileHandle.name || suggestedName };
    }
  }

  // Fallback for browsers that do not support window.showSaveFilePicker
  const blob =
    typeof blobOrFactory === 'function' ? await blobOrFactory() : blobOrFactory;
  if (!blob) {
    return { saved: false };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { saved: true, filename: suggestedName };
}

