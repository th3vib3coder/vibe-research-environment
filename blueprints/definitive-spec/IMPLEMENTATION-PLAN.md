# VRE Implementation Plan

**Date:** 2026-04-01
**Scope:** phase-scoped execution entrypoint
**Status:** Phase 1 closed, Phase 2 active

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

### Phase 2 (active)

- [implementation-plan/phase2-00-index.md](./implementation-plan/phase2-00-index.md)
- [implementation-plan/phase2-01-wave-0-boundaries-and-contracts.md](./implementation-plan/phase2-01-wave-0-boundaries-and-contracts.md)
- [implementation-plan/phase2-02-wave-1-memory-sync-core.md](./implementation-plan/phase2-02-wave-1-memory-sync-core.md)
- [implementation-plan/phase2-03-wave-2-shims-staleness-and-marks.md](./implementation-plan/phase2-03-wave-2-shims-staleness-and-marks.md)
- [implementation-plan/phase2-04-wave-3-packaging-runtime.md](./implementation-plan/phase2-04-wave-3-packaging-runtime.md)
- [implementation-plan/phase2-05-wave-4-tests-and-validators.md](./implementation-plan/phase2-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase2-06-wave-5-operator-evidence-and-closeout.md](./implementation-plan/phase2-06-wave-5-operator-evidence-and-closeout.md)

---

## Current Phase State

- Phase 1 is closed at `16/17 PASS, 1 PARTIAL` (kernel prerequisites): see [phase1-closeout.md](./implementation-plan/phase1-closeout.md)
- Phase 2 is the next active execution slice: see [phase2-00-index.md](./implementation-plan/phase2-00-index.md)
- Phase 3 remains deferred until Phase 2 runtime surfaces are stable

---

## Hard Rules

1. Wave order is mandatory; parallelism happens inside a wave, not across waves.
2. Middleware owns attempt lifecycle, telemetry, and snapshot publication.
3. Flow helpers own domain logic only; they do not open or close attempts.
4. Memory sync is command-driven mirror logic, never hook-driven truth logic.
5. Phase 2 packaging is runtime artifact packaging; claim-backed export logic stays in Phase 3.
6. No outer-project code writes kernel truth.
7. No phase closes with a conversation summary alone; every gate closes with files on disk.
