# Phase 3 Wave 0 — Boundaries And Contracts

**Goal:** Freeze the Phase 3 execution boundary before writing/export logic spreads into multiple surfaces.

---

## Scope Rule

Wave 0 resolves the Phase 3 seam explicitly:
- claim-backed export policy is Phase 3
- frozen export snapshots are Phase 3
- advisor and rebuttal deliverable packs are Phase 3
- `/flow-results` base packaging is already Phase 2 and stays there
- citation verification remains kernel-owned and out of scope

---

## WP-45 — Scope Freeze And Timing Drift Resolution

Record one execution stance and use it everywhere:
- Phase 3 does NOT recreate `environment/flows/results.js`
- Phase 3 may extend `/flow-results` only where it must consume the shared export helper or surface post-export warnings
- `/flow-writing` owns claim-backed handoff and deliverable assembly
- export policy is computed once in `environment/lib/export-eligibility.js`
- Phase 3 does NOT change kernel lifecycle or citation truth rules

Acceptance:
- the plan states one unambiguous `/flow-results` versus `/flow-writing` boundary
- no work package duplicates packaging logic already shipped in Phase 2
- no work package smuggles in connectors, automations, or autonomous paper writing

---

## WP-46 — New Contracts, Schemas, And Bundle Manifests

Create the missing Phase 3 machine-owned contracts:
- `environment/schemas/export-snapshot.schema.json`
- `environment/schemas/export-record.schema.json`
- `environment/schemas/export-alert-record.schema.json`
- `environment/install/bundles/flow-writing.bundle.json`

Ownership rules to freeze here:
- `flow-writing.bundle.json` starts by owning the three Phase 3 export schemas
- it bootstraps `.vibe-science-environment/writing/exports/`
- it bootstraps `.vibe-science-environment/writing/advisor-packs/`
- it bootstraps `.vibe-science-environment/writing/rebuttal/`
- later Phase 3 waves extend bundle ownership with `environment/lib/export-eligibility.js`
- later Phase 3 waves extend bundle ownership with `environment/flows/writing.js`

Acceptance:
- lifecycle commands can reason about the new Phase 3 bundle
- no bundle ownership overlaps Phase 1 or Phase 2 paths
- every new machine-owned JSON artifact has a schema before runtime writes it

---

## WP-47 — Deliverable Pack Contract Freeze

Advisor and rebuttal packs are named in the spec, but still too loose for runtime work.

Before implementation, freeze:
- path convention and naming scheme
- whether packs are date-based, session-based, or submission-based
- minimum required files
- whether a machine-owned `pack-manifest.json` is required or file conventions alone are enough
- what content is machine-written versus researcher-edited after assembly

Rules:
- do not implement pack generation before one contract exists
- do not let packs become a second truth path
- do not let pack assembly reach back into raw kernel files ad hoc
- V1 prefers file conventions over a pack-manifest unless a later phase proves one is necessary

Acceptance:
- one concrete advisor-pack contract exists in the active spec set
- one concrete rebuttal-pack contract exists in the active spec set
- later waves can target a stable bundle shape

---

## WP-48 — Export Snapshot And Alert Semantics Freeze

The writing spec names snapshots, records, and alerts. Wave 0 must turn them into one concrete operational contract set.

Freeze:
- snapshot id convention and overwrite rule
- export record append semantics
- alert dedupe / replay semantics
- what current-versus-frozen drift comparisons are required
- which changes are warnings versus informational notes

Rules:
- alerts never auto-edit prose
- alerts compare current projections against the frozen snapshot, not remembered text
- degraded mode is explicit when profile-safety inputs are unavailable

Acceptance:
- one stable snapshot/record/alert contract set exists
- later waves can implement warning replay without guessing policy

---

## Parallelism

- WP-45 runs first
- WP-46 and WP-47 can run in parallel after WP-45 is frozen
- WP-48 starts after WP-45 and should align with WP-46 schema decisions

---

## Exit Condition

Wave 0 is complete when:
- Phase 3 scope is unambiguous
- the new Phase 3 machine-owned contracts and bundle manifest are defined
- deliverable packs have stable contracts
- snapshot and alert semantics are frozen well enough for runtime code
