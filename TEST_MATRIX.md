# COPC adapter test matrix

이 저장소는 같은 COPC fixture와 기본 streaming 조건을 여러 host/renderer 조합에서
실제 소비자처럼 확인한다. 매트릭스의 실행 대상과 앱 identity는
`tools/matrix/manifest.mjs`가 단일 소스로 관리한다.

| App identity | Host | Renderer | Public entry | 개발 명령 |
| --- | --- | --- | --- | --- |
| `vite-vanillajs-cesium` | Vite Vanilla JS | Cesium | `@frillab/copc-adapter` | `npm run dev:vite-vanillajs` |
| `vite-react-cesium` | Vite + React | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:vite-react-cesium` |
| `vite-react-three` | Vite + React | Three.js | `@frillab/copc-adapter/three` | `npm run dev:vite-react-three` |
| `vite-r3f` | Vite | React Three Fiber | `@frillab/copc-adapter/three` | `npm run dev:vite-r3f` |
| `next-cesium` | Next.js | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:next-cesium` |
| `next-three` | Next.js | Three.js | `@frillab/copc-adapter/three` | `npm run dev:next-three` |
| `next-r3f` | Next.js | React Three Fiber | `@frillab/copc-adapter/three` | `npm run dev:next-r3f` |

## 설치 및 package source

기본 설치는 npm에 게시된 버전을 사용한다.

```bash
npm run bootstrap
```

`copc-adapter` checkout에서 만든 packed artifact를 같은 패키지명으로 검증하려면
저장소 상대경로를 package manifest에 기록하지 않고 다음처럼 설치한다.

```bash
COPC_ADAPTER_SOURCE=tarball \
COPC_ADAPTER_TARBALL=/path/to/copc-adapter/apps/viewer-web/frillab-copc-adapter-0.3.0.tgz \
npm run bootstrap
```

`bootstrap`은 `COPC_ADAPTER_SOURCE=npm|tarball`을 지원한다. npm 경로는
`COPC_ADAPTER_VERSION`(기본 `0.3.0`)으로 버전을 선택하고, tarball 경로는 모든
consumer workspace에 `@frillab/copc-adapter@file:<absolute-path>`를 일시 설치한다.
bootstrap은 설치된 artifact가 root, `/cesium`, `/three` public export를 모두 갖는지도
검사한다. registry에 이 export가 아직 없는 오래된 artifact만 보이는 경우에는
tarball 경로로 해당 entry를 포함한 `copc-adapter` checkout을 지정한다.
두 경로 모두 앱의 import는 `@frillab/copc-adapter` 또는 공개 `/cesium`, `/three`
entry로 동일하다.

## 공통 runtime contract

각 브라우저 앱은 `window.__COPC_TEST__`를 노출한다. 계약은
`packages/test-contract`에 있으며, adapter별 `getSnapshot()`은
`@copc-test/harness-core`의 `normalizeSnapshot()`을 거쳐 같은 진단 shape로
제공된다.

```ts
window.__COPC_TEST__ = {
  config: {
    appId, host, renderer, fixtureUrl, backend, scenario,
    packageSource, packageVersion,
  },
  result: {
    contractVersion: 1,
    status: 'idle' | 'loading' | 'ready' | 'error' | 'destroyed',
    lifecycle: string,
    diagnostics: {
      backend?, lifecycle?, datasetUrl?, attached?,
      selectedNodeKeys, renderedNodeKeys,
      renderedPointCount?, streamingUpdateCount?,
      metadataLoaded?, hierarchyLoaded?,
    },
    startedAt?, readyAt?, destroyedAt?, updatedAt,
    error?: { name, message, stack? },
  },
  getResult(),
}
```

설정은 앱의 기본값에 build 환경, `window.__COPC_HARNESS_CONFIG__`, URL query
순서로 적용된다. Vite는 `VITE_COPC_*`, Next는 `NEXT_PUBLIC_COPC_*`를 사용한다.
브라우저에서 빠르게 바꿔 볼 때는 `?backend=copc-js`,
`?scenario=camera-stream`, `?fixture=/fixtures/point-format-7-rgb`,
`?packageSource=tarball`을 사용할 수 있다.

지원하는 공통 설정 값은 fixture URL, backend(`copc-js|rust`), renderer,
scenario(`load-and-stream|camera-stream|static`), package source(`npm|tarball`),
app identity다. viewer/scene/camera/renderer 생성과 mount/unmount는 각 consumer가
소유하며 공통 계약은 이를 숨기지 않는다.

## Shared fixture catalog and server

fixture metadata is kept in [`fixtures/catalog.json`](fixtures/catalog.json). The catalog
contains stable IDs, expected capabilities, source/provenance/license, checksum slots, and
the cache path. The downloaded files are deliberately kept outside git in
`.cache/copc-fixtures/`, so one cache can be used by every Vite and Next consumer.

```bash
# List IDs, capabilities, source URLs, and cache status.
npm run fixtures:list

# Fetch the small smoke fixture (use --all only when the large datasets are needed).
npm run fixtures:fetch
npm run fixtures:fetch -- point-format-7-rgb
npm run fixtures:fetch -- --all

# Verify cached files. --strict also fails entries whose publisher has not supplied a SHA-256.
npm run fixtures:verify
npm run fixtures:verify -- --all --strict

# Serve the shared cache and inspect Range requests from E2E tests.
npm run fixtures:serve
curl http://127.0.0.1:8787/__fixture__/stats
curl -H 'Range: bytes=0-63' http://127.0.0.1:8787/fixtures/small-valid-copc

# Remove downloaded files only.
npm run fixtures:clean
```

The server supports `GET`, `HEAD`, `OPTIONS`, byte ranges, `Content-Range`,
`Accept-Ranges`, configurable CORS, and these deterministic behaviors selected with
`?fixtureScenario=...` or `X-COPC-Fixture-Scenario`:

`default`, `no-range`, `ignore-range`, `malformed-range`, `not-found`, `truncated`,
`delayed`, and `transient-failure`. `?delayMs=250` controls an artificial delay and
`COPC_FIXTURE_ROOT`, `COPC_FIXTURE_CATALOG`, `COPC_FIXTURE_PORT`, and
`COPC_FIXTURE_CORS_ORIGIN` configure the process. Request logs include request count,
requested ranges, bytes served, status, scenario, and failure details at
`/__fixture__/stats`; `POST /__fixture__/reset` clears them.

Vite's middleware and every Next route now delegate to `packages/fixture-server`, so
framework-specific routes only adapt the request/response shape. The canonical browser URL
is `/fixtures/<fixture-id>`; `/samples/*` remains as a compatibility alias.

## 검증 명령

모든 앱의 타입체크와 production build는 각각 아래 명령으로 실행한다.

```bash
npm run typecheck:matrix
npm run build:matrix
```

선택된 앱만 실행할 수도 있다.

```bash
npm run matrix -- typecheck --apps vite-react-three,next-r3f
npm run matrix -- build --apps vite-react-cesium
```

Vite는 `apps/shared/viteFixtureServer.ts`가 `/fixtures/*`와 `/cesium/*`를 제공한다.
Next는 각 앱의 `app/api/fixtures/[...path]/route.ts`가 `/api/fixtures/*`를 제공한다.
그래서 2GB fixture를 앱별 `public` 또는 build output으로 복사하지 않는다.

기본 fixture는 Vite에서 `/fixtures/small-valid-copc`, Next에서
`/api/fixtures/small-valid-copc`다. 실제 브라우저 smoke와 backend/fixture 조합은
후속 E2E matrix에서 이 ID와 manifest를 재사용한다.

## Playwright runtime scenarios

`tools/matrix/manifest.mjs`의 `runtimeScenarios`가 consumer별 실행 대상을 관리하고,
`tests/e2e/runtime.spec.ts`는 모든 consumer에 같은 시나리오 구현을 적용한다. 테스트는
`window.__COPC_TEST__`의 공개 결과만 읽으며 decoder 내부 객체에는 접근하지 않는다.

계약에 정의된 시나리오 ID는 다음과 같다.

`metadata-root-hierarchy`, `attach-to-caller-renderer`, `initial-point-rendering`,
`camera-streaming-update`, `equivalent-view-is-stable`, `reload-to-ready`,
`detach-preserves-host-resources`, `unload-releases-point-state`,
`destroy-releases-layer-resources`, `color-mode-change`, `point-picking`,
`diagnostics-observable`, `source-error-is-visible`, `rust-failure-is-not-retried`.

현재 구현된 consumer가 제공하는 공통 smoke subset은 matrix manifest에 선언한다.
현재 공개 Cesium layer를 직접 사용하는 Vanilla consumer는 detach/unload/destroy도
실행하며, Three/R3F adapter artifact가 해당 lifecycle/picking API를 제공하면 같은
시나리오를 해당 consumer manifest에 추가한다.

```bash
# Chromium fast suite: representative Vite/Next consumers
npm run fixtures:fetch
npm run e2e:install       # first run only
npm run e2e:fast

# Every current consumer on Chromium, Firefox, and WebKit
npm run e2e:full

# Narrow the matrix without changing test logic
COPC_E2E_APPS=vite-react-three COPC_E2E_BROWSERS=chromium npm run e2e
```

Fast mode uses Chromium and `vite-react-cesium`, `vite-react-three`, and `next-r3f`.
Full mode selects all apps in the matrix and all three Playwright browser projects.
`COPC_E2E_APPS` and `COPC_E2E_BROWSERS` override either selection. Each project starts
its own dev server and reports the app identity, host, renderer, backend, fixture, and
browser in failure artifacts.

## Fast, full, and release gates

The tier definitions live in [`tools/matrix/manifest.mjs`](tools/matrix/manifest.mjs),
so the same selectors are used locally and in GitHub Actions.

```bash
# Every consumer typecheck/build + representative Chromium runtime rows.
npm run matrix:fast

# Every consumer, Chromium/Firefox/WebKit, copc-js/Rust, and smoke/PF7 rows.
npm run matrix:full

# Pack and test a local copc-adapter checkout or prepared tarball.
COPC_ADAPTER_CHECKOUT=/path/to/copc-adapter npm run matrix:release
# or
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter.tgz npm run matrix:release
```

All matrix commands accept the same narrow selectors, for example
`npm run matrix:full -- --apps vite-react-three --browsers chromium --backends rust`.
The release gate locates `apps/viewer-web` automatically in the upstream checkout,
runs `npm pack`, installs that packed artifact under the real
`@frillab/copc-adapter` name, validates the packaged Worker/WASM assets, and checks
that consumer builds do not retain checkout-relative adapter paths.

`.github/workflows/compatibility.yml` runs the fast gate on pull requests and normal
pushes, and the full gate on the weekly schedule or manual dispatch. The separate
`release-gate.yml` workflow accepts an adapter ref or a prepared tarball URL.

On failure Playwright retains the trace/video and attaches a screenshot, browser console
log, page errors, harness result JSON, and request summary. The request summary includes
all observed `Range` headers so a passing point-rendering test proves actual byte-range
streaming rather than page load alone. `--project <app>-<browser>` can be used after
`npm run e2e:full` to rerun one exact combination; tiered runs include backend and
fixture in the project name as well.
