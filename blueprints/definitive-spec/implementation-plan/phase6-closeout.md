# Phase 6 Closeout — Kernel Bridge and Provider Reality

**Date:** 2026-04-18
**Repo:** `vibe-research-environment`
**Scope:** close the four block-class gaps (G-01, G-02, G-03, G-04) from
`PHASE-6-7-MASTER-SEQUENCE-SPEC.md` plus the G-15 CI workflow audit

---

## Supersession Note

This file records the **historical Phase 6 Wave 4 closeout**: Outcome B,
with Gate 17 and Gate 3 held at PARTIAL and follow-ups FU-6-001/002/003
opened. That was the correct state at the time.

The current final state is recorded in:
- [phase6_1-closeout.md](./phase6_1-closeout.md)
- [phase6_2-closeout.md](./phase6_2-closeout.md)

After Phase 6.2, those follow-ups are closed, Gate 17 and Gate 3 are
re-upgraded to PASS, and Phase 7 is unblocked. Do not treat the exit gate
table below as the current ledger; it is preserved for retraction history.

---

## Verdict

**Phase 6 is implementation-complete with honest Outcome B on both
block gates.**

What is closed with code on disk:
- Real kernel bridge helper (`environment/lib/kernel-bridge.js`) spawning
  `plugin/scripts/core-reader-cli.js` per projection with envelope
  validation, typed error taxonomy, and env hygiene
- Real provider CLI executors (`codex-cli.js`, `claude-cli.js`) with the
  v1 input/output envelope contract — fail-closed on missing binary
- New `session-digest-review` review-lane task kind with taskKind check,
  self-ref guard, and cross-session rejection (WP-168 findings 4 + 5
  closed)
- `bin/vre:resolveDefaultReader` now delegates to `resolveKernelReader`
  (no more duplicated CLI-reader wiring)
- Schema cross-validation: lane-run-record rejects `real-cli-binding-*`
  evidenceMode without `integrationKind: "provider-cli"` (WP-169)
- New CI validator `validate-ci-workflow.js` enforcing
  `.github/workflows/ci.yml` contract

What Phase 6 does **not** claim:
- Gate 17 is NOT yet PASS: kernel sibling's `core-reader-cli.js` does not
  exist on this host; probe runs against fake fixture only (FU-6-001)
- Gate 3 is NOT yet PASS: Wave 2's Codex/Claude CLI executor assumed
  single-envelope stdout, but real `codex exec --json` emits a JSONL
  event stream — adapter script needed in Phase 6.1 (FU-6-002)
- Phase 6 does NOT open Phase 7. Phase 7 remains blocked on Gate 3
  upgrade, consistent with the PHASE-6-7-MASTER-SEQUENCE-SPEC sequence.

---

## Evidence Map

### Runtime Code Shipped (Waves 1-3)

Wave 1 — kernel bridge:
- [environment/lib/kernel-bridge.js](../../../environment/lib/kernel-bridge.js)
- [environment/tests/fixtures/fake-kernel-sibling/plugin/scripts/core-reader-cli.js](../../../environment/tests/fixtures/fake-kernel-sibling/plugin/scripts/core-reader-cli.js)

Wave 2 — real provider binding + review-lineage task:
- [environment/orchestrator/executors/codex-cli.js](../../../environment/orchestrator/executors/codex-cli.js)
- [environment/orchestrator/executors/claude-cli.js](../../../environment/orchestrator/executors/claude-cli.js)
- [environment/orchestrator/task-registry/session-digest-review.json](../../../environment/orchestrator/task-registry/session-digest-review.json)
- [environment/flows/session-digest-review.js](../../../environment/flows/session-digest-review.js)
- [environment/schemas/session-digest-review-input.schema.json](../../../environment/schemas/session-digest-review-input.schema.json)

Wave 3 — bin/vre wiring, probe extensions, adversarial findings closed:
- [bin/vre](../../../bin/vre) refactored to use resolveKernelReader
- [environment/tests/ci/validate-ci-workflow.js](../../../environment/tests/ci/validate-ci-workflow.js)

### Regression Coverage (Waves 1-3 tests)

- [kernel-bridge.test.js (unit)](../../../environment/tests/lib/kernel-bridge.test.js) — 16 tests
- [kernel-bridge.test.js (integration)](../../../environment/tests/integration/kernel-bridge.test.js) — 19 tests + 1 declared skip (live sibling)
- [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) — 8 tests incl. bidirectional + negative
- [middleware-kernel-bridge-degraded.test.js](../../../environment/tests/control/middleware-kernel-bridge-degraded.test.js) — 4 tests
- [codex-cli-executor.test.js](../../../environment/tests/lib/codex-cli-executor.test.js) — 8 tests
- [claude-cli-executor.test.js](../../../environment/tests/lib/claude-cli-executor.test.js) — 8 tests
- [session-digest-review-task.test.js](../../../environment/tests/integration/session-digest-review-task.test.js) — 5 tests incl. WP-168 findings 4 + 5
- [session-digest-review-input.schema.test.js](../../../environment/tests/schemas/session-digest-review-input.schema.test.js) — 3 tests
- [lane-run-record.schema.test.js](../../../environment/tests/schemas/lane-run-record.schema.test.js) — 3 baseline + 7 WP-169 cross-check tests
- [bin-vre-kernel-reader.test.js](../../../environment/tests/cli/bin-vre-kernel-reader.test.js) — 2 tests (degraded + wired)

### Closeout Preparations (Wave 1, Wave 2)

- [phase6-wave1-gate17-upgrade-package.md](./phase6-wave1-gate17-upgrade-package.md) — WP-159 preparation used by Wave 4
- [phase6-wave2-review-regrade-plan.md](./phase6-wave2-review-regrade-plan.md) — WP-165 rerun plan

### CI Workflow (WP-154 + WP-170)

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) — tightened to `npm run check`
- [validate-ci-workflow.js](../../../environment/tests/ci/validate-ci-workflow.js) — enforces contract

---

## Exit Gate Outcome

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `npm run check` passes with new tests added | PASS | [ci.yml](../../../.github/workflows/ci.yml) (CI runs npm run check on every PR); commit `bf36af5` shows 503 pass, 1 declared skip, 0 fail |
| 2 | Kernel sibling integration test spawns `core-reader-cli.js` and skips honestly when sibling absent | PARTIAL | [kernel-bridge.test.js (integration)](../../../environment/tests/integration/kernel-bridge.test.js); live-sibling branch skips because real `vibe-science/plugin/scripts/core-reader-cli.js` is not present on this host — follow-up FU-6-001 (see Declared Follow-Ups below) |
| 3 | Phase 1 Gate 17 upgraded | PARTIAL | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) exercises the real probe against fake sibling; [phase1-closeout.md](./phase1-closeout.md) upgraded accordingly — follow-up FU-6-001 (see Declared Follow-Ups below) |
| 4 | Phase 5 Gate 3 regraded | PARTIAL | [session-digest-review-task.test.js](../../../environment/tests/integration/session-digest-review-task.test.js), [codex-cli-executor.test.js](../../../environment/tests/lib/codex-cli-executor.test.js); [phase5-closeout.md](./phase5-closeout.md) regraded FALSE-POSITIVE → PARTIAL — follow-up FU-6-002 (see Declared Follow-Ups below) |
| 5 | CI workflow verifiably runs `npm run check` on PR to main | PASS | [ci.yml](../../../.github/workflows/ci.yml) (single `Run check` step) enforced by [validate-ci-workflow.js](../../../environment/tests/ci/validate-ci-workflow.js) |
| 6 | `validate-closeout-honesty` accepts every corrected closeout | PASS | [validate-closeout-honesty.js](../../../environment/tests/ci/validate-closeout-honesty.js) passes in CI on commit `bf36af5` + this Wave 4 corrections set |
| 7 | External adversarial review returns no P0 or P1 findings | DEFERRED | [phase6-closeout.md](./phase6-closeout.md) produced; adversarial review round still pending — follow-up FU-6-003 (see Declared Follow-Ups below) |

**Result: 3 PASS, 3 PARTIAL, 1 DEFERRED.**

Phase 6 closes as **Outcome B** per the `PHASE-6-7-MASTER-SEQUENCE-SPEC`
sequence rationale: foundation code shipped, Gate 17 and Gate 3 disclosed
as PARTIAL with named follow-ups, Phase 7 remains blocked.

---

## Gap Reconciliation (G-01..G-04, G-15)

| Gap | Status | Evidence / Follow-up |
|-----|--------|----------------------|
| G-01 — Gate 17 tautological | PARTIAL | Real probe lands in code + tests; upgrade to PASS requires FU-6-001 (real kernel sibling on host) |
| G-02 — Phase 5 Gate 3 mock review | PARTIAL | Schema cross-check, taskKind guard, self-ref guard, real subprocess binding all shipped; upgrade to PASS requires FU-6-002 (codex CLI envelope adapter) |
| G-03 — kernel bridge untested | RESOLVED | kernel-bridge.js + integration test with fake sibling fixture + bin/vre wiring; degraded-mode behavior regression-tested |
| G-04 — no real provider binding | PARTIAL | codex-cli.js + claude-cli.js shipped with error taxonomy, timeouts, env whitelist; upgrade to PASS requires FU-6-002 adapter to bridge Wave 2's v1 envelope assumption to real CLI JSONL shape |
| G-15 — CI workflow state uncertain | RESOLVED | ci.yml inventoried and tightened; validate-ci-workflow.js enforces contract |

---

## Closeout Corrections Applied

| Closeout | Correction | Evidence |
|----------|-----------|----------|
| [phase1-closeout.md](./phase1-closeout.md) | Gate 17 evidence updated to cite kernel-governance-probe.test.js + kernel-bridge.js; FU-55-001 retired, FU-6-001 issued | Gate 17 correction note + declared follow-up |
| [phase5-closeout.md](./phase5-closeout.md) | Gate 3 regraded FALSE-POSITIVE → PARTIAL citing session-digest-review-task.test.js + codex-cli-executor.test.js; "Result: 4 PASS, 1 PARTIAL" replaces prior "4 PASS, 1 FALSE-POSITIVE"; FU-6-002 declared | Phase 6 Wave 4 correction note + declared follow-up |

---

## Declared Follow-Ups

- **FU-6-001** — Provision a CI runner (or operator host) with
  `VRE_KERNEL_PATH` pointing at a real `vibe-science` sibling checkout
  that ships `plugin/scripts/core-reader-cli.js`. Once available,
  [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js)
  automatically exercises the live kernel and Gate 17 upgrades to PASS.
- **FU-6-002** — Phase 6.1 Wave 1 ships a Codex CLI envelope adapter
  (either a thin wrapper script or a refactor of
  [codex-cli.js](../../../environment/orchestrator/executors/codex-cli.js)
  to use `--output-last-message <tmp>` + parse the file) translating
  between the v1 envelope contract and real `codex exec --json` JSONL
  event streams. Same approach applies to
  [claude-cli.js](../../../environment/orchestrator/executors/claude-cli.js).
  Once shipped, Gate 3 upgrades to PASS automatically on any host with
  `VRE_CODEX_CLI` or `VRE_CLAUDE_CLI` set.
- **FU-6-003** — External adversarial review of the Phase 6 closeout
  (this document) and the Wave 1-3 runtime. Pattern Phase 5.5 /
  Phase 6+7 spec review: fresh-eyes agent on the diff since
  `3563a48..bf36af5` + this Wave 4 corrections.

---

## Final Decisions

1. **Kernel bridge is the canonical read path**: going forward, integration
   tests that need real kernel state use `resolveKernelReader`, not custom
   spawn wrappers.
2. **`provider-cli` is the real binding, `local-subprocess` is generic**:
   Phase 6 Wave 2 formalized the two kinds as distinct `integrationKind`
   values with enforced cross-validation against `evidenceMode`.
3. **`evidenceMode` is a required discipline field**: every lane-run record
   with real CLI evidence declares the mode; legacy records without the
   field continue to validate (strict widening).
4. **Outcome B is honest**: Phase 7 stays blocked on Gate 3 PASS; a
   cosmetic Outcome A declaration would have required pretending the
   codex-cli.js envelope adapter already exists.
5. **Phase 6.1 scope is pre-frozen**: FU-6-001 + FU-6-002 are the only
   tasks standing between Phase 6 and Phase 7 entry. No other Phase 6
   work surfaces.

---

## Deferred By Design

| Deferred item | Why | Target phase |
|---------------|-----|--------------|
| Real kernel sibling on host | Host provisioning is outside VRE repo scope | Phase 6.1 or operator action |
| Codex/Claude CLI envelope adapter | Wave 2 wrote `codex-cli.js` against an assumed envelope shape that doesn't match `codex exec --json` JSONL events; fix is mechanical and small but out of Wave 4's closeout-only scope | Phase 6.1 |
| Re-running `save-phase5-artifacts.js` with real CLI | Depends on FU-6-002 adapter landing first | Phase 6.1 |
| Broader task registry expansion | Phase 7 scope (G-05) | Phase 7 |
| CLI dispatcher all 12 commands | Phase 7 scope (G-06) | Phase 7 |
| Three-tier writing enforcement | Phase 7 scope (G-07) | Phase 7 |

---

## Open Finding From Wave 4

While writing this closeout, a new finding surfaced that was NOT in the
original Wave 0 contract set:

- **`save-phase5-artifacts.js` crashes on Wave 2 runtime**: the legacy
  Phase 5 review scenario at `environment/evals/save-phase5-artifacts.js:340`
  reads `reviewCoordinator.externalReview.verdict` but the Wave 2 review-
  lane route returns `externalReview: null` for the manual-review path.
  The integration tests written in Wave 2 (WP-163, WP-164) use a
  different entry point and pass. The eval harness is stale. Either the
  harness adopts the new task-registry path, or it is deleted in favor
  of the integration test as canonical evidence. Flagged for Phase 6.1.

---

## Final Status

What we can defend now:
- Kernel bridge + real provider binding + review-lineage task kind are
  all shipped with non-trivial test coverage (71 new tests in Waves 1+2,
  12 more in Wave 3)
- `npm run check` passes with 12/12 validators including the new
  `validate-ci-workflow`
- Gate 17 and Gate 3 PARTIAL grades are honest, each with a specific
  follow-up that names the exact unblocking step
- `validate-closeout-honesty` accepts this closeout and the two upgraded
  historical closeouts

What we should NOT overclaim:
- Phase 6 did NOT produce real Codex/Claude review evidence despite
  Codex CLI being installed — the envelope mismatch is a real finding
- Gate 17 does NOT have live kernel evidence; it has live fake-sibling
  evidence
- Phase 7 is NOT unblocked by this closeout — Gate 3 must upgrade to
  PASS first, and that upgrade lives in Phase 6.1

Recommended next action (historical): open **Phase 6.1** with exactly two
work items. This has since been completed and corrected through Phase 6.2.
Current next action is Phase 7 implementation or a fresh external review
on the Phase 6.2 diff before pushing.
