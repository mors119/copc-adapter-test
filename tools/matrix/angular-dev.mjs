import { spawn } from 'node:child_process';

const appId = process.argv[2];
const appArgs = process.argv.slice(3);
const angularApps = new Set(['angular-cesium', 'angular-three']);

if (!angularApps.has(appId)) {
  throw new Error(`Unknown Angular app "${appId}". Use angular-cesium or angular-three.`);
}

function start(command, args) {
  return spawn(command, args, { stdio: 'inherit', env: process.env });
}

const fixtureServer = start('npm', [
  'run',
  'fixtures:serve',
  '--',
  '--host',
  '127.0.0.1',
  '--port',
  '8787',
]);
const angularServer = start('npm', [
  'run',
  'dev',
  '--workspace',
  `apps/${appId}`,
  '--',
  ...appArgs,
]);

let shuttingDown = false;

function stop(child) {
  if (!child.killed) child.kill('SIGTERM');
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  stop(angularServer);
  stop(fixtureServer);
  process.exitCode = code;
}

process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));
angularServer.once('error', () => shutdown(1));
fixtureServer.once('error', () => shutdown(1));
angularServer.once('exit', (code, signal) => {
  if (shuttingDown) return;
  shutdown(signal ? 1 : code ?? 1);
});
fixtureServer.once('exit', (code, signal) => {
  if (shuttingDown) return;
  shutdown(signal ? 1 : code ?? 1);
});
