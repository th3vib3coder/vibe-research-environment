# VRE Phase 3 — Implementation Plan Index

**Date:** 2026-04-02  
**Scope:** Phase 3 exit gates from [13-delivery-roadmap.md](../13-delivery-roadmap.md) and [07-writing-and-export.md](../07-writing-and-export.md)  
**Status:** Closed with saved evidence and closeout dossier

---

## Why Phase 3 Now

Phase 2 is closed with saved evidence and a green closeout dossier:
- [phase2-closeout.md](./phase2-closeout.md)

Phase 3 is the next product slice because it solves the next two user problems:
- Story 3: advisor prep and structured deliverables
- Story 4: safe writing handoff grounded in frozen, export-eligible claims

Closeout:
- [phase3-closeout.md](./phase3-closeout.md)

---

## Phase 3 Build Target

We are building:
- `flow-writing` bundle
- shared `environment/lib/export-eligibility.js`
- export snapshot, export record, and export alert contracts
- `environment/flows/writing.js`
- `commands/flow-writing.md`
- Phase 3 extension of `/flow-results` onto the shared export helper, not a second packaging stack
- advisor-meeting pack generation
- rebuttal prep pack generation
- post-export safety warnings and replay checks
- Phase 3 tests, validators, evals, and saved operator evidence

We are NOT building in Phase 3:
- autonomous manuscript writing
- kernel-side citation verification
- kernel truth mutation
- automations, connectors, or domain packs
- publication-ready multi-host delivery orchestration

---

## Critical Scope Calls

1. Export policy lives once in the shared helper. `/flow-writing` and `/flow-results` consume it; neither redefines it.
2. Claim-backed writing always runs against a frozen export snapshot, never drifting live projections.
3. `/flow-results` already exists from Phase 2. Phase 3 hardens it with shared export policy where needed; it does not recreate packaging runtime.
4. Profile-safety is compatibility-aware. Missing `governanceProfileAtCreation` capability must degrade honestly, not silently collapse to strict equivalence.
5. Advisor and rebuttal packs are deliverable bundles, not new truth layers.
6. This plan stays split across ordered files. If a file approaches ~300 lines, split it.

---

## Wave Map

| Wave | Goal | Plan file |
|------|------|-----------|
| 0 | Freeze boundaries, timing drift, and missing Phase 3 contracts | [phase3-01-wave-0-boundaries-and-contracts.md](./phase3-01-wave-0-boundaries-and-contracts.md) |
| 1 | Build shared export policy and artifact helpers | [phase3-02-wave-1-export-policy-core.md](./phase3-02-wave-1-export-policy-core.md) |
| 2 | Build writing runtime core and frozen snapshot flow | [phase3-03-wave-2-writing-runtime-core.md](./phase3-03-wave-2-writing-runtime-core.md) |
| 3 | Add command shim, deliverable packs, and post-export warning surfaces | [phase3-04-wave-3-shims-and-packs.md](./phase3-04-wave-3-shims-and-packs.md) |
| 4 | Add tests, validators, and lifecycle coverage | [phase3-05-wave-4-tests-and-validators.md](./phase3-05-wave-4-tests-and-validators.md) |
| 5 | Save operator evidence and close Phase 3 honestly | [phase3-06-wave-5-operator-evidence-and-closeout.md](./phase3-06-wave-5-operator-evidence-and-closeout.md) |

---

## Cross-Wave Rules

1. Wave order is mandatory.
2. Parallelize only inside a wave.
3. Claim-backed, artifact-backed, and free writing remain distinct surfaces with explicit boundaries.
4. Export snapshots, records, and alerts are machine-owned artifacts and must validate before publish.
5. Warning records are observational only; they never auto-edit drafts or mutate claim truth.
6. `/flow-status` remains the canonical operator summary; writing packs are derived deliverables only.
7. Every Phase 3 deliverable must stay compatible with the accepted kernel `default/strict` baseline.

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
- one agent for export contracts, schemas, and bundle ownership
- one agent for shared export policy and profile-safety logic
- one agent for writing runtime and `/flow-writing`
- one agent for advisor/rebuttal pack assembly and warning replay
- one agent for tests, validators, evals, and closeout evidence

---

## Final Gate

Phase 3 was not done when writing helpers merely existed.

Phase 3 closed only when:
- export eligibility is enforced by one shared helper
- claim-backed writing uses frozen snapshots
- post-export warnings surface drift honestly
- advisor and rebuttal packs are assembleable from one command path
- the Phase 3 roadmap gates are green with saved artifacts and a closeout dossier

Reference targets:
- [13-delivery-roadmap.md](../13-delivery-roadmap.md)
- [07-writing-and-export.md](../07-writing-and-export.md)
