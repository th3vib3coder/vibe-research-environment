# Phase 2 Wave 4 — Tests And Validators

**Goal:** Make new Phase 2 surfaces measurable, enforceable, and hard to regress.

---

## WP-38 — New Schema Tests

Add schema tests for new machine-owned artifacts:
- `memory-sync-state.schema.test.js`
- `experiment-bundle-manifest.schema.test.js`
- `session-digest.schema.test.js` only if Wave 0 froze the digest contract

Acceptance:
- every new schema has valid and invalid fixtures
- degraded fixtures exist where the contract allows them

---

## WP-39 — Runtime Unit Tests

Add runtime tests for new Phase 2 modules, such as:
- `environment/tests/lib/bundle-manifest.test.js`
- `environment/tests/integration/memory-sync.test.js`
- `environment/tests/flows/results.test.js`

Coverage rule:
- happy path
- graceful failure
- independence / no-kernel-write behavior

Acceptance:
- memory sync and packaging logic pass the three-test minimum
- missing kernel projections do not cause fabricated outputs

---

## WP-40 — Integration And Status Tests

Add integration coverage for:
- memory sync mirroring control-plane decisions without becoming truth
- stale mirror warning surfacing in `/flow-status`
- result bundle creation for a completed experiment
- result findability from operator-facing surfaces

Acceptance:
- Phase 2 behavior is verified at system boundaries, not only helper level
- control-plane authority remains intact when mirrors are stale or missing

---

## WP-41 — Validators And Install Lifecycle Coverage

Update the active validator and install surfaces for new bundles:
- `validate-templates.js`
- `validate-runtime-contracts.js`
- `validate-install-bundles.js`
- `validate-bundle-ownership.js`
- `validate-references.js`

Update lifecycle tests for:
- install
- doctor
- repair
- uninstall
- upgrade

Acceptance:
- `memory-sync` and `flow-results` bundles are lifecycle-defined
- validators catch bundle ownership drift and missing references
- no Phase 3 export validators are mixed into this wave

---

## Parallelism

- WP-38 and WP-39 can run in parallel once contracts are stable
- WP-40 starts after the main runtime surfaces exist
- WP-41 runs after bundle manifests and owned paths are frozen

---

## Exit Condition

Wave 4 is complete when every active Phase 2 machine-owned surface has the
right mix of schema, runtime, integration, and lifecycle protection.
