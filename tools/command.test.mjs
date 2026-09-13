import assert from 'node:assert/strict';
import test from 'node:test';
import { commandSpawnOptions } from './command.mjs';

test('runs package-manager shims through the Windows shell', () => {
  assert.deepEqual(commandSpawnOptions('npm', 'win32'), { shell: true });
  assert.deepEqual(commandSpawnOptions('pnpm', 'win32'), { shell: true });
});

test('keeps non-Windows and non-package-manager commands direct', () => {
  assert.deepEqual(commandSpawnOptions('npm', 'linux'), { shell: false });
  assert.deepEqual(commandSpawnOptions('tar', 'win32'), { shell: false });
});
