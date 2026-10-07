import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const fixtureRoot = resolve(process.env.COPC_FIXTURE_ROOT ?? `${repositoryRoot}/.cache/copc-fixtures`);
const catalogPath = resolve(process.env.COPC_FIXTURE_CATALOG ?? `${repositoryRoot}/fixtures/catalog.json`);

export async function assertFixturesReady(fixtureIds = ['small-valid-copc']) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  for (const fixtureId of fixtureIds) {
    const fixture = catalog.fixtures.find((entry) => entry.id === fixtureId);
    if (!fixture) throw new Error(`Fixture ${fixtureId} is missing from ${catalogPath}.`);
    const path = resolve(fixtureRoot, fixture.cachePath);
    try {
      await access(path);
      const file = await stat(path);
      if (!file.isFile()) throw new Error(`${path} is not a file.`);
      if (fixture.sizeBytes && file.size !== fixture.sizeBytes) {
        throw new Error(`${path} is ${file.size} bytes; expected ${fixture.sizeBytes}.`);
      }
    } catch (error) {
      throw new Error(`Required COPC fixture ${fixtureId} is not ready at ${path}. Run: npm run fixtures:fetch -- ${fixtureId}`, { cause: error });
    }
  }
}
