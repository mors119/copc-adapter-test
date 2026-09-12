import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareReports, formatComparison } from './report.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const currentFile = option('--current') ?? process.argv[2];
const baselineFile = option('--baseline') ?? process.argv[3];
if (!currentFile || !baselineFile) {
  throw new Error('Usage: npm run benchmark:compare -- --current current.json --baseline baseline.json [--fail-on-regression]');
}

const current = JSON.parse(await readFile(resolve(currentFile), 'utf8'));
const baseline = JSON.parse(await readFile(resolve(baselineFile), 'utf8'));
const comparison = compareReports(current, baseline, { minSamples: 2 });
const outputFile = option('--output');
if (outputFile) await writeFile(resolve(outputFile), `${JSON.stringify(comparison, null, 2)}\n`);
console.log(formatComparison(comparison));
if (process.argv.includes('--fail-on-regression') && comparison.hardRegressions.length > 0) process.exitCode = 1;
