# Phase 6.2 Closeout — Honesty Correction & Hook Runtime Verification

**Date:** 2026-04-18
**Repo:** `vibe-research-environment` + `vibe-science` (cross-repo)
**Status:** CLOSED — Phase 6.2-A corrected the ledger; Phase 6.2-B
shipped the cross-repo code fixes; Phase 6.2-C regenerated real evidence
and re-upgraded the affected gates.

---

## Verdict

**Phase 6.2 is CLOSED.** Phase 6.1 was declared CLOSED but a fresh-eyes
adversarial review on the pushed state surfaced three P1 findings that
invalidated the narrative "Gate 17 full PASS". Phase 6.2 corrected
the ledger honestly, implemented the missing hook-runtime verification,
and regenerated the affected evidence before re-upgrading Gate 17.

Root cause of the overclaim: Phase 6.1 shipped a real kernel
`core-reader-cli.js` and the VRE probe now validates against real kernel
data, BUT the `listGateChecks` projection returns a hardcoded synthetic
array claiming every non-negotiable hook is `status: 'ok'`. That's a
fixture, not a probe. The probe test passes because it asks for the
hooks and receives a static "everything fine" payload. This is the Phase
5.5 silent-zero pathology reintroduced one layer up.

Phase 7 is now **unblocked**.

---

## Adversarial Review Findings (Source)

Fresh-eyes reviewer verdict: *"Non vedo P0 immediati, ma non considererei
Phase 6.1 'blindata': ci sono 3 P1 reali. Il più importante è Gate 17:
abbiamo spostato la verifica dal VRE al kernel, ma una parte critica è
ancora sintetica. Quindi: codice molto più avanti di prima, ma la
narrativa 'Gate 17 PASS pieno' è ancora troppo forte."*

---

## Sub-Phase Outcome

### Phase 6.2-A — Honesty Correction (documentary, committed separately)

Scope: ledger-only patch, no code.

- `phase1-closeout.md`: Gate 17 PASS → PARTIAL (FU-6-004)
- `phase5-closeout.md`: Gate 3 stays PASS but records loose-contract
  limit as FU-6-006
- `phase6_1-closeout.md`: verdict CLOSED → CONDITIONALLY CLOSED; Gate 4
  (Gate 17 upgrade) retracted; remove "Phase 7 unblocked" and "No
  Phase 6.2 required" overclaims
- `IMPLEMENTATION-PLAN.md`: reflect Phase 7 blocked + add Phase 6.2 link

Status: **CLOSED** in commit `5a43369`.

### Phase 6.2-B — Code Fixes (cross-repo, atomic)

Scope: close the four review findings with real code.

- **FU-6-004 (Gate 17 blocker)**: `vibe-science/plugin/lib/core-reader.js`
  `listGateChecks` must verify real hook installation, not synthesise.
  - Read `hooks/hooks.json` and `.claude/settings.json`
  - Check each non-negotiable hook script exists on disk and is
    executable
  - Optionally reuse `vibe-science/tests/governance-hooks.test.mjs`
    as probe evidence (runtime ping)
  - Drop the hardcoded `synthetic: true` array
- **FU-6-005 (Gate 17 blocker)**: `vibe-science/plugin/lib/core-reader.js`
  `withDb` currently catches all SQL errors and returns `{ok: true}`
  fallback. Add `dbAvailable` and `sourceMode` fields to every
  projection envelope. Bridge on VRE side must degrade explicitly when
  a projection falls back, not conflate "verified zero" with "DB
  missing".
- **FU-6-006 (Gate 3 hardening)**: `environment/orchestrator/executors/codex-cli.js`
  - Spawn must set `cwd: projectPath`
  - Review payload must include `projectPath` field
  - Regression test: invoke real adapter from a nested directory;
    asserts without the fix it fails to produce valid envelope
- **FU-6-007 (P2, evidence hardening)**: `environment/tests/evals/saved-artifacts.test.js`
  - Require `evidenceMode === 'real-cli-binding-codex'` specifically
    (not the generic `real-cli-binding` family)
  - Assert at least one record in `.vibe-science-environment/operator-validation/external-review-log.jsonl`

Status: **CLOSED**.

Evidence:
- `vibe-science/plugin/lib/core-reader.js` now inspects
  `.claude/settings.json` and `hooks/hooks.json`, checks hook script
  presence/runnability, executes `tests/governance-hooks.test.mjs`, and
  emits `synthetic: false` hook records only.
- `vibe-science/plugin/scripts/core-reader-cli.js` now includes
  `dbAvailable`, `sourceMode`, and `degradedReason` in every successful
  envelope.
- `environment/lib/kernel-bridge.js` rejects `ok:true` degraded envelopes
  in normal projection calls and marks the reader unavailable during the
  initial probe when the kernel reports degraded data.
- `environment/orchestrator/review-lane.js` now includes `projectPath` in
  provider payloads; `environment/orchestrator/executors/codex-cli.js`
  requires that field and spawns real Codex from `cwd: projectPath`.
- `environment/tests/evals/saved-artifacts.test.js` now requires
  `evidenceMode: "real-cli-binding-codex"`, `providerRef:
  "openai/codex"`, `integrationKind: "provider-cli"`, and the durable
  `externalReview` record, not just a lane-run summary.

### Phase 6.2-C — Evidence Regen + Adversarial Review + Re-Upgrade

Scope: rebuild evidence and re-grade the ledger.

- Regenerate real-codex benchmark runs with the new `cwd`/`projectPath`
  contract in place
- Run Gate 17 probe against the hook-runtime-verifying `core-reader.js`
- New external adversarial review focused on Phase 6.2 only
- If the review clears:
  - Phase 1 Gate 17: PARTIAL → PASS (second time, this time on real
    evidence)
  - Phase 6.1 verdict: CONDITIONALLY CLOSED → CLOSED
  - Phase 6.2 verdict: OPEN → CLOSED
  - Phase 7 unblocked

Status: **CLOSED**.

Evidence regenerated:
- [orchestrator-execution-review-lineage / 2026-04-18-04](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-18-04/summary.json)
  contains real Codex evidence with `evidenceMode:
  "real-cli-binding-codex"` and a durable `externalReview` record.
- [phase5-operator-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase5-operator-validation.json)
  was regenerated after the stricter saved-artifact test.
- `npm run check`: 507/508 pass, 1 declared live-kernel skip when
  `VRE_KERNEL_PATH` is unset, 12/12 validators.
- Live sibling probe with `VRE_KERNEL_PATH=../vibe-science`: 28/28 pass,
  including Gate 17 hook provenance assertions.

---

## Follow-Ups Opened

| ID | Scope | Blocks |
|----|-------|--------|
| FU-6-004 | Kernel hook runtime verification in `core-reader.js` `listGateChecks` — replace synthetic array with real probe (hooks.json + settings.json + script existence + optional runtime test reuse) | Phase 1 Gate 17 re-upgrade |
| FU-6-005 | Core-reader envelope exposes `dbAvailable`/`sourceMode`; VRE bridge degrades explicitly on fallback | Phase 1 Gate 17 re-upgrade |
| FU-6-006 | Codex adapter spawn sets `cwd: projectPath`; payload carries `projectPath`; regression test from nested dir | Phase 5 Gate 3 hardening (not a downgrade) |
| FU-6-007 | `saved-artifacts.test.js` requires `real-cli-binding-codex` + verifies the durable `externalReview` record embedded from `external-review-log.jsonl` | P2 evidence tightening (not a gate blocker) |

All four follow-ups are **CLOSED**.

---

## Final Re-Grade

| Gate | Phase 6.2-A | Phase 6.2-C |
|------|-------------|-------------|
| Phase 1 Gate 17 | PARTIAL | PASS |
| Phase 5 Gate 3 | PASS-with-limit | PASS |
| Phase 6.1 verdict | CONDITIONALLY CLOSED | CLOSED |
| Phase 6.2 verdict | OPEN | CLOSED |
| Phase 7 status | BLOCKED | UNBLOCKED |

---

## Commit Strategy

Phase 6.2-A is **one commit, one repo** (`vibe-research-environment`).
No `vibe-science` changes. Message:

```
phase6_2-A: retract Gate 17 PASS and record 4 follow-ups

Fresh-eyes review surfaced that Phase 6.1 Gate 17 PASS rests on a
synthetic hook array in core-reader.js listGateChecks — a fixture, not
a runtime probe. This is the Phase 5.5 silent-zero pathology one layer
up. Retract the PASS, open FU-6-004/005/006/007, defer Phase 7.
```

## Commit Strategy

Phase 6.2 landed as local commits first (user policy: no push without
explicit ask). Cross-repo code is intentionally split by ownership:

1. `vibe-science`: hook/runtime DB provenance for the kernel reader.
2. `vibe-research-environment`: bridge fail-closed behavior, Codex
   `projectPath` contract, stricter evidence tests, regenerated evidence,
   and closeout re-grade.

Push order remains kernel first, VRE second, when the user explicitly asks.
