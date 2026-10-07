# COPC Adapter Consumer Testbed

This repository validates [`@frillab/copc-adapter`](https://github.com/mors119/copc-adapter) as an installed public npm package. The canonical target is **0.4.0**. Consumer builds check its public exports and packaged Worker/WASM/declaration assets; browser scenarios exercise real COPC loads through the shared Range-enabled fixture server.

There are exactly three host applications because they cover the distinct host boundaries we support:

| Application | Responsibility | Renderer scenarios |
| --- | --- | --- |
| `apps/vanilla` | Small browser baseline, without React or SSR | Cesium, Three.js |
| `apps/react` | React mount, cleanup, remount, and state synchronization | Cesium, Three.js, React Three Fiber |
| `apps/next` | Server/client boundary, SSR-safe imports, hydration, and Next bundling | Cesium, Three.js |

Cesium, Three.js, R3F, backends, and fixtures are runtime scenarios or parameters. They do not each get an application. The three hosts mount one shared Control Panel and use common diagnostics, fixture catalog, and byte Range server.

## Local sibling checkout

With `copc-adapter` checked out at `../copc-adapter`, prepare the package with:

```sh
npm ci
npm run bootstrap:local
npm run fixtures:fetch -- small-valid-copc
```

`bootstrap:local` runs the adapter checkout’s actual `npm pack` and `prepack` flow, validates the resulting `@frillab/copc-adapter@0.4.0` tarball, then installs that packed artifact for these external consumers. It never imports adapter source files. Set `COPC_ADAPTER_CHECKOUT=/path/to/copc-adapter` to select another checkout. A missing sibling or wrong package version fails explicitly.

Other explicit package sources are supported:

```sh
COPC_ADAPTER_SOURCE=tarball \
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter-0.4.0.tgz \
npm run bootstrap

COPC_ADAPTER_SOURCE=npm npm run bootstrap
```

npm mode requires the published 0.4.0 package; it never downgrades to an older version. `npm run test:local` performs the local packed-checkout setup and fast validation.

## Run an application

```sh
npm run dev:vanilla  # open http://127.0.0.1:5173; choose Cesium or Three
npm run dev:react    # open http://127.0.0.1:5173; choose Cesium, Three, or R3F
npm run dev:next     # visit /cesium or /three
```

The first two applications use Vite for development and builds. Next renders a small shared client boundary; browser-only renderer modules are dynamically imported after hydration. Cesium uses a real Viewer, the bundled NaturalEarthII imagery, local Cesium assets, and globe controls without an Ion token. Three uses a real WebGL renderer, scene, camera, controls, resize handling, and adapter layer. R3F is intentionally limited to React.

## Validation commands

```sh
npm run validate:package
npm run test:package
npm run test:shared
npm run typecheck
npm run build
npm run e2e:fast
npm run test:fast
npm run test:full
npm run test:release
```

`test:fast` is the PR tier: package and shared tests, all three typechecks/builds, then Chromium smoke for Vanilla Cesium, Vanilla Three, and React R3F with `copc-js` and the small fixture. It fetches the shared smoke fixture if it is not cached.

`test:full` adds Rust backend cases, React renderer/backend switching and cleanup, and production Next hydration/renderer checks. The manually dispatched release gate uses the same adapter-source implementation as local setup, validates the exact packed artifact, builds all applications, and runs the full Chromium scenarios. Rust failures remain visible when Rust is selected.

`npm run e2e:fast` and `npm run e2e:full` require the package to be bootstrapped and the fixture cache to be ready. E2E preflight fails with the fetch command when a required fixture is absent; tests are not skipped.

## Fixtures

`fixtures/catalog.json` is the shared source of fixture IDs, capabilities, provenance, checksums, and cache paths. Fixture bytes stay under `.cache/copc-fixtures`, outside application bundles. The small deterministic valid COPC is used for normal browser validation. The catalog also retains an RGB-capable fixture and a geographic-CRS fixture for focused validation; the large datasets are not downloaded or exercised by PR CI.

One fixture server implementation handles the Vite host middleware and Next route adapter. It serves fixture metadata, byte `Range`/`Content-Range`, `Accept-Ranges`, CORS, and explicit error scenarios. Download or inspect fixtures with `npm run fixtures:list`, `npm run fixtures:fetch -- <fixture-id>`, and `npm run fixtures:verify -- <fixture-id>`.
