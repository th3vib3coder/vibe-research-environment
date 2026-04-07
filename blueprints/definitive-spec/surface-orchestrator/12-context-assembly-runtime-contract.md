# Surface Orchestrator Layer — Context Assembly Runtime Contract

---

## Purpose

Define the runtime mechanics of context assembly: budget, helper API, caching,
deduplication, formatting, update rules, and VRE relationship.

This is the HOW companion to doc 11 (which defines the WHAT: profiles, sources,
modes, recall).

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

`maxTokens` is the assembler's sub-budget, not the total prompt budget.
The full prompt budget must be arbitrated by an upstream coordinator that knows
about all context injectors:
- kernel-owned base context
- VRE command or helper context
- orchestrator continuity context

If no global budget coordinator exists yet, Phase 0 should use a conservative
ceiling for continuity assembly rather than assume it owns the full model
window.

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
  maxTokens,
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
  "totalTokens": 0,
  "truncated": false,
  "assembledAt": "2026-04-07T10:00:00Z"
}
```

Future build surfaces:
- `environment/orchestrator/continuity-profile.js`
- `environment/orchestrator/context-assembly.js`
- `environment/schemas/orchestrator-continuity-profile.schema.json`
- `environment/schemas/orchestrator-continuity-update.schema.json`

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

Each update should carry:
- the previous value
- the new value
- the reason for the change (from supermemory's `entityContext` pattern)
- timestamp
- whether the change was operator-initiated or orchestrator-proposed

This gives us undo capability and "explain why this changed" for free, inspired
by supermemory's version chain model (`updates`, `extends`, `derives` relations
in their memory entries).

Destination rule:
- `continuity-profile.json` stores current effective state only
- `continuity-profile-history.jsonl` stores append-only update and forget
  records

This keeps the live profile compact while preserving auditable history.

### Explicit Forget

The stable profile should support explicit "forget this preference" with a
reason, inspired by supermemory's `memoryForget` tool with `reason` field.
The forgotten preference should be soft-marked (not hard-deleted) so the
history remains auditable.

At minimum, the soft-forget record should preserve:
- prior value
- `forgetReason`
- `forgottenAt`
- actor (`operator` or proposed-by-orchestrator)

### Anti-Patterns For Updates

The profile should **not** change because:
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

## Deduplication Rule

When the assembler combines sources (VRE session, attempts, decisions, recall
hits), the same fact can appear from multiple surfaces. Supermemory handles this
with an explicit `deduplicateMemories()` pass before prompt assembly
(`packages/tools/src/tools-shared.ts`).

Our assembler should do the same:
- deduplicate across stable profile, dynamic context, and recall hits BEFORE
  formatting
- when duplicates overlap, keep them in this order:
  stable profile first, dynamic context second, recall hits last
- dedup key should be content-based, not source-based
- in Phase 0, "normalized text" means deterministic textual normalization only
  (for example trim, and optionally repeated-whitespace collapse if declared)
- fuzzy or semantic dedup is explicitly out of scope for the first contract
- log the dedup count so we can measure redundancy over time

This is cheap and prevents the assembled context from wasting tokens on
repeated facts.

---

## Prompt Formatting Contract

The `assembleContinuityContext` helper returns structured JSON. But the
coordinator needs to inject this into an LLM prompt as text.

Supermemory solves this with a `PromptTemplate` function
(`packages/tools/src/shared/types.ts` line 40) that the caller can override.

Our equivalent:
- the assembler returns structured data (JSON)
- a separate `formatContinuityForPrompt(assembled, options)` function converts
  it to text
- the formatter is overridable so different lanes can format differently
  (e.g., concise for reporting, detailed for execution)
- the default formatter should produce markdown sections with source labels
- the formatter should receive source type metadata so ordering and truncation
  can prefer decision logs over old mirror summaries when appropriate

This keeps assembly and formatting as separate concerns.

---

## Explicit Operator Decision Capture

We reject `addMemory: "always"` (auto-save every utterance). But there IS a
legitimate case for capturing specific operator decisions made during chat:
- "use batch correction method X for all future experiments"
- "from now on, always include the propensity matching step"

These are not truth — they are operational preferences. They should enter the
stable continuity profile through an explicit capture path:
- the orchestrator detects a preference-like statement
- it proposes a stable profile update
- the operator confirms or rejects
- the update is logged with audit visibility

This is the opposite of ambient capture: it is **confirmed, explicit,
auditable preference ingestion**.

The exact detection mechanism is still a Phase 0 open question.
It may be operator-invoked, rule-based, classifier-assisted, or proposed by a
lane, but it must never silently persist a preference without visible review.

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
