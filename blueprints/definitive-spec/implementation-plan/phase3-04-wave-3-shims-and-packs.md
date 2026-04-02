# Phase 3 Wave 3 — Shims And Packs

**Goal:** Expose the Phase 3 runtime through thin command surfaces and assemble the deliverable bundles researchers actually need.

---

## WP-55 — `/flow-writing` Command Shim

Create `commands/flow-writing.md` as the thin host-facing entrypoint over shared middleware plus `environment/flows/writing.js`.

The shim follows the established pattern:
- detect CLI bridge availability
- route through shared middleware
- degrade honestly
- delegate real logic to runtime helpers

Rules:
- do not duplicate export policy in markdown
- do not embed large logic in the command file
- keep the shim compatible with future flags for advisor and rebuttal packs

Acceptance:
- `/flow-writing` exists as a real command surface
- middleware owns attempt lifecycle, telemetry, and session snapshot publication

---

## WP-56 — Advisor Pack Generator

Implement the advisor-meeting pack generator on top of the writing runtime and Phase 2 evidence surfaces.

Expected inputs:
- current control-plane snapshot
- experiment status and result bundles
- open questions / blockers
- relevant claim-backed export surfaces where allowed

Expected outputs:
- `status-summary.md`
- `experiment-progress.md`
- `open-questions.md`
- `next-steps.md`
- pack-local figure links or copied figure references according to the Wave 0 pack contract

Acceptance:
- one command path can assemble the advisor pack
- the pack remains derived and does not invent claim truth

---

## WP-57 — Rebuttal Prep Pack Generator

Implement the rebuttal prep pack generator once the contract from Wave 0 is frozen.

Expected inputs:
- reviewer comments import surface
- current claim status and related experiment evidence
- experiment plan gaps for challenged claims

Expected outputs:
- `reviewer-comments.md`
- `claim-status.md`
- `experiment-plan.md`
- `response-draft.md`

Rules:
- rebuttal prep may organize evidence; it may not fabricate resolved answers
- current claim status must remain traceable to live kernel-derived surfaces and frozen export snapshots where relevant

Acceptance:
- one command path can assemble the rebuttal pack
- the pack can be regenerated without mutating prior truth surfaces

---

## WP-58 — Operator-Facing Warning Surfacing

Thread Phase 3 export and post-export warnings back into operator-facing status.

This includes:
- `exportAlerts` visibility in `/flow-status`
- writing-related next actions and blockers in flow state
- honest surfacing when a prior exported claim is now unsafe for draft reuse

Acceptance:
- the operator can see writing/export risk without reading raw JSONL files
- warnings remain observational and traceable

---

## Parallelism

- WP-55 starts first
- WP-56 and WP-57 can run in parallel once the pack contracts are frozen
- WP-58 starts after writing/export warning surfaces exist

---

## Exit Condition

Wave 3 is complete when:
- `/flow-writing` exists as a thin command shim
- advisor and rebuttal packs are assembleable from one command path each
- export and writing warnings are visible in operator-facing surfaces
