# Phase 3 Wave 5 — Operator Evidence And Closeout

**Goal:** Close Phase 3 with saved evidence, not with confidence.

---

## WP-63 — Eval Definitions

Create Phase 3 operator/eval tasks under `environment/evals/` for at least:
- export-eligibility positive path
- non-strict claim blocked until fresh schema validation exists
- frozen snapshot creation before claim-backed writing export
- advisor pack assembly
- post-export warning replay after claim drift

If the Phase 3 `/flow-results` extension lands by this point, add a task for it here.

Acceptance:
- Phase 3 tasks reflect the real roadmap gates
- no Phase 4 automation or connector tasks are mixed into the benchmark set

---

## WP-64 — Saved Operator Validation Artifacts

Produce saved repeats under:
- `.vibe-science-environment/operator-validation/benchmarks/`

Minimum proof points:
- export eligibility is enforced by the shared helper only
- zero or unverified citations block claim-backed export
- frozen snapshot ids are referenced by claim-backed writing artifacts
- advisor pack is assembleable from one command path
- post-export warnings surface when exported claims later drift

Acceptance:
- each core Phase 3 task has saved artifacts on disk
- compatibility-limited profile-safety behavior is explicit and non-fabricated

---

## WP-65 — Phase 3 Closeout Dossier

Create:
- `blueprints/definitive-spec/implementation-plan/phase3-closeout.md`

It must include:
- links to saved Phase 3 artifacts
- the final profile-safety degraded-mode decision
- the final export snapshot and alert replay decision
- evidence that advisor and rebuttal packs are assembleable
- a short list of Phase 4+ items intentionally deferred

Rules:
- the dossier summarizes measured outputs; it does not replace them
- no gate is marked complete unless the underlying artifact exists

---

## Exit Gate Mapping

This wave closes the remaining Phase 3 roadmap gates:
- export eligibility only exports claims accepted by the shared helper
- zero tracked citations block export eligibility
- export eligibility is implemented once, not duplicated
- claim-backed writing runs against frozen export snapshots
- killed or disputed claims produce visible warnings after export
- advisor pack is assembleable from one command path
- three-tier writing distinction is enforced

Reference:
- [13-delivery-roadmap.md](../13-delivery-roadmap.md)

---

## Exit Condition

Wave 5 is complete when Phase 3 can be defended with files on disk, saved operator evidence, and a closeout dossier that matches the roadmap and writing/export spec.
