import { spawn } from 'node:child_process';
import { selectMatrix } from './manifest.mjs';

function npmCommand(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', args, { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`npm ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function runMatrix(command, options = {}) {
  const apps = selectMatrix(options.apps ?? option('--apps') ?? option('--app'));
  const packageSource = options.packageSource ?? process.env.COPC_ADAPTER_SOURCE ?? 'npm';
  const packageVersion = options.packageVersion ?? process.env.COPC_ADAPTER_VERSION ?? '0.3.0';
  const backend = options.backend ?? process.env.COPC_E2E_BACKEND ?? 'copc-js';
  const fixtureId = options.fixtureId ?? process.env.COPC_E2E_FIXTURE ?? 'small-valid-copc';
  for (const app of apps) {
    console.log(`\n→ ${app.appId} | host=${app.host} renderer=${app.renderer} backend=${backend} fixture=${fixtureId} package=${packageSource}@${packageVersion}`);
    await npmCommand(['run', command, '--workspace', app.workspace]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? 'build';
  if (!['build', 'typecheck'].includes(command)) {
    throw new Error(`Unknown matrix command "${command}". Use build or typecheck.`);
  }
  await runMatrix(command);
}
