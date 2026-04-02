# Phase 2 Wave 2 — Shims, Staleness, And Marks

**Goal:** Expose memory sync safely to operators and make mirror freshness visible.

---

## WP-31 — `/sync-memory` Command Shim

Create:
- `commands/sync-memory.md`

The shim must stay thin:
- detect CLI bridge availability
- load only allowed outer-project state
- call the shared sync helper
- route lifecycle-sensitive behavior through shared middleware
- degrade honestly when kernel projections are unavailable

Acceptance:
- the shim is an entrypoint, not a second implementation
- operator-visible messaging is explicit in degraded mode
- the command never writes kernel truth

---

## WP-32 — Marks Sidecar Support

Add support for:
- `.vibe-science-environment/memory/index/marks.jsonl`

Scope:
- parse and validate mark records
- tolerate the file being absent
- expose marks as retrieval/prioritization hints only

Marks may:
- reorder or highlight what the shell surfaces first
- help future retrieval

Marks may NOT:
- change claim state
- certify evidence
- override blockers or mirror truth

Acceptance:
- missing or partial marks do not break sync
- marks influence prioritization only
- sync and status surfaces remain truth-neutral

---

## WP-33 — Stale Mirror Warning In `/flow-status`

Update status/query surfaces so that:
- mirror freshness comes from `memory/sync-state.json`
- mirrors older than 24h show `STALE — run /sync-memory to refresh`
- stale mirror resume text is treated as non-authoritative
- canonical operator resume still comes from `control/session.json`

Acceptance:
- >24h stale mirrors are visible in operator-facing status
- stale memory is a warning, not silent drift
- the control-plane snapshot remains the canonical resume surface

---

## Parallelism

- WP-31 and WP-32 can run in parallel after Wave 1 runtime stabilizes
- WP-33 starts after `sync-state.json` shape is stable

---

## Exit Condition

Wave 2 is complete when:
- `/sync-memory` exists as a thin command shim
- marks sidecar support is real but truth-neutral
- stale mirrors are surfaced explicitly in `/flow-status`
