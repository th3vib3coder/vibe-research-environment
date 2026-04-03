# Phase 4 Wave 2 — Automation Substrate

**Goal:** Build reviewable automation on top of stable flow state without
creating hidden background authority.

---

## WP-72 — Automation Registry And Run Ledger

Add the automation runtime under `environment/automation/`:
- `definitions.js`
- `run-log.js`
- `artifacts.js`

Responsibilities:
- load automation definitions
- open and close automation run records
- persist visible artifact pointers
- track blocked and degraded runs explicitly

Acceptance:
- every run has a durable machine-owned record
- reruns do not silently overwrite prior artifacts
- blocked runs stay visible instead of disappearing

---

## WP-73 — First Reviewable Automations

Implement the first safe automation set:
- weekly research digest
- stale-memory reminder
- export-warning digest

Suggested command shims:
- `commands/weekly-digest.md`
- `commands/automation-status.md`

Artifact expectations:
- markdown or json summary artifact
- explicit timestamp
- explicit source surfaces used
- explicit blocked/degraded notes

Acceptance:
- each automation stays within summary/reminder scope
- export-warning digest only summarizes Phase 3 alerts; it never edits or clears them
- stale-memory reminder consumes existing staleness semantics from Phase 2

---

## WP-74 — Host-Schedule Compatibility

Add schedule-aware behavior without making scheduling mandatory.

Requirements:
- explicit command invocation remains supported
- host-native scheduled tasks can point at the same runtime path later
- schedule metadata never becomes the artifact itself

Acceptance:
- scheduled and manual runs share the same run-record contract
- no automation depends on SessionStart
- missing scheduler support degrades to manual command use only

---

## WP-75 — Operator Visibility And Backpressure

Surface automation state without inventing a second control plane.

Minimum visibility:
- last successful run
- current blocked or degraded reason
- latest artifact path
- next due time if scheduling metadata exists

Acceptance:
- `/flow-status` can summarize automation readiness without becoming a scheduler
- automation debt is visible when stale mirrors or export warnings remain unresolved

---

## Parallelism

- WP-72 must land before WP-73 and WP-74
- WP-73 and WP-74 can run in parallel on the shared runtime
- WP-75 starts after the first automation artifacts exist

---

## Exit Condition

Wave 2 is complete when automation definitions, run records, visible artifacts,
and safe first digests/reminders all work through one shared runtime.
