# Phase 2 Wave 5 — Operator Evidence And Closeout

**Goal:** Close Phase 2 with saved evidence, not with confidence.

---

## WP-42 — Eval Definitions

Create Phase 2 operator/eval tasks under `environment/evals/` for at least:
- sync-memory refresh
- stale-mirror warning visibility
- experiment bundle creation
- experiment result findability

If a thin `/flow-results` shim lands by this point, add a task for it here.

Acceptance:
- Phase 2 tasks reflect the real roadmap gates
- no Phase 3 writing/export tasks are mixed into the benchmark set

---

## WP-43 — Saved Operator Validation Artifacts

Produce saved repeats under:
- `.vibe-science-environment/operator-validation/benchmarks/`

Minimum proof points:
- `/sync-memory` creates the mirrors and freshness state honestly
- stale mirrors are surfaced explicitly
- a past experiment bundle is found in under 1 minute
- packaging records `sourceAttemptId`

Acceptance:
- each core Phase 2 task has saved artifacts on disk
- degraded-mode behavior is explicit and non-fabricated

---

## WP-44 — Phase 2 Closeout Dossier

Create:
- `blueprints/definitive-spec/implementation-plan/phase2-closeout.md`

It must include:
- links to saved Phase 2 artifacts
- the final stale-mirror behavior decision
- the final session digest contract decision
- evidence that experiment bundles are typed and findable
- a short list of Phase 3/4 items intentionally deferred

Rules:
- the dossier summarizes measured outputs; it does not replace them
- no gate is marked complete unless the underlying artifact exists

---

## Exit Gate Mapping

This wave closes the remaining Phase 2 roadmap gates:
- memory mirror updates via explicit command with visible timestamp
- decision log mirrors control-plane decisions without becoming a second truth path
- marks guide retrieval/prioritization without changing truth semantics
- experiment bundles contain manifest + outputs + claim link
- experiment bundles record `sourceAttemptId`
- researcher finds past experiment results in <1 minute
- stale mirrors (>24h) are flagged in `/flow-status`

Reference:
- [13-delivery-roadmap.md](../13-delivery-roadmap.md)

---

## Exit Condition

Wave 5 is complete when Phase 2 can be defended with files on disk, saved
operator evidence, and a closeout dossier that matches the roadmap.
