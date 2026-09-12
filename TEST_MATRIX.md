# COPC adapter test matrix

이 저장소는 같은 COPC fixture와 기본 streaming 조건을 여러 host/renderer 조합에서
실제 소비자처럼 확인한다. 매트릭스의 실행 대상과 앱 identity는
`tools/matrix/manifest.mjs`가 단일 소스로 관리한다.

| App identity | Host | Renderer | Public entry | 개발 명령 |
| --- | --- | --- | --- | --- |
| `vite-vanillajs-cesium` | Vite Vanilla JS | Cesium | `@frillab/copc-adapter` | `npm run dev:vite-vanillajs` |
| `vite-vanilla-three` | Vite Vanilla JS | Three.js | `@frillab/copc-adapter/three` | `npm run dev:vite-vanilla-three` |
| `vite-react-cesium` | Vite + React | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:vite-react-cesium` |
| `vite-react-three` | Vite + React | Three.js | `@frillab/copc-adapter/three` | `npm run dev:vite-react-three` |
| `vite-r3f` | Vite | React Three Fiber | `@frillab/copc-adapter/three` | `npm run dev:vite-r3f` |
| `next-cesium` (`next-cesium-webpack`) | Next.js / webpack | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:next-cesium` |
| `next-cesium` (`next-cesium-turbopack`) | Next.js / Turbopack | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:turbo --workspace apps/next-cesium` |
| `next-three` (`next-three-webpack`) | Next.js / webpack | Three.js | `@frillab/copc-adapter/three` | `npm run dev:next-three` |
| `next-three` (`next-three-turbopack`) | Next.js / Turbopack | Three.js | `@frillab/copc-adapter/three` | `npm run dev:turbo --workspace apps/next-three` |
| `next-r3f` (`next-r3f-webpack`) | Next.js / webpack | React Three Fiber | `@frillab/copc-adapter/three` | `npm run dev:next-r3f` |
| `next-r3f` (`next-r3f-turbopack`) | Next.js / Turbopack | React Three Fiber | `@frillab/copc-adapter/three` | `npm run dev:turbo --workspace apps/next-r3f` |
| `nuxt-cesium` | Nuxt | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:nuxt-cesium` |
| `nuxt-three` | Nuxt | Three.js | `@frillab/copc-adapter/three` | `npm run dev:nuxt-three` |
| `sveltekit-cesium` | SvelteKit | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:sveltekit-cesium` |
| `sveltekit-three` | SvelteKit | Three.js | `@frillab/copc-adapter/three` | `npm run dev:sveltekit-three` |
| `astro-cesium` | Astro | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:astro-cesium` |
| `astro-three` | Astro | Three.js | `@frillab/copc-adapter/three` | `npm run dev:astro-three` |
| `vite-vue-cesium` | Vite + Vue | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:vite-vue-cesium` |
| `vite-vue-three` | Vite + Vue | Three.js | `@frillab/copc-adapter/three` | `npm run dev:vite-vue-three` |
| `vite-svelte-cesium` | Vite + Svelte | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:vite-svelte-cesium` |
| `vite-svelte-three` | Vite + Svelte | Three.js | `@frillab/copc-adapter/three` | `npm run dev:vite-svelte-three` |
| `webpack-three` | Webpack 5 | Three.js | `@frillab/copc-adapter/three` | `npm run dev --workspace apps/webpack-three` |
| `rollup-cesium` | Rollup | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev --workspace apps/rollup-cesium` |
| `esbuild-three` | esbuild | Three.js | `@frillab/copc-adapter/three` | `npm run dev --workspace apps/esbuild-three` |
| `parcel-three` | Parcel | Three.js | `@frillab/copc-adapter/three` | `npm run dev --workspace apps/parcel-three` |
| `angular-cesium` | Angular | Cesium | `@frillab/copc-adapter/cesium` | `npm run dev:angular-cesium` |
| `angular-three` | Angular | Three.js | `@frillab/copc-adapter/three` | `npm run dev:angular-three` |

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

## Boundary compatibility consumers

`tools/compatibility/manifest.mjs`에는 지원 경계와 일반 개발 매트릭스의 현재 버전을
정확한 문자열로 기록한다.

| Case | Renderer/consumer | Peer version |
| --- | --- | --- |
| `cesium-min` | Cesium | `1.142.0` |
| `cesium-current` | Cesium | `1.145.0` |
| `three-min` | Three.js | `0.170.0` |
| `three-current` | Three.js | `0.186.0` |
| `r3f-current` | React Three Fiber | React `19.2.8`, R3F `9.7.0`, Three `0.186.0` |

각 케이스는 저장소 workspace 밖의 clean temporary directory에 작은 Vite consumer를
생성한다. consumer의 `@frillab/copc-adapter`는 npm의 고정 버전 또는 외부 tarball로
설치되며 workspace 경로를 참조하지 않는다. 설치와 production build가 모두 통과해야 한다.

```bash
# The boundary cases use the public renderer entrypoints from a packed artifact.
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter.tgz \
  npm run compatibility:consumer -- \
    --cases cesium-min,cesium-current,three-min,three-current,r3f-current \
    --package-managers npm

# Exercise all supported package-manager commands against representative cases.
COPC_ADAPTER_TARBALL=/path/to/frillab-copc-adapter.tgz \
  npm run compatibility:consumer -- \
    --cases cesium-min,three-current \
    --package-managers npm,pnpm,yarn,bun
```

실패 메시지는 `packageManager`, OS, Node, renderer, peer track, adapter package version을
항상 포함한다. Node 18은 선언된 최소 지원선이고 Node 22는 일반 CI의 current track이다.
GitHub Actions의 `compatibility-boundaries.yml`은 같은 packed adapter artifact를
Node 18/22, npm/pnpm/Yarn/Bun, Linux/macOS/Windows에서 사용해 경계와 build smoke를
검증한다. 이 adapter 조합에서 Bun은 native runtime 의존성이 없으므로
`required-pass` track으로 기록되어 있으며, 실패를 expected-failure로 숨기지 않는다.

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
`.cache/copc-fixtures/`, so one cache can be used by every consumer.

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

Vite's middleware and every framework route now delegate to `packages/fixture-server`, so
framework-specific routes only adapt the request/response shape. Next exposes the control
endpoints at `/api/fixture-control/*` because App Router private segments cannot begin with `_`;
the other SSR hosts retain `/api/__fixture__/*`. The canonical browser URL
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
npm run build:bundlers
```

Bundler consumers are separate workspaces with independent bundler
configuration. Each `dev` command runs a production build first, then starts
the small static server that delegates fixture, Range, CORS, and diagnostic
endpoints to the shared fixture server.

```bash
npm run typecheck:bundlers
npm run build:bundlers
npm run e2e:bundlers
npm run matrix -- build --apps webpack-three,rollup-cesium
```

Webpack and esbuild exercise the Rust/WASM backend. Rollup exercises the
explicit `/cesium` entrypoint, while Parcel exercises `/three`. All four are in
the full Playwright matrix; Webpack and Rollup are in the fast matrix.

Vite는 `apps/shared/viteFixtureServer.ts`가 `/fixtures/*`와 `/cesium/*`를 제공한다.
Next, Nuxt, SvelteKit, Astro는 각자의 framework route adapter를 통해 `/api/fixtures/*`와
`/api/cesium/*`를 shared fixture server에 위임한다.
그래서 2GB fixture를 앱별 `public` 또는 build output으로 복사하지 않는다.

Angular 앱은 표준 Angular CLI workspace의 standalone component로 구성한다.
`apps/angular-shared/proxy.conf.json`이 개발 서버의 fixture/diagnostics 요청을
공용 `packages/fixture-server` 프로세스(`127.0.0.1:8787`)로 전달하며, Cesium 정적
자산은 Angular production build의 `assets` 설정으로 패키지에서 복사한다.
`npm run dev:angular-cesium`과 `npm run dev:angular-three`는 공용 fixture server와
해당 Angular dev server를 함께 실행한다. Playwright도 Angular E2E 실행 시 공용
fixture server를 함께 시작하므로 Angular 전용 fixture server나 fixture/diagnostics
구현을 추가하지 않는다.

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
`diagnostics-observable`, `api-lifecycle`, `source-probe`, `source-error-is-visible`,
`rust-failure-is-not-retried`.

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

Fast mode uses Chromium and the non-Next consumer apps in the matrix; build and
typecheck still cover every app. Full mode selects all apps in the matrix and all
three Playwright browser projects.
`COPC_E2E_APPS` and `COPC_E2E_BROWSERS` override either selection. Expected-failure
variants are excluded from browser runs by default; set
`COPC_E2E_INCLUDE_EXPECTED_FAILURES=1` to inspect the known Turbopack failure. Each project starts
its own dev server and reports the app identity, host, renderer, backend, fixture, and
browser in failure artifacts.

Next.js webpack and Turbopack are separate matrix identities. The current Turbopack entries are
recorded expected build failures because the adapter's WASM URL modules are not yet resolvable by
that bundler; the matrix runner captures the build output and requires the recorded adapter WASM
loader and `?url&no-inline` markers before accepting the failure. It also fails if any of those
builds unexpectedly start passing, so the record can be removed when the package or bundler
behavior is fixed.

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

`npm run e2e:preview` builds the matrix first and runs the same Chromium scenarios
against each Vite production preview server. This keeps the development-server and
production-bundle paths under the same consumer contract.
## Public API coverage

The `vite-react-three` consumer enables the extended `api-lifecycle` scenario. It
uses the published `/three` entry directly to exercise the layer lifecycle and
diagnostics (`getMetadata()`, hierarchy/cache counters, snapshots), all documented
color-mode constructor options, `pick(...)`, `probeCopcSource(...)`, and the
renderer-neutral `CopcStreamingCore` load and view-update contract. The same consumer also runs the
`source-probe` scenario against the fixture server's ignored-Range mode. Its normal
camera-streaming scenario still verifies the integrated layer update, while the
API-focused URL skips only the initial active-layer render pass; its explicit core and
color-mode candidates still load and update against the fixture.

```bash
COPC_E2E_APPS=vite-react-three COPC_E2E_BROWSERS=chromium npm run e2e -- --grep 'api-lifecycle|source-probe'
```

On failure Playwright retains the trace/video and attaches a screenshot, browser console
log, page errors, harness result JSON, and request summary. The request summary includes
all observed `Range` headers so a passing point-rendering test proves actual byte-range
streaming rather than page load alone. `--project <app>-<browser>` can be used after
`npm run e2e:full` to rerun one exact combination; tiered runs include backend and
fixture in the project name as well.
