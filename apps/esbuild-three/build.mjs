import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(appDirectory, 'dist');
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

function wasmUrl() {
  return {
    name: 'copc-wasm-url',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /\.wasm(?:\?.*)?$/ }, (args) => ({
        path: resolve(dirname(args.importer), args.path.split('?')[0]),
        namespace: 'copc-wasm-url',
      }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'copc-wasm-url' }, (args) => {
        const filename = args.path.split('/').at(-1);
        copyFileSync(args.path, resolve(outputDirectory, filename));
        return { contents: `export default './${filename}';`, loader: 'js' };
      });
    },
  };
}

try {
  await build({
    absWorkingDir: appDirectory,
    entryPoints: ['src/main.ts'],
    outfile: 'dist/bundle.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    plugins: [wasmUrl()],
  });
  copyFileSync(resolve(appDirectory, 'src/index.html'), resolve(outputDirectory, 'index.html'));
  writeFileSync(
    resolve(outputDirectory, 'style.css'),
    readFileSync(resolve(appDirectory, '../shared/bundler-smoke.css'), 'utf8'),
  );
  console.log('Bundler phase=build bundler=esbuild status=passed');
} catch (error) {
  console.error('Bundler phase=build bundler=esbuild status=failed', error);
  process.exitCode = 1;
}
