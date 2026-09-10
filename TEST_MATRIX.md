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
`?scenario=camera-stream`, `?fixture=/samples/other.copc.laz`,
`?packageSource=tarball`을 사용할 수 있다.

지원하는 공통 설정 값은 fixture URL, backend(`copc-js|rust`), renderer,
scenario(`load-and-stream|camera-stream|static`), package source(`npm|tarball`),
app identity다. viewer/scene/camera/renderer 생성과 mount/unmount는 각 consumer가
소유하며 공통 계약은 이를 숨기지 않는다.

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

Vite는 `apps/shared/viteFixtureServer.ts`가 `/samples/*`와 `/cesium/*`를
Range-aware로 제공한다. Next는 각 앱의 `app/api/*/[...path]/route.ts`가 같은
역할을 한다. 그래서 2GB fixture를 앱별 `public` 또는 build output으로 복사하지
않는다.

기본 fixture는 Vite에서 `/samples/sofi.copc.laz`, Next에서
`/api/samples/sofi.copc.laz`다. 실제 브라우저 smoke와 backend/fixture 조합은
후속 E2E matrix에서 이 계약과 manifest를 재사용한다.
