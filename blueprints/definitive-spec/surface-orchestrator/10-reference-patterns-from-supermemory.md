# Surface Orchestrator Layer — Reference Patterns from Supermemory

---

## Purpose

Capture what is worth adopting from
`https://github.com/supermemoryai/supermemory` without importing a second
memory authority or a hosted dependency as the foundation of our system.

This is a design filter, not an implementation plan.

It exists because `supermemory` is unusually relevant to our next step:
- it treats continuity as a first-class problem
- it distinguishes profile context from query retrieval
- it exposes multiple integration shapes: API, middleware, MCP, and router
- it sits closer to our continuity and recall problems than the shell-heavy
  repos we inspected before

Reference repo surfaces inspected (docs + runtime code):
- `apps/docs/concepts/memory-vs-rag.mdx`
- `apps/docs/concepts/how-it-works.mdx`
- `apps/docs/concepts/user-profiles.mdx`
- `apps/docs/concepts/graph-memory.mdx`
- `apps/docs/user-profiles/api.mdx`
- `apps/docs/user-profiles/examples.mdx`
- `apps/docs/memory-router/overview.mdx`
- `apps/docs/connectors/overview.mdx`
- `packages/tools/src/shared/memory-client.ts` — actual API client
- `packages/tools/src/shared/prompt-builder.ts` — context assembly
- `packages/tools/src/shared/cache.ts` — per-turn LRU cache
- `packages/tools/src/shared/context.ts` — client factory
- `packages/tools/src/shared/types.ts` — MemoryMode, ProfileStructure
- `packages/tools/src/vercel/middleware.ts` — transparent injection
- `packages/tools/src/openai/middleware.ts` — transparent injection
- `packages/tools/src/claude-memory.ts` — Claude file-system adapter
- `packages/lib/api.ts` — backend API schema (Zod)
- `packages/validation/api.ts` — validation schemas
- `apps/mcp/src/server.ts` — MCP tool surface
- `packages/memory-graph/src/` — visualization package

---

## Critical Structural Finding

**The supermemory backend is NOT in this repo.**

`packages/lib/api.ts` line 231: `baseURL: "https://api.supermemory.ai"`.
`packages/tools/src/shared/context.ts` line 10: `const defaultUrl = "https://api.supermemory.ai"`.

This repo is a **client-side monorepo**: SDK, middleware, MCP server, browser
extension, web app, and docs. The actual memory storage, embedding, profiling,
and search engine live on a hosted Cloudflare service that is NOT open source.

**Implication:** The patterns we extract are real product patterns, but there is
no local implementation to fork or adapt. Everything we adopt must be built from
scratch on top of VRE state surfaces.

**Implication for the "memory graph" package:** `packages/memory-graph/` is
purely a **canvas visualization** (renderer, hit-test, simulation, viewport).
It is NOT a graph database or a local knowledge store.

---

## Main Conclusion

`supermemory` does **not** tell us to replace VRE memory mirrors or kernel
truth with a hosted memory platform.

What it does tell us is more specific and more useful:

1. continuity context should be assembled deliberately, not improvised
2. stable profile context and query recall are different things
3. one-call context assembly is a real product advantage
4. per-turn caching matters once a coordinator loops across tools and lanes

The right adoption path is therefore:
- keep truth in the kernel
- keep operational runtime in VRE
- add a future orchestrator continuity contract above VRE

---

## What Supermemory Gets Right

### 1. Memory vs Retrieval Is A Real Boundary

`memory-vs-rag.mdx` makes the central distinction clearly:
- memory is evolving, user- or entity-scoped context
- retrieval is document or chunk lookup

Mapped into our architecture:
- kernel and VRE artifacts remain the authoritative evidence and runtime state
- future orchestrator recall is not "just search"
- the coordinator needs a continuity layer that can combine stable context,
  live state, and targeted retrieval

### 2. Static And Dynamic Profile Split

`user-profiles.mdx` and `user-profiles/api.mdx` separate:
- static profile: durable facts and preferences
- dynamic profile: recent context and temporary state

Mapped into our architecture:
- stable operator/project preferences should not live in chat history only
- active blockers, current flow, and recent run context should not be stored as
  timeless preferences

### 3. Profile Plus Search In One Call

The `/v4/profile` endpoint returns one combined response with profile
(static + dynamic) and optional search results. However, the `profile` /
`query` / `full` modes are **client-side filters**, not server-side parameters.

In `memory-client.ts` lines 136-152, the SDK calls the same endpoint regardless
of mode and then locally selects what to include in the assembled prompt:
- `profile` mode → include static+dynamic, exclude search results
- `query` mode → include search results, exclude profile
- `full` mode → include everything

**What this means for us:**
- the mode abstraction is still valuable as a design pattern
- but it is a local assembler concern, not a retrieval contract
- our `assembleContinuityContext` should branch locally, not call different
  endpoints per mode

### 4. Per-Turn Memory Cache

`packages/tools/src/shared/cache.ts` is a thin LRU wrapper (74 lines,
`lru-cache` with `max: 100`). The cache key is
`containerTag:threadId:mode:normalizedMessage`. There is no TTL, no
freshness-based invalidation, no persistence. It exists solely to avoid
redundant API calls when the middleware loops through multiple tool calls in
one turn.

**What this actually tells us:**
- supermemory's per-turn cache is deliberately simple — not a sophisticated
  freshness engine
- a simple in-memory LRU keyed on scope + mode + normalized query is likely
  sufficient for our first coordinator too
- we should not over-engineer the cache contract in our doc 11 beyond what the
  reference implementation actually needed

### 5. Explicit Scope Keys

`containerTag`, `conversationId`, and project-scoped MCP usage are not random
SDK details. They are scope discipline.

Mapped into our architecture:
- project root is our primary hard scope
- thread id, queue task id, lane id, and domain pack are likely secondary
  context scopes
- continuity context should always declare which scope it was assembled for

### 6. Memory Version Chains

Supermemory's backend data model (`packages/validation/api.ts` lines 690-760)
tracks memory evolution through version chains:
- each memory entry can have `parents` and `children`
- relations are typed: `updates`, `extends`, `derives`
- version distance is tracked (-1 for direct parent, +1 for direct child)

Example: "Dhravya is working on a patent at Cloudflare" → (updates) →
"Dhravya has filed the patent successfully."

**Mapped into our architecture:**
- the stable continuity profile should not just store current preferences — it
  should record WHY a preference changed (update reason + previous value)
- this is NOT the same as kernel claim versioning; it is operational preference
  history
- the version chain gives us "undo" and "explain why this changed" for free

### 7. Explicit Forget With Reason

The MCP server exposes `memoryForget` with an optional `reason` field. The
backend marks the memory as `isForgotten` with `forgetReason` — soft delete,
not hard delete.

**Mapped into our architecture:**
- stable profile updates should support explicit "forget this preference" with
  a reason
- the reason should be logged in the profile update history
- this is the counterpart to "explicit confirmed capture" — both directions
  (add and remove) should be auditable

### 8. Source Type Awareness In Recall

Supermemory's validation schemas distinguish content types: text, pdf, tweet,
image, video, webpage, code. This matters for relevance ranking.

**Mapped into our architecture:**
- our query recall sources are not all equal: memory mirrors, decision logs,
  attempt summaries, experiment bundles, writing packs, export alerts all have
  different relevance for different modes
- the context assembler should carry source type metadata so the formatter can
  prioritize appropriately (e.g., recent decisions rank higher than old mirror
  summaries for a resume task)

### 9. Separate Tools For Save, Recall, And Context

The MCP server exposes distinct surfaces:
- `memory`
- `recall`
- `context`

Mapped into our architecture:
- future orchestrator northbound helpers should avoid one overloaded
  "do-everything memory" surface
- profile retrieval, recall lookup, and prompt/context assembly should stay
  separate concerns even when composed together

---

## What Maps Cleanly To Our System

| Supermemory idea | Our equivalent |
|------------------|----------------|
| static profile | stable continuity profile for operator/project preferences |
| dynamic profile | live operational context derived from VRE state |
| profile + query response | `profile`, `query`, `full` context modes |
| container tag | project / thread / queue-task scope |
| per-turn cache | per-turn or per-task continuity cache |
| memory tool + recall tool + context prompt | future distinct orchestrator helpers for profile, recall, and assembled context |

---

## What We Must Not Import

### A. Transparent Memory Router As Foundation

`memory-router/overview.mdx` describes a transparent proxy that rewrites context
between the app and the provider.

That is useful for many products.
It is **not** the right foundation for us.

Why:
- it hides context assembly behind transport
- it makes continuity behavior harder to inspect than an explicit coordinator
- it blurs provider I/O with orchestration policy

For us, continuity assembly should be an explicit coordinator responsibility,
not a hidden proxy side effect.

### B. Auto-Save Every Message By Default

The middleware supports `addMemory: "always"`.

That is exactly the kind of convenience that becomes dangerous in our system if
copied blindly.

For us:
- stable continuity should not absorb every utterance
- scientific notes and truth-adjacent artifacts must remain traceable to VRE
  or kernel surfaces
- operational preferences should change explicitly or through tightly declared
  updater rules, not by ambient chat osmosis

### C. Derived Or Inferred Memories As Truth

`graph-memory.mdx` highlights `derives` relationships and inferred facts.

Useful for generic assistant memory.
Unsafe as a truth path for research.

For us:
- inference may inform recall or summarization
- it may not create claim truth, citation truth, gate outcomes, or export
  eligibility

### D. Hosted Memory Backend As Mandatory Dependency

`supermemory` is designed as a memory platform.

Our system is designed as:
- local kernel truth
- local VRE runtime
- future local-first orchestrator control plane

So even if we later inspect hosted continuity helpers, the coordinator core
must not require an external memory service to function.

### E. Connector Ingestion As Shadow Authority

`supermemory` connectors pull external content into its memory/search layer.

For us:
- imported external content must still enter through VRE connector boundaries
- imported content may support literature or recall
- it must not become a shadow truth plane outside kernel/VRE contracts

---

## Concrete Decisions Supermemory Pushes Us Toward

These are real architectural decisions, not just confirmations.

### 1. Continuity Profile Should Be First-Class

We should freeze a future orchestrator-owned continuity profile instead of
treating preferences and recurring project context as chat residue.

### 2. Context Assembly Should Have Modes

The coordinator should support at least:
- `profile`
- `query`
- `full`

That keeps broad context, targeted recall, and combined context distinct.

### 3. Stable And Dynamic Continuity Should Be Split

Stable preferences and current operational state should not be mixed into one
undifferentiated blob.

### 4. Per-Turn Cache Should Be Part Of The Contract

If we leave context caching implicit, every runtime will invent it differently.

### 5. Future Northbound Tools Should Be Separable

The eventual northbound surface should likely expose distinct concepts for:
- continuity profile
- targeted recall
- assembled context

Even if a UI later hides that distinction from the user.

---

## Open Questions For Phase 0

1. Which stable preferences belong in an orchestrator-owned continuity profile
   versus VRE or kernel state?
2. Which live state fields belong in dynamic continuity context versus raw
   `/flow-status`?
3. Which recall sources are allowed in `query` mode on day one?
4. When continuity recall disagrees with current VRE state, how is staleness
   labeled and who wins?
5. Is the first continuity cache purely in-memory, or does any part become
   durable on disk?

---

## Final Reading

`supermemory` is strongest for us not as a backend to copy, but as a pressure
test on continuity design.

The architectural import is:
- continuity is a product surface
- context assembly needs explicit modes
- stable profile, dynamic state, and targeted recall should be separate
- the coordinator should own that composition visibly above VRE
