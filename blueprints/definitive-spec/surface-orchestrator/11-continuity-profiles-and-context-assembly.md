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

## Context Budget

The VRE baseline context measurement (Phase 1) showed ~20K tokens for
kernel-owned base (CLAUDE.md + SKILL.md + SessionStart). Adding orchestrator
continuity on top:

| Surface | Estimated cost | Notes |
|---------|---------------|-------|
| Stable profile | ~200-500 tokens | Small JSON, rarely changes |
| Dynamic context | ~1-3K tokens | Derived from VRE helpers, bounded by query limits |
| Query recall hits | ~2-8K tokens | Variable, must be limit-capped |
| Per-turn cache overhead | 0 (in-memory) | No token cost, only compute |

In `full` mode, worst case is ~12K additional tokens. On a 200K context model
this is manageable. On a 100K model it is ~12% of budget.

**Truncation rule:** The context assembler MUST accept a `maxTokens` parameter.
When the assembled context exceeds the budget:
1. Truncate recall hits first (least critical)
2. Truncate dynamic context details second (keep blockers, drop history)
3. Never truncate the stable profile (it is the cheapest and most reusable)

This budget analysis should be re-measured after the first coordinator runtime
exists, not assumed to be final.

---

## Candidate Helper Surface

Phase 0 should freeze a helper shape roughly like this.

**Note:** Parameters `laneId`, `threadId`, and `queueTaskId` depend on the
queue and lane contracts from doc 07, which are not yet frozen. This signature
is a candidate shape. Final parameter names will be settled when the queue
contract freezes.

```ts
assembleContinuityContext(projectPath, {
  mode: "profile" | "query" | "full",
  laneId,
  threadId,
  queueTaskId,
  queryText,
  limit,
})
```

Candidate return shape:

```json
{
  "stableProfile": {},
  "dynamicContext": {},
  "retrievalHits": [],
  "sourceRefs": [],
  "warnings": [],
  "assembledAt": "2026-04-07T10:00:00Z"
}
```

Future build surfaces:
- `environment/orchestrator/continuity-profile.js`
- `environment/orchestrator/context-assembly.js`
- `environment/schemas/orchestrator-continuity-profile.schema.json`

---

## Per-Turn Cache Rule

Context assembly should support a non-authoritative per-turn cache.

**Simplicity principle from the supermemory audit:** The actual supermemory
per-turn cache (`packages/tools/src/shared/cache.ts`) is a 74-line LRU with
max 100 entries and no TTL. It works. We should not over-engineer this.

The cache key should include:
- project scope
- mode
- lane id or thread id
- normalized query text

That is sufficient. The supermemory reference confirms that a simple
`scope:mode:query` key works in practice.

The cache should be invalidated when:
- a new user turn begins
- the mode or lane changes

We should NOT add field-level change detection on `session.json` as an
invalidation trigger — that would invalidate on every middleware run and make
the cache useless. If the cache is wrong after a VRE state change, the next
fresh assembly will fix it. The cache is disposable by design.

The cache is a performance optimization, not a source of truth.

---

## Update And Forgetting Rules

### Stable Profile Updates

Stable continuity profile should change only through:
- explicit operator choice
- explicit orchestrator-owned settings changes
- future declared update flows with audit visibility

It should **not** change because:
- every user utterance is auto-captured
- one summary guessed a new preference
- a lane hallucinated an operator habit

### Dynamic Context Decay

Dynamic continuity is derived, so it can decay naturally through source
freshness:
- resolved blockers disappear
- old queue failures move to history
- stale mirror warnings remain warnings, not active context forever

This gives us the useful part of "automatic forgetting" without inventing a
hidden memory authority.

---

## Relationship To VRE Memory Layer

VRE memory mirrors remain:
- human-readable
- filesystem-first
- explicitly synced
- non-canonical for truth and resume

The orchestrator continuity contract is different:
- it is northbound
- it assembles context for coordination
- it can use mirrors as one source among several
- it does not redefine mirror ownership or sync rules

That means:
- VRE memory stays mirror-first
- orchestrator continuity stays coordination-first

---

## What We Explicitly Avoid

1. auto-saving every chat turn into durable continuity state
2. using inferred or derived memories as claim truth
3. rebuilding continuity through a hidden proxy instead of explicit helpers
4. letting continuity recall outrank current VRE state
5. turning one convenience cache into a shadow database

---

## Invariants

1. Continuity is not truth.
2. Stable profile and dynamic context remain distinct.
3. `profile`, `query`, and `full` are separate modes with separate semantics.
4. Current VRE state wins over historical recall.
5. Context caching is explicit, bounded, and disposable.
6. Stable profile changes require visible ownership, not ambient chat capture.
