# Phase 1 Closeout

**Date:** 2026-04-01  
**Repo:** `vibe-research-environment`  
**Scope:** Phase 1 closeout for Vibe Research Environment (VRE)

---

## Verdict

VRE Phase 1 is **implementation-complete** inside this repo.

What is closed with files on disk:
- canonical control plane
- literature + experiment flow MVP
- schema/test/validator coverage
- Phase 1 benchmark definitions
- saved benchmark repeats
- saved operator-validation artifact
- measured baseline context artifact

What is **not** fully closed at ecosystem level:
- nothing in the accepted Phase 1 cross-repo boundary remains blocked today
- the richer `minimal/standard/strict` governance proposal survives only as
  future design space; it is not a missing prerequisite for Phase 1 sign-off

What was closed after the initial VRE Phase 1 freeze:
- append-only `governance_events` storage now exists in the current sibling kernel snapshot, including schema, migration, DB helper, and hook emitters
- protected config coverage is now directly visible both in runtime hooks and in `.claude/settings.json`
- claim promotion now has an explicit pre-write lifecycle validator: `PROMOTED` is blocked unless the latest recorded event is `R2_REVIEWED`

So the honest reading is:
- **VRE implementation:** ready
- **cross-repo Phase 1 sign-off:** complete against the kernel's documented `default/strict` governance baseline

---

## Evidence Map

### Saved Benchmark Repeats

- [flow-status-resume / 2026-03-31-02](../../../.vibe-science-environment/operator-validation/benchmarks/flow-status-resume/2026-03-31-02/)
- [flow-literature-register / 2026-03-31-02](../../../.vibe-science-environment/operator-validation/benchmarks/flow-literature-register/2026-03-31-02/)
- [flow-experiment-register / 2026-03-31-02](../../../.vibe-science-environment/operator-validation/benchmarks/flow-experiment-register/2026-03-31-02/)
- [degraded-kernel-mode / 2026-03-31-02](../../../.vibe-science-environment/operator-validation/benchmarks/degraded-kernel-mode/2026-03-31-02/)

### Saved Artifacts

- operator validation: [phase1-resume-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-resume-validation.json)
- context baseline: [phase1-context-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-context-baseline.json)

### Repo Validation Surfaces

- benchmark artifact contract test: [saved-artifacts.test.js](../../../environment/tests/evals/saved-artifacts.test.js)
- compatibility checks: [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [config-protection.test.js](../../../environment/tests/compatibility/config-protection.test.js), [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js)
- CI validators: [run-all.js](../../../environment/tests/ci/run-all.js)

---

## Phase 1 Exit Gate Outcome (all 17 gates from Doc 13)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | core-reader.js has 8 tested projection functions | PASS | inherited kernel contract anchored in [02-kernel-contract.md](../02-kernel-contract.md) |
| 2 | CLI bridge returns stable JSON envelope | PASS | inherited kernel contract anchored in [02-kernel-contract.md](../02-kernel-contract.md) |
| 3 | Flow state lives outside kernel in `.vibe-science-environment/` | PASS | [flow-state.js](../../../environment/lib/flow-state.js), [flow-state.test.js](../../../environment/tests/lib/flow-state.test.js) |
| 4 | Canonical operator snapshot in `control/session.json` | PASS | [session-snapshot.js](../../../environment/control/session-snapshot.js), [session-snapshot.test.js](../../../environment/tests/control/session-snapshot.test.js) |
| 5 | Every `/flow-*` opens and closes an attempt | PASS | [middleware.js](../../../environment/control/middleware.js), [middleware.test.js](../../../environment/tests/control/middleware.test.js) |
| 6 | Capability snapshot defaults unknown features to `false` | PASS | [capabilities.js](../../../environment/control/capabilities.js), [capabilities.test.js](../../../environment/tests/control/capabilities.test.js) |
| 7 | Shared middleware chain handles lifecycle | PASS | [middleware.js](../../../environment/control/middleware.js) |
| 8 | `/flow-status` resumes and produces summary | PASS | [flow-status.md](../../../commands/flow-status.md), [control-plane-rebuild.test.js](../../../environment/tests/integration/control-plane-rebuild.test.js) |
| 9 | `/flow-literature` registers paper and links to claim | PASS | [literature.js](../../../environment/flows/literature.js), [literature-register.test.js](../../../environment/tests/integration/literature-register.test.js) |
| 10 | `/flow-experiment` creates manifest and tracks outputs | PASS | [experiment.js](../../../environment/flows/experiment.js), [experiment-manifest-lifecycle.test.js](../../../environment/tests/integration/experiment-manifest-lifecycle.test.js) |
| 11 | `/flow-experiment` lists existing manifests | PASS | [experiment.test.js](../../../environment/tests/flows/experiment.test.js) |
| 12 | At least one flow demonstrates two-substrate rule | PASS | [literature.js](../../../environment/flows/literature.js), [experiment.js](../../../environment/flows/experiment.js) |
| 13 | Flow state, control records, manifests validate against schemas | PASS | [validate-runtime-contracts.js](../../../environment/tests/ci/validate-runtime-contracts.js), [attempt-record.schema.test.js](../../../environment/tests/schemas/attempt-record.schema.test.js) |
| 14 | Saved operator-validation artifact (resume ≤2 min) | PASS | [phase1-resume-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-resume-validation.json) |
| 15 | Phase 1 scenarios in eval harness with saved runs | PASS | [flow-status-resume summary](../../../.vibe-science-environment/operator-validation/benchmarks/flow-status-resume/2026-03-31-02/summary.json) |
| 16 | Baseline context cost measured | PASS | [phase1-context-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-context-baseline.json) |
| 17 | Kernel governance prerequisites automatically verified | PARTIAL | [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js); follow-up FU-55-001 |

**Result: 16 PASS, 1 PARTIAL.** Phase 1 VRE implementation sign-off remains green; the automated kernel-governance evidence claim is corrected below.

---

## Phase 5.5 Correction Note — Gate 17

Gate 17 was originally marked `PASS` as though VRE had an automated runtime
probe for every kernel governance prerequisite. That was too strong. The sibling
kernel exists and the checklist below records real cross-repo evidence, but the
VRE compatibility tests linked above are contract fixtures and static sequence
checks; they do not spawn the sibling kernel or exercise a live governance
runtime.

The corrected status is therefore `PARTIAL`: Phase 1 remains usable against the
documented kernel baseline, but the specific claim "automatically verified" is
not closed until FU-55-001 adds a live sibling-kernel compatibility probe.

## Declared Follow-Up

- FU-55-001: add a VRE compatibility test that runs against the sibling
  `vibe-science` checkout and verifies the governance envelope through the
  kernel bridge instead of only through local compatibility fixtures.

---

## Baseline Context Measurement

Measured surfaces required by the roadmap:
- `CLAUDE.md`
- `SKILL.md`
- live SessionStart injection output
- one normal flow command: `/flow-status`

Measured artifact:
- [phase1-context-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-context-baseline.json)

Measured totals:

| Surface | Tokens | Notes |
|---------|--------|-------|
| kernel `CLAUDE.md` | 2041 | measured from raw file contents |
| kernel `SKILL.md` | 18768 | measured from raw file contents |
| SessionStart injected context | 70 | measured from live hook output |
| `/flow-status` command surface | 467 | measured from command markdown |
| kernel-owned base total | 20879 | not counted against VRE incremental budget |
| incremental flow total | 467 | counted against VRE incremental budget |
| baseline invocation total | 21346 | full measured sum |

Budget decision:
- Phase 1 incremental budget max: `1500`
- measured incremental flow cost: `467`
- result: **PASS**

Important note:
- the kernel-owned base is far above the historical spec estimate
- this does **not** fail the VRE budget gate, because the gate applies to incremental flow-specific context beyond the kernel-owned base
- this **does** deserve a kernel governance follow-up because the standing estimate in [13-delivery-roadmap.md](../13-delivery-roadmap.md) is now stale relative to measured reality

---

## Kernel Governance Prerequisite Checklist

The roadmap requires these kernel-side prerequisites:
- governance profiles
- kernel-side config protection
- append-only governance event storage
- kernel-side claim event sequence enforcement

This checklist distinguishes:
- `PASS`: directly observed in current kernel sibling or covered strongly enough by contract evidence
- `PARTIAL`: contract is represented, but direct runtime/kernel observation is incomplete
- `GAP`: not observed in the current kernel sibling snapshot

| Prerequisite | Status | Evidence | Notes |
|--------------|--------|----------|-------|
| governance mode contract | PASS | [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [session-start.js](../../../../vibe-science/plugin/scripts/session-start.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [post-tool-use.js](../../../../vibe-science/plugin/scripts/post-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [v7.0-IMPLEMENTATION-SPEC.md](../../../../vibe-science/blueprints/v7.0-IMPLEMENTATION-SPEC.md) | Phase 1 now explicitly accepts the kernel's documented `default/strict` model via `VIBE_SCIENCE_STRICT=1` as the required governance baseline; the richer `minimal/standard/strict` proposal is future design work, not a current blocker |
| kernel config protection | PASS | [config-protection.test.js](../../../environment/tests/compatibility/config-protection.test.js), [.claude/settings.json](../../../../vibe-science/.claude/settings.json), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | the protected config surface is now directly observable in settings and enforced at runtime for schemas, `fault-taxonomy.yaml`, and `judge-rubric.yaml` |
| append-only governance event storage | PASS | [08-governance-engine.md](../08-governance-engine.md), [schema.sql](../../../../vibe-science/plugin/db/schema.sql), [migrations.js](../../../../vibe-science/plugin/lib/migrations.js), [db.js](../../../../vibe-science/plugin/lib/db.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [post-tool-use.js](../../../../vibe-science/plugin/scripts/post-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [governance-events.test.mjs](../../../../vibe-science/tests/governance-events.test.mjs), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | sibling kernel `main` now has append-only storage, migration coverage, storage-level immutability, and hook-level emitters / secondary guarantee |
| claim event sequence enforcement | PASS | [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js), [claim-ingestion.js](../../../../vibe-science/plugin/lib/claim-ingestion.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | claim promotion is now blocked at pre-write time unless the latest recorded event is `R2_REVIEWED`, and unresolved-claim stop enforcement remains active |

Checklist conclusion:
- VRE has verified the compatibility surface honestly
- the kernel prerequisite check is **green for Phase 1**
- there are now **0 hard gaps** and **0 patchable partials**
- richer multi-profile governance remains a future design choice, not an unmet prerequisite

---

## Deferred By Design

These items were intentionally **not** built in Phase 1.

### Phase 2

- `commands/sync-memory.md`
- `environment/memory/sync.js`
- `/sync-memory`
- markdown mirrors (`project-overview.md`, `decision-log.md`)
- `memory/index/marks.jsonl`
- experiment result bundles
- figure catalog
- session digest export

### Phase 3

- `/flow-writing`
- `/flow-results`
- `environment/lib/export-eligibility.js`
- export snapshot writer
- export record and alert runtime surfaces
- advisor meeting pack generator
- rebuttal prep pack
- post-export safety warnings

### Phase 4+

- bibliography adapters
- automation surfaces
- domain packs
- richer eval storage beyond the base control plane

---

## Final Status

What we can defend now:
- the VRE repo itself has reached a real Phase 1 implementation baseline
- the implementation is backed by saved benchmark evidence, operator-validation evidence, measured context evidence, validators, and tests

What we should **not** overclaim:
- we should not claim the kernel already implements a richer multi-profile matrix; Phase 1 closes against the documented `default/strict` baseline only

Recommended next action:
- treat any richer `minimal/standard/strict` governance model as post-Phase-1 design work
- keep future writing/export extensions aligned to the accepted `default/strict` baseline unless the kernel contract changes
