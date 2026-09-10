import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));

function runParcel() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('parcel', ['build', 'src/index.html', '--dist-dir', 'dist', '--no-cache', '--no-source-maps'], {
      cwd: appDirectory,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`parcel build failed (${signal ?? code})`));
    });
  });
}

rmSync(resolve(appDirectory, 'dist'), { recursive: true, force: true });

/**
 * Parcel's JavaScript transformer rejects inline string Worker constructors.
 * The packed adapter uses one for its Rust decoder. Keep the consumer import
 * untouched, but adapt this one generated dependency for Parcel and restore it
 * immediately after the build so node_modules is never left modified.
 */
async function patchInlineWorkerForParcel() {
  const entry = fileURLToPath(await import.meta.resolve('@frillab/copc-adapter/three'));
  const packageDirectory = dirname(entry);
  const originals = [];
  const replaceInFile = (fileName, replacements) => {
    const filePath = resolve(packageDirectory, fileName);
    const original = readFileSync(filePath, 'utf8');
    let patched = original;
    for (const [from, to] of replacements) patched = patched.replace(from, to);
    if (patched !== original) {
      writeFileSync(filePath, patched);
      originals.push([filePath, original]);
    }
  };

  replaceInFile('rustCopcWorkerFactory.js', [
    ['new Worker("data:', 'new Worker(new URL("data:'],
    ['", { name:', '", import.meta.url), { name:'],
  ]);
  replaceInFile('copcWasmAsset.js', [["'./copc_wasm.wasm?url&no-inline'", "'url:./copc_wasm.wasm'"]]);
  replaceInFile('lazPerfAsset.js', [["'./laz-perf.wasm?url&no-inline'", "'url:./laz-perf.wasm'"]]);

  return originals.length === 0
    ? undefined
    : () => originals.reverse().forEach(([filePath, original]) => writeFileSync(filePath, original));
}

let restore;
try {
  restore = await patchInlineWorkerForParcel();
  await runParcel();
  console.log('Bundler phase=build bundler=parcel status=passed');
} catch (error) {
  console.error('Bundler phase=build bundler=parcel status=failed', error);
  process.exitCode = 1;
} finally {
  restore?.();
}
