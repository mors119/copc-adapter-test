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
    console.log(`\n→ ${app.appId} (${app.host}/${app.renderer})`);
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
