# Phase 4 Wave 4 — Tests And Validators

**Goal:** Make connector, automation, and domain-pack surfaces measurable,
enforceable, and hard to regress.

---

## WP-80 — New Schema Tests

Add schema tests for the new Phase 4 machine-owned artifacts:
- `connector-manifest.schema.test.js`
- `connector-run-record.schema.test.js`
- `automation-definition.schema.test.js`
- `automation-run-record.schema.test.js`
- `domain-config.schema.test.js`
- `domain-pack.schema.test.js`

Coverage rule:
- one valid fixture
- one invalid fixture
- one degraded fixture where the contract allows optional infrastructure

Acceptance:
- every new schema has explicit valid and invalid coverage
- degraded external-tool or missing-scheduler cases are represented honestly

---

## WP-81 — Runtime And Integration Tests

Add focused runtime and integration coverage for:
- connector registry and exporters
- automation definition loading and run ledgers
- domain-pack resolver and active-pack fallback

Minimum cases:
- happy path
- graceful failure when external dependencies are unavailable
- independence / no-kernel-write behavior
- idempotent rerun behavior where the contract promises it

Acceptance:
- external failures never fabricate successful artifacts
- automation reruns do not silently destroy prior evidence
- missing domain packs fall back cleanly to default behavior

---

## WP-82 — Operator And Lifecycle Coverage

Add or extend tests for:
- connector health surfacing in `/flow-status`
- automation status surfacing in `/flow-status`
- active domain-pack surfacing in `/flow-status`
- install, doctor, repair, uninstall, and upgrade coverage for new bundles

Acceptance:
- every Phase 4 bundle is lifecycle-defined
- operator summaries stay observational and do not become a second task system
- uninstall scope remains bounded to owned paths only

---

## WP-83 — Validators And Reference Guards

Update the active validator surfaces for the new bundles and docs:
- `validate-runtime-contracts.js`
- `validate-install-bundles.js`
- `validate-bundle-ownership.js`
- `validate-references.js`
- `validate-counts.js`

Acceptance:
- validators catch missing Phase 4 contracts or bundle-ownership drift
- docs and plan references remain current
- no Phase 4 surface claims paths already owned by earlier phases

---

## Parallelism

- WP-80 and WP-81 can run in parallel once Wave 0 contracts are stable
- WP-82 starts after the first operator surfaces exist
- WP-83 runs after bundle ownership and schema inventory are frozen

---

## Exit Condition

Wave 4 is complete when every active Phase 4 machine-owned surface has the
right mix of schema, runtime, integration, lifecycle, and validator protection.
