# Phase 5 Wave 1 — State And Queue Foundation

**Goal:** Build the shared orchestrator state, queue, ledger, and query
foundation before any lane runtime starts executing work.

---

## WP-93 — Shared Orchestrator Path And IO Helpers

Add the shared runtime substrate under `environment/orchestrator/`:
- path helpers for the orchestrator state root
- schema-backed read/write helpers for orchestrator-owned JSON and JSONL
- any thin wrappers needed to reuse `environment/control/_io.js`

Rules:
- reuse existing atomic write and lock discipline whenever possible
- do not fork a second IO framework if the control-plane helper is sufficient
- keep all writes bounded to the orchestrator-owned state zone

Acceptance:
- Phase 5 writes reuse the repo's existing file-safety discipline
- missing state surfaces fail honestly
- no helper writes outside orchestrator-owned paths

---

## WP-94 — Bootstrap And Read Helpers For Orchestrator State

Implement explicit bootstrap/read helpers for:
- `continuity-profile.json`
- `lane-policies.json`
- `router-session.json`
- empty append-only ledgers

Rules:
- bootstrap must be explicit
- read paths must not create files as a side effect
- defaults must remain conservative

Acceptance:
- first-run orchestrator state can be created intentionally and read safely
- bootstrap-on-read behavior is not reintroduced through convenience helpers
- empty-state reads return honest defaults instead of fabricating activity

---

## WP-95 — Event-Sourced Queue Helper

Add `environment/orchestrator/queue.js` for:
- appending queue task records
- deriving latest task state from append-only records
- dependency tracking
- durable queue replay

Minimum behaviors:
- create task
- append status transition
- compute latest task state
- list ready, blocked, active, and terminal tasks

Acceptance:
- queue semantics match the spec's append-only model
- replay derives current state without mutating prior records
- dependency failure or corruption becomes visible state, not silent omission

---

## WP-96 — Lane Policy And Runtime Ledgers

Add helpers for:
- lane policy read/validation
- lane run append/query
- recovery-log append/query
- escalation append/query

Acceptance:
- every lane invocation is attributable to a queue item or explicit operator action
- recovery and escalation decisions are machine-owned records
- lane policy remains the authoritative per-lane override surface

---

## WP-97 — Orchestrator Query Surface

Add `environment/orchestrator/query.js` for operator-facing summaries such as:
- queue depth by status
- active lane runs
- latest escalation
- latest recovery action
- next recommended operator action

Rules:
- query helpers remain read-only
- summaries stay observational and must not become a second task system

Acceptance:
- later command shims can consume one shared query surface
- researchers can inspect orchestrator state without reading raw JSONL manually
- query helpers degrade honestly on missing or partial state

---

## Parallelism

- WP-93 runs first
- WP-94, WP-95, and WP-96 can branch after the shared IO substrate exists
- WP-97 starts after the queue and ledger helpers return stable summaries

---

## Exit Condition

Wave 1 is complete when the orchestrator has a reusable state/query substrate:
bootstrapped safely, append-only where promised, and readable through shared
helpers instead of ad hoc file parsing.
