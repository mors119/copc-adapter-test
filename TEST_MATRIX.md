# COPC adapter test matrix

이 저장소는 같은 COPC fixture와 같은 기본 streaming 조건을 여러 host/renderer 조합에서 확인한다.

| Host | Renderer | Entry | 실행 명령 |
| --- | --- | --- | --- |
| Vite Vanilla JS | Cesium | `@frillab/copc-adapter` | `npm run dev:vite-vanillajs` |
| Vite + React | Cesium | `@frillab/copc-adapter` | `npm run dev:vite-react-cesium` |
| Vite + React | Three.js | `@frillab/copc-adapter-local/three` | `npm run dev:vite-react-three` |
| Vite | React Three Fiber | `@frillab/copc-adapter-local/three` | `npm run dev:vite-r3f` |
| Next.js | Cesium | `@frillab/copc-adapter` | `npm run dev:next-cesium` |
| Next.js | Three.js | `@frillab/copc-adapter-local/three` | `npm run dev:next-three` |
| Next.js | React Three Fiber | `@frillab/copc-adapter-local/three` | `npm run dev:next-r3f` |

## 검증 순서

모든 앱의 typecheck와 production build는 아래 한 명령으로 확인한다.

```bash
npm run build:matrix
```

브라우저에서 실제 fixture까지 확인하려면 해당 dev 명령을 실행한다. Vite는 `apps/shared/viteFixtureServer.ts`가 `/samples/*`와 `/cesium/*`를 Range-aware로 제공한다. Next는 각 앱의 `app/api/*/[...path]/route.ts`가 같은 역할을 한다. 그래서 2GB fixture를 앱별 `public` 또는 build output으로 복사하지 않는다.

기본 fixture는 `/samples/sofi.copc.laz`다. 다른 파일을 쓰려면 각 host의 `SAMPLE_URL` 또는 Next client의 sample URL을 바꾼다.

## 설계 원칙

1. COPC core 동작과 host 통합을 분리한다. 테스트가 확인해야 하는 공통 계약은 `load`, metadata/hierarchy, node streaming, camera update, `destroy`다.
2. Cesium과 Three는 서로 다른 adapter surface를 사용한다. Cesium은 caller-owned `Viewer`, Three는 caller-owned `Scene`/`Camera`/`WebGLRenderer`를 전달한다.
3. React는 lifecycle wrapper만 담당한다. R3F는 `useThree`로 scene/camera/renderer를 받고 `useFrame`에서 layer update를 호출한다.
4. Next의 browser-only WebGL/Cesium 코드는 client boundary 안에서만 import한다. Next 16 Turbopack의 WASM URL 처리 문제를 피하기 위해 build/dev는 webpack 모드로 고정한다.
5. 테스트 매트릭스는 fixture 다운로드가 아니라 adapter 통합 차이를 드러내야 하므로, fixture URL과 backend/streaming 설정은 가능한 한 동일하게 유지한다.

현재 `@frillab/copc-adapter` 배포 entry는 Cesium이고, 로컬 TGZ에 Three entry가 있다. 따라서 Three/R3F 행은 의도적으로 local package track을 사용한다. 배포 패키지에도 Three entry를 포함할 때는 이 행의 dependency만 published package로 바꾸면 된다.
