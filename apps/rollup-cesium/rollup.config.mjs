import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';

const require = createRequire(import.meta.url);
const appDirectory = dirname(fileURLToPath(import.meta.url));
const cesiumDirectory = dirname(require.resolve('cesium/package.json'));
const cesiumBuildDirectory = join(cesiumDirectory, 'Build', 'Cesium');

function wasmUrl() {
  return {
    name: 'copc-wasm-url',
    resolveId(source, importer) {
      if (!importer || !source.includes('.wasm?')) return null;
      const wasmPath = resolve(dirname(importer), source.split('?')[0]);
      return existsSync(wasmPath) ? `\0copc-wasm:${wasmPath}` : null;
    },
    load(id) {
      if (!id.startsWith('\0copc-wasm:')) return null;
      const wasmPath = id.slice('\0copc-wasm:'.length);
      const referenceId = this.emitFile({
        type: 'asset',
        name: wasmPath.split('/').at(-1),
        source: readFileSync(wasmPath),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
    },
  };
}

function cleanDist() {
  return {
    name: 'clean-dist',
    buildStart() {
      rmSync(resolve(appDirectory, 'dist'), { recursive: true, force: true });
    },
  };
}

function copyRuntimeAssets() {
  return {
    name: 'copy-cesium-runtime-assets',
    writeBundle() {
      cpSync(cesiumBuildDirectory, resolve(appDirectory, 'dist/cesium'), { recursive: true });
      cpSync(resolve(appDirectory, 'src/index.html'), resolve(appDirectory, 'dist/index.html'));
      writeFileSync(
        resolve(appDirectory, 'dist/style.css'),
        readFileSync(resolve(appDirectory, '../shared/bundler-smoke.css'), 'utf8'),
      );
    },
  };
}

export default {
  input: resolve(appDirectory, 'src/main.ts'),
  output: {
    dir: resolve(appDirectory, 'dist'),
    format: 'es',
    entryFileNames: 'bundle.js',
    assetFileNames: '[name][extname]',
    sourcemap: false,
  },
  plugins: [
    cleanDist(),
    wasmUrl(),
    nodeResolve({ browser: true, extensions: ['.mjs', '.js', '.json', '.ts'] }),
    commonjs(),
    esbuild({ target: 'es2022', sourceMap: false }),
    copyRuntimeAssets(),
  ],
  onwarn(warning, defaultHandler) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    defaultHandler(warning);
  },
};
