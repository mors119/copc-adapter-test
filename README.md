# COPC Adapter Test

External compatibility and integration testbed for [`@frillab/copc-adapter`](https://github.com/mors119/copc-adapter).

This repository validates the adapter as a real package dependency across frameworks, bundlers, renderers, browsers, backends, package sources, and representative COPC datasets.

It complements the adapter's own unit/conformance tests by focusing on external-consumer behavior: package exports, Worker/WASM asset resolution, browser lifecycle, streaming, renderer integration, Range/CORS requirements, and compatibility boundaries.

## What is covered

Public package entrypoints:

```text
@frillab/copc-adapter
@frillab/copc-adapter/cesium
@frillab/copc-adapter/three
```

The matrix includes CesiumJS, Three.js, React Three Fiber, Vite, Next.js, Nuxt, SvelteKit, Astro, Angular, Webpack, Rollup, esbuild, Parcel, multiple browser engines, `copc-js`, Rust/WASM, fixture/source behavior, peer-version boundaries, package managers, operating systems, and packed release artifacts.

## Design principles

### Share infrastructure, keep real integrations visible

Share fixture serving, scenario definitions, assertions, diagnostics, configuration, and orchestration.

Do not hide framework integration behind a large abstraction. React effects, Vue/Svelte/Angular lifecycle code, Next.js client boundaries, and renderer ownership should remain inside each consumer app because those boundaries are part of what this repository tests.

### Test the public package

Consumer apps should use normal package imports rather than private source paths.

Normal compatibility runs may use the published npm package. Release validation should consume a packed `.tgz` artifact as an external project would.

### Share large fixtures

Large COPC files must not be copied into each app or build output. The fixture system owns downloads, caching, checksums, and Range-aware delivery.

## Repository layout

```text
apps/                  real framework/bundler consumers
packages/              shared test/harness packages
fixtures/              fixture catalog and metadata
tools/fixtures/         fixture tooling
tools/matrix/           matrix definitions and runners
.github/workflows/      CI and release validation
```

## Test tiers

### Fast

Pull-request feedback should stay representative and quick.

```bash
npm run matrix:fast
```

Fast checks should cover a small set of critical Cesium/Three consumers, Chromium, the default backend, and a small deterministic fixture. Do not move every new test into this tier.

### Full

Broad scheduled/manual compatibility validation.

```bash
npm run matrix:full
```

This tier may cover all consumers, Chromium/Firefox/WebKit, both backends, and the wider fixture matrix.

### Release gate

Validates an actual packed adapter artifact.

```bash
npm run matrix:release
```

Use this tier for package exports, packaged Worker/WASM assets, and clean external-consumer installation behavior.

### Compatibility boundaries

Boundary checks cover minimum/current renderer peers, supported Node.js versions, package managers, and Linux/macOS/Windows build smoke tests. These are better suited to scheduled/manual CI than every pull request.

## Common commands

```bash
npm ci
npm run build:matrix
npm run typecheck:matrix
npm run test:matrix
npm run e2e:fast
npm run e2e:full
npm run fixtures:list
npm run fixtures:fetch
npm run fixtures:verify
```

## Performance benchmarks

The performance suite is intentionally separate from the correctness scenarios. It
uses fixed browser view scripts and records machine-readable JSON for load and
first-render timings, steady-view/streaming timings, Range request counts and
bytes, rendered counts, public point-cache/hierarchy/worker diagnostics, and
public streaming performance counters. Decoded point-cache bytes describe the
adapter-owned CPU cache only; they are not browser or GPU memory measurements.

```bash
# Small, local-friendly smoke benchmark (one sample)
npm run benchmark

# Representative Cesium/Three + copc-js/Rust + small/large fixtures (two samples)
npm run benchmark -- --profile representative

# Compare two JSON reports. Timing differences remain informational by default.
npm run benchmark:compare -- --current benchmark-results/latest.json --baseline /path/to/baseline.json
```

Profiles fetch the selected shared fixtures before running. Use `--no-fetch` when
the fixture cache is already prepared. `--output`, `--apps`, `--browsers`,
`--backends`, `--fixtures`, and `--repeat` can override a profile; `--baseline`
adds a comparison against an existing report.
The constrained-cache scenario defaults to an 8 MiB public point-cache budget;
override it with `COPC_BENCHMARK_CACHE_BYTES` when a fixture needs a different
working set.
Only `--fail-on-regression` promotes repeatable, large request/byte/point-count
changes to a non-zero comparison result; normal PR compatibility runs do not run
this benchmark or fail on noisy absolute milliseconds.

Run individual consumers with the `dev:*` scripts in the root `package.json`, for example:

```bash
npm run dev:vite-react-cesium
npm run dev:vite-react-three
npm run dev:next-cesium
```

## CI policy

Pull-request CI should optimize for fast regression detection, not exhaustive compatibility coverage.

- Fast: representative builds/runtime checks only.
- Full: scheduled or manual broad matrix.
- Boundary: scheduled/manual compatibility envelope checks.
- Release gate: manual packed-artifact validation.

If a new test materially increases PR runtime, prefer placing it in Full, Boundary, or Release unless it protects a critical high-frequency regression.

## Adding a new consumer

When adding a framework, renderer, or bundler:

1. Keep its actual integration code inside `apps/`.
2. Reuse the shared fixture and test contract.
3. Register it in the matrix manifest instead of duplicating orchestration.
4. Add it to Fast only if it adds unique, high-value PR coverage.
5. Keep large datasets outside individual apps.

## Related project

Adapter implementation and internal conformance tests live in:

- [`mors119/copc-adapter`](https://github.com/mors119/copc-adapter)
