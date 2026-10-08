# Repository rules

- Keep only the Vanilla, React, and Next host environments; add another framework only for a concrete unsupported boundary.
- Treat renderer, backend, fixture, and browser choices as runtime test parameters, not applications.
- Share the test UI, harness, fixtures, and Range server instead of duplicating them.
- Test the packed `@frillab/copc-adapter@0.4.0` public exports; never import adapter source internals.
- Keep pull request CI representative and lightweight; put broader coverage in full or release validation.
- Do not hide unexpected failures with skips, mocks, fake diagnostics, or backend/version fallbacks; Rust must not silently fall back to copc-js.
- Keep fixtures outside app bundles and do not modify the sibling adapter checkout as part of consumer tests.
