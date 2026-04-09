# Phase 5 Wave 4 — Tests And Validators

**Goal:** Make the orchestrator MVP measurable, enforceable, and hard to
regress before any Phase 5 closeout is attempted.

---

## WP-108 — New Schema Tests

Add schema tests for new Phase 5 machine-owned artifacts:
- `router-session.schema.test.js`
- `run-queue-record.schema.test.js`
- `lane-policy.schema.test.js`
- `lane-run-record.schema.test.js`
- `recovery-record.schema.test.js`
- `escalation-record.schema.test.js`
- `external-review-record.schema.test.js`
- `continuity-profile.schema.test.js`
- `continuity-profile-history.schema.test.js`
- `assembled-continuity-payload.schema.test.js`

Coverage rule:
- one valid fixture
- one invalid fixture
- one degraded or partial fixture where the contract allows it

Acceptance:
- every Phase 5 schema has explicit valid and invalid coverage
- degraded cases are represented honestly

---

## WP-109 — State, Queue, And Continuity Runtime Tests

Add focused runtime coverage for:
- orchestrator bootstrap and state readers
- queue replay and dependency handling
- continuity update/forget/history behavior
- recall adapters
- context assembly, dedup, cache, and truncation

Acceptance:
- append-only semantics are verified in code, not assumed from docs
- continuity updates remain explicit and auditable
- cache and truncation behavior are observable outputs

---

## WP-110 — Coordinator And Lane Integration Tests

Add integration coverage for:
- intent routing into queue records
- execution lane success and bounded failure
- review lane objections and reroute proposals
- recovery and escalation mapping
- provider-lane capability enforcement

Acceptance:
- unsupported supervision/integration combinations fail closed
- repeated failures do not fabricate success
- review artifacts remain non-canonical

---

## WP-111 — Operator And Lifecycle Coverage

Add or extend tests for:
- status shim
- run shim
- minimal operator shell summaries
- install, doctor, repair, uninstall, and upgrade coverage for the orchestrator bundle

Acceptance:
- operator-facing surfaces stay observational and bounded
- lifecycle commands understand the Phase 5 bundle
- uninstall remains limited to owned paths only

---

## WP-112 — Validators And Reference Guards

Update the active validator surfaces for Phase 5:
- `validate-runtime-contracts.js`
- `validate-install-bundles.js`
- `validate-bundle-ownership.js`
- `validate-references.js`
- `validate-counts.js`
- any command/reference inventory checks affected by new shims or schemas

Acceptance:
- validators catch missing Phase 5 schemas, bundle drift, or reference drift
- no Phase 5 surface claims paths already owned by earlier phases
- planning and spec references remain current

---

## Parallelism

- WP-108 and WP-109 can run in parallel once Wave 0 and Wave 2 contracts are stable
- WP-110 starts once the first coordinator runtime is real
- WP-111 starts once operator entry surfaces and bundle ownership are implemented
- WP-112 runs after schema and bundle inventory are frozen

---

## Exit Condition

Wave 4 is complete when every active Phase 5 surface has the right mix of
schema, runtime, integration, lifecycle, and validator protection.
