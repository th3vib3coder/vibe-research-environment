# Surface Orchestrator Layer — Continuity Profiles and Context Assembly

---

## Purpose

Define how the future orchestrator should assemble useful continuity context
without creating a second truth system above VRE.

This document exists because the coordinator will fail in practice if it has
only two bad options:
- rebuild context from scratch on every turn
- silently improvise a hidden memory layer with no contract

The goal is a third option:
- explicit continuity profile
- explicit live context assembly
- explicit query recall
- explicit boundaries against truth drift

---

## Three Different Things

These must stay separate.

| Surface | Meaning | Owner |
|--------|---------|-------|
| truth | claims, citations, gates, export safety | kernel + VRE contracts |
| continuity profile | durable non-truth operator/project preferences | orchestrator |
| recall and live context | current operational state plus targeted historical retrieval | VRE-derived + orchestrator assembly |

If these collapse into one "memory" concept, the orchestrator becomes sloppy.

---

## Stable vs Dynamic Continuity

The orchestrator should adopt a two-part continuity model.

### Stable Continuity Profile

Durable preferences and long-lived project framing that are not scientific
truth.

Examples:
- preferred reporting verbosity
- preferred autonomy level
- preferred review strictness
- quiet hours and delivery windows
- primary audience (`advisor`, `coauthors`, `self`)
- preferred lane roles for review or reporting (abstract roles, not provider
  refs — provider mapping lives in lane-policies.json)

**Note on domain-pack preference:** VRE already owns `domain-config.json` with
`activePackId`. The continuity profile should NOT duplicate this. If the
operator wants a domain-pack default, it lives in VRE's domain activation
surface, not here. The continuity profile may reference the active pack for
display but does not own pack selection.

### Dynamic Continuity Context

Recent, freshness-bounded operational state derived from VRE and orchestrator
state.

Examples:
- active objective
- current flow and stage
- open blockers
- unresolved review debt
- stale-memory or cooldown warnings
- last failed or interrupted queue items
- recent recovery decisions

Stable continuity should persist.
Dynamic continuity should be derived fresh and decay naturally.

---

## Proposed Durable Surface

The orchestrator should eventually own:

`.vibe-science-environment/orchestrator/continuity-profile.json`

This file is non-truth operational state.

Candidate shape:

```json
{
  "schemaVersion": "vibe-orch.continuity-profile.v1",
  "operator": {
    "autonomyPreference": "supervised",
    "reportVerbosity": "concise",
    "reviewStrictness": "high",
    "quietHoursLocal": ["22:00-07:00"]
  },
  "project": {
    "primaryAudience": "advisor",
    "defaultReportKinds": ["advisor-pack", "weekly-digest"]
  },
  "runtime": {
    "preferredLaneRoles": ["primary-execution", "primary-review"],
    "allowApiFallback": false
  },
  "updatedAt": "2026-04-07T10:00:00Z"
}
```

This file may influence:
- routing
- reporting style
- escalation policy
- provider choice

It may NOT influence:
- claim truth
- citation truth
- gate outcomes
- export eligibility

---

## Dynamic Context Sources

Dynamic continuity context should be assembled, not hand-maintained.

**Important:** Dynamic context MUST be read through VRE query helpers, not by
reading workspace files directly. Doc 07 (southbound contract rules) explicitly
forbids scraping files when helpers exist. The context assembler should call:
- `getSessionSnapshot(projectPath)` — not read `session.json` directly
- `getCapabilitiesSnapshot(projectPath)` — not read `capabilities.json`
- `listAttempts(projectPath, filters)` — not parse `attempts.jsonl`
- `listDecisions(projectPath, filters)` — not parse `decisions.jsonl`
- `getMemorySyncState(projectPath)` — not read `sync-state.json`
- `getConnectorHealthOverview(projectPath)` — when connectors installed
- `getAutomationOverview(projectPath)` — when automation installed
- `getDomainPackOverview(projectPath)` — when domain packs installed

Primary orchestrator-owned inputs (read directly because we own them):
- `run-queue.jsonl`
- `lane-runs.jsonl`
- `recovery-log.jsonl`
- `escalations.jsonl`

This keeps dynamic continuity grounded in actual machine-owned state instead of
chat reconstruction, AND respects the southbound contract boundary.

---

## Query Recall Sources

`query` mode should be allowed to read from declared historical surfaces such
as:
- memory mirrors
- decision mirrors or decision ledger entries
- attempt summaries
- experiment bundles
- writing packs
- export alerts
- future orchestrator lane-run summaries

But query recall remains:
- historical
- attributable
- subordinate to current VRE state

Each recall hit should carry source type metadata (inspired by supermemory's
content type awareness across text/pdf/code/etc). Our source types:
- `memory-mirror` — human-readable orientation
- `decision-log` — control-plane workflow decisions
- `attempt-summary` — past run outcomes
- `experiment-bundle` — packaged results
- `writing-pack` — advisor/rebuttal deliverables
- `export-alert` — post-export warnings
- `lane-run` — orchestrator-owned execution history

Source type matters for relevance ranking: recent decisions rank higher than
old mirror summaries for a resume task. The formatter should use source type
to prioritize, not just recency.

If recall conflicts with current validated state, the current state wins and
the recall hit is labeled stale or historical.

---

## Context Assembly Modes

The future coordinator should support at least three modes.

### `profile`

Use when the task needs broad continuity but not targeted retrieval.

Includes:
- stable continuity profile
- dynamic continuity context

Typical use:
- reporting
- planning
- intake
- light review

### `query`

Use when the task needs targeted historical retrieval without large background
injection.

Includes:
- query hits only
- source refs and freshness warnings

Typical use:
- "what did we decide about X?"
- "find the last failed experiment on Y"
- "show the latest export warning for claim C-014"

### `full`

Use when the task needs both broad continuity and targeted retrieval.

Includes:
- stable continuity profile
- dynamic continuity context
- query recall hits

Typical use:
- resume after interruption
- prepare a review or advisor summary
- restart a stalled work item with context

---

## Runtime Mechanics

Context budget, helper API, caching, deduplication, formatting, update rules,
and VRE relationship are defined in the companion document:

[12 — Context Assembly Runtime Contract](./12-context-assembly-runtime-contract.md)
