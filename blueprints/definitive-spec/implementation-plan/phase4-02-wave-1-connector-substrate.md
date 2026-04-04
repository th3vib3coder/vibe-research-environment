# Phase 4 Wave 1 — Connector Substrate

**Goal:** Build the first enterprise-safe connector runtime with one-way
behavior, explicit ownership, and visible failure surfaces.

---

## WP-68 — Connector Registry And Resolution

Add the shared connector runtime under `environment/connectors/`:
- `registry.js`
- `manifest.js`
- `health.js`

Responsibilities:
- discover installed connector manifests
- expose connector capability and health summaries
- refuse duplicate connector ids or overlapping owned paths

Acceptance:
- connector registry reads manifests only from repo-owned bundle paths
- connector health is queryable without mutating connector state
- missing optional connectors degrade honestly

---

## WP-69 — First One-Way Export Connectors

Implement the lowest-risk connector surfaces first:
- `filesystem-export.js`
- `obsidian-export.js`

Safe first outputs:
- results bundle export
- figure bundle export
- writing-pack export from already-generated Phase 3 artifacts
- memory-mirror export into an Obsidian vault path

Acceptance:
- exporters only consume already-derived VRE artifacts
- connector code does not recreate Phase 3 export-policy logic
- target-path failures are visible in connector run records
- export targets are rejected if they resolve inside the project workspace

---

## WP-70 — Optional Read-Only Metadata Ingress

Only if Wave 0 froze the contract cleanly, add:
- `zotero-import.js`

Scope:
- read paper metadata and attachment pointers only
- hand off into literature-flow compatible records
- never mark citations verified

Acceptance:
- ingress is clearly read-only
- imported metadata remains provisional until existing VRE flow logic accepts it
- connector unavailability never fabricates literature state

---

## WP-71 — Operator Surfaces For Connector Health

Add operator-facing visibility for connector state through existing summary
surfaces before inventing new dashboards.

Minimum surfaces:
- `/flow-status` health summary
- connector-owned run artifacts under `.vibe-science-environment/connectors/`

Acceptance:
- researchers can tell whether a connector is healthy, degraded, or unavailable
- connector status stays observational and never becomes a second task system
- connector status payloads are schema-validated before publication

---

## Parallelism

- WP-68 must land before WP-69 and WP-70
- WP-69 and WP-70 can run in parallel if both consume the shared registry
- WP-71 starts once the first connector run records exist

---

## Exit Condition

Wave 1 is complete when the repo has a shared connector substrate plus at least
one low-risk one-way export connector, with visible health and no truth writes.
