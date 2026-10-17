# COPC adapter consumer validation

This repository validates **`@frillab/copc-adapter@0.5.0` as an external consumer**. It installs the packed public npm package, checks its public exports and bundled Worker, WASM, and declaration files, then builds and runs consumer applications against that artifact.

This is not the adapter implementation repository or a framework showcase. It proves that the published package boundary works in the supported browser, React, and SSR host environments.

## Supported host applications

### Vanilla (`apps/vanilla`)

Purpose: baseline browser consumer that isolates adapter behavior from React and SSR.

Renderer scenarios: Cesium and Three.js.

### React (`apps/react`)

Purpose: React lifecycle validation, including mount/unmount/remount, renderer switching, state synchronization, and cleanup.

Renderer scenarios: Cesium, Three.js, and React Three Fiber (R3F).

### Next (`apps/next`)

Purpose: SSR/client-boundary validation through a production build, hydration, and browser-only renderer startup.

Renderer scenarios: Cesium and Three.js.

There are exactly three applications because they represent the distinct host boundaries under test. Renderer, backend, fixture, and browser combinations are test parameters; they do not get separate applications. Vanilla's host integration has no React dependency. Next is a focused SSR consumer rather than a copy of the React playground.

## Shared implementation

The applications share one Control Panel, UI styles, diagnostics model, source catalog, fixture catalog, Range server, package validation, and test contract. Shared implementation lives in `packages/`; app-specific code contains only the differences required by each host. Fixtures live outside application bundles under `.cache/copc-fixtures`.

Vanilla + Cesium is the primary functional-spec host. Its default source is a public COPC URL and the adapter requests byte ranges directly from that origin. A compact streaming HUD keeps backend, active view, selected/rendered node counts, rendered points and their configured limits, and LoD visible while the diagnostics panel is collapsed. The shared panel reports source probe, hierarchy, LoD, streaming, cache, and style diagnostics. Click a rendered point to open a compact popover anchored to it, with additional attributes and dimensions available on demand. Cesium stays alive while a candidate source loads; a source replaces the current layer only after it has rendered points.

The shared panel lets you configure point size, node and point budgets, LoD, screen-space error, and maximum streaming distance. `Render distance` sets the camera range in meters; leave it blank to fit the camera to the loaded data. `Max render distance` is the adapter's node streaming limit. The matching URL parameters are `pointSize`, `renderDistance`, `maxNodes`, `maxRenderedPoints`, `maxDepth`, `maxScreenSpaceError`, and `maxRenderDistanceMeters`.

The shared remote selector currently enables Autzen Stadium (`autzen-classified.copc.laz`, RGB/intensity/classification) and Chicago Downtown (`chicago-downtown.copc.laz`, intensity/classification; RGB is disabled). Chromium verified both at `data.pointcloud.org` for CORS-readable `206` responses with valid `Content-Range`, COPC metadata, hierarchy, and rendered Cesium points. The candidate S3 Autzen, Millsite, and SoFi URLs returned `206`, but Chromium could not read `Content-Range` (the response did not expose it), so they are excluded. No URL is rewritten or proxied.

The local fixture server is shared by the Vite middleware and the Next route handler. It serves deterministic regression fixture metadata and byte ranges, including `Range`/`Content-Range`, `Accept-Ranges`, CORS, and explicit error scenarios. It is not used to proxy remote examples.

## Adapter package source

Every mode installs and validates the same public package identity and exports:

- `@frillab/copc-adapter`
- `@frillab/copc-adapter/cesium`
- `@frillab/copc-adapter/three`

| Source | Behavior |
| --- | --- |
| `checkout` | Stages the selected checkout in an isolated temporary directory, runs its real `prepack` through `npm pack`, validates the tarball and dependencies, then installs that tarball into this consumer workspace. |
| `tarball` | Validates and installs an existing local packed artifact. `npm run bootstrap:tarball` discovers one under `local-packages/`; `COPC_ADAPTER_TARBALL` can select an explicit artifact. |
| `npm` | Runs `npm pack` for the explicitly requested published `@frillab/copc-adapter@0.5.0`, validates that registry tarball, then installs the same artifact into this consumer workspace. |

For checkout mode, the usual local path is:

```text
../copc-adapter checkout
  → isolated npm pack/prepack
  → tarball and dependency validation
  → install packed artifact
  → external consumer tests
```

The adapter source is never imported directly, and checkout packaging does not modify the sibling checkout. All modes reject a package other than version `0.5.0`; there is no older-version fallback.

These environment variables are supported by `tools/adapter-source/`:

| Variable | Use |
| --- | --- |
| `COPC_ADAPTER_CHECKOUT` | Checkout path for `checkout` mode; defaults to `../copc-adapter`. |
| `COPC_ADAPTER_SOURCE` | `checkout`, `tarball`, or `npm`; defaults to `npm` for a registry-package consumer setup. |
| `COPC_ADAPTER_TARBALL` | Local `.tgz` path required for `tarball` mode. |
| `COPC_ADAPTER_VERSION` | npm mode version; must be exactly `0.5.0`. |

For example, to install a local artifact or the published package:

```sh
COPC_ADAPTER_SOURCE=tarball \
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter-0.5.0.tgz \
npm run bootstrap

COPC_ADAPTER_SOURCE=npm npm run bootstrap
```

## Test a local packed artifact before npm publish

Use checkout mode while actively developing adapter source. `npm run bootstrap:local` stages that checkout, runs its `npm pack`/`prepack`, validates the result, and installs it before testing.

Use tarball mode to test the exact `.tgz` intended for publication. From the adapter repository root, pack its package into this repository's ignored `local-packages/` directory:

```sh
cd apps/viewer-web
npm pack --pack-destination ../../../copc-adapter-test/local-packages
```

Then, from this repository, run:

```sh
npm run bootstrap:tarball
npm run dev:vanilla
```

Or run the standard fast validation tier, including bootstrap:

```sh
npm run test:tarball
```

`bootstrap:tarball` requires exactly one matching top-level `frillab-copc-adapter-*.tgz` in `local-packages/`. It validates the artifact's package metadata, public exports and targets, WASM, Worker, declarations, and dependencies through the existing tarball installer. Multiple matching files fail with instructions to remove extras or set `COPC_ADAPTER_TARBALL` to the artifact to test. Files in `local-packages/` are ignored by Git. This is the closest pre-publish check because it tests the exact package artifact rather than packing source again or fetching a published registry package.

Source mode differences:

- **checkout** — develop adapter source; run `npm run bootstrap:local` to pack, validate, install, and test the checkout.
- **tarball** — validate the exact existing `.tgz`; run `npm run bootstrap:tarball`.
- **npm** — validate the published registry artifact; run `npm run bootstrap` (the default).

## Local setup and development

Requirements: Node.js `>=22.12`, npm, and an installed packed adapter package. To validate local adapter changes, provide the sibling `../copc-adapter` checkout; checkout packaging runs its WASM build, so Rust and the `wasm32-unknown-unknown` target must be installed. Tarball and npm modes do not pack source.

For the normal remote-streaming viewer, install the repository dependencies and bootstrap the published target package:

```sh
npm ci
npm run bootstrap
npm run dev:vanilla
```

Then open `http://127.0.0.1:4173`. No COPC fixture download is needed. If you are actively changing the sibling adapter checkout, use `npm run bootstrap:local` instead of the registry bootstrap. A clean registry-installed consumer is also exercised separately by `npm run test:npm`.

Install Chromium once before local browser runs with `npx playwright install chromium`. CI installs Chromium and its system dependencies.

Start each host in its own terminal:

```sh
npm run dev:vanilla
npm run dev:react
npm run dev:next
```

| Host | URL | Select or open |
| --- | --- | --- |
| Vanilla | `http://127.0.0.1:4173` | Choose Cesium or Three.js in the Control Panel. |
| React | `http://127.0.0.1:4174` | Choose Cesium, Three.js, or R3F in the Control Panel. |
| Next | `http://127.0.0.1:4175/cesium` or `http://127.0.0.1:4175/three` | Each route starts its renderer after hydration. |

Cesium runs a real Viewer with local assets. Vanilla, React, and Next use `VITE_CESIUM_ION_TOKEN` from the repository-root `.env` to load Cesium ion's world imagery tiles; without it, the viewer uses bundled NaturalEarthII imagery. The token is included in the browser bundle, so use a Cesium ion token scoped for browser use. Three.js runs a real WebGL scene and adapter layer. R3F is available only in the React host. Next uses a browser-only renderer boundary so renderer startup happens after hydration.

`npm run test:local` combines local checkout bootstrap and the fast validation tier. If the package has already been bootstrapped, `npm run test:fast` runs the fast checks directly.

## Deterministic local fixtures

Local fixtures remain available for reproducible regression tests, offline development, failure scenarios, and exact byte-range checks. Fetch only when running those tests:

```sh
npm run fixtures:fetch -- small-valid-copc
npm run test:fast
```

Fixtures stay in `.cache/copc-fixtures`, outside app bundles. The fast PR tier uses this stable local source; it does not replace the remote streaming functional specification.

## Validation tiers

The compatibility workflow checks out the stable `v0.5.0` adapter tag, sets up Node 22 and the Rust WASM target needed by `npm pack`, restores the fixture cache, runs `npm ci`, installs Chromium, and calls the same `bootstrap:local` and repository test scripts used locally. The fixture cache key includes the runner OS and `fixtures/catalog.json` content; a restored file is still checked against catalog size and checksum. Fast runs on pull requests and pushes to `main`. Full uses the same preparation on the weekly schedule or a manual request.

### Fast

Fast is the normal pull request signal and also runs on pushes to `main`. Manual dispatch can request it. It runs package and shared tests, typechecks/builds all three hosts, and runs representative Chromium smoke for Vanilla Cesium, Vanilla Three.js, and React R3F using `copc-js` with `small-valid-copc`. It does not run the broader backend/renderer cases or start Next in a browser; the Next production build remains required.

Run locally with:

```sh
npm run test:fast
```

### Full

Full runs on the weekly schedule or by manual dispatch. It includes the Vanilla remote streaming specification, React remote Cesium source switching plus renderer/backend lifecycle checks, selected Rust backend checks, a fixture error case, and Next production server runtime checks including one remote Cesium render after hydration. It uses explicit high-value cases, not every possible combination.

Run locally with:

```sh
npm run test:full
```

`npm run e2e:full` alone requires a bootstrapped package, prepared fixture, and completed application build. `test:full` prepares the fixture and builds before launching the browser scenarios.

### Remote streaming

`test:remote` runs the Vanilla + Cesium remote functional specification. It tests direct Chromium requests to the enabled browser-verified sources, including range headers, `206`, readable `Content-Range`, incremental transfer, camera-driven streaming, cache reuse, styles, point picking, persistent-Viewer source switching, and a failed-source rollback. It needs network access to the public source host and does not use the local fixture server for COPC bytes.

```sh
npm run test:remote
```

### Registry-installed npm consumer

`test:npm` creates a temporary project outside the repository and runs `npm install cesium vite` followed by `npm install @frillab/copc-adapter@0.5.0`. It builds a minimal Cesium Vite consumer using only public package exports, then checks remote Range traffic and rendered points in Chromium. This is separate from checkout packaging and `.tgz` validation.

```sh
npm run test:npm
```

### Release

The `release-gate.yml` workflow is manual only. It accepts `checkout`, `tarball`, or `npm`, always requires the exact `0.5.0` package, validates and installs the exact packed artifact, runs builds and critical Chromium scenarios (including remote streaming and the Rust path), then runs the isolated registry-installed npm consumer. Tarball input must be a non-empty HTTPS URL. Checkout repository and ref are explicit workflow inputs.

The compatibility workflow intentionally checks out the stable adapter tag `v0.5.0`. The release gate is where a maintainer selects another repository/ref or artifact for release validation; it still fails if the package metadata is not `0.5.0`.

Run the equivalent release validation locally with:

```sh
npm run test:release
```

## Useful commands

```sh
npm test
npm run validate:package
npm run test:package
npm run test:shared
npm run typecheck
npm run build
npm run e2e:fast
npm run e2e:full
npm run fixtures:list
npm run fixtures:fetch -- small-valid-copc
npm run fixtures:verify -- small-valid-copc
npm run fixtures:serve
npm run test:remote
npm run test:npm
```

`e2e:fast` and `e2e:full` require a bootstrapped package and a ready fixture. Playwright validates the installed package and fixture before starting browser applications. Fast starts only Vanilla and React Vite servers. Full and release also start Next with `next start` on port `4175` after its production build. Playwright uses Chromium only, with ports `4173`, `4174`, and `4175`; local runs may reuse existing servers, while CI always starts clean servers.

## Fixture catalog

`fixtures/catalog.json` is the source of fixture IDs, capabilities, provenance, checksums, and cache paths. `small-valid-copc` is the deterministic smoke fixture. The catalog also records an RGB fixture and a geographic CRS fixture for focused validation, plus documented coverage gaps. Larger fixtures are not downloaded or exercised by pull request CI.
