# VRE Implementation Plan

**Date:** 2026-04-03
**Scope:** phase-scoped execution entrypoint
**Status:** Phase 1-5 closed; Phase 5.5 audit hardening implementation closed with one external-review follow-up

---

## Purpose

This file stays intentionally short.

Implementation planning is phase-scoped and index-driven. We do not keep one
giant markdown plan. If a plan file approaches ~300 lines, split it.

The plan sets currently on disk are:

### Phase 1 (completed)

- [implementation-plan/00-index.md](./implementation-plan/00-index.md)
- [implementation-plan/01-wave-0-foundation.md](./implementation-plan/01-wave-0-foundation.md)
- [implementation-plan/02-wave-1-lib-helpers.md](./implementation-plan/02-wave-1-lib-helpers.md)
- [implementation-plan/03-wave-2-control-plane.md](./implementation-plan/03-wave-2-control-plane.md)
- [implementation-plan/04-wave-3-flows-and-shims.md](./implementation-plan/04-wave-3-flows-and-shims.md)
- [implementation-plan/05-wave-4-tests-and-validators.md](./implementation-plan/05-wave-4-tests-and-validators.md)
- [implementation-plan/06-wave-5-evals-and-closeout.md](./implementation-plan/06-wave-5-evals-and-closeout.md)
- [implementation-plan/phase1-closeout.md](./implementation-plan/phase1-closeout.md)

### Phase 2 (completed)

- [implementation-plan/phase2-00-index.md](./implementation-plan/phase2-00-index.md)
- [implementation-plan/phase2-01-wave-0-boundaries-and-contracts.md](./implementation-plan/phase2-01-wave-0-boundaries-and-contracts.md)
- [implementation-plan/phase2-02-wave-1-memory-sync-core.md](./implementation-plan/phase2-02-wave-1-memory-sync-core.md)
- [implementation-plan/phase2-03-wave-2-shims-staleness-and-marks.md](./implementation-plan/phase2-03-wave-2-shims-staleness-and-marks.md)
- [implementation-plan/phase2-04-wave-3-packaging-runtime.md](./implementation-plan/phase2-04-wave-3-packaging-runtime.md)
- [implementation-plan/phase2-05-wave-4-tests-and-validators.md](./implementation-plan/phase2-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase2-06-wave-5-operator-evidence-and-closeout.md](./implementation-plan/phase2-06-wave-5-operator-evidence-and-closeout.md)
- [implementation-plan/phase2-closeout.md](./implementation-plan/phase2-closeout.md)

### Phase 3 (completed)

- [implementation-plan/phase3-00-index.md](./implementation-plan/phase3-00-index.md)
- [implementation-plan/phase3-01-wave-0-boundaries-and-contracts.md](./implementation-plan/phase3-01-wave-0-boundaries-and-contracts.md)
- [implementation-plan/phase3-02-wave-1-export-policy-core.md](./implementation-plan/phase3-02-wave-1-export-policy-core.md)
- [implementation-plan/phase3-03-wave-2-writing-runtime-core.md](./implementation-plan/phase3-03-wave-2-writing-runtime-core.md)
- [implementation-plan/phase3-04-wave-3-shims-and-packs.md](./implementation-plan/phase3-04-wave-3-shims-and-packs.md)
- [implementation-plan/phase3-05-wave-4-tests-and-validators.md](./implementation-plan/phase3-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase3-06-wave-5-operator-evidence-and-closeout.md](./implementation-plan/phase3-06-wave-5-operator-evidence-and-closeout.md)
- [implementation-plan/phase3-closeout.md](./implementation-plan/phase3-closeout.md)

### Phase 4 (completed)

- [implementation-plan/phase4-00-index.md](./implementation-plan/phase4-00-index.md)
- [implementation-plan/phase4-01-wave-0-boundaries-and-contracts.md](./implementation-plan/phase4-01-wave-0-boundaries-and-contracts.md)
- [implementation-plan/phase4-02-wave-1-connector-substrate.md](./implementation-plan/phase4-02-wave-1-connector-substrate.md)
- [implementation-plan/phase4-03-wave-2-automation-substrate.md](./implementation-plan/phase4-03-wave-2-automation-substrate.md)
- [implementation-plan/phase4-04-wave-3-domain-pack-runtime.md](./implementation-plan/phase4-04-wave-3-domain-pack-runtime.md)
- [implementation-plan/phase4-05-wave-4-tests-and-validators.md](./implementation-plan/phase4-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase4-06-wave-5-evals-and-closeout.md](./implementation-plan/phase4-06-wave-5-evals-and-closeout.md)
- [implementation-plan/phase4-closeout.md](./implementation-plan/phase4-closeout.md)

### Phase 5 (completed)

- [implementation-plan/phase5-00-index.md](./implementation-plan/phase5-00-index.md)
- [implementation-plan/phase5-01-wave-0-contract-artifacts.md](./implementation-plan/phase5-01-wave-0-contract-artifacts.md)
- [implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md](./implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md)
- [implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md](./implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md)
- [implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md](./implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md)
- [implementation-plan/phase5-05-wave-4-tests-and-validators.md](./implementation-plan/phase5-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase5-06-wave-5-evals-and-closeout.md](./implementation-plan/phase5-06-wave-5-evals-and-closeout.md)
- [implementation-plan/phase5-closeout.md](./implementation-plan/phase5-closeout.md)

### Phase 5.5 (implementation closed)

Audit-hardening pass scoped against the 2026-04-17 forensic audit (4 P0 closeout
overclaims, 6 P1 runtime / agent-discipline gaps, 3 P2 structural issues).
Blocks Phase 6 entry.

- [implementation-plan/phase55-00-index.md](./implementation-plan/phase55-00-index.md)
- [implementation-plan/phase55-01-wave-0-contracts-and-honesty-rules.md](./implementation-plan/phase55-01-wave-0-contracts-and-honesty-rules.md)
- [implementation-plan/phase55-02-wave-1-runtime-integrity.md](./implementation-plan/phase55-02-wave-1-runtime-integrity.md)
- [implementation-plan/phase55-03-wave-2-execution-surface-hardening.md](./implementation-plan/phase55-03-wave-2-execution-surface-hardening.md)
- [implementation-plan/phase55-04-wave-3-agent-discipline-and-dispatcher.md](./implementation-plan/phase55-04-wave-3-agent-discipline-and-dispatcher.md)
- [implementation-plan/phase55-05-wave-4-tests-and-validators.md](./implementation-plan/phase55-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase55-06-wave-5-evidence-regeneration-and-closeout-honesty.md](./implementation-plan/phase55-06-wave-5-evidence-regeneration-and-closeout-honesty.md)
- [implementation-plan/phase55-closeout.md](./implementation-plan/phase55-closeout.md)

Implementation status:
- Wave 0 closed: schema contracts for `signals.provenance` and task-registry entries
- Wave 1 closed: export snapshot immutability, signal provenance, budget advisory, and Phase 2/3 boundary correction
- Wave 2 closed: task registry, three seed task kinds, local-subprocess executor, and review-gate hardening
- Wave 3 closed: `bin/vre` dispatcher and command/runtime drift checks
- Wave 4 closed: closeout-honesty validator staged outside default CI
- Wave 5 closed: regenerated Phase 3 evidence, historical closeout corrections,
  Phase 5.5 closeout, and default CI closeout-honesty enforcement landed

Phase 5.6 and Phase 5.7 follow-ups (shipped on `origin/main @ 3563a48`):
- Phase 5.6 finish-pass closed 3 P1 + 2 P2 from external review #1
- Phase 5.7 hygiene closed 3 P2 from external review #2
- Current state: 420/420 tests, 11/11 validators, 11 of 13 findings RESOLVED

### Phase 6 (spec drafted, pending implementation)

Kernel Bridge and Provider Reality. Closes the 4 block-class gaps
(G-01..G-04) from `PHASE-6-7-MASTER-SEQUENCE-SPEC.md`: Gate 17 automation,
Phase 5 Gate 3 real evidence, kernel bridge integration testing, real CLI
provider binding. 5 waves, WP-149..WP-175.

- [PHASE-6-7-MASTER-SEQUENCE-SPEC.md](./PHASE-6-7-MASTER-SEQUENCE-SPEC.md) (cross-phase sequence rationale)
- [implementation-plan/phase6-00-index.md](./implementation-plan/phase6-00-index.md)
- [implementation-plan/phase6-01-wave-0-contracts-and-scope.md](./implementation-plan/phase6-01-wave-0-contracts-and-scope.md)
- [implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md](./implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md)
- [implementation-plan/phase6-03-wave-2-real-provider-binding.md](./implementation-plan/phase6-03-wave-2-real-provider-binding.md)
- [implementation-plan/phase6-04-wave-3-tests-and-validators.md](./implementation-plan/phase6-04-wave-3-tests-and-validators.md)
- [implementation-plan/phase6-05-wave-4-evidence-and-closeout.md](./implementation-plan/phase6-05-wave-4-evidence-and-closeout.md)
- phase6-closeout.md (to be written as Wave 4 WP-175 lands)

### Phase 7 (spec drafted, pending Phase 6 exit gate)

Capability Expansion. Closes G-05..G-15: task registry + CLI dispatcher
expansion, three-tier writing enforcement, connector depth, automation
scheduling, domain-pack rule engine, UX flags, honesty validator semantic
upgrade, surface-orchestrator archive. 6 waves, WP-176..WP-220.

- [implementation-plan/phase7-00-index.md](./implementation-plan/phase7-00-index.md)
- [implementation-plan/phase7-01-wave-0-contracts-and-scope.md](./implementation-plan/phase7-01-wave-0-contracts-and-scope.md)
- [implementation-plan/phase7-02-wave-1-execution-surface-expansion.md](./implementation-plan/phase7-02-wave-1-execution-surface-expansion.md)
- [implementation-plan/phase7-03-wave-2-agent-surface-and-ux.md](./implementation-plan/phase7-03-wave-2-agent-surface-and-ux.md)
- [implementation-plan/phase7-04-wave-3-three-tier-writing.md](./implementation-plan/phase7-04-wave-3-three-tier-writing.md)
- [implementation-plan/phase7-05-wave-4-connectors-automation-domain-packs.md](./implementation-plan/phase7-05-wave-4-connectors-automation-domain-packs.md)
- [implementation-plan/phase7-06-wave-5-tests-evidence-closeout.md](./implementation-plan/phase7-06-wave-5-tests-evidence-closeout.md)
- phase7-closeout.md (to be written as Wave 5 WP-219 lands)

### Companion Future Overlay Specs

- [surface-orchestrator/00-index.md](./surface-orchestrator/00-index.md)

This spec set is intentionally tracked here for planning continuity. The local
Phase 5 coordinator MVP is now closed; the surface-orchestrator spec remains
the post-MVP expansion frontier above VRE and below any future UI/channel
surfaces.

---

## Current Phase State

- Phase 1 is closed at `16 PASS / 1 PARTIAL` after Phase 5.5 correction: see [phase1-closeout.md](./implementation-plan/phase1-closeout.md)
- Phase 2 is closed with saved evidence: see [phase2-closeout.md](./implementation-plan/phase2-closeout.md)
- Phase 3 is closed with regenerated saved evidence and one partial writing-boundary gate: see [phase3-closeout.md](./implementation-plan/phase3-closeout.md)
- Phase 4 is closed with saved evidence plus explicit deferred scheduler and domain-pack enforcement work: see [phase4-closeout.md](./implementation-plan/phase4-closeout.md)
- Phase 5 is closed as an MVP baseline, with its historical review-lineage gate retracted as false-positive: see [phase5-closeout.md](./implementation-plan/phase5-closeout.md)
- Phase 5.5 (Audit Hardening) implementation is closed with [phase55-closeout.md](./implementation-plan/phase55-closeout.md). Phase 5.6 + 5.7 follow-ups shipped on `origin/main @ 3563a48`.
- Phase 6 (Kernel Bridge and Provider Reality) is spec-drafted and awaiting
  implementation: see [phase6-00-index.md](./implementation-plan/phase6-00-index.md).
  Closes F-04 FALSE-POSITIVE and G-01/G-03/G-04 from master spec.
- Phase 7 (Capability Expansion) is spec-drafted and blocked on Phase 6 exit
  gate: see [phase7-00-index.md](./implementation-plan/phase7-00-index.md).
- Surface orchestrator spec will be archived in Phase 7 Wave 5 WP-216 to
  `blueprints/definitive-spec/archive/surface-coordinator/`.
- The local coordinator MVP baseline is shipped; do not reopen Phase 5
  scope. New scope lands as Phase 6/7 or later.

---

## Hard Rules

1. Wave order is mandatory; parallelism happens inside a wave, not across waves.
2. Middleware owns attempt lifecycle, telemetry, and snapshot publication.
3. Flow helpers own domain logic only; they do not open or close attempts.
4. Memory sync is command-driven mirror logic, never hook-driven truth logic.
5. Phase 2 packaging is runtime artifact packaging; claim-backed export logic stays in Phase 3.
6. Phase 3 export policy lives once in the shared helper, never per-command.
7. No outer-project code writes kernel truth.
8. No phase closes with a conversation summary alone; every gate closes with files on disk.
9. Companion future overlay specs may extend the system later, but they do not
   bypass kernel or VRE contracts while inactive.
