# Phase 6 Wave 3 — Tests And Validators

**Goal:** Add regression coverage for every Wave 1 and Wave 2 deliverable so
that kernel-bridge reality and real-provider reality become machine-checkable
invariants. Verify the CI workflow contract from Wave 0 WP-154.

---

## Scope Rule

Wave 3 creates test files, verifies CI configuration, and performs exactly
one runtime wiring refactor: `bin/vre:resolveDefaultReader` must consume the
Wave 1 kernel bridge. No other runtime code edits are in scope. Every test
added must satisfy the pre/post criterion: fails on `origin/main @ 3563a48`
(the pre-Phase-6 baseline) and passes once the corresponding Wave 1 or Wave
2 WP lands.

Dependencies:
- Waves 1 and 2 skeleton code merged
- Wave 0 WP-154 CI workflow audit result recorded

---

## WP-166 — Kernel Bridge Wiring And Regression Suite

Wire the Wave 1 bridge into the first real caller and guard WP-155..WP-158
against future regression.

Runtime refactor:
- update `bin/vre:resolveDefaultReader` to call
  `resolveKernelReader({projectRoot, kernelRoot, timeoutMs})`
- preserve the current degraded behavior when the sibling kernel is absent
- do not introduce caching; each projection remains a bridge call unless the
  caller explicitly caches outside the bridge
- keep `VRE_KERNEL_PATH` as the operator override and default to the existing
  sibling lookup when unset

New test files:

- `environment/tests/lib/kernel-bridge.test.js` (unit) — covers WP-155:
  - happy path: fake sibling fixture with canned `getProjectOverview`
    returns expected envelope; reader methods return parsed data
  - envelope parse error: stdout is malformed JSON → `KernelBridgeContractMismatchError`
  - envelope `{ok:false, error}`: kernel reports failure → bridge surfaces
    that error through a dedicated class OR attaches `cause` to the caller
    (see WP-155 adversarial-scrutiny point in Wave 1)
  - ENOENT on CLI path → `KernelBridgeUnavailableError`
  - timeout → `KernelBridgeTimeoutError` with `timeoutPhase` captured
  - env var sanitization: credentials absent from child env unless passed
    explicitly via `envPassthrough`
  - `close()` behavior: no-op returns cleanly (addresses WP-150 gap flagged
    by Wave 1 agent)
- `environment/tests/integration/kernel-bridge.test.js` is already authored
  in Wave 1 WP-156; Wave 3 adds no integration file for this lane — it just
  verifies the Wave 1 file passes in CI.
- `environment/tests/cli/bin-vre-kernel-reader.test.js` (or an equivalent
  CLI regression file) — proves `bin/vre flow-status` can use the fake sibling
  bridge path and still degrades honestly when the bridge is unavailable

Acceptance:
- `bin/vre:resolveDefaultReader` consumes `environment/lib/kernel-bridge.js`
  rather than duplicating sibling-reader logic
- unit test file covers every error class from WP-155
- unit tests complete in <2 seconds total
- tests pass on fake-sibling fixture without requiring `VRE_KERNEL_PATH`

State ownership:
- enters via: `npm test`
- state: one runtime refactor plus test files; no persistent state
- read by: CI and developers
- degradation: if fake-sibling fixture path breaks on Windows line endings,
  the test is explicitly cross-platform-normalized

---

## WP-167 — Gate 17 Real Probe Regression

Wave 1 WP-157 ships `kernel-governance-probe.test.js`. Wave 3 extends its
coverage.

New test additions:
- probe handles absent sibling (skips with declared reason "kernel sibling
  not available — Gate 17 upgrade requires VRE_KERNEL_PATH set")
- probe reports bidirectional coverage (addresses WP-157 adversarial-scrutiny
  point on kernel-adds-new-profile-value): assertion uses set-equality on
  enum projections rather than membership-only
- probe exercises at least one negative case: kernel projection that would
  VIOLATE Gate 17 claim triggers a test failure with explicit message

Acceptance:
- new negative-case assertion FAILS on a fixture kernel that mis-reports
  governance profile
- existing positive path continues to PASS on fake-sibling fixture
- skip reason is machine-readable (matches CI skip-reason format used
  elsewhere in the tree)

---

## WP-168 — Real Provider Binding Regression Suite

Guard Wave 2 WP-160..WP-164 against future regression.

New test files:

- `environment/tests/lib/codex-cli-executor.test.js` — covers WP-160:
  - happy path with a fake Codex CLI (`node -e` script that reads envelope
    and writes valid v1 output) — verify envelope stdin/stdout round-trip
  - missing `VRE_CODEX_CLI` → fail closed (throw typed error, no fallback)
  - CLI exits nonzero → `tool-failure` with exitCode captured
  - CLI returns malformed schemaVersion → `contract-mismatch`
  - timeout → SIGTERM + grace + SIGKILL, `timeoutPhase` recorded
  - env sanitization: only declared passthrough vars reach child
  - concurrency: two simultaneous invocations do not interfere (different
    stdin/stdout streams, different child processes)

- `environment/tests/lib/claude-cli-executor.test.js` — covers WP-161:
  - happy path with Claude-CLI-shaped fake: input is prompt-first, output
    is `{type:"result",result:"<json>"}` which the wrapper unpacks and
    re-parses (per Wave 2 WP-161 envelope adaptation)
  - prompt-mode args differ from Codex exec args — assert the exact args
    shape passed to spawn
  - result-unwrap failure: `type` is not `result` OR `result` is not valid
    JSON → `contract-mismatch`
  - other error modes mirror Codex: ENOENT, timeout, nonzero exit, env
    hygiene

- `environment/tests/integration/session-digest-review-task.test.js` —
  covers WP-163 + WP-164:
  - chains on a completed session-digest-export lane-run from a fresh
    fixture project, registers a session-digest-review task, runs the
    review lane with a fake Codex-CLI executor, asserts `externalReview`
    record contains verdict + materialMismatch + summary + followUpAction
  - `executionLaneRunId` same-session requirement (addresses Wave 2 WP-152
    spec gap flagged by agent): reject cross-session refs with a typed
    error
  - manual-review path is untouched — a task kind NOT in the registry
    still routes through the original manual-review logic

Acceptance:
- every new test fails on baseline (no executor exists pre-Wave-2)
- fake CLI scripts live under
  `environment/tests/fixtures/fake-provider-cli/` with separate
  codex-echo.js and claude-echo.js
- session-digest-review integration test exercises the full chain
  (route → execute → review) without requiring real provider credentials

---

## WP-169 — Provider Gateway And Schema Widening Regression

Cover Wave 2 WP-162 (provider-gateway + schema enum extensions).

New/updated test files:

- Update `environment/tests/lib/orchestrator-lanes.test.js`:
  - add case: lane-policy with `integrationKind: "provider-cli"` binds
    successfully when the executor is supplied; fails closed when absent
  - add case: `selectLaneBinding` does NOT return a `provider-cli` binding
    for capabilities it does not support
- Update `environment/tests/schemas/lane-policy.schema.test.js`:
  - accept `integrationKind: "provider-cli"` (post-WP-162)
  - legacy fixtures without `provider-cli` still validate (strict widening)
- Update `environment/tests/schemas/lane-run-record.schema.test.js`:
  - accept `integrationKind: "provider-cli"` with `evidenceMode:
    "real-cli-binding-codex"` / `"real-cli-binding-claude"`
  - reject unknown `evidenceMode` values not in the enum

Acceptance:
- `validate-counts.js` updated: `schemaTests` and `libTests` deltas recorded
- pre-Wave-2 test fixtures continue to pass (strict widening, no regression)

---

## WP-170 — CI Workflow Verification

Finalize Wave 0 WP-154 audit:

- if audit FOUND: Wave 3 adds a smoke test that PR checks actually run —
  concretely: commit a deliberate-fail test in a scratch branch locally
  (not pushed), verify `npm run check` exits non-zero, document the
  confirmation in the Phase 6 closeout
- if audit ABSENT: Wave 3 ships `.github/workflows/check.yml`:
  - triggers: `pull_request` to main, `push` to main
  - jobs: `node-check` on `ubuntu-latest` with Node 18+; `npm ci && npm run
    check`; upload any saved eval artifacts on failure for diagnosis
  - optionally a `cross-platform-check` job on `windows-latest` running the
    same `npm run check` — justified by Phase 5.5 WP-135 cross-platform
    concern

New test: `environment/tests/ci/validate-ci-workflow.js` (new CI validator)
- parses `.github/workflows/*.yml` (lightweight regex, no YAML library needed)
- asserts at least one workflow triggers on `pull_request` targeting main
- asserts at least one workflow runs an install step (`npm ci` preferred,
  `npm install` accepted) before the check step
- asserts at least one workflow runs `npm run check` exactly; `npm run test`
  plus `npm run validate` is not equivalent for this contract because future
  `check` may add non-test gates
- registered in `environment/tests/ci/run-all.js`; `validate-counts.js`
  `ciValidators` incremented 11 → 12

Acceptance:
- CI workflow file exists and is parseable by the validator
- `npm run check` registers the new validator

State ownership:
- written by: Wave 0 author (audit) + Wave 3 implementer (workflow file if
  needed)
- read by: GitHub Actions + `validate-ci-workflow.js`
- degradation: if a workflow file is malformed, the validator fails the
  local `npm run check` with a specific error pointing at the file

---

## Parallelism

- WP-166 can start as soon as Wave 1 WP-155 skeleton lands
- WP-167 can start as soon as Wave 1 WP-157 skeleton lands
- WP-168 can start as soon as Wave 2 WP-160/161 skeletons land
- WP-169 can start as soon as Wave 2 WP-162 schemas land
- WP-170 is independent and can parallelize with all others

All five WPs may land in parallel branches once Wave 0 contracts are
frozen.

---

## Six Implementation Questions (wave-level)

1. **Enters how?** Via `npm test` (test files) and `npm run validate`
   (new CI validator). CI via `.github/workflows/check.yml` if needed.
2. **State where?** No new persistent state; test files + fixtures read the
   repo and spawn fake CLI fixtures.
3. **Read by?** CI and developers running `npm run check` locally.
4. **Written by?** Only Waves 1-2 code writes what these tests observe;
   Wave 3 itself writes only test files + optionally the workflow YAML.
5. **Tested how?** Each validator has its own fixture test; each regression
   test is itself a pre/post guard.
6. **Degrades how?** If the CI runner is unreachable, GitHub Actions' own
   status communicates that; VRE does not paper over outages. If
   `VRE_KERNEL_PATH` is absent for an integration test, skips with a
   declared reason — never silent pass.

---

## Exit Condition

Wave 3 is complete when:
- four regression test files are present (WP-166, WP-167, WP-168) plus
  schema/orchestrator updates (WP-169)
- each fails on baseline and passes after its corresponding Wave 1-2 WP
- `validate-ci-workflow.js` is registered as a CI validator if WP-170
  required adding `.github/workflows/check.yml`
- `validate-counts.js` reflects the new counts (ciValidators: 11 → 12 if
  new validator added; plus lib/integration/schema test deltas)
- `npm run check` is green post-merge
