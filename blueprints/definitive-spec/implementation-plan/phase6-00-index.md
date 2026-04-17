# Phase 6 — Kernel Bridge and Provider Reality

**Date:** 2026-04-17
**Scope:** close the four block-class gaps (G-01..G-04) from the master spec
**Status:** Draft — undergoing adversarial review
**Prerequisite:** `PHASE-6-7-MASTER-SEQUENCE-SPEC.md` read and accepted

---

## What Phase 6 Is

Phase 6 is NOT a capability release.

It closes the four honesty gaps that Phase 5.5+5.6+5.7 left on the table:
- **G-01 / F-01** — Gate 17 kernel governance prerequisites have no automated
  probe (the three compatibility tests assert hardcoded literals against
  themselves, never touch the sibling kernel).
- **G-02 / F-04** — Phase 5 Gate 3 review-lineage evidence comes from a mock
  executor that always returns `affirmed`; the FALSE-POSITIVE stands.
- **G-03** — every VRE test runs in degraded mode; no integration test actually
  spawns the kernel sibling.
- **G-04** — provider gateway has no real CLI binding; `smoke-real-subprocess`
  today is `node -e` echo.

The baseline is sound: 420/420 tests, 11/11 validators, 11 commits Phase 5.5–5.7
shipped. Phase 6 makes the **honest surface** match the **ambitious narrative**
before Phase 7 adds capability on top.

What Phase 6 does **not** do:
- expand the task registry as a general capability surface. The only allowed
  registry addition is the narrowly scoped `session-digest-review` review task
  needed to close G-02/F-04 review-lineage evidence.
- extend the CLI dispatcher beyond its current 3 commands
- ship new connectors, automations, or domain-packs
- touch three-tier writing enforcement
- write kernel-side code (VRE remains read-only against kernel)

---

## Non-Negotiable Rules

1. **Every finding (G-01..G-04) maps to at least one work package.** No gap
   closes through rewording alone.
2. **Every WP answers the six implementation questions** from
   `blueprints/ADVERSARIAL-REVIEW-PROTOCOL.md` §5.
3. **Every WP has a test that fails before the fix and passes after.** Same
   TDD discipline as Phase 5.5.
4. **Closeout honesty standard (WP-119) applies** to every corrected closeout.
5. **No cosmetic rewording.** PASS upgrades require real automated evidence;
   otherwise the gate stays PARTIAL with a new follow-up.
6. **Adversarial review before closeout.** Per protocol: draft → external
   attack → repo grounding → patch → hostile reread → commit.
7. **Kernel sibling may or may not be present.** The host running Phase 6 tests
   needs a `vibe-science/` sibling checkout; tests that require it are clearly
   declared and skip honestly when absent.

---

## Gaps Addressed

| ID | Severity | Gap | Wave |
|----|----------|-----|------|
| G-01 | Block | Gate 17 kernel governance prerequisites tautological (F-01) | Wave 1 (probe) + Wave 4 (closeout upgrade) |
| G-02 | Block | Phase 5 Gate 3 review-lineage evidence is mock (F-04) | Wave 2 (real provider) + Wave 4 (regrade) |
| G-03 | Block | Kernel bridge never exercised in tests; all tests run degraded | Wave 1 (bridge integration test) |
| G-04 | Block | Provider gateway has no real CLI binding | Wave 2 (Codex/Claude CLI executor) |
| G-15 | Quality | CI workflow state uncertain | Wave 0 (contract) + Wave 3 (verify) |

---

## Reading Order

| # | Document | What it covers | Current size note |
|---|----------|---------------|-------------|
| 00 | phase6-00-index.md (this file) | Scope, gap table, non-negotiables, reading order | ~160 lines |
| 01 | phase6-01-wave-0-contracts-and-scope.md | Kernel bridge contract, real-provider contract, CI workflow contract, closeout continuation | ~245 lines |
| 02 | phase6-02-wave-1-kernel-bridge-integration.md | core-reader-cli spawn, bridge integration test, Gate 17 real probe, degraded fallback hardening | ~465 lines; dense bridge contract, split deferred until implementation |
| 03 | phase6-03-wave-2-real-provider-binding.md | Codex CLI + Claude CLI executors, CLI detection, review-lane wiring, benchmark rerun | ~335 lines; dense provider contract, split deferred until implementation |
| 04 | phase6-04-wave-3-tests-and-validators.md | Regression suites per gap, new CI validator for kernel-bridge guard | ~255 lines |
| 05 | phase6-05-wave-4-evidence-and-closeout.md | Regenerate Phase 5 review-lineage, upgrade phase1 Gate 17, roadmap sync, phase6-closeout.md | ~270 lines |

---

## Wave Summary

| Wave | Name | Purpose | Gap IDs | WP range |
|------|------|---------|---------|----------|
| 0 | Contracts & Scope | Freeze bridge/provider/CI contracts before any runtime code | — | WP-149..WP-154 |
| 1 | Kernel Bridge Integration | Ship first real kernel-backed integration test | G-01, G-03 | WP-155..WP-159 |
| 2 | Real Provider Binding | Ship first real Codex or Claude CLI executor | G-02, G-04 | WP-160..WP-165 |
| 3 | Tests & Validators | Regression coverage, new CI validator if needed | all | WP-166..WP-170 |
| 4 | Evidence & Closeout Honesty | Regenerate review evidence, upgrade closeouts | G-01, G-02 | WP-171..WP-175 |

WP numbering continues from Phase 5.7 (last WP-148).

---

## Parallelism Across Waves

- Wave 0 runs first; Waves 1-4 do not start until contracts land.
- Waves 1 and 2 can progress in parallel after Wave 0 (bridge integration and
  provider binding are independent subsystems).
- Wave 3 depends on Wave 1 + Wave 2 skeletons being merged.
- Wave 4 runs last; it regenerates evidence against the runtime shipped in
  Waves 1-3.

---

## Exit Gate For Phase 6

Phase 6 is complete when **all** hold:

1. `npm run check` passes (420 baseline preserved; new tests added).
2. Kernel sibling integration test spawns `plugin/scripts/core-reader-cli.js`,
   asserts on real kernel projections, and skips honestly when sibling is
   absent (documented skip reason, not silent pass).
3. Phase 1 Gate 17 upgraded to PASS with the new real probe cited as evidence,
   OR remains PARTIAL with an upgraded follow-up that names the specific next
   step (not "eventually").
4. Phase 5 Gate 3 regraded:
   - **PASS** if real provider binding produced a real `externalReview` with
     complete evidence (verdict derived from actual Codex/Claude CLI output),
   - OR **PARTIAL** with explicit evidence-mode disclosure and a follow-up
     that names why a full PASS is still out of reach.
5. CI workflow verifiably runs `npm run check` on PR to `main` (either
   confirmed existing or added in Wave 0/3).
6. `validate-closeout-honesty` accepts every corrected closeout.
7. External adversarial review returns no P0 or P1 findings.

---

## What Phase 6 Unblocks

Phase 7. No capability expansion (new task kinds, broader CLI, three-tier
enforcement, connector depth) starts until Phase 6 exit gate closes.

---

## Relationship To Phase 5.5 Closeout

| Phase 5.5 residue | Phase 6 disposition |
|-------------------|----------------------|
| F-01 Gate 17 PARTIAL, `FU-55-001` | Wave 1 closes it via real probe, OR Wave 4 upgrades `FU-55-001` to a named successor |
| F-04 Phase 5 Gate 3 FALSE-POSITIVE | Wave 2 + Wave 4 regrade on real evidence |
| "validate-closeout-honesty structural, not semantic" (doc note) | Remains as-is in Phase 6; semantic upgrade deferred to Phase 7 Wave 5 |

---

## Provenance

Phase 6 scope is derived from:
1. Phase 5.5 closeout explicit PARTIAL/FALSE-POSITIVE gates
2. External adversarial review #2 on commit `2415266` (now `21606dc`
   post-rebase)
3. Post-5.7 retrospective (the 15-gap list) filtered to block-class items
4. `PHASE-6-7-MASTER-SEQUENCE-SPEC.md` sequence rationale
