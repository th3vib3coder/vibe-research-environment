# Phase 3 Wave 4 — Tests And Validators

**Goal:** Make Phase 3 surfaces measurable, enforceable, and hard to regress.

---

## WP-59 — New Schema Tests

Add schema tests for the new Phase 3 machine-owned artifacts:
- `export-snapshot.schema.test.js`
- `export-record.schema.test.js`
- `export-alert-record.schema.test.js`

Coverage rule:
- one valid fixture
- one invalid fixture
- one degraded or compatibility-limited fixture where allowed

Acceptance:
- every Phase 3 schema has explicit valid and invalid coverage
- degraded profile-safety cases are represented where the contract allows them

---

## WP-60 — Shared Helper And Runtime Tests

Add focused runtime tests for:
- `environment/lib/export-eligibility.js`
- export artifact helpers
- `environment/flows/writing.js`

Minimum policy cases:
- eligible promoted claim with verified citations
- created/unpromoted claim
- killed claim
- disputed claim
- unverified citation
- zero tracked citations
- non-strict claim without fresh schema validation
- degraded-mode path when profile metadata is unavailable

Acceptance:
- the shared helper proves the full Phase 3 rule set once
- writing runtime passes happy path, graceful failure, and independence checks

---

## WP-61 — Integration And Pack Tests

Add integration coverage for:
- snapshot creation before claim-backed export
- `/flow-writing` generating claim-backed artifacts from a frozen snapshot
- post-export warning replay when claims drift after export
- advisor pack assembly from one command path
- rebuttal pack assembly from one command path
- results and writing surfaces sharing one export-policy helper

Acceptance:
- Phase 3 behavior is verified at system boundaries, not only helper level
- pack assembly and warning replay remain traceable and deterministic

---

## WP-62 — Validators, Compatibility, And Lifecycle Coverage

Update the active validator and lifecycle surfaces for the new bundle and schemas:
- `validate-runtime-contracts.js`
- `validate-install-bundles.js`
- `validate-bundle-ownership.js`
- `validate-references.js`
- `validate-counts.js`

Add or extend compatibility checks for:
- profile-safety export behavior across kernel `default` versus `strict`
- fresh schema validation requirement for non-strict claims

Acceptance:
- `flow-writing` is lifecycle-defined
- validators catch missing Phase 3 contracts or ownership drift
- no Phase 4 connector or automation validators leak into this wave

---

## Parallelism

- WP-59 and WP-60 can run in parallel once Wave 0 contracts are stable
- WP-61 starts after the main writing runtime exists
- WP-62 runs after bundle ownership and schema inventory are frozen

---

## Exit Condition

Wave 4 is complete when every active Phase 3 machine-owned surface has the right mix of schema, runtime, integration, compatibility, and lifecycle protection.
