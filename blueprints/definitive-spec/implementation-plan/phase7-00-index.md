# Phase 7 — Capability Expansion

**Date:** 2026-04-17 (opened 2026-04-18)
**Scope:** close the capability-class + quality-class gaps (G-05..G-15)
**Status:** OPEN — Phase 6.2 cleared 2026-04-18 (Gate 17 + Gate 3 both PASS on real evidence). Wave 0 spec-freeze closed inside this doc set. Wave 1 implementation in progress.
**Prerequisite:** `PHASE-6-7-MASTER-SEQUENCE-SPEC.md` + Phase 6 closeout + Phase 6.2 closeout

---

## What Phase 7 Is

Phase 7 expands VRE's capability surface on top of the honest foundation
Phase 6 delivers (kernel bridge + real provider binding).

It closes eleven gaps:
- **G-05** task registry has 3 kinds all execution-lane; no review-lane kind
  registered (Phase 6 ships `session-digest-review`, but Phase 7 widens the
  registry further)
- **G-06** CLI dispatcher promotes only 3 of 12 commands
- **G-07** three-tier writing distinction is markdown headers only (F-13
  PARTIAL, `FU-55-003` pending)
- **G-08** Obsidian connector copies 2 markdown files; branded-integration gap
- **G-09** Zotero connector absent; ingress touches kernel truth, deferred
- **G-10** automation "weekly" = isoweek idempotency key, no real scheduler
- **G-11** omics domain-pack is 1 JSON preset with `forbiddenMutations`
  declared but unenforced
- **G-12** `bin/vre` has no `--help`, `--dry-run`, `--json`
- **G-13** `validate-closeout-honesty` is structural, not semantic
- **G-14** `surface-orchestrator/` spec (12 docs) collides with Phase 5
  MVP name
- **G-15** *(closed in Phase 6 Wave 0 + Wave 3)* — listed here only to
  confirm Phase 7 inherits a verified CI workflow

What Phase 7 does **not** do:
- write kernel-side code (VRE stays read-only against kernel)
- add new phases of lanes (reporting/monitoring/supervise/recover still
  out of scope per Phase 5 closeout)
- build a dashboard / UI
- change claim or citation truth semantics

---

## Non-Negotiable Rules

1. **Every gap (G-05..G-15) maps to at least one work package.**
2. **Every WP answers the six implementation questions** from
   `blueprints/ADVERSARIAL-REVIEW-PROTOCOL.md` §5.
3. **Every WP has a test that fails before and passes after.**
4. **Closeout honesty standard (WP-119) applies** to every correction.
5. **No cosmetic rewording.** G-08 Obsidian honest-rename is legitimate;
   pretending a 2-file copier became an API integration is not.
6. **Adversarial review before closeout.** Per protocol.
7. **Phase 7 does not reopen Phase 6 findings.** If Gate 17 or Gate 3
   regressed, that is a Phase 6.x amendment, not Phase 7 scope.
8. **Zotero ingress is specced, not necessarily shipped.** The decision
   between "ship Zotero ingress adapter" and "formal deferral" is declared
   in Wave 4.

---

## Gaps Addressed

| ID | Severity | Gap | Wave |
|----|----------|-----|------|
| G-05 | Capability | Task registry narrow | 1 (execution expansion) |
| G-06 | Capability | CLI dispatcher narrow | 2 (agent surface) |
| G-07 | Capability | Three-tier markdown-only | 3 (structured enforcement) |
| G-08 | Capability | Obsidian connector = markdown copier | 4 (real integration OR honest rename) |
| G-09 | Capability | Zotero absent | 4 (ingress spec ± implementation) |
| G-10 | Capability | Scheduling = isoweek dedupe | 4 (host-native integration) |
| G-11 | Capability | Domain-pack rules unenforced | 4 (rule engine) |
| G-12 | Quality | CLI lacks --help/--dry-run/--json | 2 |
| G-13 | Quality | honesty validator structural | 5 |
| G-14 | Quality | surface-orchestrator legacy | 5 |

---

## Reading Order

| # | Document | What it covers | Current size note |
|---|----------|---------------|-------------|
| 00 | phase7-00-index.md (this file) | Scope, gap table, non-negotiables | ~180 lines |
| 01 | phase7-01-wave-0-contracts-and-scope.md | Task-registry expansion, dispatcher v2, three-tier schema, connector/automation/domain contracts, closeout honesty continuation | ~275 lines |
| 02 | phase7-02-wave-1-execution-surface-expansion.md | New task kinds (experiment-flow-register, writing-export-finalize, results-bundle-discover, review-lane kinds) | ~510 lines; dense task-kind contract, split deferred until implementation |
| 03 | phase7-03-wave-2-agent-surface-and-ux.md | bin/vre expansion to all 12 commands, --help/--dry-run/--json | ~425 lines; dense CLI contract, split deferred until implementation |
| 04 | phase7-04-wave-3-three-tier-writing.md | Block-level tier metadata, schema enforcement, claim-ref validation | ~365 lines; dense schema contract, split deferred until implementation |
| 05 | phase7-05-wave-4-connectors-automation-domain-packs.md | Obsidian depth or rename, Zotero ingress decision, scheduling host-native, domain-pack rule engine | ~445 lines; dense connector/domain contract, split deferred until implementation |
| 06 | phase7-06-wave-5-tests-evidence-closeout.md | Regression suites, evidence regen where applicable, closeout honesty semantic upgrade, surface-orchestrator cleanup, Phase 7 closeout | ~340 lines; dense closeout contract, split deferred until implementation |

---

## Wave Summary

| Wave | Name | Purpose | Gap IDs | WP range |
|------|------|---------|---------|----------|
| 0 | Contracts & Scope | Freeze expansion contracts | — | WP-176..WP-182 |
| 1 | Execution Surface Expansion | Widen task registry beyond Phase 6 minimum | G-05 | WP-183..WP-188 |
| 2 | Agent Surface & UX | Expand CLI dispatcher to all commands + UX flags | G-06, G-12 | WP-189..WP-195 |
| 3 | Three-Tier Writing Enforcement | Structural data boundary for claim-backed/artifact-backed/free | G-07 | WP-196..WP-200 |
| 4 | Connectors + Automation + Domain-Packs | Depth for Obsidian/Zotero/scheduling + domain-pack rule engine | G-08, G-09, G-10, G-11 | WP-201..WP-210 |
| 5 | Tests, Evidence, Closeout, Cleanup | Regression, honesty validator upgrade, surface-orchestrator cleanup, Phase 7 closeout | G-13, G-14, all | WP-211..WP-220 |

WP numbering continues from Phase 6 (last WP-175).

---

## Parallelism Across Waves

- Wave 0 runs first.
- Waves 1, 2, 3, 4 can progress in parallel after Wave 0. They touch
  different subsystems:
  - Wave 1: `environment/orchestrator/task-registry/` + `flows/`
  - Wave 2: `bin/vre` + `commands/*.md` frontmatter
  - Wave 3: `environment/flows/writing*.js` + `environment/schemas/writing-*`
  - Wave 4: `environment/connectors/`, `environment/automation/`,
    `environment/domain-packs/`
- Wave 5 runs last: it depends on Waves 1-4 having shipped skeleton code.

---

## Exit Gate For Phase 7

Phase 7 is complete when **all** hold:

1. `npm run check` passes (baseline preserved; new tests added).
2. `listReviewTaskKinds()` returns ≥1 kind beyond
   `session-digest-review` (Phase 6 minimum exceeded); at least one new
   execution kind shipped (experiment-flow-register OR equivalent).
3. CLI dispatcher (`bin/vre`) covers all 12 commands in `commands/` OR a
   declared explicit subset with honest documentation of what is still
   agent-only.
4. `--help`, `--dry-run`, `--json` flags implemented and tested.
5. Phase 3 Gate on three-tier writing (F-13) upgrades from PARTIAL to PASS,
   OR an explicit downgrade path with named follow-up.
6. Obsidian connector: **either** deep integration (YAML frontmatter,
   wikilinks, vault-metadata) with tests, **or** honest rename to
   `folder-export` / `vault-target-export` with closeout correction.
7. Zotero ingress: ships OR a formal deferral entry exists with the
   ingress contract frozen (kernel-side changes documented, Phase 8+
   candidate).
8. Scheduling: at least one host-native binding implemented
   (GitHub Actions scheduled workflow, OR cron wrapper, OR Windows Task
   Scheduler) OR explicit deferral with a follow-up ticket.
9. Omics domain-pack: `forbiddenMutations` and `doesNotModify` enforced at
   runtime (rule engine invokes on relevant operations) OR explicit
   disclosure that the rule engine is generic-only and omics remains
   preset-only.
10. `validate-closeout-honesty` has a semantic cite-check upgrade (each
    PASS row's evidence file content contains at least one keyword from
    the gate description) OR documented reason why it was not upgraded.
11. `surface-orchestrator/` spec set: renamed (e.g.
    `surface-coordinator/`) OR archived with a preserved pointer; no more
    name collision with the Phase 5 `environment/orchestrator/`.
12. Phase 6 gate outcomes (G-01, G-02) are NOT regressed.
13. External adversarial review returns no P0/P1 on Phase 7 closeout.

---

## Dependency On Phase 6

Phase 7 runs ONLY after Phase 6 exit gate closes. Specifically:
- If Phase 6 Gate 17 upgrade lands (Outcome A), Phase 7 proceeds normally.
- If Phase 6 Gate 17 remains PARTIAL (Outcome B), Phase 7 proceeds BUT the
  Phase 7 exit gate explicitly inherits the Phase 6 PARTIAL (no PASS can
  claim to have fixed what Phase 6 left open).
- If Phase 6 Gate 3 remains FALSE-POSITIVE (Outcome B), Phase 7 does NOT
  open. Fix Phase 6 first.

---

## Provenance

Phase 7 scope is derived from:
1. Post-5.7 retrospective (the 15-gap list) filtered to capability-class
   and quality-class items (G-05..G-15)
2. `PHASE-6-7-MASTER-SEQUENCE-SPEC.md`
3. Phase 6 closeout outcome (which gates actually closed)
4. External adversarial review #2 on commit `21606dc` (confirmed P2 P2-A,
   P2-B, P2-C — all closed in Phase 5.7)
