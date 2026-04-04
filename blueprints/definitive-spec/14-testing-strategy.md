# 14 — Testing Strategy

---

## Purpose

Define how runtime code, compatibility checks, and CI validators prevent
regression and spec/runtime drift.

This document is about **tests**. Benchmark-style **evals** and operator
validation live in [14A-evaluation-harness.md](./14A-evaluation-harness.md).

---

## Two Testing Worlds

### Runtime Code

JavaScript modules in `environment/` are tested with unit and integration tests.

Examples:
- `environment/control/session-snapshot.js`
- `environment/control/attempts.js`
- `environment/control/decisions.js`
- `environment/control/events.js`
- `environment/control/capabilities.js`
- `environment/control/query.js`
- `environment/control/middleware.js`
- `environment/flows/literature.js`
- `environment/flows/experiment.js`
- `environment/lib/flow-state.js`
- `environment/lib/manifest.js`

### Compatibility Checks

Kernel-owned guarantees are tested through compatibility harnesses, not through
mock-only unit tests.

Examples:
- governance profiles
- claim event sequence enforcement
- config protection
- governance event immutability

---

## Three-Test Minimum per Shell Module

Every outer-project module must prove three things:

| Test | What it proves |
|------|---------------|
| Happy path | Module works when kernel is available |
| Graceful failure | Module degrades honestly when kernel is unavailable |
| Independence | Kernel still works correctly if this module disappears |

If any of the three fails, the module is not ready.

---

## Runtime Test Matrix

### Unit Tests

Focus:
- pure helper logic
- schema validation and rejection paths
- capability defaulting
- token counting mode selection
- attempt/session lifecycle invariants

Minimum modules:
- `environment/control/session-snapshot.js`
- `environment/control/attempts.js`
- `environment/control/decisions.js`
- `environment/control/events.js`
- `environment/control/capabilities.js`
- `environment/control/query.js`
- `environment/control/middleware.js`
- `environment/flows/literature.js`
- `environment/flows/experiment.js`
- `environment/lib/flow-state.js`
- `environment/lib/manifest.js`
- `environment/lib/token-counter.js`
- `environment/lib/session-metrics.js`
- `environment/lib/export-eligibility.js`
- `environment/lib/export-snapshot.js`
- `environment/lib/export-records.js`
- `environment/connectors/registry.js`
- `environment/connectors/health.js`
- `environment/connectors/filesystem-export.js`
- `environment/connectors/obsidian-export.js`
- `environment/automation/definitions.js`
- `environment/automation/run-log.js`
- `environment/automation/artifacts.js`
- `environment/automation/builtin-plans.js`
- `environment/automation/plan-render.js`
- `environment/automation/runtime.js`
- `environment/domain-packs/index.js`
- `environment/domain-packs/loader.js`
- `environment/domain-packs/resolver.js`
- `environment/flows/writing.js`

### Schema Tests

Every machine-owned file shape gets:
- one valid fixture
- one invalid fixture
- one partial/degraded fixture where allowed

Active machine-owned schemas:
- `session-snapshot.schema.json`
- `capabilities-snapshot.schema.json`
- `memory-sync-state.schema.json`
- `memory-mark-record.schema.json`
- `attempt-record.schema.json`
- `event-record.schema.json`
- `decision-record.schema.json`
- `flow-index.schema.json`
- `literature-flow-state.schema.json`
- `experiment-flow-state.schema.json`
- `schema-validation-record.schema.json`
- `experiment-manifest.schema.json`
- `experiment-bundle-manifest.schema.json`
- `session-digest.schema.json`
- `export-snapshot.schema.json`
- `export-record.schema.json`
- `export-alert-record.schema.json`
- `connector-manifest.schema.json`
- `connector-run-record.schema.json`
- `connector-status.schema.json`
- `automation-definition.schema.json`
- `automation-run-record.schema.json`
- `domain-config.schema.json`
- `domain-pack.schema.json`
- `costs-record.schema.json`
- `install-state.schema.json`

Later phases add schema tests only when new machine-owned artifacts land.

### Integration Tests

Minimum integration scenarios:
1. bootstrap creates `flows/` and `control/`
2. `/flow-status` rebuilds missing `control/session.json`
3. opening/updating/closing an attempt refreshes heartbeat and writes telemetry
4. corrupt flow state or control snapshot fails closed and rebuilds cleanly
5. `/flow-literature` registers a paper and persists linked claim IDs
6. `/flow-experiment` creates and lists manifests without duplicating attempt lifecycle
7. memory sync mirrors control-plane decisions without becoming a second truth path
8. session digest export writes under `results/summaries/` without inventing a canonical session id
9. `/flow-writing` can assemble advisor and rebuttal packs through middleware without inventing claim truth
10. `/flow-writing` can publish a snapshot-first handoff through middleware and respects the shared export-policy gate for default-mode claims

Active Phase 3 integration coverage also proves:
- export snapshot creation before claim-backed export
- post-export warning replay stays append-only
- results and writing surfaces share one export-policy helper

Phase 4+ must add:
- connector failure visibility without kernel-write side effects
- automation artifact visibility plus idempotent rerun behavior where practical
- domain-pack activation, invalid-pack rejection, and clean fallback to default behavior
- operator summary surfacing of active automations, connector health, and active domain pack without inventing new truth paths

Phase 4 Wave 0 now adds schema coverage for:
- connector contracts and visible failure records
- automation definitions and run ledgers
- domain-pack activation config and pack manifests

Phase 4 Wave 1 adds runtime coverage for:
- connector registry discovery plus overlap rejection
- one-way filesystem and Obsidian export adapters consuming already-derived VRE artifacts
- operator status surfacing of connector health without inventing a second task system

Phase 4 Wave 2 adds runtime coverage for:
- automation definition discovery plus run-ledger validation
- reviewable digest/reminder artifacts with idempotent rerun guards
- operator status surfacing of automation readiness and latest artifact paths

Phase 4 Wave 3 adds runtime coverage for:
- domain-pack registry and repo-owned pack loading
- project-scoped activation plus invalid/unknown-pack/not-installed fallback
- safe activation that refuses silent config overwrite unless explicitly forced
- preset-only flow surfacing for literature, experiment, results, and writing helpers
- operator status surfacing of the active domain pack without inventing a new truth path

Phase 4 Wave 4 adds cross-surface coverage for:
- neutral `runtimeInstalled: false` behavior across connectors, automation, and domain-pack runtimes
- install, doctor, repair, uninstall, and upgrade coverage with Phase 4 bundles present
- validator coverage that scans Phase 4 runtime modules for kernel-write-adjacent references

---

## Command Shim Validation

Prompt shims are not unit-tested. They are validated through real operator runs.

Every critical command must prove:
1. it reads and writes only its allowed state surfaces
2. it never writes kernel truth
3. degraded mode is explicit, not fabricated
4. it delegates lifecycle-sensitive behavior to shared middleware

See [14A-evaluation-harness.md](./14A-evaluation-harness.md) for saved benchmark and operator-validation artifacts.

---

## Kernel Compatibility Validation

These tests run against the real kernel contract surface.

Suggested location:
`environment/tests/compatibility/`

### Claim State Machine

```js
test('CREATED → PROMOTED without R2_REVIEWED is blocked', () => {
  // Verify parser rejects invalid sequence
});

test('valid sequence CREATED → R2_REVIEWED → PROMOTED passes', () => {
  // Verify accepted
});
```

### Profile Compatibility

```js
test('default mode still runs confounder check', () => {
  // Verify non-negotiable hook still blocks missing confounder_status
});

test('strict mode turns integrity degradation into fail-loud behavior', () => {
  // Verify the same hook surface hardens when VIBE_SCIENCE_STRICT=1
});
```

Phase 3 adds:

```js
test('default-mode claim requires fresh schema validation before export', () => {
  // Verify export helper refuses until validation artifact exists
});

test('strict-mode claim stays export-eligible without schema-validation drift', () => {
  // Verify profile-safety compatibility keeps strict claims honest without inventing extra blockers
});
```

### Config Protection And Immutability

```js
test('Write to schema file is blocked', () => {
  // Verify exit code 2 and governance event logged
});

test('governance_events rejects UPDATE at storage layer', () => {
  // Verify append-only guarantee
});
```

---

## CI Validators

Run on every commit and PR:

| Validator | What it checks |
|-----------|---------------|
| `validate-templates.js` | JSON templates parse correctly |
| `validate-runtime-contracts.js` | runtime contracts and gating artifacts match schema contracts |
| `validate-references.js` | every referenced file exists |
| `validate-install-bundles.js` | every bundle manifest references real repo paths |
| `validate-bundle-ownership.js` | no two bundles claim the same managed path |
| `validate-counts.js` | documented counts still match reality |
| `validate-no-kernel-writes.js` | no outer-project code bypasses read-only rule |
| `validate-roles.js` | every role in roles.md maps to a known permission-engine role |
| `validate-no-personal-paths.js` | no hardcoded user paths in committed files |

---

## Regression Triggers

### When Modifying Kernel Contract

1. update `CORE-READER-INTERFACE-SPEC.md`
2. rerun kernel tests
3. rerun outer-project consumer tests
4. rerun capability defaulting tests

### When Modifying Control Plane

1. rerun schema tests
2. rerun attempt lifecycle tests
3. rerun snapshot rebuild tests
4. rerun degraded-mode tests

### When Modifying Install Or Lifecycle Logic

1. rerun install, doctor, repair, uninstall, and upgrade tests
2. verify bundle ownership validators still pass
3. verify uninstall removes only owned paths
4. verify backed-up content restores correctly

---

## Test Location

```
environment/tests/
├── control/
│   ├── session-snapshot.test.js
│   ├── attempts.test.js
│   ├── decisions.test.js
│   ├── events.test.js
│   ├── capabilities.test.js
│   ├── query.test.js
│   └── middleware.test.js
├── flows/
│   ├── literature.test.js
│   ├── experiment.test.js
│   ├── writing.test.js
│   └── writing-packs.test.js
├── schemas/
│   ├── session-snapshot.schema.test.js
│   ├── capabilities-snapshot.schema.test.js
│   ├── attempt-record.schema.test.js
│   ├── event-record.schema.test.js
│   ├── decision-record.schema.test.js
│   ├── flow-index.schema.test.js
│   ├── literature-flow-state.schema.test.js
│   ├── experiment-flow-state.schema.test.js
│   ├── schema-validation-record.schema.test.js
│   ├── experiment-manifest.schema.test.js
│   ├── costs-record.schema.test.js
│   └── install-state.schema.test.js
├── lib/
│   ├── flow-state.test.js
│   ├── manifest.test.js
│   ├── token-counter.test.js
│   └── session-metrics.test.js
├── compatibility/
│   ├── state-machine.test.js
│   ├── profiles.test.js
│   ├── config-protection.test.js
│   └── export-profile-safety.test.js
├── install/
│   ├── install.test.js
│   ├── doctor.test.js
│   ├── repair.test.js
│   ├── uninstall.test.js
│   └── upgrade.test.js
├── integration/
│   ├── flow-bootstrap.test.js
│   ├── control-plane-rebuild.test.js
│   ├── literature-register.test.js
│   ├── experiment-manifest-lifecycle.test.js
│   ├── writing-handoff.test.js
│   └── writing-packs.test.js
└── ci/
    ├── validate-templates.js
    ├── validate-runtime-contracts.js
    ├── validate-references.js
    ├── validate-install-bundles.js
    ├── validate-bundle-ownership.js
    ├── validate-counts.js
    ├── validate-no-kernel-writes.js
    ├── validate-roles.js
    └── validate-no-personal-paths.js
```

Phase 3 currently adds:
- `environment/tests/integration/writing-handoff.test.js`
- `environment/tests/integration/writing-packs.test.js`

---

## Invariants

1. Every runtime module has unit or integration coverage
2. Every machine-owned runtime contract or gating artifact validates against a schema
3. Every shell module passes happy, failure, and independence checks
4. Kernel contract changes trigger both kernel and outer-project suites
5. CI validators run on every commit
6. Prompt behavior is validated through saved operator/eval artifacts, not unit tests
