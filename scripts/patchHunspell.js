/**
 * Patch script for hunspell-asm and emscripten-wasm-loader.
 * Fixes:
 * 1. "TypeError: runtimeModule is not a function" caused by esbuild/Vite ESM interop
 *    when import * as runtime wraps Emscripten factory in an object with .default.
 * 2. "TypeError: nanoid is not a function" caused by modern nanoid packaging vs
 *    the old `import * as nanoid from 'nanoid'` / `require('nanoid')`.
 */

import fs from 'fs';
import path from 'path';

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patchHunspell] Skipping ${filePath} (not found)`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [target, replacement] of replacements) {
    if (typeof target === 'string') {
      if (content.includes(target)) {
        content = content.replaceAll(target, replacement);
        changed = true;
      }
    } else if (target instanceof RegExp) {
      if (target.test(content)) {
        content = content.replace(target, replacement);
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[patchHunspell] Successfully patched ${filePath}`);
  } else {
    console.log(`[patchHunspell] Already patched or pattern not found in ${filePath}`);
  }
}

console.log('[patchHunspell] Applying Hunspell & Emscripten loader fixes...');

// 1. Fix getModuleLoader in emscripten-wasm-loader (ESM & CJS)
const safeRuntimeCall = `const _rt = typeof runtimeModule === 'function' ? runtimeModule : (runtimeModule.default || runtimeModule.Module || runtimeModule); const asmModule = _rt(constructedModule);`;

patchFile('node_modules/emscripten-wasm-loader/dist/esm/getModuleLoader.js', [
  ['const asmModule = runtimeModule(constructedModule);', safeRuntimeCall],
]);

patchFile('node_modules/emscripten-wasm-loader/dist/cjs/getModuleLoader.js', [
  ['const asmModule = runtimeModule(constructedModule);', safeRuntimeCall],
]);

// 2. Fix loadModule in hunspell-asm (ESM & CJS)
patchFile('node_modules/hunspell-asm/dist/esm/loadModule.js', [
  [
    'const moduleLoader = await getModuleLoader((runtime) => hunspellLoader(runtime), runtime, undefined, { timeout });',
    'const _rt = typeof runtime === "function" ? runtime : (runtime.default || runtime.Module || runtime); const moduleLoader = await getModuleLoader((runtime) => hunspellLoader(runtime), _rt, undefined, { timeout });',
  ],
]);

patchFile('node_modules/hunspell-asm/dist/cjs/loadModule.js', [
  [
    'const moduleLoader = await emscripten_wasm_loader_1.getModuleLoader((runtime) => hunspellLoader_1.hunspellLoader(runtime), runtime, undefined, { timeout });',
    'const _rt = typeof runtime === "function" ? runtime : (runtime.default || runtime.Module || runtime); const moduleLoader = await emscripten_wasm_loader_1.getModuleLoader((runtime) => hunspellLoader_1.hunspellLoader(runtime), _rt, undefined, { timeout });',
  ],
]);

// 3. Fix nanoid in hunspell-asm hunspellLoader (ESM & CJS)
const nanoidReplacement = `const nanoid = (len = 21) => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);`;

patchFile('node_modules/hunspell-asm/dist/esm/hunspellLoader.js', [
  ["import * as nanoid from 'nanoid';", nanoidReplacement],
]);

patchFile('node_modules/hunspell-asm/dist/cjs/hunspellLoader.js', [
  ['const nanoid = require("nanoid");', nanoidReplacement],
]);

// 4. Fix nanoid in emscripten-wasm-loader mountBuffer (ESM & CJS)
patchFile('node_modules/emscripten-wasm-loader/dist/esm/path/mountBuffer.js', [
  ["import * as nanoid from 'nanoid';", nanoidReplacement],
]);

patchFile('node_modules/emscripten-wasm-loader/dist/cjs/path/mountBuffer.js', [
  ['const nanoid = require("nanoid");', nanoidReplacement],
]);

console.log('[patchHunspell] Patch complete.');
