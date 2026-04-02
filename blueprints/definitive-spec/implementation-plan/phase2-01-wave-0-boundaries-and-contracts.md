# Phase 2 Wave 0 — Boundaries And Contracts

**Goal:** Freeze the Phase 2 execution boundary before code spreads into new surfaces.

---

## Scope Rule

Wave 0 resolves the Phase 2 seam explicitly:
- `memory-sync` is Phase 2
- runtime artifact packaging is Phase 2
- claim-backed export policy is still Phase 3
- `session digest export` must not be guessed into existence without a contract

---

## WP-25 — Scope Freeze And Timing Drift Resolution

Record one execution stance and use it everywhere:
- Phase 2 owns `memory-sync`
- Phase 2 owns experiment bundles, figure catalogs, and result findability
- Phase 2 does NOT own `environment/lib/export-eligibility.js`
- Phase 2 does NOT redefine writing-handoff rules
- if a doc says `flow-results` is "Phase 2-3", interpret that as: runtime packaging may land now, claim-backed export logic may not

Acceptance:
- the plan states one unambiguous Phase 2 boundary
- no work package smuggles in Phase 3 export policy
- the seam is resolved once here, not ad hoc in later waves

---

## WP-26 — New Contracts, Schemas, And Bundle Manifests

Create the missing Phase 2 machine-owned contracts:
- `environment/schemas/memory-sync-state.schema.json`
- `environment/schemas/experiment-bundle-manifest.schema.json`
- `environment/schemas/session-digest.schema.json`
- `environment/templates/experiment-bundle-manifest.v1.json`
- `environment/install/bundles/memory-sync.bundle.json`
- `environment/install/bundles/flow-results.bundle.json`

Contract rules:
- `memory-sync.bundle.json` lands the Wave 0 contract surface first, then expands to runtime files as those files land
- `flow-results.bundle.json` lands the Wave 0 packaging contract surface first, then expands to runtime files as those files land
- no bundle claims any Phase 3 export snapshot or alert surface

Acceptance:
- lifecycle commands can reason about the new bundles
- bundle ownership does not overlap existing Phase 1 bundles
- every new machine-owned JSON artifact has a schema

---

## WP-27 — Session Digest Contract Freeze

`session digest export` is named in the roadmap, but it is still under-specified.

Before runtime implementation, freeze:
- path convention
- file format
- ownership boundary
- minimum required fields
- whether the digest is per-session, per-sync, or per-results run

Rules:
- do not implement digest generation before this contract exists
- do not let the digest become a second truth layer
- do not bind it to Phase 3 writing exports

Acceptance:
- one concrete digest contract exists in the active spec set
- Wave 3 runtime work can target a stable artifact shape

---

## Parallelism

- WP-25 runs first
- WP-26 and WP-27 can run in parallel after WP-25 is frozen

---

## Exit Condition

Wave 0 is complete when:
- Phase 2 scope is unambiguous
- the new bundle manifests and machine-owned contracts are defined
- session digest export is no longer a fuzzy roadmap bullet
