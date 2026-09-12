# AGENTS.md

Repository-wide rules for coding agents.

- Treat this repository as an external compatibility testbed for `@frillab/copc-adapter`.
- Prefer shared fixtures, assertions, diagnostics, and orchestration over duplicated test code.
- Keep framework-specific lifecycle and renderer integration inside each consumer app.
- Test public package entrypoints only; do not depend on private adapter source paths.
- Keep large COPC fixtures shared and out of individual app outputs.
- Keep PR CI fast. Add broad browser/backend/version coverage to full, boundary, or release tiers instead.
- Do not move every new consumer into the fast tier.
- Preserve reproducible packed-artifact testing in the release gate.
- Add or update tests when behavior changes.
- Keep each change focused and avoid unrelated refactoring.
- Do not weaken or delete tests merely to make CI pass.
- Do not perform destructive Git operations or force pushes without explicit approval.
