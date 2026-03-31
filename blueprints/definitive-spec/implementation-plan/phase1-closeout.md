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
- the kernel prerequisite checklist is no longer blocked by a hard gap, but it is
  still not fully green in the current sibling-kernel state:
  - governance profiles remain a documented model-alignment residual between VRE expectations and the current kernel implementation

What was closed after the initial VRE Phase 1 freeze:
- append-only `governance_events` storage now exists in the current sibling kernel snapshot, including schema, migration, DB helper, and hook emitters
- protected config coverage is now directly visible both in runtime hooks and in `.claude/settings.json`
- claim promotion now has an explicit pre-write lifecycle validator: `PROMOTED` is blocked unless the latest recorded event is `R2_REVIEWED`

So the honest reading is:
- **VRE implementation:** ready
- **cross-repo Phase 1 sign-off:** still conditional, but now only on whether the kernel's documented binary strict/default model is accepted as sufficient for the governance-profile prerequisite

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
| 1 | core-reader.js has 8 tested projection functions | PASS | kernel-side: `plugin/lib/core-reader.js`, `tests/core-reader.test.mjs` (pre-existing) |
| 2 | CLI bridge returns stable JSON envelope | PASS | kernel-side: `plugin/scripts/core-reader-cli.js` (pre-existing) |
| 3 | Flow state lives outside kernel in `.vibe-science-environment/` | PASS | [flow-state.js](../../../environment/lib/flow-state.js), [flow-state.test.js](../../../environment/tests/lib/flow-state.test.js) |
| 4 | Canonical operator snapshot in `control/session.json` | PASS | [session-snapshot.js](../../../environment/control/session-snapshot.js), [session-snapshot.test.js](../../../environment/tests/control/session-snapshot.test.js) |
| 5 | Every `/flow-*` opens and closes an attempt | PASS | [middleware.js](../../../environment/control/middleware.js), [middleware.test.js](../../../environment/tests/control/middleware.test.js) |
| 6 | Capability snapshot defaults unknown features to `false` | PASS | [capabilities.js](../../../environment/control/capabilities.js), [capabilities.test.js](../../../environment/tests/control/capabilities.test.js) |
| 7 | Shared middleware chain handles lifecycle | PASS | [middleware.js](../../../environment/control/middleware.js) — 7-step chain |
| 8 | `/flow-status` resumes and produces summary | PASS | [flow-status.md](../../../commands/flow-status.md), [control-plane-rebuild.test.js](../../../environment/tests/integration/control-plane-rebuild.test.js) |
| 9 | `/flow-literature` registers paper and links to claim | PASS | [literature.js](../../../environment/flows/literature.js), [literature-register.test.js](../../../environment/tests/integration/literature-register.test.js) |
| 10 | `/flow-experiment` creates manifest and tracks outputs | PASS | [experiment.js](../../../environment/flows/experiment.js), [experiment-manifest-lifecycle.test.js](../../../environment/tests/integration/experiment-manifest-lifecycle.test.js) |
| 11 | `/flow-experiment` lists existing manifests | PASS | [experiment.test.js](../../../environment/tests/flows/experiment.test.js) |
| 12 | At least one flow demonstrates two-substrate rule | PASS | literature + experiment use workspace files + optional CLI bridge projections |
| 13 | Flow state, control records, manifests validate against schemas | PASS | [validate-runtime-contracts.js](../../../environment/tests/ci/validate-runtime-contracts.js), 12 schema tests in [tests/schemas/](../../../environment/tests/schemas/) |
| 14 | Saved operator-validation artifact (resume ≤2 min) | PASS | [phase1-resume-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-resume-validation.json) |
| 15 | Phase 1 scenarios in eval harness with saved runs | PASS | 4 repeat directories under [benchmarks/](../../../.vibe-science-environment/operator-validation/benchmarks/) |
| 16 | Baseline context cost measured | PASS | [phase1-context-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase1-context-baseline.json) |
| 17 | Kernel governance prerequisites verified | PARTIAL | checklist below — only the governance-profile model-alignment residual remains |

**Result: 16 PASS, 1 PARTIAL.** The PARTIAL is now a documented kernel/VRE model-alignment residual, not a missing enforcement surface.

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
| governance profiles | PARTIAL | [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [session-start.js](../../../../vibe-science/plugin/scripts/session-start.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [post-tool-use.js](../../../../vibe-science/plugin/scripts/post-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [v7.0-IMPLEMENTATION-SPEC.md](../../../../vibe-science/blueprints/v7.0-IMPLEMENTATION-SPEC.md) | the kernel now clearly exposes a binary strict/default integrity model via `VIBE_SCIENCE_STRICT=1`; the residual is that VRE still models governance as `minimal/standard/strict`, so this is now a model-alignment question rather than a missing safeguard |
| kernel config protection | PASS | [config-protection.test.js](../../../environment/tests/compatibility/config-protection.test.js), [.claude/settings.json](../../../../vibe-science/.claude/settings.json), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | the protected config surface is now directly observable in settings and enforced at runtime for schemas, `fault-taxonomy.yaml`, and `judge-rubric.yaml` |
| append-only governance event storage | PASS | [08-governance-engine.md](../08-governance-engine.md), [schema.sql](../../../../vibe-science/plugin/db/schema.sql), [migrations.js](../../../../vibe-science/plugin/lib/migrations.js), [db.js](../../../../vibe-science/plugin/lib/db.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [post-tool-use.js](../../../../vibe-science/plugin/scripts/post-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [governance-events.test.mjs](../../../../vibe-science/tests/governance-events.test.mjs), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | sibling kernel `main` now has append-only storage, migration coverage, storage-level immutability, and hook-level emitters / secondary guarantee |
| claim event sequence enforcement | PASS | [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js), [claim-ingestion.js](../../../../vibe-science/plugin/lib/claim-ingestion.js), [pre-tool-use.js](../../../../vibe-science/plugin/scripts/pre-tool-use.js), [stop.js](../../../../vibe-science/plugin/scripts/stop.js), [governance-hooks.test.mjs](../../../../vibe-science/tests/governance-hooks.test.mjs) | claim promotion is now blocked at pre-write time unless the latest recorded event is `R2_REVIEWED`, and unresolved-claim stop enforcement remains active |

Checklist conclusion:
- VRE has verified the compatibility surface honestly
- the kernel prerequisite check is **still not fully green**
- there are now **0 hard gaps**, **0 patchable partials**, and **1 documented residual**
- the remaining residual sits in governance-profile model alignment: kernel `strict/default` vs VRE `minimal/standard/strict`

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
- we should not call the wider system fully Phase-1-closed until the governance-profile residual is either explicitly accepted as the Phase 1 boundary or the VRE expectation is revised to match the kernel model

Recommended next action:
- decide whether the kernel's documented binary strict/default model is sufficient for Phase 1
- if yes, revise the VRE governance-profile expectation and mark the final residual as accepted
