import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { isCliEntry } from './runner.mjs';

test('recognizes a CLI path using a platform-safe file URL conversion', () => {
  const cliPath = process.platform === 'win32'
    ? 'C:\\actions\\runner\\tools\\compatibility\\runner.mjs'
    : '/actions/runner/tools/compatibility/runner.mjs';
  assert.equal(isCliEntry(pathToFileURL(cliPath).href, cliPath), true);
});

test('does not run as a CLI when imported without an argv path', () => {
  assert.equal(isCliEntry('file:///actions/runner/runner.mjs', undefined), false);
});
