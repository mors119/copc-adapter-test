import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTER_PACKAGE, ADAPTER_VERSION, PUBLIC_EXPORTS, validateInstalledPackage } from '../../tools/adapter-source/index.mjs';

test('installed packed package has the canonical public identity and assets', async () => {
  const { metadata } = await validateInstalledPackage();
  assert.equal(metadata.name, ADAPTER_PACKAGE);
  assert.equal(metadata.version, ADAPTER_VERSION);
  assert.deepEqual(Object.keys(metadata.exports).sort(), [...PUBLIC_EXPORTS].sort());
});
