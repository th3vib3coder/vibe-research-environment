# Phase 2 Wave 1 — Memory Sync Core

**Goal:** Build the command-independent memory sync runtime before adding operator shims.

---

## Memory Rule

Memory is mirror, never truth.

This wave may read:
- kernel projections via CLI bridge
- `control/session.json`
- `control/decisions.jsonl`
- experiment manifests
- optional marks sidecar

This wave may NOT:
- write kernel truth
- write into `memory/notes/`
- infer claim or citation truth from prose

---

## WP-28 — `environment/memory/sync.js`

Create the main Phase 2 memory runtime entrypoint:
- read kernel projections with honest degradation
- read control-plane and experiment surfaces from workspace state
- compose one sync run from explicit inputs
- return structured warnings instead of inventing facts when inputs are missing

Required behavior:
- workspace-first degradation when kernel DB is unavailable
- no markdown scraping as substitute truth
- no hidden coupling to hooks

Acceptance:
- the sync helper is callable without the command shim
- kernel-unavailable mode is explicit and honest
- no kernel-owned path is written

---

## WP-29 — Mirror Renderers

Implement machine-written renderers for:
- `.vibe-science-environment/memory/mirrors/project-overview.md`
- `.vibe-science-environment/memory/mirrors/decision-log.md`

Rules:
- full overwrite on every sync
- every file carries `<!-- synced: ... -->`
- mirrored facts use kernel vocabulary, not paraphrased truth terms
- mirrored fact lines carry provenance markers where required
- manual note zones stay untouched

Acceptance:
- `project-overview.md` solves orientation, not truth certification
- `decision-log.md` mirrors control-plane decisions without becoming a second source of truth
- mirrors remain readable in plain text editors

---

## WP-30 — Sync State And Write Policy

Implement:
- `.vibe-science-environment/memory/sync-state.json`
- atomic write behavior for machine-owned mirror files

Rules:
- mirror writes use write-then-rename where applicable
- partial failure warns honestly and never corrupts kernel state
- the sync state records enough freshness metadata for >24h stale detection
- this wave emits freshness metadata only; stale operator messaging is Wave 2

Acceptance:
- stale/fresh state is derivable from `sync-state.json`
- partial failure leaves recoverable outputs
- next sync can overwrite cleanly

---

## Parallelism

- WP-28 starts first
- WP-29 and WP-30 can run in parallel once the sync input/output contract is frozen

---

## Exit Condition

Wave 1 is complete when Phase 2 has a real memory sync runtime that can:
- read allowed sources
- write the two core mirrors
- publish sync freshness state

without relying on prompt-only logic.
