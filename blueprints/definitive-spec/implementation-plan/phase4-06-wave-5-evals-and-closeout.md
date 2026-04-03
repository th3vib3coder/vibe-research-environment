# Phase 4 Wave 5 — Evals And Closeout

**Goal:** Save operator evidence for the new external-facing surfaces and close
Phase 4 with an honest dossier.

---

## WP-84 — Benchmark Definitions

Add Phase 4 benchmark coverage under `environment/evals/` for at least:
- connector export with visible failure reporting
- weekly digest generation
- stale-memory reminder generation
- export-warning digest generation
- domain-pack activation with `omics`
- default fallback when domain config is missing or invalid

Acceptance:
- every benchmark uses repo-owned task definitions
- every task asserts visible artifacts, not only terminal output

---

## WP-85 — Saved Repeats And Operator Validation

Save benchmark repeats under:
- `.vibe-science-environment/operator-validation/benchmarks/`

Save the Phase 4 operator-validation artifact under:
- `.vibe-science-environment/operator-validation/artifacts/`

Acceptance:
- saved artifacts demonstrate connector honesty under failure
- saved artifacts demonstrate automation visibility and reviewability
- saved artifacts demonstrate domain-pack activation and clean fallback

---

## WP-86 — Phase 4 Closeout Dossier

Write:
- `blueprints/definitive-spec/implementation-plan/phase4-closeout.md`

The closeout must include:
- verdict
- evidence map
- exit gate outcome
- final decisions
- deferred-by-design section
- honest statement of what Phase 4 still does not claim

Acceptance:
- no Phase 4 completion claim exists without files on disk
- the closeout references saved repeats and saved artifacts directly

---

## Parallelism

- WP-84 and WP-85 can overlap once the runtime and tests are stable
- WP-86 starts after saved artifacts exist

---

## Exit Condition

Wave 5 is complete when Phase 4 has benchmark definitions, saved repeats,
saved operator evidence, and a closeout dossier that matches the actual system.
