globalThis.$state = (v) => v;
globalThis.$state.raw = (v) => v;
globalThis.$state.snapshot = (v) => JSON.parse(JSON.stringify(v));
globalThis.$derived = (v) => v;
globalThis.$derived.by = (fn) => fn();
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

import { describe, it, expect } from 'bun:test';

const {
  WHISTLE_LANGUAGES,
  isWhistleLanguage,
  getWhistleLanguageName,
} = await import('../src/services/whistleLanguages.js');

const {
  AVAILABLE_PRESETS,
  modelState,
} = await import('../src/state/modelState.svelte.js');

const { isWhistleModel, getWhistleAssetUrls } = await import(
  '../src/utils/whistleRunner.js'
);

describe('Whistle Model & Languages Support', () => {
  describe('Whistle Languages', () => {
    it('defines the 7 European languages plus auto-detect', () => {
      const codes = WHISTLE_LANGUAGES.map((l) => l.code);
      expect(codes).toContain('auto');
      expect(codes).toContain('en');
      expect(codes).toContain('de');
      expect(codes).toContain('fr');
      expect(codes).toContain('es');
      expect(codes).toContain('it');
      expect(codes).toContain('nl');
      expect(codes).toContain('pl');
      expect(codes.length).toBe(8);
    });

    it('validates supported Whistle languages with isWhistleLanguage', () => {
      expect(isWhistleLanguage('en')).toBe(true);
      expect(isWhistleLanguage('DE')).toBe(true);
      expect(isWhistleLanguage('fr')).toBe(true);
      expect(isWhistleLanguage('es')).toBe(true);
      expect(isWhistleLanguage('it')).toBe(true);
      expect(isWhistleLanguage('nl')).toBe(true);
      expect(isWhistleLanguage('pl')).toBe(true);
      expect(isWhistleLanguage('auto')).toBe(true);
      expect(isWhistleLanguage('')).toBe(true);

      // Unsupported languages
      expect(isWhistleLanguage('zh')).toBe(false);
      expect(isWhistleLanguage('ja')).toBe(false);
      expect(isWhistleLanguage('ru')).toBe(false);
      expect(isWhistleLanguage('fa')).toBe(false);
    });

    it('resolves Whistle language display names with getWhistleLanguageName', () => {
      expect(getWhistleLanguageName('en')).toBe('English');
      expect(getWhistleLanguageName('de')).toBe('German');
      expect(getWhistleLanguageName('fr')).toBe('French');
      expect(getWhistleLanguageName('es')).toBe('Spanish');
      expect(getWhistleLanguageName('it')).toBe('Italian');
      expect(getWhistleLanguageName('nl')).toBe('Dutch');
      expect(getWhistleLanguageName('pl')).toBe('Polish');
      expect(getWhistleLanguageName('auto')).toBe('Auto-detect');
    });
  });

  describe('Official Model Presets', () => {
    it('includes Whistle in AVAILABLE_PRESETS with correct configuration', () => {
      const whistlePreset = AVAILABLE_PRESETS.find((p) => p.baseId === 'whistle');
      expect(whistlePreset).toBeDefined();
      expect(whistlePreset.title).toBe('Whistle');
      expect(whistlePreset.architecture).toBe('whistle');
      expect(whistlePreset.modelId).toBe('Cactus-Compute/whistle');
      expect(whistlePreset.dtype).toBe('wasm');
      expect(whistlePreset.device).toBe('wasm');
      expect(whistlePreset.sizeApprox).toBe('~17 MB');
      expect(whistlePreset.supportedLanguages).toEqual([
        'auto',
        'en',
        'de',
        'fr',
        'es',
        'it',
        'nl',
        'pl',
      ]);
    });

    it('retains Whisper-base and Whisper-small presets', () => {
      const whisperBase = AVAILABLE_PRESETS.find((p) => p.baseId === 'whisper-base');
      const whisperSmall = AVAILABLE_PRESETS.find((p) => p.baseId === 'whisper-small');
      expect(whisperBase).toBeDefined();
      expect(whisperSmall).toBeDefined();
      expect(whisperBase.architecture).toBe('whisper');
      expect(whisperSmall.architecture).toBe('whisper');
    });
  });

  describe('Local Folder Analysis (.cact detection)', () => {
    it('detects a .cact model file in a folder as a valid Whistle model', () => {
      const mockFiles = [
        { name: 'whistle.cact', webkitRelativePath: 'my-model/whistle.cact' },
        { name: 'README.md', webkitRelativePath: 'my-model/README.md' },
      ];

      const result = modelState.analyzeFolderFiles(mockFiles);
      expect(result).not.toBeNull();
      expect(result.isValid).toBe(true);
      expect(result.isCact).toBe(true);
      expect(result.architecture).toBe('whistle');
      expect(result.detectedDtype).toBe('wasm');
      expect(result.cactFiles).toHaveLength(1);
      expect(result.cactFiles[0]).toContain('whistle.cact');
      expect(result.topFolderName).toBe('my-model');
    });

    it('detects uppercase or mixed-case .CACT extension', () => {
      const mockFiles = [
        { name: 'WHISTLE.CACT', webkitRelativePath: 'test/WHISTLE.CACT' },
      ];

      const result = modelState.analyzeFolderFiles(mockFiles);
      expect(result).not.toBeNull();
      expect(result.isValid).toBe(true);
      expect(result.isCact).toBe(true);
      expect(result.architecture).toBe('whistle');
    });

    it('rejects an empty folder or folder without config.json or .cact', () => {
      const mockFiles = [
        { name: 'notes.txt', webkitRelativePath: 'empty/notes.txt' },
      ];

      const result = modelState.analyzeFolderFiles(mockFiles);
      expect(result).not.toBeNull();
      expect(result.isValid).toBe(false);
      expect(result.isCact).toBe(false);
    });

    it('detects standard ONNX model folders as Whisper architecture', () => {
      const mockFiles = [
        { name: 'config.json', webkitRelativePath: 'whisper/config.json' },
        { name: 'model_quantized.onnx', webkitRelativePath: 'whisper/model_quantized.onnx' },
      ];

      const result = modelState.analyzeFolderFiles(mockFiles);
      expect(result).not.toBeNull();
      expect(result.isValid).toBe(true);
      expect(result.isCact).toBe(false);
      expect(result.architecture).toBe('whisper');
      expect(result.detectedDtype).toBe('q8');
    });
  });

  describe('isWhistleModel Helper & Asset URLs', () => {
    it('resolves valid asset URLs pointing to public/cactus-needle', () => {
      const { workerUrl, wasmUrl } = getWhistleAssetUrls();
      expect(workerUrl).toContain('cactus-needle/worker.js');
      expect(wasmUrl).toContain('cactus-needle/needle.wasm');
    });

    it('identifies Whistle by architecture', () => {
      expect(isWhistleModel({ architecture: 'whistle' })).toBe(true);
    });

    it('identifies Whistle by Cactus-Compute/whistle modelId', () => {
      expect(isWhistleModel({ modelId: 'Cactus-Compute/whistle' })).toBe(true);
      expect(isWhistleModel({ modelId: 'cactus-compute/whistle' })).toBe(true);
      expect(isWhistleModel({ modelId: 'https://huggingface.co/Cactus-Compute/whistle' })).toBe(true);
    });

    it('identifies Whistle by .cact file in folder entries', () => {
      expect(
        isWhistleModel({
          files: [{ path: 'models/whistle.cact' }],
        })
      ).toBe(true);
    });

    it('returns false for standard Whisper models', () => {
      expect(
        isWhistleModel({
          architecture: 'whisper',
          modelId: 'onnx-community/whisper-base',
          files: [{ path: 'model_quantized.onnx' }],
        })
      ).toBe(false);
    });
  });
});
