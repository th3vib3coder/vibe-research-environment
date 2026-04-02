# Phase 3 Wave 1 — Export Policy Core

**Goal:** Build one normative export-policy core and the machine-owned artifact helpers it depends on.

---

## WP-49 — Shared `exportEligibility()` Helper

Implement `environment/lib/export-eligibility.js` as the single normative export predicate.

Core responsibilities:
- read claim-head status
- read citation-check projections
- treat `listUnresolvedClaims()` as diagnostic only, not sole normative truth
- return `eligible` plus stable reason codes

Minimum reason codes:
- `not_promoted`
- `zero_citations`
- `unverified_citations`
- `needs_fresh_schema_validation`
- `review_debt_signal`
- one explicit degraded-mode reason if profile metadata is unavailable

Acceptance:
- helper returns one stable shape everywhere
- `/flow-results` and `/flow-writing` consume the same helper
- no command-specific re-encoding of export policy survives

---

## WP-50 — Profile-Safety Compatibility Layer

Implement the Phase 3 extension around `governanceProfileAtCreation` and fresh schema validation.

Runtime responsibilities:
- consume `governanceProfileAtCreation` when the kernel exposes it
- degrade honestly when the field is unavailable
- read fresh schema-validation artifacts from `.vibe-science-environment/governance/schema-validation/`
- require fresh validation at export time for claims not created under `strict`

Compatibility rule:
- missing profile metadata is not silent strict equivalence
- it must surface as an explicit degraded or compatibility-limited path

Acceptance:
- profile-safety logic is centralized beside the shared helper
- default-mode claims cannot slip into claim-backed export without the fresh-validation artifact
- strict-mode claims do not require redundant fresh validation

---

## WP-51 — Export Snapshot, Record, And Alert Helpers

Add reusable machine-owned artifact helpers for:
- frozen export snapshot writes
- append-only export record writes
- append-only export alert writes

Likely surfaces:
- `environment/lib/export-snapshot.js`
- `environment/lib/export-records.js`
- or one equivalent helper split that keeps files small and responsibilities clear

Rules:
- snapshot writes are atomic
- record and alert writes are append-only
- alert replay logic must preserve prior exported context, not only current state

Acceptance:
- writing runtime can call helpers instead of hand-rolling JSON writes
- all machine-owned Phase 3 artifacts are written through shared validated helpers
- helper boundaries remain small enough for independent testing

---

## Parallelism

- WP-49 starts first
- WP-50 can run in parallel once WP-49 freezes the reason-code surface
- WP-51 starts after the Wave 0 contracts are stable and may overlap with WP-50

---

## Exit Condition

Wave 1 is complete when:
- one shared export helper exists
- profile-safety compatibility behavior is explicit
- snapshot, record, and alert helpers exist as reusable validated runtime surfaces
