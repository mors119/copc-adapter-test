# COPC adapter compatibility

This repository is an external compatibility testbed for [`@frillab/copc-adapter`](https://github.com/mors119/copc-adapter). It checks the package as a real application dependency across host/framework, bundler, renderer entrypoint, browser engine, backend, package source, fixture, and runtime-scenario boundaries.

The adapter repository owns implementation and internal conformance tests. This repository owns external-consumer behavior: public package exports, Worker/WASM asset resolution, framework lifecycle, renderer integration, streaming, Range/CORS behavior, and the browser-facing diagnostic contract.

## Architecture

The compatibility boundary is intentionally split into four layers:

| Layer | Responsibility |
| --- | --- |
| `apps/` consumers | Real framework lifecycle, renderer setup, client/SSR boundaries, mount/unmount, and cleanup. These integrations stay visible inside each app. |
| `packages/` shared harness | Runtime contract, scenario helpers, diagnostics normalization, fixture client, and reusable assertions. It does not create a framework viewer or renderer scene. |
| `packages/fixture-server` | One shared fixture catalog/cache, provenance and checksum checks, Range/CORS behavior, negative source modes, and request instrumentation. |
| Playwright and matrix runners | Start selected consumers, choose browser/backend/fixture dimensions, run common scenarios, and attach identity plus failure diagnostics. |

The public package entrypoints under test are:

```text
@frillab/copc-adapter
@frillab/copc-adapter/cesium
@frillab/copc-adapter/three
```

Consumer code must use those entrypoints. It must not import private adapter source paths or depend on a repository-relative local alias.

## Status vocabulary

The matrix uses these statuses when a cell needs more detail than a simple pass/fail:

| Status | Meaning |
| --- | --- |
| `supported/pass` | The package/build path is supported and is expected to pass its gate. |
| `expected failure` | A known failure is intentionally retained in the matrix. It needs a reason and a recognizable failure signature. |
| `build-only` | Typecheck or production build is covered; browser runtime is intentionally outside this cell. |
| `runtime-tested` | The shared browser contract runs for the cell. |
| `not applicable` | A dimension does not apply, such as runtime for a known build failure. |
| `planned/untested` | Coverage is documented for future work or an unavailable source and is not treated as a pass. |

These statuses describe the compatibility contract and coverage policy. A current CI run remains the evidence for whether a supported cell passed today.

## Consumer matrix

The executable selection source is [`tools/matrix/manifest.mjs`](../tools/matrix/manifest.mjs). The table below is the human-readable review of that source. `Full` means Chromium, Firefox, and WebKit with both `copc-js` and Rust/WASM where the consumer is applicable.

| Matrix identity | Host / mode | Renderer / public entrypoint | Build | Browser runtime | Backend | Package source coverage | Fixture / scenario |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `vite-vanillajs-cesium` | Vite Vanilla JS | Cesium / root | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-vanilla-three` | Vite Vanilla JS | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-react-cesium` | Vite + React | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-react-three` | Vite + React | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream`, API/lifecycle scenarios |
| `vite-r3f` | Vite + React Three Fiber | R3F / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `camera-stream` |
| `vite-vue-cesium` | Vite + Vue | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-vue-three` | Vite + Vue | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-svelte-cesium` | Vite + Svelte | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `vite-svelte-three` | Vite + Svelte | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `next-cesium-webpack` | Next.js / webpack | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `next-cesium-turbopack` | Next.js / Turbopack | Cesium / `/cesium` | expected failure | not applicable | not applicable | not applicable | WASM URL resolution failure |
| `next-three-webpack` | Next.js / webpack | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `next-three-turbopack` | Next.js / Turbopack | Three.js / `/three` | expected failure | not applicable | not applicable | not applicable | WASM URL resolution failure |
| `next-r3f-webpack` | Next.js / webpack | R3F / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `camera-stream` |
| `next-r3f-turbopack` | Next.js / Turbopack | R3F / `/three` | expected failure | not applicable | not applicable | not applicable | WASM URL resolution failure |
| `nuxt-cesium` | Nuxt | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `nuxt-three` | Nuxt | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `sveltekit-cesium` | SvelteKit | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `sveltekit-three` | SvelteKit | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `astro-cesium` | Astro | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `astro-three` | Astro | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `webpack-three` | Webpack 5 | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `camera-stream` |
| `rollup-cesium` | Rollup | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `esbuild-three` | esbuild | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `camera-stream` |
| `parcel-three` | Parcel | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `camera-stream` |
| `angular-cesium` | Angular | Cesium / `/cesium` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |
| `angular-three` | Angular | Three.js / `/three` | supported/pass | runtime-tested | `copc-js`, Rust | npm, checkout, tarball | `load-and-stream` |

The three Turbopack rows remain visible because removing a known failure would hide a compatibility boundary. Their build record requires the `copc_wasm.wasm_.loader.mjs` and `?url&no-inline` markers; an unrelated error is a failure, and a build that starts passing requires removing the exception from the executable manifest.

## Tier coverage

| Tier | Purpose | Runtime selection | Browser / backend / fixture | Package source |
| --- | --- | --- | --- | --- |
| Fast | Representative PR gate | Vite Vanilla Cesium and Vite React Three; selected consumer builds/typechecks | Chromium / `copc-js` / `small-valid-copc` | checkout in CI; npm when explicitly selected locally |
| Full | Broad scheduled or manually dispatched compatibility run | All current consumer identities except expected-failure browser variants | Chromium, Firefox, WebKit / `copc-js`, Rust / small, RGB, and geographic fixtures | checkout in CI; npm when explicitly selected locally |
| Visual | Small deterministic rendering supplement | Vite React Cesium, Vite React Three, and Vite R3F | Chromium / `copc-js` / `small-valid-copc` | packed checkout |
| Release | External package gate | Vite Cesium, Vite Three/R3F, and Next representatives | Chromium / `copc-js` / `small-valid-copc` | packed `.tgz` |
| Boundary | Peer, Node, package-manager, and OS envelope | Clean temporary Vite consumers | Node 18/22; npm, pnpm, Yarn, Bun; Linux, macOS, Windows | packed `.tgz` |

Commands:

```bash
npm run matrix:fast
npm run matrix:full
npm run matrix:release
npm run e2e:visual
```

The same selectors can narrow a run to one cell:

```bash
npm run matrix:full -- \
  --apps vite-react-three \
  --browsers chromium \
  --backends rust \
  --fixtures small-valid-copc
```

## Boundary compatibility consumers

Boundary checks use clean temporary Vite consumers outside this workspace. The exact peer versions are intentionally recorded in [`tools/compatibility/manifest.mjs`](../tools/compatibility/manifest.mjs) rather than inherited from the main lockfile:

| Case | Renderer / consumer | Track | Exact peer versions |
| --- | --- | --- | --- |
| `cesium-min` | Cesium | minimum | `cesium@1.142.0` |
| `cesium-current` | Cesium | current | `cesium@1.145.0` |
| `three-min` | Three.js | minimum | `three@0.170.0` |
| `three-current` | Three.js | current | `three@0.186.0` |
| `r3f-current` | React Three Fiber | current | `@react-three/fiber@9.7.0`, `@types/three@0.185.4`, `react@19.2.8`, `react-dom@19.2.8`, `three@0.186.0` |

Node 18 is the declared minimum track and Node 22 is the current CI track. Boundary CI installs the same packed adapter artifact with npm, pnpm, Yarn, and Bun (all currently `required-pass`) and runs production-build smoke on Linux, macOS, and Windows. Failures identify the package manager, operating system, Node version, renderer peer track, and installed adapter version.

## Package source modes

The compatibility target is `@frillab/copc-adapter@0.4.0`.

- `npm` installs the exact published version. It never silently downgrades when that version is unavailable.
- `checkout` runs the adapter checkout’s real `npm pack`/`prepack` path, then installs the resulting artifact under the real package name.
- `tarball` installs a prepared `.tgz` as an external consumer would. This is the release gate’s source.

All modes validate the package metadata, root/`cesium`/`three` public exports, and packaged Worker/WASM assets. No consumer should import the adapter checkout directly.

## Fixture coverage and provenance

Fixture metadata, provenance, licenses, checksums, capability declarations, and Range budgets live in [`fixtures/catalog.json`](../fixtures/catalog.json). Downloads are cached once in `.cache/copc-fixtures/` and are not copied into app public directories or build outputs.

| Fixture | Coverage status | Data characteristics | Normal use |
| --- | --- | --- | --- |
| `small-valid-copc` | covered | LAS 1.4 point format 7, intensity/classification, projected CRS, nested hierarchy | Fast, visual, release, and smoke runtime |
| `point-format-7-rgb` | covered | LAS 1.4 point format 7 with RGB and larger streaming workload | Full and RGB visual/runtime cases |
| `geographic-crs` | covered | LAS 1.4 point format 6, geographic CRS, WKT2 metadata | Full CRS coverage |
| `point-format-8-rgb-nir` | planned/untested | The documented Millsite URL currently returns 404 | Keep documented as a fixture gap; do not add to runnable coverage until a valid source exists |
| `invalid-truncated` | negative | Derived server response from the small fixture | Explicit source-error scenarios |

Use the fixture commands to inspect and verify the shared cache:

```bash
npm run fixtures:list
npm run fixtures:fetch
npm run fixtures:fetch -- --all
npm run fixtures:verify
npm run fixtures:clean
```

The server can select `default`, `no-range`, `ignore-range`, `malformed-range`, `not-found`, `truncated`, `delayed`, and `transient-failure` behavior through `fixtureScenario`. E2E evidence includes requested ranges, request count, bytes served, status, and failure details.

## Backend and browser interpretation

`copc-js` is the default JavaScript decoder path. The `rust` selection exercises the packaged Rust/WASM worker and its emitted assets. A Rust failure must stay visible as a Rust/backend failure; the application must not silently retry through `copc-js` and report a false pass.

Assertions use public diagnostics and observable behavior: metadata and hierarchy load, backend identity, selected/rendered nodes, rendered point counts, streaming updates, source errors, and public lifecycle state. They do not depend on private traversal order, Worker messages, decoder allocation, or WASM ABI details.

Playwright WebKit is useful browser-engine coverage, but passing WebKit is not equivalent to testing every physical Safari, macOS, or iOS combination. The Boundary tier catches platform-specific package, path, shell, and build assumptions separately on Linux, macOS, and Windows.

## Visual and performance policy

Visual checks are supplementary and intentionally narrow: representative consumers, a fixed local fixture, a fixed 1280×720 viewport, device scale factor 1, deterministic camera/view commands, Chromium, and the documented software-rendering path. Runtime and numeric assertions remain the primary correctness signal. Baselines are updated only through the explicit visual-update command.

Performance benchmarks are separate from correctness. They record load/first-render and streaming timings, Range request counts/bytes, rendered counts, and public cache/hierarchy/worker diagnostics. Decoded point-cache bytes describe adapter-owned CPU cache, not browser or GPU memory. Scheduled/manual comparisons may flag large repeatable request, byte, or point-count regressions; ordinary PR compatibility checks do not fail on noisy absolute milliseconds.
