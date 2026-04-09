# Phase 5 Wave 2 — Continuity And Context Assembly

**Goal:** Implement the continuity-profile runtime and helper-backed context
assembly before the coordinator starts composing prompts ad hoc.

---

## WP-98 — Continuity Profile Runtime

Add `environment/orchestrator/continuity-profile.js` for:
- reading the stable profile
- explicit profile updates
- explicit forget operations
- append-only history writes

Rules:
- updates must carry prior value, new value or forget marker, reason, actor, and timestamp
- no automatic preference persistence from arbitrary chat turns
- continuity profile remains non-truth operational state

Acceptance:
- explicit update and explicit forget are both auditable
- continuity-profile current state and history stay separate by contract
- update helpers never bypass schema validation

---

## WP-99 — Helper-Backed Recall Adapters

Add read-only adapters that assemble recall candidates from existing VRE helpers:
- writing packs and export alerts through `getWritingOverview(...)`
- result bundles through `getResultsOverview(...)`
- decision and attempt summaries through control-plane helpers
- future lane-run summaries from orchestrator-owned records

Rules:
- Phase 5 uses helper-backed summary surfaces only
- no free-text recall over arbitrary JSONL logs lands in Phase 5
- current validated state always outranks historical recall

Acceptance:
- `query` mode has real historical sources without bypassing southbound rules
- recall hits are attributable and source-typed
- stale or conflicting recall is labeled, not silently merged

---

## WP-100 — Context Assembly Core

Add `environment/orchestrator/context-assembly.js` for:
- `profile`, `query`, and `full` modes
- stable profile + dynamic context + recall composition
- ordered deduplication
- source refs and warnings

Rules:
- dedup precedence stays `stable profile > dynamic context > recall hits`
- assembly returns structured payload, not prompt text only
- dynamic context must come from declared read-only helpers

Acceptance:
- one shared assembly helper exists for all lanes
- mode semantics match docs 11 and 12
- the payload exposes enough structure for testing and prompt formatting

---

## WP-101 — Formatting, Budget, And Cache

Extend the continuity runtime with:
- `formatContinuityForPrompt(...)`
- sub-budget enforcement via `maxTokens`
- token/truncation visibility in the payload
- in-memory LRU cache for repeated assembly within one run scope

Rules:
- cache is in-memory only in Phase 5
- `maxTokens` is the assembler sub-budget, not the global prompt budget
- truncation order must follow the spec contract

Acceptance:
- lanes can consume one default formatter instead of inventing prompt text independently
- cache is explicit, disposable, and never becomes durable state
- token and truncation visibility are testable outputs, not hidden behavior

---

## WP-102 — Explicit Capture Surfaces

Add the minimal surfaces needed for explicit continuity updates:
- one explicit invoke/update path
- one visible proposal path for a lane to suggest a profile update
- one confirm/reject path

Rules:
- if there is no explicit invoke or visible proposal, nothing is persisted
- proposals remain reviewable artifacts or records, not hidden side effects

Acceptance:
- the repo has a safe path for continuity updates without auto-capture
- later coordinator runtime can rely on one explicit capture contract
- profile pollution from chat guesswork remains impossible by contract

---

## Parallelism

- WP-98 and WP-99 can run in parallel after Wave 1 query helpers exist
- WP-100 starts after WP-98 and WP-99 return stable shapes
- WP-101 starts after WP-100
- WP-102 can start after WP-98 once history semantics are frozen

---

## Exit Condition

Wave 2 is complete when continuity profile updates are explicit and auditable,
and one shared assembly runtime can produce bounded, source-aware context in
all three modes without ad hoc prompt glue.
