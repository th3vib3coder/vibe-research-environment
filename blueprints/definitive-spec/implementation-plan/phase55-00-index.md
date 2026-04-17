# Phase 5.5 — Audit Hardening

**Date:** 2026-04-17
**Scope:** surgical hardening pass that closes the gap between Phase 1-5 closeouts and the code that backs them
**Status:** Draft — undergoing adversarial review

---

## What Phase 5.5 Is

Phase 5.5 is NOT a new feature phase.

It is an audit-hardening pass that closes four P0 closeout overclaims, six
P1 runtime / agent-discipline gaps, and three P2 structural issues surfaced
during the forensic audit of 2026-04-17.

The baseline is sound: 331 tests pass, 9 CI validators pass, the middleware
7-step chain is real, schema-before-write is honored, degraded mode emits
events, and the orchestrator queue is event-sourced with durable replay.

What Phase 5.5 fixes:
- closeouts that dichiarano PASS su evidenza parziale, tautologica, o mockata
- runtime invariants written as aspirational in docs but not enforced in code
- one Wave 0 boundary violation (Phase 3 import living inside Phase 2)
- agent discipline that relies on markdown prose instead of enforced dispatch

What Phase 5.5 explicitly does **not** do:
- add Phase 6 features (reporting lane, monitoring lane, supervise lane)
- redesign any schema already shipped (only extends fields)
- touch kernel truth semantics
- rewrite working code; every change is additive or surgical

---

## Non-Negotiable Rules

1. **Every finding maps to a work package.** No finding is closed through
   rewording alone; either fix the code or downgrade the gate to PARTIAL.
2. **Every work package answers the six implementation questions** from
   `blueprints/ADVERSARIAL-REVIEW-PROTOCOL.md` §5 (enters how, state where, who
   reads, who writes, tested how, degrades how).
3. **Every WP has a test that fails before the fix and passes after.** No
   silent fixes.
4. **Closeout honesty standard applies to every corrected phase closeout.**
   PASS means automated verification exists; PARTIAL means a disclosed gap
   remains; FALSE-POSITIVE means the prior PASS is retracted.
5. **No closeout corrections are cosmetic.** Each correction cites the exact
   prior phrasing, the evidence gap, and the revised phrasing.
6. **Adversarial review before closeout.** Per protocol: draft → Codex attack
   → repo grounding → patch → hostile reread → only then commit.

---

## Findings Addressed

Each finding is addressed by at least one work package. Findings with P0
severity block Phase 6 entry.

| ID | Severity | Finding | Wave |
|----|----------|---------|------|
| F-01 | P0 | Phase 1 Gate 17 "kernel governance prerequisites verified" is an evidence-claim bug: the sibling kernel exists, but the closeout sells a document/static-literal compatibility check as automated kernel verification. | Wave 5 |
| F-02 | P0 | Phase 3 "frozen export snapshots" are not frozen; `lib/export-snapshot.js` silently overwrites on rerun; `writing.js` deletes and recreates seeds for the same snapshotId. | Wave 1 |
| F-03 | P0 | Phase 3 `phase3-operator-validation.json` metrics are pass-stamps: `resumeLatencySeconds` and `degradedHonestyScore` are `null` for all 7 benchmarks; only binary flags populated. | Wave 5 |
| F-04 | P0 | Phase 5 "execution-backed review lineage" gate passes on a mock executor in `save-phase5-artifacts.js` that always returns `{verdict:'affirmed'}`. No real Codex/Claude binding anywhere in saved evidence. | Wave 2 or Wave 5 |
| F-05 | P1 | Budget advisory tier (80%) is schema-only; no code in `environment/control/` or `environment/lib/` computes the threshold; `budgetState` is self-reported by callers. | Wave 1 |
| F-06 | P1 | Phase 2 `flows/results.js:4` imports `lib/export-eligibility.js`; Wave 0 WP-25 explicitly forbids this Phase 3 dependency. | Wave 1 |
| F-07 | P1 | `signals.*` fields in session snapshot can read as clean (0 unresolved claims) when the kernel bridge is absent; only mitigated by a separate event record. | Wave 1 |
| F-08 | P1 | Execution lane supports exactly 1 task kind (`session-digest-export`); router regex-matches only that task's keywords. Closeout language soft-sells this scope. | Wave 2 |
| F-09 | P1 | Provider gateway is pure DI; no HTTP client, no `spawn`, no subprocess anywhere in runtime. Only eval-saved executor is a mock. | Wave 2 |
| F-10 | P1 | Commands/*.md are prose contracts; no dispatcher; nothing prevents an agent from calling `registerExperiment(...)` directly and bypassing middleware. | Wave 3 |
| F-11 | P2 | `phase4-closeout.md` does not acknowledge Zotero connector as deferred; the spec `10-connectors.md` still lists it. | Wave 5 |
| F-12 | P2 | Obsidian connector is a two-file markdown copier; branding oversells the implementation. | Wave 5 |
| F-13 | P2 | Three-tier writing distinction is enforced only as markdown section headers; no schema, no data boundary, no validator. | Wave 5 |

---

## Reading Order

Read in numerical order. Each document is atomic and self-contained.

| # | Document | What it covers | Size target |
|---|----------|---------------|-------------|
| 00 | [phase55-00-index.md](./phase55-00-index.md) (this file) | Scope, findings table, non-negotiables | ~200 lines |
| 01 | [phase55-01-wave-0-contracts-and-honesty-rules.md](./phase55-01-wave-0-contracts-and-honesty-rules.md) | Contract freezes, schema diffs, closeout honesty standard | ~250 lines |
| 02 | [phase55-02-wave-1-runtime-integrity.md](./phase55-02-wave-1-runtime-integrity.md) | Snapshot immutability, signals.sourceMode, budget advisory, boundary fix | ~250 lines |
| 03 | [phase55-03-wave-2-execution-surface-hardening.md](./phase55-03-wave-2-execution-surface-hardening.md) | Task registry, additional task kinds, provider binding or gate downgrade | ~280 lines |
| 04 | [phase55-04-wave-3-agent-discipline-and-dispatcher.md](./phase55-04-wave-3-agent-discipline-and-dispatcher.md) | Minimal CLI dispatcher, command-to-JS drift validator | ~220 lines |
| 05 | [phase55-05-wave-4-tests-and-validators.md](./phase55-05-wave-4-tests-and-validators.md) | Regression tests per finding, new CI validators | ~200 lines |
| 06 | [phase55-06-wave-5-evidence-regeneration-and-closeout-honesty.md](./phase55-06-wave-5-evidence-regeneration-and-closeout-honesty.md) | Metric regeneration, closeout correction pass for Phase 1/3/4/5 | ~280 lines |

---

## Wave Summary

| Wave | Name | Purpose | Finding IDs | WP range |
|------|------|---------|-------------|----------|
| 0 | Contracts & Honesty Rules | Freeze schema diffs, closeout honesty standard, scope rules | (establishes bar for all) | WP-113..WP-119 |
| 1 | Runtime Integrity | Make aspirational invariants actually enforced | F-02, F-05, F-06, F-07 | WP-120..WP-125 |
| 2 | Execution Surface Hardening | Widen execution lane and force provider gateway to do real work or stand down | F-04, F-08, F-09 | WP-126..WP-131 |
| 3 | Agent Discipline & Dispatcher | Prevent middleware bypass by giving the agent a single entry point | F-10 | WP-132..WP-135 |
| 4 | Tests & Validators | Regression coverage for every finding, new CI validators | (all) | WP-136..WP-140 |
| 5 | Evidence Regeneration & Closeout Honesty | Real metrics, corrected closeouts for Phase 1, 3, 4, 5, Gate 17 decision | F-01, F-03, F-11, F-12, F-13 | WP-141..WP-148 |

WP numbering continues from Phase 5 (last WP-112).

---

## Parallelism Across Waves

- Wave 0 runs first; nothing in Phase 5.5 starts until contracts freeze.
- Waves 1, 2, 3 can progress in parallel after Wave 0.
- Wave 4 depends on Waves 1-3 having shipped at least the skeleton code.
- Wave 5 runs last; it corrects closeouts against evidence produced in Waves
  1-4 and the current state of the codebase.

---

## Relationship To Existing Closeouts

| Closeout | Status after Phase 5.5 | Correction required in Wave 5 |
|----------|------------------------|-------------------------------|
| `phase1-closeout.md` | Gate 17 to be downgraded or upgraded with real test | WP-142 |
| `phase2-closeout.md` | Minor note: Wave 0 boundary fix disclosed after WP-124 | WP-145 |
| `phase3-closeout.md` | Snapshot immutability disclosure, metric regeneration, three-tier honesty | WP-143 |
| `phase4-closeout.md` | Zotero deferral, Obsidian branding, scheduling reality | WP-144 |
| `phase5-closeout.md` | Task kind narrowness, review mock disclosure | WP-146 |
| `13-delivery-roadmap.md` | Phase 5.5 section added, per-phase note on corrections | WP-147 |
| `IMPLEMENTATION-PLAN.md` | Phase 5.5 appears with saved closeout | WP-147 |

---

## Exit Gate For Phase 5.5

Phase 5.5 is complete when **all** of the following hold:

1. `npm run check` passes (baseline preserved).
2. Every P0 finding (F-01, F-02, F-03, F-04) has either an automated test that
   encodes the invariant OR an explicit PARTIAL/DEFERRED disclosure in the
   corrected closeout with a link to a follow-up ticket.
3. Every P1 finding (F-05..F-10) has either a fix, a test, and a regression
   guard, OR the same disclosure downgrade.
4. Every P2 finding (F-11, F-12, F-13) has a resolved closeout wording.
5. Each corrected closeout follows the closeout honesty standard (WP-119).
6. `IMPLEMENTATION-PLAN.md` and `13-delivery-roadmap.md` reference Phase 5.5.
7. Codex adversarial review on the closed set returns no further P0/P1.

---

## What Phase 5.5 Unblocks

Phase 6 entry. No new lane (reporting, monitoring, supervise, recover), no new
surface (dashboard, inbox, channel), no new agent (judge R3, scanner) is
considered before the Phase 5.5 exit gate closes.

This is a deliberate constraint: Phase 6 ambition cannot cure Phase 5 honesty
gaps. The audit must land first.

---

## Non-Negotiable Constraint

If any work package proposes:
- changing claim truth semantics
- changing citation truth semantics
- changing gate meaning
- changing integrity meaning
- changing stop semantics

...it is **out of scope** and returns to kernel core review. Phase 5.5 builds
AROUND the existing contracts; it only tightens enforcement.

---

## Provenance

Phase 5.5 is built from:
1. Forensic wave-by-wave audit of Phase 1-5 conducted 2026-04-17 (Claude Opus 4.7).
2. Cross-verification by Codex GPT 5.4 on the same date.
3. The existing ADVERSARIAL-REVIEW-PROTOCOL.md (2026-03-28).
4. Verified against the current repo state at `main @ f06fe47`.
