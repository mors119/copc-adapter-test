import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { resolveLocalAdapterTarball } from '../../tools/adapter-source/index.mjs';

async function withPackagesDirectory(runTest) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'copc-local-tarball-'));
  const directory = join(projectRoot, 'local-packages');
  await mkdir(directory);
  try {
    await runTest({ projectRoot, directory });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function addFile(directory, filename) {
  const path = join(directory, filename);
  await writeFile(path, 'test artifact');
  return path;
}

test('fails clearly when no matching local adapter tarball exists', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    await assert.rejects(
      resolveLocalAdapterTarball({ tarball: '', directory, projectRoot }),
      /No local @frillab\/copc-adapter tarball found in local-packages\/[\s\S]*npm pack --pack-destination/,
    );
  });
});

test('selects the one matching top-level adapter tarball', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    const expected = await addFile(directory, 'frillab-copc-adapter-0.4.0.tgz');
    assert.equal(
      await resolveLocalAdapterTarball({ tarball: '', directory, projectRoot }),
      expected,
    );
  });
});

test('fails deterministically when multiple matching tarballs exist', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    await addFile(directory, 'frillab-copc-adapter-0.4.0-1.tgz');
    await addFile(directory, 'frillab-copc-adapter-0.4.0.tgz');
    await assert.rejects(
      resolveLocalAdapterTarball({ tarball: '', directory, projectRoot }),
      (error) => {
        assert.match(error.message, /Multiple local adapter tarballs found/);
        assert.ok(error.message.indexOf('- frillab-copc-adapter-0.4.0-1.tgz') < error.message.indexOf('- frillab-copc-adapter-0.4.0.tgz'));
        assert.match(error.message, /COPC_ADAPTER_TARBALL=\/path\/to\/artifact\.tgz npm run bootstrap:tarball/);
        return true;
      },
    );
  });
});

test('explicit COPC_ADAPTER_TARBALL takes precedence over discovered artifacts', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    await addFile(directory, 'frillab-copc-adapter-0.4.0.tgz');
    await addFile(directory, 'frillab-copc-adapter-0.4.0-1.tgz');
    const explicit = await addFile(projectRoot, 'chosen.tgz');
    const previous = process.env.COPC_ADAPTER_TARBALL;
    process.env.COPC_ADAPTER_TARBALL = './chosen.tgz';
    try {
      assert.equal(
        await resolveLocalAdapterTarball({ directory, projectRoot }),
        resolve(explicit),
      );
    } finally {
      if (previous === undefined) delete process.env.COPC_ADAPTER_TARBALL;
      else process.env.COPC_ADAPTER_TARBALL = previous;
    }
  });
});

test('ignores non-tgz files and unrelated tgz names', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    await addFile(directory, 'frillab-copc-adapter-0.4.0.tgz.sha256');
    await addFile(directory, 'other-package-1.0.0.tgz');
    await addFile(directory, 'notes.txt');
    await assert.rejects(
      resolveLocalAdapterTarball({ tarball: '', directory, projectRoot }),
      /No local @frillab\/copc-adapter tarball found/,
    );
  });
});

test('ignores matching artifacts in nested directories', async () => {
  await withPackagesDirectory(async ({ projectRoot, directory }) => {
    const nested = join(directory, 'nested');
    await mkdir(nested);
    await addFile(nested, 'frillab-copc-adapter-0.4.0.tgz');
    await assert.rejects(
      resolveLocalAdapterTarball({ tarball: '', directory, projectRoot }),
      /No local @frillab\/copc-adapter tarball found/,
    );
  });
});
