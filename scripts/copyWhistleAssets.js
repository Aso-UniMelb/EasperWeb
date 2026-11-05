import fs from 'fs';
import path from 'path';

const targetDir = path.resolve('public/cactus-needle');
const sourceWorker = path.resolve(
  'node_modules/cactus-needle/dist/browser/worker.js',
);
const sourceWasm = path.resolve('node_modules/cactus-needle/vendor/needle.wasm');

if (fs.existsSync(sourceWorker) && fs.existsSync(sourceWasm)) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceWorker, path.join(targetDir, 'worker.js'));
  fs.copyFileSync(sourceWasm, path.join(targetDir, 'needle.wasm'));
  console.log(
    '[copyWhistleAssets] Copied cactus-needle worker.js and needle.wasm to public/cactus-needle/',
  );
} else {
  console.warn(
    '[copyWhistleAssets] cactus-needle assets not found in node_modules.',
  );
}

