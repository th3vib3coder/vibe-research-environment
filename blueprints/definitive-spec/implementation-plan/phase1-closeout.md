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
| 17 | Kernel governance prerequisites automatically verified | PASS | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) validates against a real kernel `core-reader-cli.js`; Phase 6.2-B removed the synthetic hook array, verifies `.claude/settings.json` + `hooks/hooks.json`, checks hook script presence/runnability, executes `tests/governance-hooks.test.mjs`, and rejects degraded DB/schema fallback via `dbAvailable`/`sourceMode` envelope metadata. |

**Result: 17 PASS, 0 PARTIAL.** Gate 17 was marked PASS in Phase 6.1, retracted in Phase 6.2-A after a fresh-eyes review found synthetic hook evidence, and re-upgraded in Phase 6.2-C only after FU-6-004 and FU-6-005 landed with live hook runtime verification plus fail-closed DB/source-mode envelope handling. See [phase6_2-closeout.md](./phase6_2-closeout.md).

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

## Phase 6 Wave 4 Correction Note — Gate 17 (historical)

Phase 6 Wave 1 (WP-155, WP-157) shipped [kernel-bridge.js](../../../environment/lib/kernel-bridge.js)
and [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js).
The probe exercised a real `child_process.spawn` against a fake sibling
fixture, asserted on real envelope shape, validated the profile enum set,
and covered a negative path (kernel-reported profile outside the Phase 1
enum triggers test failure — actually executed, not just documented).

At Phase 6 Wave 4 close, the sibling kernel did NOT yet ship
`plugin/scripts/core-reader-cli.js`. Gate 17 was therefore held at PARTIAL
with follow-up FU-6-001.

## Phase 6.1 Correction Note — Gate 17 Upgrade (PARTIAL → PASS)

Phase 6.1 closed FU-6-001 by shipping:
- `vibe-science/plugin/lib/core-reader.js` — 8 projections over the kernel
  DB (claim_events, sessions, gate_checks, literature_searches, citation_checks,
  observer_alerts, meta) plus static governance contracts (VALID_PROFILES,
  NON_NEGOTIABLE_HOOKS, VALID_CLAIM_SEQUENCES)
- `vibe-science/plugin/scripts/core-reader-cli.js` — stdin/stdout envelope
  CLI matching the WP-150 contract
- Degraded-mode fallbacks for every projection when the DB file is absent
  or a schema column is missing (no silent contract-break)

With the real sibling in place, the Gate 17 probe now validates kernel
governance claims against real data (profile read from `meta` table or
default, gate_checks from actual DB, valid claim sequences from the
static kernel contract). FU-6-001 is retired.

Adversarial review (Phase 6.1 FU-6-003) surfaced three P0 schema column
mismatches in the initial core-reader implementation (column names
`query_text`/`severity`/`timestamp` vs the real schema's
`query`/`level`/`created_at`). All three were fixed before the Phase 6.1
commit. The `withDb` fallback pattern is preserved but the correct
columns are now used so real data surfaces rather than being silently
swallowed.

## Phase 6.2 Correction Note — Gate 17 Retracted Then Re-Upgraded

A second fresh-eyes review after the Phase 6.1 push found that the
Gate 17 PASS still rested on synthetic evidence. Specifically:
- `vibe-science/plugin/lib/core-reader.js` `listGateChecks` builds a
  synthetic array of non-negotiable hooks, all with hardcoded
  `status: 'ok'` and `synthetic: true`. No file check, no script
  probe, no runtime ping.
- The Gate 17 probe reads this payload and treats it as proof. It is
  not proof — it is a fixture.
- Separately, `withDb` catches every SQL error and returns
  `{ok: true}` with empty data. "DB missing" and "verified zero" look
  identical to the VRE bridge — the same silent-zero pathology we killed
  in Phase 5.5, reintroduced at the bridge boundary.

Phase 6.2-A (documentary only) retracted Gate 17 back to PARTIAL and
opened FU-6-004 (real hook verification) + FU-6-005 (envelope honesty).
Phase 6.2-B shipped the code fixes:
- `listGateChecks` now reads committed hook configuration, checks hook
  scripts, and executes `tests/governance-hooks.test.mjs`;
- the core-reader CLI now reports `dbAvailable`, `sourceMode`, and
  `degradedReason`;
- the VRE bridge rejects degraded `ok:true` envelopes instead of
  treating them as verified zero.

Phase 6.2-C regenerated evidence and re-upgraded Gate 17 to PASS. See
[phase6_2-closeout.md](./phase6_2-closeout.md).

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

## Declared Follow-Ups Closed

- **FU-6-004**: CLOSED in Phase 6.2-B. Kernel hook runtime verification
  in `vibe-science/plugin/lib/core-reader.js` `listGateChecks` reads
  `hooks/hooks.json` and `.claude/settings.json`, checks script
  presence/runnability, and executes
  `vibe-science/tests/governance-hooks.test.mjs` as probe evidence.
- **FU-6-005**: CLOSED in Phase 6.2-B. `core-reader.js` envelopes expose
  `dbAvailable`, `sourceMode`, and `degradedReason`; the VRE bridge
  rejects degraded `ok:true` envelopes instead of accepting silent zero.

See [phase6_2-closeout.md](./phase6_2-closeout.md).

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
