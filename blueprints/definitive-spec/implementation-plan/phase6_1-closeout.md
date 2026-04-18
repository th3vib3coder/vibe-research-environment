# Phase 6.1 Closeout — Follow-Up Closure

**Date:** 2026-04-18
**Repo:** `vibe-research-environment` + `vibe-science` (cross-repo)
**Scope:** close the three declared follow-ups from Phase 6 (FU-6-001,
FU-6-002, FU-6-003), plus one stale-fixture bug surfaced during closeout

---

## Verdict

**Phase 6.1 is CONDITIONALLY CLOSED.** All three declared Phase 6 follow-ups
(FU-6-001, FU-6-002, FU-6-003) were retired, but a second fresh-eyes
adversarial review on the pushed state surfaced three additional P1
findings + one P2 that were NOT closed by Phase 6.1. The most serious:
Gate 17's "PASS" rested on a synthetic (hardcoded) non-negotiable-hooks
array in the new kernel `core-reader.js` — a fixture, not a runtime
probe.

**Phase 6.2 is REQUIRED** before Phase 6.1 can be declared unconditionally
closed. Phase 7 is **blocked** pending Phase 6.2. See
[phase6_2-closeout.md](./phase6_2-closeout.md) for the corrective plan.

Phase 6.2-A (documentary, this commit) retracts the Gate 17 upgrade back
to PARTIAL and opens FU-6-004/005/006/007. Phase 6.2-B ships the code
fixes. Phase 6.2-C regenerates evidence and re-grades.

What is closed with code on disk:
- `vibe-science/plugin/lib/core-reader.js` (NEW): 8 projections over the
  real kernel DB + static governance contracts, matches WP-150 envelope
- `vibe-science/plugin/scripts/core-reader-cli.js` (NEW): stdin/stdout
  envelope CLI for the VRE kernel bridge
- `vre/environment/orchestrator/executors/codex-cli.js`: added
  `invokeRealCodexCli` + `buildRealCodexCliExecutor` using
  `codex exec --output-last-message <tmpfile>` with prompt-engineered
  JSON output validation
- `vre/environment/evals/save-phase5-artifacts.js`: fixed binding to use
  `provider-cli` integrationKind + registers real adapter under the
  matching executor key
- `vre/environment/evals/_orchestrator-fixture.js`: review lane
  `integrationKind` corrected from stale `local-cli` → `provider-cli`
- `vre/environment/tests/evals/saved-artifacts.test.js`: tightened
  review-verdict assertion to demand declared evidenceMode (catches
  lost-evidenceMode regressions)
- `vre/environment/evals/tasks/orchestrator-execution-review-lineage.json`:
  relaxed hardcoded verdict assertion (real review produces any of
  three valid verdicts)

---

## Evidence Map

### Kernel-Side Shipments (vibe-science sibling)

- [plugin/lib/core-reader.js](../../../../vibe-science/plugin/lib/core-reader.js)
- [plugin/scripts/core-reader-cli.js](../../../../vibe-science/plugin/scripts/core-reader-cli.js)

### VRE-Side Shipments

- [codex-cli.js](../../../environment/orchestrator/executors/codex-cli.js) — adapter
- [save-phase5-artifacts.js](../../../environment/evals/save-phase5-artifacts.js) — fixture binding fix
- [_orchestrator-fixture.js](../../../environment/evals/_orchestrator-fixture.js) — integrationKind fix
- [saved-artifacts.test.js](../../../environment/tests/evals/saved-artifacts.test.js) — tightened assertion
- [orchestrator-execution-review-lineage.json](../../../environment/evals/tasks/orchestrator-execution-review-lineage.json) — assertion relax

### Benchmark Evidence

- [orchestrator-execution-review-lineage/2026-04-18-02](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-18-02/summary.json) — real-codex review, verdict `"challenged"`, evidenceMode `"real-cli-binding"`
- Full Phase 5 benchmark set regenerated with real-provider evidence at `2026-04-18-07/03/02`

### Regression Tests

- [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) passes against real kernel when `VRE_KERNEL_PATH` is set
- [codex-cli-executor.test.js](../../../environment/tests/lib/codex-cli-executor.test.js) covers fake-CLI envelope path
- [session-digest-review-task.test.js](../../../environment/tests/integration/session-digest-review-task.test.js) covers WP-168 regression guards
- `npm run check`: 503/504 pass, 1 declared skip (live kernel test), 0 fail, 12/12 validators

---

## Exit Gate Outcome

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | FU-6-001 closed: kernel sibling ships real `core-reader-cli.js` probe-testable | PASS | [plugin/lib/core-reader.js](../../../../vibe-science/plugin/lib/core-reader.js), [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) (probe passes against real kernel) |
| 2 | FU-6-002 closed: Codex CLI envelope adapter ships + produces real v1 evidence | PASS | [codex-cli.js](../../../environment/orchestrator/executors/codex-cli.js) `invokeRealCodexCli`, benchmark [2026-04-18-02/summary.json](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-18-02/summary.json) |
| 3 | FU-6-003 closed: external adversarial review surfaced findings; all closed before commit | PASS | [phase6_1-closeout.md](./phase6_1-closeout.md) "Adversarial Review Findings Closed" section below |
| 4 | Phase 1 Gate 17 upgraded PARTIAL → PASS | RETRACTED | Upgrade retracted in Phase 6.2-A after fresh-eyes review found `listGateChecks` returns synthetic hook-status array, not real runtime probe. See [phase1-closeout.md](./phase1-closeout.md) Phase 6.2-A correction note. FU-6-004 + FU-6-005 block re-upgrade. |
| 5 | Phase 5 Gate 3 upgraded PARTIAL → PASS | PASS (with limit) | Evidence remains real-codex benchmark `2026-04-18-02`. Phase 6.2-A records loose-contract limit (FU-6-006: no `cwd`/`projectPath` contract); hardening not downgrade. See [phase5-closeout.md](./phase5-closeout.md) Phase 6.2-A note. |
| 6 | `npm run check` passes with tightened assertions | PASS | [ci.yml](../../../.github/workflows/ci.yml); local run confirms 503/504 |

**Result: 3 PASS, 1 PASS-with-limit, 1 RETRACTED, 0 PARTIAL.** The
Phase 6.1 commits ARE on disk and working, but the narrative "Phase 6.1
closes all Phase 6 gaps" is too strong. Phase 6.2 exists to correct the
overclaim, ship the missing code, and re-grade honestly.

---

## Adversarial Review Findings Closed (FU-6-003)

The fresh-eyes review found 3 P0 kernel column-drift bugs + 6 P1 issues.
All P0s and the two critical P1s (P1-1, P1-5) were fixed before commit.

### P0 — fixed

- **P0-1** — `core-reader.js` used `ls.query_text` while schema has `query`
  in `literature_searches`. Queries returned empty. **Fixed**: column name
  corrected + added `results_count`, `search_layer` to projection output.
- **P0-2** — `core-reader.js` used `r.severity` and `r.timestamp` while
  schema has `level` and `created_at` in `observer_alerts`. **Fixed**:
  expose both `level` (real column) and `severity` (alias for bridge
  compatibility) + `created_at`.
- **P0-3** — `core-reader.js` called `getCitationChecks(db, {projectPath,
  limit})` but db.js signature accepts `{sessionId, claimId}`. Filters
  silently ignored, always returned empty. **Fixed**: projection now
  queries `citation_checks` table directly with correct WHERE clause on
  `sessions.project_path`.

### P1 — fixed before commit

- **P1-1** — Fixture said `integrationKind: 'local-subprocess'` but the
  real-codex executor carries `integrationKind: 'provider-cli'`. Review
  lane lane-run records were inconsistent with the executor kind.
  **Fixed**: fixture updated to `provider-cli`; smoke + real executors
  both registered under `'openai/codex:provider-cli'` key.
- **P1-5** — Test accepted any verdict in `{affirmed, challenged,
  inconclusive}` but normalize logic coerces ANY invalid verdict to
  `inconclusive`, so a gibberish real-codex run would silently pass.
  **Fixed**: test now asserts `review.evidenceMode` is declared + in
  known mode set. A regression that loses evidenceMode fails the test.

### P1 — deferred (documented, not blocker AT THE TIME)

**Note (Phase 6.2-A):** P1-3 was documented here as an accepted limit.
The second fresh-eyes review correctly rejected this framing: a
hardcoded `status: 'ok'` in a PASS gate IS the Phase 5.5 silent-zero
pathology, not a "known limit". P1-3 is re-opened as **FU-6-004** and
blocks Gate 17 re-upgrade.

- **P1-2** — Kernel governance profile reads from `meta['governance.profile']`
  key that no kernel code currently writes; projection defaults to
  `'default'`. **Honest limit documented** in `core-reader.js` header.
  Kernel-side work to persist profile changes is a future task (Phase 7+
  or kernel milestone); not required for Gate 17 because the probe
  validates the enum, not dynamic profile changes.
- **P1-3 (RE-OPENED as FU-6-004)** — Synthetic non-negotiable hooks are
  always `status: 'ok'`; if runtime hook crashes, synthesis would lie.
  Documenting this as a "limit" while Gate 17 reads PASS was the
  overclaim. Phase 6.2-B ships the real runtime probe.
- **P1-4** — Zero unit-test coverage for `invokeRealCodexCli` itself.
  **Deferred**: integration test via saved-artifacts covers the success
  path; unit-level coverage of error branches (tmpfile cleanup, missing
  last-message, timeout with real spawn) is Phase 7+ test hardening.
- **P1-6** — Prompt-injection surface via `task.objective`. Low severity
  (operator-trusted input); backtick/fence escaping in JSON.stringify
  limits but does not eliminate. **Deferred**: hardening is Phase 7
  scope when the dispatcher broadens.

### P1 Second-Review Findings (Opened as Phase 6.2 FUs)

- **FU-6-004** (blocker for Gate 17 re-upgrade) — Kernel hook runtime
  verification: `core-reader.js` `listGateChecks` must read
  `hooks/hooks.json` and `.claude/settings.json`, check script
  existence and executability, and optionally reuse
  `tests/governance-hooks.test.mjs` as probe evidence. No more
  synthetic hook arrays.
- **FU-6-005** (blocker for Gate 17 re-upgrade) — DB/schema honesty:
  `withDb` currently swallows SQL errors and returns `ok:true`
  fallback. Envelope must expose `dbAvailable`/`sourceMode` so the
  VRE bridge degrades explicitly instead of conflating "verified
  zero" with "DB missing".
- **FU-6-006** (Gate 3 hardening, not downgrade) — Codex adapter
  spawn must set `cwd: projectPath`; payload must include
  `projectPath`; regression test invoked from a nested directory.
- **FU-6-007** (P2 evidence) — `saved-artifacts.test.js` must require
  `evidenceMode === 'real-cli-binding-codex'` (not generic
  `real-cli-binding`) and assert ≥1 record in
  `external-review-log.jsonl`.

---

## Cross-Repo Commit Strategy

Phase 6.1 touches two repos. Separate commits, one per repo:

1. **vibe-science**: `phase6_1: ship core-reader for VRE kernel bridge`
   - `plugin/lib/core-reader.js` (new, 300+ lines, 8 projections)
   - `plugin/scripts/core-reader-cli.js` (new, 80 lines, envelope CLI)
2. **vibe-research-environment**: `phase6_1: close FU-6-001/002/003 with real evidence`
   - `environment/orchestrator/executors/codex-cli.js` (+ ~250 lines for real adapter)
   - `environment/evals/save-phase5-artifacts.js` (fixture binding fix)
   - `environment/evals/_orchestrator-fixture.js` (integrationKind correction)
   - `environment/evals/tasks/orchestrator-execution-review-lineage.json` (assertion relax)
   - `environment/tests/evals/saved-artifacts.test.js` (tightened assertion)
   - `blueprints/definitive-spec/implementation-plan/phase1-closeout.md` (Gate 17 PASS)
   - `blueprints/definitive-spec/implementation-plan/phase5-closeout.md` (Gate 3 PASS)
   - `blueprints/definitive-spec/implementation-plan/phase6_1-closeout.md` (this file)
   - benchmark regenerated artifacts under
     `.vibe-science-environment/operator-validation/benchmarks/`

Push order: vibe-science FIRST (enables VRE probe + real-codex path),
then vibe-research-environment.

---

## Final Decisions

1. **Kernel governance profile persistence is out of scope**. Core-reader
   reads `meta['governance.profile']` if present, defaults `'default'`
   otherwise. Future kernel work may write this key; VRE contract holds.
2. **Synthetic non-negotiable hooks are the right default**. Kernel
   runtime enforcement is the source of truth; DB projection is a
   secondary surface. P1-3 limit documented in core-reader source.
3. **Real-codex benchmark evidence is canonical for Gate 3**. The
   `2026-04-18-02` run with verdict `"challenged"` is authentic real
   review output; the orchestrator correctly escalated per the verdict.
4. **`integrationKind` must match executor lookup key**. Going forward,
   any new provider adapter must ship with its fixture binding aligned
   to the `providerRef:integrationKind` lookup.

---

## Phase 7 Entry

Phase 7 is **BLOCKED** pending Phase 6.2 closure.

Phase 6.1 declared Phase 7 unblocked prematurely. The second
adversarial review correctly flagged that Gate 17 PASS is not
defensible while `listGateChecks` returns synthetic hook data. Phase 6.2
exists to close that gap. See [phase6_2-closeout.md](./phase6_2-closeout.md).
