import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

function hunspellBrowserFixPlugin() {
  return {
    name: 'hunspell-browser-fix',
    transform(code, id) {
      if (id.includes('getModuleLoader')) {
        if (code.includes('const asmModule = runtimeModule(constructedModule);')) {
          return {
            code: code.replace(
              'const asmModule = runtimeModule(constructedModule);',
              "const _rt = typeof runtimeModule === 'function' ? runtimeModule : (runtimeModule.default || runtimeModule.Module || runtimeModule); const asmModule = _rt(constructedModule);"
            ),
            map: null,
          };
        }
      }
      if (id.includes('loadModule')) {
        if (code.includes('runtime, undefined, { timeout }')) {
          return {
            code: code.replace(
              'runtime, undefined, { timeout }',
              '(typeof runtime === "function" ? runtime : (runtime.default || runtime.Module || runtime)), undefined, { timeout }'
            ),
            map: null,
          };
        }
      }
      if (id.includes('hunspellLoader') || id.includes('mountBuffer')) {
        if (code.includes("import * as nanoid from 'nanoid'")) {
          return {
            code: code.replace(
              /import \* as nanoid from 'nanoid';/g,
              "const nanoid = (len = 21) => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);"
            ),
            map: null,
          };
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [svelte(), hunspellBrowserFixPlugin()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('hunspell-asm')) {
              return 'vendor-hunspell';
            }
            if (id.includes('jszip')) {
              return 'vendor-jszip';
            }
            if (id.includes('svelte')) {
              return 'vendor-svelte';
            }
          }
        },
      },
    },
  },
});

