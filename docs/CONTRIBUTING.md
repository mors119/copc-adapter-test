# Contributing to the compatibility testbed

This repository is a compatibility specification for the external package [`@frillab/copc-adapter`](https://github.com/mors119/copc-adapter). Keep changes focused on observable consumer behavior and preserve the distinction between shared test infrastructure and framework-owned integration.

For the current supported combinations, tiers, fixtures, and status meanings, see [`COMPATIBILITY.md`](COMPATIBILITY.md).

## Before changing a consumer

Start with the smallest relevant command and confirm the package source you intend to test:

```bash
npm ci

# Published package, exact version from the repository configuration.
npm run bootstrap

# Or use a sibling adapter checkout through its packed artifact.
COPC_ADAPTER_SOURCE=checkout \
COPC_ADAPTER_CHECKOUT=/path/to/copc-adapter \
npm run bootstrap

# Common ../copc-adapter layout; packs and installs automatically.
npm run bootstrap:local
npm run dev:local:three
npm run dev:local:cesium
npm run test:local:three
```

The `checkout` path must run the adapter’s normal `npm pack`/`prepack` process. A consumer must never import adapter source files directly. For a prepared artifact, set `COPC_ADAPTER_SOURCE=tarball` and `COPC_ADAPTER_TARBALL=/path/to/adapter.tgz`.

## Adding a framework, renderer, or bundler

1. Add or update the real consumer under `apps/`. Keep framework lifecycle, renderer creation, camera/view ownership, client boundaries, and cleanup in that consumer.
2. Use a public package entrypoint: the root entry, `/cesium`, or `/three`, as appropriate.
3. Reuse `packages/test-contract`, `packages/harness-core`, `packages/fixture-client`, and the shared fixture server. Do not create a framework-specific fixture server or duplicate scenario assertions.
4. Expose the common `window.__COPC_TEST__` result contract. Include app identity, host, renderer, backend, fixture, lifecycle status, rendered counts, streaming counters, and structured errors. The package entrypoint belongs in the matrix/package import declaration; it is not an additional required `HarnessConfig` field.
5. Add the consumer identity to [`tools/matrix/manifest.mjs`](../tools/matrix/manifest.mjs), including its host, bundler/mode, renderer, public entrypoint, default scenario, backend selection, and applicable runtime scenarios.
6. Update the human-readable matrix in [`COMPATIBILITY.md`](COMPATIBILITY.md) and the short [`TEST_MATRIX.md`](../TEST_MATRIX.md) index when the supported surface changes. Record an intentional build-only, not-applicable, or planned/untested boundary instead of implying runtime coverage.
7. Put a new consumer in Fast only when it protects a high-value, frequent PR regression. Use Full, Boundary, or Release for broader or slower coverage.

Framework integration is part of what this repository tests. A shared helper may normalize configuration and diagnostics, but it must not hide whether a React effect, Vue hook, Svelte lifecycle, Angular destroy hook, or SSR client island actually owns the adapter and renderer.

## Expected failures

An expected failure is a maintained compatibility boundary, not a way to make a broken build green. Keep it in the executable matrix only when all of the following are true:

- the record has a specific human-readable reason;
- it has a narrow output signature that identifies the known failure;
- the affected phase and dimensions are clear (for example, build-only failure versus runtime not applicable);
- an upstream issue, release note, or technical reference is recorded when available; and
- the runner rejects both unrelated failures and a build that unexpectedly starts passing.

Review expected failures on every adapter or framework upgrade. When the upstream behavior is fixed, remove the record and run the formerly failing cell as a normal supported combination.

## Reproducing one CI matrix cell

Use the same app, browser, backend, and fixture selectors that CI uses. This example targets one Rust/WASM browser cell:

```bash
COPC_ADAPTER_SOURCE=checkout \
COPC_ADAPTER_CHECKOUT=/path/to/copc-adapter \
npm run matrix:full -- \
  --apps vite-react-three \
  --browsers chromium \
  --backends rust \
  --fixtures small-valid-copc
```

To separate package/build problems from runtime problems:

```bash
npm run matrix -- typecheck --apps vite-react-three
npm run matrix -- build --apps vite-react-three
COPC_E2E_APPS=vite-react-three \
COPC_E2E_BROWSERS=chromium \
COPC_E2E_BACKENDS=rust \
COPC_E2E_FIXTURES=small-valid-copc \
npm run e2e
```

For a release-like package check, use a packed adapter artifact:

```bash
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter-0.4.0.tgz \
npm run matrix:release
```

Failure artifacts should be read together: browser console, page errors, harness result JSON, screenshot/trace, and the network summary. Range headers and fixture-server statistics distinguish actual streaming from a page that merely loaded.

## Fixtures

Use fixture IDs from [`fixtures/catalog.json`](../fixtures/catalog.json), not copied files in an app. The catalog is the place for source URL, provenance, license, checksum, capability, size, and Range-budget metadata.

```bash
npm run fixtures:list
npm run fixtures:fetch                  # small smoke fixture
npm run fixtures:fetch -- point-format-7-rgb
npm run fixtures:fetch -- --all
npm run fixtures:verify
npm run fixtures:clean
```

Fast checks should use the deterministic small fixture. Full and performance runs may opt into the larger RGB and geographic-CRS fixtures. If a public source disappears, keep the row documented as `planned/untested` or a fixture gap; do not silently remove the required data characteristic or replace it with an unrelated dataset.

Negative source behavior is selected through the shared server (`not-found`, `truncated`, ignored/malformed Range, delay, and transient-failure modes). The expected public failure should remain visible in the harness result.

## Backend-specific expectations

`copc-js` is the default decoder path. Rust/WASM runs must load the packaged Worker/WASM assets from the installed package and report backend identity through public diagnostics. Do not catch a Rust initialization or streaming error and retry with `copc-js`; that would turn a backend compatibility failure into a false pass.

Do not compare private traversal order, Worker protocol details, decoder allocation, or exact timing. Compare public metadata, hierarchy state, rendered/selected nodes and points, streaming updates, request ranges, lifecycle transitions, and structured error categories.

## Visual and performance changes

Visual changes should use the narrow deterministic suite: fixed local fixture, fixed viewport and device scale factor, deterministic camera/view, and Chromium software rendering. Numeric/runtime assertions remain primary. Baseline updates are explicit and must include the reason for the visual change.

Performance changes belong in the benchmark suite, separate from correctness assertions. Keep machine-readable measurements for load, first render, steady view, camera streaming, Range requests/bytes, rendered counts, and public cache/hierarchy diagnostics. Do not add noisy absolute millisecond thresholds to ordinary PR gates; use repeatable whole-file download, request amplification, byte, or point-count regressions when a threshold is justified.

WebKit results provide useful browser-engine coverage. They do not represent every physical Safari, macOS, or iOS combination, so do not describe a WebKit pass as universal Apple-platform support.

## Documentation review checklist

Before opening a pull request:

- the consumer still imports only public package entrypoints;
- the shared fixture is referenced by ID and remains outside app output;
- lifecycle and renderer ownership stay visible in the consumer;
- the matrix manifest, `COMPATIBILITY.md`, and `TEST_MATRIX.md` agree;
- expected failures have narrow reasons/signatures and are not broad fallbacks;
- Fast coverage remains intentionally small;
- the relevant typecheck, build, runtime, visual, boundary, or release command was run; and
- the pull request describes the exact app/renderer/backend/browser/fixture cell that changed.
