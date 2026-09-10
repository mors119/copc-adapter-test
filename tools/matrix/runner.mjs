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

export async function runMatrix(command) {
  const apps = selectMatrix(option('--apps') ?? option('--app'));
  for (const app of apps) {
    const script = command === 'build' ? (app.buildScript ?? 'build') : (app.typecheckScript ?? 'typecheck');
    const expectedFailure = command === 'build' ? app.expectedFailure : undefined;
    console.log(`\n→ ${app.matrixId ?? app.appId} (${app.host}/${app.renderer}${app.bundler ? `/${app.bundler}` : ''})`);
    const args = ['run', script, '--workspace', app.workspace];
    if (!expectedFailure) {
      await npmCommand(args);
      continue;
    }

    try {
      await npmCommand(args);
    } catch {
      console.warn(`✓ Expected failure recorded: ${expectedFailure.id}`);
      console.warn(`  ${expectedFailure.reason}`);
      continue;
    }
    throw new Error(`Expected failure ${expectedFailure.id} no longer reproduces for ${app.matrixId ?? app.appId}. Remove expectedFailure from tools/matrix/manifest.mjs.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? 'build';
  if (!['build', 'typecheck'].includes(command)) {
    throw new Error(`Unknown matrix command "${command}". Use build or typecheck.`);
  }
  await runMatrix(command);
}
