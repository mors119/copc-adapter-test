import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrapAdapterSource, clearViteCaches } from './index.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`)));
  });
}

try {
  const source = process.env.COPC_ADAPTER_SOURCE ?? 'checkout';
  await bootstrapAdapterSource(source);
  await clearViteCaches();
  await run('npm', ['run', 'test:full']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
