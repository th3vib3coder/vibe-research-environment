# Phase 5 Wave 5 — Evals And Closeout

**Goal:** Save operator evidence, benchmark the coordinator honestly, and close
Phase 5 with artifacts rather than conversation summaries.

---

## WP-113 — Phase 5 Eval Scenarios

Add Phase 5 evaluation scenarios for the first coordinator behaviors:
- queue resume from saved state
- continuity assembly in `profile`, `query`, and `full` modes
- execution lane plus review lane on one task lineage
- recovery/escalation on bounded failure
- operator status inspection after interrupted work

Acceptance:
- each target behavior has at least one saved run artifact
- saved artifacts point to real Phase 5 code paths, not mock-only fixtures

---

## WP-114 — Operator Validation Artifacts

Save explicit operator-facing evidence that a researcher can:
- start one orchestrator task safely
- inspect queue and lane state quickly
- understand blockers or escalations
- resume interrupted work through the status surface

Acceptance:
- at least one saved operator-validation artifact demonstrates useful resume/inspection behavior within a short human workflow
- evidence is durable on disk and easy to replay

---

## WP-115 — Context And Cost Measurements

Measure and save:
- incremental token cost for `profile`, `query`, and `full`
- queue/runtime overhead for one coordinator cycle
- any provider-specific cost or rate-limit observations needed for the MVP lane path

Acceptance:
- continuity assembly cost is measured, not guessed
- the Phase 5 runtime has one honest baseline cost story
- expensive or noisy prompt assembly can be redesigned before closeout

---

## WP-116 — Phase 5 Closeout Dossier

Create:
- `implementation-plan/phase5-closeout.md`

The dossier should record:
- shipped Phase 5 surfaces
- evidence pointers
- green gate results
- any explicitly deferred Phase 6 work

Acceptance:
- Phase 5 closes with saved evidence and a written gate review
- deferred work is named honestly instead of silently dropped

---

## Parallelism

- WP-113 and WP-115 can run in parallel after Wave 3 is stable
- WP-114 starts once status/run shims are usable end-to-end
- WP-116 starts after evidence paths and validator results are green

---

## Exit Condition

Wave 5 is complete when the repo has saved evaluation artifacts, operator
evidence, measured context/cost data, and a Phase 5 closeout dossier that can
justify the coordinator MVP as a real shipped slice.
