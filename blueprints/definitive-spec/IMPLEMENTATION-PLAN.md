# VRE Implementation Plan

**Date:** 2026-04-03
**Scope:** phase-scoped execution entrypoint
**Status:** Phase 1-3 closed, Phase 4 planning active

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

### Phase 4 (planning active)

- [implementation-plan/phase4-00-index.md](./implementation-plan/phase4-00-index.md)
- [implementation-plan/phase4-01-wave-0-boundaries-and-contracts.md](./implementation-plan/phase4-01-wave-0-boundaries-and-contracts.md)
- [implementation-plan/phase4-02-wave-1-connector-substrate.md](./implementation-plan/phase4-02-wave-1-connector-substrate.md)
- [implementation-plan/phase4-03-wave-2-automation-substrate.md](./implementation-plan/phase4-03-wave-2-automation-substrate.md)
- [implementation-plan/phase4-04-wave-3-domain-pack-runtime.md](./implementation-plan/phase4-04-wave-3-domain-pack-runtime.md)
- [implementation-plan/phase4-05-wave-4-tests-and-validators.md](./implementation-plan/phase4-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase4-06-wave-5-evals-and-closeout.md](./implementation-plan/phase4-06-wave-5-evals-and-closeout.md)

### Companion Future Overlay Specs

- [surface-orchestrator/00-index.md](./surface-orchestrator/00-index.md)

This spec set is intentionally tracked here for planning continuity, but it is
not part of the active Phase 1-3 execution path. It defines a future
user-facing orchestration layer above VRE and below channel/UI surfaces.

---

## Current Phase State

- Phase 1 is closed at `17/17 PASS`: see [phase1-closeout.md](./implementation-plan/phase1-closeout.md)
- Phase 2 is closed with saved evidence: see [phase2-closeout.md](./implementation-plan/phase2-closeout.md)
- Phase 3 is closed with saved evidence: see [phase3-closeout.md](./implementation-plan/phase3-closeout.md)
- Phase 4 planning is now active: see [phase4-00-index.md](./implementation-plan/phase4-00-index.md)
- Surface orchestrator is preserved as a companion future overlay spec:
  see [surface-orchestrator/00-index.md](./surface-orchestrator/00-index.md)

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
