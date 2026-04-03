# VRE Phase 4 — Implementation Plan Index

**Date:** 2026-04-03  
**Scope:** Phase 4+ deferred modules from [13-delivery-roadmap.md](../13-delivery-roadmap.md), [10-connectors.md](../10-connectors.md), [11-automation.md](../11-automation.md), and [12-domain-packs.md](../12-domain-packs.md)  
**Status:** Planning entrypoint after Phase 3 closeout

---

## Why Phase 4 Now

Phase 3 is closed with saved evidence and a green closeout dossier:
- [phase3-closeout.md](./phase3-closeout.md)

Phase 4 is the next product slice because the base flow system is finally
stable enough to support:
- external adapters that remain subordinate to kernel truth
- recurring, reviewable automation on top of real stale/blocked semantics
- domain-specific presets that change workflow shape without changing truth rules

---

## Phase 4 Build Target

We are building:
- connector contracts, manifests, and state surfaces
- one-way connector runtime under `environment/connectors/`
- reviewable automation runtime under `environment/automation/`
- project-scoped domain-pack runtime under `environment/domain-packs/`
- first low-risk exporters and reminders that consume Phase 1-3 surfaces instead of bypassing them
- one reference production pack, `omics`
- Phase 4 tests, validators, evals, and closeout evidence

We are NOT building in Phase 4:
- bidirectional sync
- hidden background mutation
- connector-defined gate semantics
- any automation that changes claim or citation truth
- multi-pack composition or inheritance chains
- surface orchestrator runtime

---

## Critical Scope Calls

1. Connector implementation starts with one-way exporters and read-only ingress only.
2. Automation stays command-driven or host-scheduled, never kernel-hook-driven.
3. Every automation writes a visible artifact or inbox item.
4. Domain packs stay optional, project-scoped, and safe to ignore.
5. The first production pack is `omics`; more packs wait until the resolver is proven stable.
6. External failures must become visible operator state, not hidden retries.
7. Phase 4 extends Phase 3 surfaces; it does not replace the control plane, export policy, or writing runtime.
8. This plan stays split across ordered files. If a file approaches ~300 lines, split it.

---

## Wave Map

| Wave | Goal | Plan file |
|------|------|-----------|
| 0 | Freeze Phase 4 boundaries, schemas, and machine-owned paths | [phase4-01-wave-0-boundaries-and-contracts.md](./phase4-01-wave-0-boundaries-and-contracts.md) |
| 1 | Build connector substrate and first one-way adapters | [phase4-02-wave-1-connector-substrate.md](./phase4-02-wave-1-connector-substrate.md) |
| 2 | Build automation substrate and visible digest/reminder surfaces | [phase4-03-wave-2-automation-substrate.md](./phase4-03-wave-2-automation-substrate.md) |
| 3 | Build domain-pack runtime and first reference pack | [phase4-04-wave-3-domain-pack-runtime.md](./phase4-04-wave-3-domain-pack-runtime.md) |
| 4 | Add tests, validators, compatibility, and lifecycle coverage | [phase4-05-wave-4-tests-and-validators.md](./phase4-05-wave-4-tests-and-validators.md) |
| 5 | Save operator evidence and close Phase 4 honestly | [phase4-06-wave-5-evals-and-closeout.md](./phase4-06-wave-5-evals-and-closeout.md) |

---

## Cross-Wave Rules

1. Wave order is mandatory.
2. Parallelize only inside a wave.
3. Connectors are adapters, not authorities.
4. Automation outputs are reviewable artifacts, not silent state changes.
5. Domain packs change presets only; they never change truth semantics.
6. Missing optional infrastructure must degrade honestly and visibly.
7. No Phase 4 runtime writes kernel truth or invents a second truth path.
8. No Phase 4 module bypasses existing middleware, flow state, or export-policy boundaries.

---

## Agent Strategy

Recommended staffing:
- Wave 0: 1-2 agents
- Wave 1: 2 agents
- Wave 2: 2 agents
- Wave 3: 2 agents
- Wave 4: 2-3 agents
- Wave 5: 1-2 agents

Best split:
- one agent for contracts, schemas, and bundle ownership
- one agent for connector runtime
- one agent for automation runtime and command/schedule surfaces
- one agent for domain-pack resolver and reference pack
- one agent for tests, validators, evals, and closeout evidence

---

## Final Gate

Phase 4 is not done when adapter stubs or reminder prompts merely exist.

Phase 4 is done only when:
- connector behavior is one-way, reviewable, and failure-visible
- automation runs produce explicit artifacts and respect stale/blocked semantics
- domain packs activate cleanly and fall back cleanly
- the first reference pack proves the resolver without changing truth semantics
- the Phase 4 roadmap gates are green with saved artifacts and a closeout dossier

Reference targets:
- [13-delivery-roadmap.md](../13-delivery-roadmap.md)
- [10-connectors.md](../10-connectors.md)
- [11-automation.md](../11-automation.md)
- [12-domain-packs.md](../12-domain-packs.md)
