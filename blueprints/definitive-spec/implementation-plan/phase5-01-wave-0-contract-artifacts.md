# Phase 5 Wave 0 — Contract Artifacts

**Goal:** Freeze the Phase 5 machine-owned artifacts, schemas, bundle ownership,
and entry surfaces before coordinator runtime code lands.

---

## Scope Rule

Wave 0 freezes only what the first executable coordinator needs:
- one orchestrator-owned state zone
- one continuity-profile contract
- one queue model
- one execution lane and one review lane contract
- one status shim and one run shim contract
- one minimal operator shell contract

It does NOT freeze:
- channel adapters
- dashboard UI
- broad multi-agent scheduling
- cloud-managed runtime

---

## WP-87 — Phase 5 MVP Scope Freeze

Record one implementation stance and use it everywhere:
- Phase 5 is the local coordinator MVP
- the runtime stays in this repo
- Phase 5 consumes VRE helpers; it does not bypass them
- the first operator surfaces are chat, command shims, and filesystem artifacts
- review remains non-canonical
- Phase 5 does not auto-capture preferences from arbitrary chat

Acceptance:
- no work package assumes dashboard-first or channel-first delivery
- no work package smuggles in wider supervision or cloud-only runtime
- the MVP seam is clear enough that later waves do not guess scope

---

## WP-88 — Orchestrator Bundle And Owned Paths

Freeze the machine-owned Phase 5 bundle and state root:
- `environment/install/bundles/orchestrator-core.bundle.json`
- `.vibe-science-environment/orchestrator/`

Minimum owned paths to freeze here:
- `continuity-profile.json`
- `continuity-profile-history.jsonl`
- `router-session.json`
- `lane-policies.json`
- `run-queue.jsonl`
- `lane-runs.jsonl`
- `recovery-log.jsonl`
- `escalations.jsonl`
- `external-review-log.jsonl`

Acceptance:
- lifecycle commands can reason about Phase 5 ownership before runtime files land
- no owned path overlaps Phase 1-4 bundles
- uninstall scope is bounded to orchestrator-owned paths only

---

## WP-89 — Queue, Lane, And Runtime Schemas

Create the missing Phase 5 runtime schemas:
- `environment/schemas/router-session.schema.json`
- `environment/schemas/run-queue-record.schema.json`
- `environment/schemas/lane-policy.schema.json`
- `environment/schemas/lane-run-record.schema.json`
- `environment/schemas/recovery-record.schema.json`
- `environment/schemas/escalation-record.schema.json`
- `environment/schemas/external-review-record.schema.json`

Acceptance:
- the queue model is append-only/event-sourced by contract
- lane policy captures the per-lane override surface from the spec set
- recovery and escalation records are explicit machine-owned artifacts, not console-only output

---

## WP-90 — Continuity And Context Schemas

Create the missing Phase 5 continuity schemas:
- `environment/schemas/continuity-profile.schema.json`
- `environment/schemas/continuity-profile-history.schema.json`
- `environment/schemas/assembled-continuity-payload.schema.json`

Freeze here:
- explicit profile update history lives in append-only JSONL
- assembled context carries source refs, warnings, token accounting, and truncation visibility
- cache state is not a durable contract in Phase 5

Acceptance:
- continuity contracts match docs 11 and 12 without hidden inference fields
- profile history is auditable and bounded to orchestrator-owned semantics
- assembled payload distinguishes stable profile, dynamic context, and recall hits

---

## WP-91 — Command And Minimal Shell Contract Freeze

Freeze the first operator entry surfaces:
- one run shim
- one status shim
- one minimal operator shell contract above `/flow-status` and VRE summaries

Freeze:
- required status fields
- required queue visibility
- required escalation and recovery visibility
- required artifact locations for human-readable operator output

Acceptance:
- no runtime work package invents its own operator surface ad hoc
- Phase 5 shells stay filesystem-first and chat-compatible
- dashboard UI remains explicitly out of scope

---

## WP-92 — Lifecycle And Validator Entry Freeze

Decide up front which existing lifecycle and validator surfaces Phase 5 must extend:
- `install`
- `doctor`
- `repair`
- `uninstall`
- `upgrade`
- `validate-runtime-contracts.js`
- `validate-install-bundles.js`
- `validate-bundle-ownership.js`
- `validate-references.js`
- `validate-counts.js`

Acceptance:
- every planned Phase 5 artifact has a future validator owner
- lifecycle coverage is defined before runtime code spreads
- Phase 5 does not land hidden files with no validator or lifecycle story

---

## Parallelism

- WP-87 runs first
- WP-88, WP-89, and WP-90 can run in parallel after WP-87 is accepted
- WP-91 should align with WP-87 and WP-89
- WP-92 starts after bundle ownership and schema inventory are frozen

---

## Exit Condition

Wave 0 is complete when Phase 5 has explicit bundle ownership, schema-backed
machine-owned artifacts, and frozen operator entry surfaces with no dashboard
or cloud-runtime ambiguity.
