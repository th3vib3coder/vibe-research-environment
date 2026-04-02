# VRE Phase 2 — Implementation Plan Index

**Date:** 2026-04-01  
**Scope:** Phase 2 exit gates from [13-delivery-roadmap.md](../13-delivery-roadmap.md)  
**Status:** Active execution entrypoint after Phase 1 closeout

---

## Why Phase 2 Now

Phase 1 is closed with saved evidence and a green closeout dossier:
- [phase1-closeout.md](./phase1-closeout.md)

Phase 2 is the next product slice because it solves the next two user problems:
- Story 1: orientation across sessions via memory mirrors
- Story 2: experiment result findability and packaging

---

## Phase 2 Build Target

We are building:
- `memory-sync` bundle
- `flow-results` runtime packaging surfaces
- `commands/sync-memory.md`
- `environment/memory/sync.js`
- machine-owned mirrors: `project-overview.md`, `decision-log.md`
- `memory/index/marks.jsonl` support
- stale mirror warning surfaced in `/flow-status`
- experiment result bundles with typed artifact entries
- figure catalog generation
- session digest export only after its contract is frozen
- Phase 2 tests, validators, and saved operator evidence

We are NOT building in Phase 2:
- claim-backed export eligibility
- export snapshots / export alerts / writing alerts
- advisor pack and rebuttal pack assembly
- autonomous note writing
- hook-driven mirror sync
- connectors, automations, or domain packs

---

## Critical Scope Calls

1. Phase 2 memory remains mirror-only. Kernel truth still wins on every disagreement.
2. `/sync-memory` is command-driven only. No kernel hook becomes the mirror writer in V1.
3. Phase 2 packaging is runtime-first artifact packaging. Claim-backed export policy remains Phase 3.
4. `session digest export` is currently under-specified in the definitive spec. Wave 0 must freeze that contract before runtime code lands.
5. This plan remains split across ordered files. If a file approaches ~300 lines, split it instead of growing a monolith.

---

## Wave Map

| Wave | Goal | Plan file |
|------|------|-----------|
| 0 | Freeze boundaries, missing contracts, and bundle ownership | [phase2-01-wave-0-boundaries-and-contracts.md](./phase2-01-wave-0-boundaries-and-contracts.md) |
| 1 | Build memory sync runtime core | [phase2-02-wave-1-memory-sync-core.md](./phase2-02-wave-1-memory-sync-core.md) |
| 2 | Add command shim, staleness visibility, and marks support | [phase2-03-wave-2-shims-staleness-and-marks.md](./phase2-03-wave-2-shims-staleness-and-marks.md) |
| 3 | Build experiment packaging runtime and findability surfaces | [phase2-04-wave-3-packaging-runtime.md](./phase2-04-wave-3-packaging-runtime.md) |
| 4 | Add tests, validators, and lifecycle coverage | [phase2-05-wave-4-tests-and-validators.md](./phase2-05-wave-4-tests-and-validators.md) |
| 5 | Save operator evidence and close Phase 2 honestly | [phase2-06-wave-5-operator-evidence-and-closeout.md](./phase2-06-wave-5-operator-evidence-and-closeout.md) |

---

## Cross-Wave Rules

1. Wave order is mandatory.
2. Parallelize only inside a wave.
3. Command shims stay thin; reusable behavior lives in `environment/`.
4. Machine-owned artifacts get schema contracts before they are treated as stable.
5. `/flow-status` keeps reading the canonical control-plane snapshot, not markdown mirrors.
6. `memory/notes/` stays human-owned. Sync never writes there.
7. Phase 2 may package evidence artifacts, but it may not certify truth or backdoor Phase 3 export policy.

---

## Agent Strategy

Recommended staffing:
- Wave 0: 1-2 agents
- Wave 1: 2 agents
- Wave 2: 2 agents
- Wave 3: 2-3 agents
- Wave 4: 2-3 agents
- Wave 5: 1-2 agents

Best split:
- one agent for contracts, schemas, and bundle manifests
- one agent for memory runtime
- one agent for status/marks integration
- one agent for results packaging runtime
- one agent for tests, validators, and evidence harnesses

---

## Final Gate

Phase 2 is not done when the code merely exists.

Phase 2 is done only when:
- the Phase 2 roadmap gates are green with saved artifacts
- stale mirrors are visible and honest
- experiment bundles are typed and findable
- the closeout dossier exists on disk

Reference target:
- [13-delivery-roadmap.md](../13-delivery-roadmap.md)
