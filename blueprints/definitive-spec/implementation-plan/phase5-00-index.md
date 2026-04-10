# VRE Phase 5 — Surface Orchestrator MVP Plan

**Date:** 2026-04-09  
**Scope:** first executable surface-orchestrator slice above VRE, grounded in `surface-orchestrator/` specs  
**Status:** Closed with runtime, saved evidence, and [phase5-closeout.md](./phase5-closeout.md)

---

## Why Phase 5 Now

Phase 1-4 are closed with saved evidence.

The next product slice is now the first orchestrator runtime because the repo
already has:
- stable southbound VRE helper surfaces
- tested control-plane state and query helpers
- writing, results, connector, automation, and domain-pack summaries that can
  be consumed instead of reimplemented
- a closed Phase 0 orchestrator spec set with no intentional architectural
  decisions left open

---

## Phase 5 Build Target

We are building:
- one local coordinator runtime inside the VRE repo
- one orchestrator-owned state zone under `.vibe-science-environment/orchestrator/`
- one event-sourced queue
- one execution lane and one review lane
- one continuity-profile runtime plus helper-backed context assembly
- one status shim and one run shim
- one minimal operator shell above `/flow-status` and existing VRE summaries
- Phase 5 tests, validators, evals, and closeout evidence

We are NOT building in Phase 5:
- dashboard UI
- Telegram/email/WhatsApp adapters
- cloud-first or managed-agents runtime
- wide multi-agent assignment
- automatic preference capture from arbitrary chat
- a repo split into a sibling coordinator project

---

## Critical Scope Calls

1. Phase 5 implements the **MVP coordinator**, not the full orchestrator end-state.
2. The runtime lives in the same repo as VRE and consumes declared local helper surfaces.
3. The first delivery surfaces after chat are command shims plus filesystem-backed artifacts.
4. Continuity updates are explicit or explicitly confirmed; no ambient memory capture lands in Phase 5.
5. Queue and lane state are append-only/event-sourced where the spec says so.
6. Review outputs are attributable, non-canonical, and must never outrank kernel or VRE truth.
7. Existing VRE IO, schema validation, and lifecycle helpers should be reused whenever possible.
8. This plan stays split across ordered files. If a file approaches ~300 lines, split it.

---

## Wave Map

| Wave | Goal | Plan file |
|------|------|-----------|
| 0 | Freeze Phase 5 machine-owned contracts, schemas, and bundle ownership | [phase5-01-wave-0-contract-artifacts.md](./phase5-01-wave-0-contract-artifacts.md) |
| 1 | Build orchestrator state, queue, ledgers, and query foundation | [phase5-02-wave-1-state-and-queue-foundation.md](./phase5-02-wave-1-state-and-queue-foundation.md) |
| 2 | Build continuity profile, recall adapters, and context assembly | [phase5-03-wave-2-continuity-and-context-assembly.md](./phase5-03-wave-2-continuity-and-context-assembly.md) |
| 3 | Build the local coordinator MVP, lanes, and command shims | [phase5-04-wave-3-local-coordinator-mvp.md](./phase5-04-wave-3-local-coordinator-mvp.md) |
| 4 | Add tests, validators, lifecycle coverage, and reference guards | [phase5-05-wave-4-tests-and-validators.md](./phase5-05-wave-4-tests-and-validators.md) |
| 5 | Save eval evidence and close Phase 5 honestly | [phase5-06-wave-5-evals-and-closeout.md](./phase5-06-wave-5-evals-and-closeout.md) |

---

## Cross-Wave Rules

1. Wave order is mandatory.
2. Parallelism happens inside a wave, not across waves.
3. No Phase 5 runtime writes kernel truth or redefines VRE truth semantics.
4. Command shims and operator shells stay observational and coordinative, not dashboard-led authorities.
5. Any provider lane must honor lane policy, fallback rules, and supervision capability constraints from the spec set.
6. If a helper would require bootstrap-on-read behavior, Phase 5 adds a read-only variant before depending on it.
7. No Phase 5 module duplicates existing VRE flow, export-policy, or memory-sync logic.
8. No phase closes with prose alone; every gate closes with files, tests, and saved evidence.

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
- one agent for contracts, schemas, bundle ownership, and lifecycle integration
- one agent for state/queue/runtime helpers
- one agent for continuity/context assembly
- one agent for coordinator/lane runtime and command shims
- one agent for tests, validators, evals, and closeout evidence

---

## Final Gate

Phase 5 is not done when queue files, lane stubs, or prompt assemblers merely
exist.

Phase 5 is done only when:
- the coordinator can run locally against declared VRE helper surfaces
- queue, lane, escalation, and recovery state are durable and queryable
- continuity assembly works in `profile`, `query`, and `full` modes within explicit budgets
- review stays non-canonical and visible
- the status and run shims let an operator resume or steer work without a dashboard
- Phase 5 tests, validators, evals, and closeout evidence are saved on disk
