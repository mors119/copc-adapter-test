import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  BENCHMARK_KIND,
  BENCHMARK_SCHEMA_VERSION,
} from './report.mjs';

function gitMetadata() {
  const command = (args) => {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch {
      return undefined;
    }
  };
  return {
    commit: command(['rev-parse', 'HEAD']),
    branch: command(['branch', '--show-current']),
    dirty: command(['status', '--porcelain']) !== undefined
      ? Boolean(command(['status', '--porcelain']))
      : undefined,
  };
}

async function attachmentBody(attachment) {
  if (attachment.body) return attachment.body.toString('utf8');
  if (attachment.path) return readFile(attachment.path, 'utf8');
  return undefined;
}

export default class BenchmarkReporter {
  constructor(options = {}) {
    this.outputFile = resolve(options.outputFile ?? process.env.COPC_BENCHMARK_OUTPUT ?? 'benchmark-results/latest.json');
    this.results = [];
    this.errors = [];
    this.pending = [];
  }

  onTestEnd(test, result) {
    const attachment = result.attachments.find((candidate) => candidate.name === 'benchmark.json');
    if (!attachment) {
      if (result.status !== 'skipped') this.errors.push(`${test.title}: benchmark.json attachment is missing`);
      return;
    }
    this.pending.push(attachmentBody(attachment).then((body) => {
      if (!body) return;
      try {
        const payload = JSON.parse(body);
        if (Array.isArray(payload.results)) this.results.push(...payload.results);
        else this.results.push(payload);
      } catch (error) {
        this.errors.push(`${test.title}: invalid benchmark.json (${error.message})`);
      }
    }));
  }

  async onEnd(result) {
    await Promise.all(this.pending);
    const report = {
      kind: BENCHMARK_KIND,
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      environment: {
        ...gitMetadata(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      playwrightStatus: result.status,
      results: this.results,
      ...(this.errors.length > 0 ? { reporterErrors: this.errors } : {}),
    };
    await mkdir(dirname(this.outputFile), { recursive: true });
    await writeFile(this.outputFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Benchmark report written to ${this.outputFile}`);
  }
}
