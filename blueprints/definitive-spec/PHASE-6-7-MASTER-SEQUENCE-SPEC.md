# Phase 6 + Phase 7 — Master Sequence Specification

**Date:** 2026-04-17
**Status:** Draft — awaiting adversarial review
**Baseline:** Phase 5.5 + 5.6 + 5.7 closed at `origin/main @ 3563a48`

---

## What This Document Is

This is **the sequence spec** for every remaining gap identified by the post-5.7
retrospective. It defines:
- what still needs fixing
- in what order
- why that order
- what gates each phase to the next

It does **not** contain work packages or wave-by-wave detail. Those live in the
implementation plans (`phase6-00-index.md` and `phase7-00-index.md` with their
wave docs).

This doc is the authoritative "why now, why in this order" reference that every
wave in Phase 6 and Phase 7 must respect.

---

## Baseline (already shipped on origin/main)

- 11 commits Phase 5.5/5.6/5.7 closed honestly, pushed to `origin/main`
- `npm run check`: 420/420 tests, 11/11 validators
- 13 findings F-01..F-13: 11 RESOLVED, 2 open with honest disclosure
  - **F-01** PARTIAL (Gate 17 has no automated kernel probe; follow-up `FU-55-001`)
  - **F-04** FALSE-POSITIVE (Phase 5 Gate 3 review-lineage evidence from mock executor; blocks Phase 6 exit gate)
- `validate-closeout-honesty` is a structural guardrail, not semantic proof (documented limit, not blocker)

---

## The Residual Gap — What We Still Owe

Retrospective on the 15 items surfaced post-5.7. Grouped by nature:

### Block-class (explicit in closeouts)

| ID | Gap | Current state |
|----|-----|--------------|
| G-01 | F-01 Gate 17 kernel governance prerequisites NOT automated | PARTIAL, hand-verified only, `FU-55-001` pending |
| G-02 | F-04 Phase 5 review-lineage evidence is mock | FALSE-POSITIVE, blocks Phase 6 exit |
| G-03 | Every VRE test runs in degraded mode; kernel sibling never exercised in tests | Design gap surfaced during Wave 5 forensic — degraded-mode coverage is strong, kernel-backed coverage is zero |
| G-04 | Provider gateway has no concrete binding: smoke-real is `node -e` echo, no actual Codex/Claude CLI invocation | Documented limit; functional but narrative overclaims "works with Codex/Claude" |

### Capability-class (narrow surface)

| ID | Gap | Current state |
|----|-----|--------------|
| G-05 | Task registry has 3 kinds, all execution-lane; `listReviewTaskKinds() === []` | Wave 2 rejected 3 additional kinds pending F-02/F-06 closure (both now closed) |
| G-06 | CLI dispatcher (`bin/vre`) promotes only 3 of 12 commands | Per Phase 5.5 Wave 3 scope cap |
| G-07 | Three-tier writing distinction is markdown headers only, no schema boundary | F-13 PARTIAL, `FU-55-003` pending |
| G-08 | Obsidian connector copies 2 markdown files, no API/URI/vault-metadata integration | Rebranded honestly in closeout; if real integration wanted, scope is non-trivial |
| G-09 | Zotero connector absent; ingress touches kernel truth, deferred pre-Phase-6 | Explicitly deferred |
| G-10 | Automation "weekly" = idempotency isoweek key, no real scheduler | Host-native integration pending; decision between Task Scheduler / cron / GitHub Actions |
| G-11 | Domain-pack `omics` is 1 JSON preset; `forbiddenMutations` and `doesNotModify` declared but unenforced | Admitted in Phase 4 closeout |

### Quality-class (UX, tooling, rot)

| ID | Gap | Current state |
|----|-----|--------------|
| G-12 | `bin/vre` has no `--help`, `--dry-run`, `--json` | Phase 5.5 minimal scope explicitly deferred these |
| G-13 | `validate-closeout-honesty` is structural, not semantic | Documented limit; could upgrade to cite-check |
| G-14 | `surface-orchestrator/` spec (12 docs) pre-dates Phase 5 MVP and shares "orchestrator" name | Cognitive collision; rename or archive |
| G-15 | CI workflow audit — `.github/workflows/` state uncertain (never exercised in audit) | If `npm run check` doesn't run on PR, regressions can slip through |

---

## Sequence Rationale

**Why Phase 6 before Phase 7?**

Phase 6 closes **honest foundation gaps**. Phase 7 expands **capability** on top
of that foundation. Building capability on a degraded-mode-only substrate would
repeat the Phase 5 trap: shipping something that works in tests but not against
reality.

Concretely:
- G-03 (kernel bridge untested) + G-04 (no real provider) are the two "every
  test is mocked" gaps. Without them, any new task kind or CLI surface shipped
  in Phase 7 would carry the same "works in CI, mocked in practice" liability
  that required Phase 5.5 in the first place.
- G-01 (Gate 17) and G-02 (F-04) are the same class as G-03/G-04 — they are
  what closeout honesty dictates must be chased. Closing them moves the honest
  baseline forward so Phase 7 can build on real evidence.

**Why split into two phases rather than one big one?**

Phase 6 is small and targeted (~27 WPs). Phase 7 is broader (~45 WPs).
Shipping Phase 6 as a standalone milestone delivers a cleaner incremental value:
"VRE now actually exercises the kernel and has at least one real provider
binding." Phase 7 then ships as "VRE surface is broader" on top of that.

Single-phase bundling would create a 70+ WP package where a failed capability
wave in Phase 7 could delay the honest-baseline landing from Phase 6. That is
anti-incremental.

---

## Phase 6 — Kernel Bridge and Provider Reality

**Objective:** Close G-01, G-02, G-03, G-04. Ship the first real kernel-backed
integration test AND the first real provider binding (Codex or Claude CLI).
Upgrade Phase 1 Gate 17 from PARTIAL to PASS. Upgrade Phase 5 Gate 3 from
FALSE-POSITIVE to PASS or honestly-disclosed PARTIAL.

**Five waves** (WP-149..WP-175, 27 WPs):
- Wave 0: Contracts & scope freeze (WP-149..WP-154)
- Wave 1: Kernel bridge integration (WP-155..WP-159)
- Wave 2: Real provider binding (WP-160..WP-165)
- Wave 3: Tests & validators (WP-166..WP-170)
- Wave 4: Evidence regeneration & closeout honesty (WP-171..WP-175)

**Exit gate:** `npm run check` passes; Gate 17 (F-01) upgraded with real
probe; Phase 5 Gate 3 (F-04) regraded on real evidence; `validate-closeout-honesty`
accepts corrected closeouts; external adversarial review returns no P0/P1.

**Blocks:** Phase 7 does not open until Phase 6 exit gate closes.

---

## Phase 7 — Capability Expansion

**Objective:** Close G-05 through G-15. Expand task registry, CLI dispatcher,
three-tier writing enforcement, connector depth, automation scheduling reality,
domain-pack rule engine, and QoL surfaces. Retire `surface-orchestrator/`
legacy docs. Audit + fix CI workflow.

**Six waves** (WP-176..WP-220, ~45 WPs):
- Wave 0: Contracts & scope freeze (WP-176..WP-182)
- Wave 1: Execution surface expansion (WP-183..WP-188)
- Wave 2: Agent surface & UX (WP-189..WP-195)
- Wave 3: Three-tier writing enforcement (WP-196..WP-200)
- Wave 4: Connectors, automation, domain-packs (WP-201..WP-210)
- Wave 5: Tests, evidence, closeout honesty, cleanups (WP-211..WP-220)

**Exit gate:** `npm run check` passes; F-13 (three-tier) upgraded to PASS;
`listReviewTaskKinds()` non-empty; CLI dispatcher covers all 12 commands OR
a declared subset with honest documentation; Obsidian/Zotero/Scheduling state
honestly declared (ship OR formal deferral); CI workflow verifiably runs on PR;
external adversarial review returns no P0/P1.

---

## Global Invariants (Both Phases)

1. **Spec-driven.** No WP starts before its contract is frozen in Wave 0.
2. **Every WP has a test that fails before the fix and passes after.**
3. **Closeout honesty standard (WP-119)** applies to every closeout edit.
4. **No kernel truth writes.** VRE continues to be read-only against kernel.
5. **No push without explicit user instruction.** Policy continues.
6. **Adversarial review before push.** Per `ADVERSARIAL-REVIEW-PROTOCOL.md`.
7. **Agent-orchestrated implementation.** Specs written with parallel agent
   teams; implementation uses subagent dispatch where work is independent.
8. **Atomic WPs.** No WP bundles unrelated concerns; each work package is the
   smallest defensible change unit.

---

## Non-Negotiable Constraints

If any WP proposes:
- changing claim truth semantics
- changing citation truth semantics
- changing gate meaning
- changing integrity meaning
- changing stop semantics
- expanding kernel-side code

...it is **out of scope** and returns to kernel core review. Phase 6 and Phase 7
continue to build AROUND the kernel, never INTO it.

---

## Orchestration Pattern

This spec set is itself being produced via agent orchestration (matching the
Phase 5.5 pattern):
- Master spec (this doc) and phase indexes + Wave 0 contracts are written by
  the main author (contract authority lives with the orchestrator).
- Wave 1..N implementation waves are dispatched to parallel agents where waves
  are independent after Wave 0 contracts land.
- Evidence + closeout waves (final wave per phase) return to main author for
  consolidation against final runtime state.

This orchestration is intentional: the same pattern the phases describe
(parallel execution of independent work) is used to produce the specs that
describe them.

---

## Findings-to-Phase Mapping

| Gap | Phase | Wave |
|-----|-------|------|
| G-01 Gate 17 | 6 | 1 (probe) + 4 (closeout upgrade) |
| G-02 F-04 review-lineage | 6 | 2 (real provider) + 4 (regrade) |
| G-03 kernel bridge untested | 6 | 1 (bridge integration) |
| G-04 no real provider | 6 | 2 (CLI binding) |
| G-05 task registry narrow | 7 | 1 |
| G-06 CLI dispatcher narrow | 7 | 2 |
| G-07 three-tier writing | 7 | 3 |
| G-08 Obsidian depth | 7 | 4 |
| G-09 Zotero absent | 7 | 4 (formal deferral OR ingress spec) |
| G-10 scheduling real | 7 | 4 |
| G-11 domain-pack rules | 7 | 4 |
| G-12 CLI UX | 7 | 2 |
| G-13 validator semantic | 7 | 5 |
| G-14 surface-orchestrator cleanup | 7 | 5 |
| G-15 CI workflow audit | 6 | 0 (contract) + 3 (test) |

---

## What Happens After Phase 7

Three candidate directions for Phase 8+, NOT scoped here:

1. **Performance & cost regression** — CI-continuous context-cost measurement,
   perf baselines, budget-tracking across runs.
2. **Scientific workflow E2E** — a full demo from literature → experiment →
   results → writing with real data and a real kernel.
3. **Multi-lane coordination** — reporting, monitoring, supervise, recover
   lanes (declared out-of-scope in Phase 5 closeout).

These remain Phase 8+ candidates. No commitment here.

---

## Document Set

This master spec is paired with two implementation-plan doc sets:

**Phase 6 implementation plan:**
- [phase6-00-index.md](./implementation-plan/phase6-00-index.md)
- phase6-01-wave-0-contracts-and-scope.md
- phase6-02-wave-1-kernel-bridge-integration.md
- phase6-03-wave-2-real-provider-binding.md
- phase6-04-wave-3-tests-and-validators.md
- phase6-05-wave-4-evidence-and-closeout.md

**Phase 7 implementation plan:**
- [phase7-00-index.md](./implementation-plan/phase7-00-index.md)
- phase7-01-wave-0-contracts-and-scope.md
- phase7-02-wave-1-execution-surface-expansion.md
- phase7-03-wave-2-agent-surface-and-ux.md
- phase7-04-wave-3-three-tier-writing.md
- phase7-05-wave-4-connectors-automation-domain-packs.md
- phase7-06-wave-5-tests-evidence-closeout.md
