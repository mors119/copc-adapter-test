import { spawn } from 'node:child_process';
import { selectMatrix } from './manifest.mjs';

function npmCommand(args, { captureOutput = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', args, {
      stdio: captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    });
    let output = '';
    if (captureOutput) {
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        process.stdout.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
        process.stderr.write(chunk);
      });
    }
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        const error = new Error(`npm ${args.join(' ')} failed (${signal ?? code})`);
        error.output = output;
        reject(error);
      }
    });
  });
}

export function matchesExpectedFailure(output, expectedFailure) {
  const fragments = expectedFailure.outputIncludes ?? [];
  return fragments.length > 0 && fragments.every((fragment) => output.includes(fragment));
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
    const script = command === 'build' ? (app.buildScript ?? 'build') : (app.typecheckScript ?? 'typecheck');
    const expectedFailure = command === 'build' ? app.expectedFailure : undefined;
    console.log(`\n→ ${app.matrixId ?? app.appId} (${app.host}/${app.renderer}${app.bundler ? `/${app.bundler}` : ''}) backend=${backend} fixture=${fixtureId} package=${packageSource}@${packageVersion}`);
    const args = ['run', script, '--workspace', app.workspace];
    if (!expectedFailure) {
      await npmCommand(args);
      continue;
    }

    try {
      await npmCommand(args, { captureOutput: true });
    } catch (error) {
      const output = error?.output ?? '';
      if (!matchesExpectedFailure(output, expectedFailure)) {
        throw new Error(`Expected failure ${expectedFailure.id} did not match its recorded output signature for ${app.matrixId ?? app.appId}.`);
      }
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
