# COPC adapter test matrix

The detailed compatibility specification now lives in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

That document covers the current consumer matrix, host/framework and bundler modes, public renderer entrypoints, package sources, backends, browsers, fixtures, tiers, expected failures, and visual/performance policy.

Contributor setup and reproducibility guidance is in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

For the common sibling-checkout layout, `npm run bootstrap:local` packs and
installs `../copc-adapter` as an external 0.4.0 artifact. Use
`npm run dev:local:three`, `npm run dev:local:cesium`, or
`npm run test:local:three` for focused local checks.

The executable matrix selections remain in [`tools/matrix/manifest.mjs`](tools/matrix/manifest.mjs). Keep the human-readable documentation aligned when a consumer, fixture, status, or CI tier changes.
