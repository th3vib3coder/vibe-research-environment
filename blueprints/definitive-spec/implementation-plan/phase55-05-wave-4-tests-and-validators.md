# Phase 5.5 Wave 4 — Tests And Validators

**Goal:** Add regression coverage for every finding (F-01..F-13), register the
commands-to-JS CI validator, and stage the closeout-honesty validator so that
(a) no Phase 5.5 fix can silently regress in a later phase, and (b) closeout
honesty becomes a machine-checkable property once Wave 5 corrects the
historical closeouts.

---

## Scope Rule

Wave 4 creates test files and CI validators. It does NOT edit production
runtime code; it only consumes what Waves 1-3 shipped plus synthetic fixtures
for closeout-honesty rules. It must not require Wave 5 closeout corrections to
be green.

Every test added in Wave 4 must satisfy the pre/post criterion: **fails on
`main @ f06fe47` (the pre-Phase-5.5 baseline) and passes once the
corresponding Wave 1-3 work package lands.** If a test cannot fail against the
baseline, it is not a regression guard and must be rejected from this wave.
Exception: WP-140 uses synthetic closeout fixtures because real closeout
corrections land in Wave 5; those fixture tests must fail on intentionally bad
fixtures and pass on valid fixtures.

Wave 4 depends on:
- Waves 1-3 having shipped at least the skeleton code and schemas
- Wave 0's closeout honesty standard (WP-119) for the validator in WP-140

---

## WP-136 — Runtime Integrity Regression Suite

Add regression tests for Wave 1 findings (F-02, F-05, F-06, F-07).

New test files:
- `environment/tests/lib/export-snapshot-immutability.test.js` — covers WP-120
  - happy path: first write creates the snapshot; returned `existedBefore: false`
  - rerun with same `snapshotId` throws `ExportSnapshotAlreadyExistsError`;
    error message includes both the existing `createdAt` and the new
    `attemptId`; no temp-file leaks in `.vibe-science-environment/writing/exports/snapshots/`
  - concurrent write attempts: first succeeds, second throws; both writes
    leave the filesystem in a consistent state
- `environment/tests/flows/writing-seeds-immutable.test.js` — covers WP-121
  - calling `renderWritingSeeds()` twice for the same snapshotId raises the
    immutability error; the prior seed tree is intact after the failed rerun
  - a new snapshotId produces a new seed subtree; prior subtree untouched
- `environment/tests/control/session-snapshot-provenance.test.js` — covers WP-122
  - `sourceMode: 'kernel-backed'` when every kernel-dependent signal field was
    derived from a live reader and workspace-derived fields read successfully
  - `sourceMode: 'degraded'` when reader.dbAvailable is false; `unresolvedClaims`
    explicitly marked as fallback-zero rather than verified-zero
  - `sourceMode: 'mixed'` when the reader exists but a kernel-dependent field
    throws while another signal source succeeds
  - `signals.provenance.degradedReason` populated with a machine-readable string
- `environment/tests/control/budget-advisory.test.js` — covers WP-123
  - estimated cost below 80% of `maxUsd`: no advisory event
  - estimated cost ≥80% and <100%: `budget_advisory_entered` event recorded;
    attempt continues
  - estimated cost ≥100%: existing hard-stop path still fires (no regression)
  - missing `maxUsd`: advisory tier gracefully no-ops without crashing
- `environment/tests/integration/phase2-boundary.test.js` — covers WP-124
  - the repo is ESM; `require.cache` does not exist. Strategy is a
    static-source grep assertion: `fs.readFile('environment/flows/results.js',
    'utf8')` then assert `!/export-eligibility/u.test(content)` — verifies
    the import line WP-124 removed never re-appears (addresses audit P1-J).
  - packaging a bundle succeeds without any citation check calls: run the
    packaging flow with a reader whose `listCitationChecks` throws, assert no
    call path exercises it (today throws; post-fix: no throw).
  - when writing flow subsequently applies eligibility, result is identical to
    pre-fix behavior for the end-to-end case (snapshot-diff golden test).

Test conventions:
- each test file follows existing `environment/tests/**/*.test.js` patterns:
  `node --test`, `describe`/`test`, `assert.strictEqual`, per-test tmp project
  paths under `os.tmpdir()`
- no test file mocks the filesystem; all tests write to a real temp dir and
  clean up in `afterEach`
- test names match the finding ID they guard (`test('F-02: snapshot immutability
  rejects same-id rerun', ...)`)

Acceptance:
- all five test files added; each fails on baseline, passes after WP-120..WP-124
- `npm test` total count rises by the number of leaf tests added; CI reports
  the delta in the Phase 5.5 closeout

---

## WP-137 — Execution Surface Regression Suite

Add tests for Wave 2 findings (F-04, F-08, F-09).

New test files:
- `environment/tests/lib/task-registry.test.js` — covers WP-126
  - registry loads three seed entries from
    `environment/orchestrator/task-registry/*.json`
  - schema-invalid entry is rejected with a typed error naming the file
  - a duplicate `taskKind` across two files is rejected
  - cache behavior: second load does not re-read disk unless `{force: true}`
- `environment/tests/integration/execution-lane-multi-task.test.js` — covers WP-128
  - the execution lane runs `session-digest-export` (pre-existing behavior)
  - the execution lane runs `literature-flow-register` end-to-end through
    middleware, producing a `lane-runs.jsonl` record that cites the expected
    `artifactRefs`
  - the execution lane runs `memory-sync-refresh` and updates the memory
    mirror
  - unknown task kind still throws, classified as `contract-mismatch` and
    routed through recovery
- `environment/tests/integration/router-registry-driven.test.js` — covers WP-129
  - router classifies `"export session digest"` → `session-digest-export`
  - router classifies `"register paper"` → `literature-flow-register`
  - router classifies `"sync memory"` → `memory-sync-refresh`
  - ambiguous input (matches two entries) surfaces an escalation with both
    candidates listed
- `environment/tests/lib/local-subprocess-executor.test.js` — covers WP-130
  - successful subprocess invocation: stdin JSON round-trips through `node -e`
    echo, stdout JSON parsed, lane-run-record populated
  - `ENOENT` on missing binary: maps to `dependency-unavailable`
  - nonzero exit code: maps to `tool-failure`; stderr truncated to 4 KiB
    captured in the record
  - timeout: SIGTERM sent at 45s, SIGKILL at 47s, record status `escalated`
  - malformed stdout: `contract-mismatch`
  - env-var passthrough: only whitelisted keys forwarded; injected credential
    env var not present in subprocess environment
- `environment/tests/integration/review-gate-honesty.test.js` — covers WP-131
  - saved benchmark `orchestrator-execution-review-lineage` runs with
    `evidenceMode: "smoke-real-subprocess"` by default and writes a real
    subprocess log
  - setting `VRE_CODEX_CLI` to an empty path falls back to `mocked-review`
    mode AND writes the explicit disclosure field to
    `phase5-operator-validation.json`

Acceptance:
- all five test files added; each fails on baseline
- the `execution-lane-multi-task.test.js` and `router-registry-driven.test.js`
  files together guard F-08 against regression: any future removal of a
  registry entry breaks them
- `review-gate-honesty.test.js` guards F-04: the mocked-review path is
  reachable only when explicitly requested

---

## WP-138 — Agent Discipline Regression Suite

Add tests for Wave 3 finding (F-10).

New test files:
- `environment/tests/integration/cli-dispatcher.test.js` — covers WP-132 and
  WP-135
  - `node bin/vre flow-status` in a fresh repo writes a valid
    `session.json`, returns exit code 0
  - `node bin/vre nonexistent-command` returns exit code 2, lists available
    subcommands on stderr
  - `node bin/vre flow-status --bad-arg` returns exit code 3
  - middleware-refused case (e.g., locked attempt) returns exit code 4
  - cross-platform path normalization: all output paths use forward slashes
    regardless of host OS (covers win32 + posix)
- `environment/tests/lib/frontmatter-parser.test.js` — covers WP-133
  - parses v1 frontmatter (without `dispatch` block) and returns the
    agent-only flag
  - parses v2 frontmatter with nested `dispatch: { module, export, scope,
    wrappedByMiddleware }`
  - rejects frontmatter with missing required keys (`description`,
    `allowed-tools`, `model`)
  - tolerates extra unknown keys without crashing (forward-compat)

Acceptance:
- both test files added; fail on baseline, pass after WP-132 and WP-133 land

---

## WP-139 — Commands-To-JS Drift Validator

Ship the validator from WP-134 as a CI validator integrated into
`environment/tests/ci/run-all.js`.

New file: `environment/tests/ci/validate-commands-to-js.js`

Behavior:
- walks every `commands/*.md`
- extracts, for commands with a `dispatch` block, the declared `module` and
  `export`, verifies the file exists and the named export exists (via a static
  `import.meta` resolution check or a light parse of `export` keywords)
- extracts, for all commands, prose references matching the regex
  `Import\s+\w+.*\s+from\s+['"]environment\/([^'"]+)['"]` and verifies each
  cited file exists
- fails CI on: missing referenced file, missing named export in the `dispatch`
  block, drift between `dispatch.module` and any prose-cited module path
- logs to stdout with the same format as other validators in `tests/ci/`
- returns non-zero exit code on any failure

Add to `environment/tests/ci/run-all.js`:
- new entry in the validator list (alongside the existing 9)
- expected count in `validate-counts.js` updated from 9 validators to 10

Acceptance:
- renaming any flow helper's exported symbol without updating the command
  markdown produces a CI error
- the validator runs in <2 seconds across the current commands set
- false-negative tolerance: prose-only references without the literal
  `Import X from 'environment/...'` phrasing are tolerated (the `dispatch`
  block is the authoritative machine path)
- regression test: `environment/tests/ci/validate-commands-to-js.test.js`
  covers happy path, missing file, missing export, forward-slash/backslash
  normalization

---

## WP-140 — Closeout Honesty Validator

Implement and test the validator from WP-119. Do **not** register it in the
default CI list until Wave 5 after the historical closeouts are corrected; Wave
4 must stay green on its own.

New file: `environment/tests/ci/validate-closeout-honesty.js`

Behavior:
- walks every unique `blueprints/definitive-spec/implementation-plan/phase*-closeout.md`
  path and optionally `phase55-closeout.md` when explicitly supplied
- parses the Exit Gate table (Markdown table with columns `| # | Gate | Result
  | Evidence |`)
- enforces: every `Result` cell must be one of `PASS | PARTIAL |
  FALSE-POSITIVE | DEFERRED`
- enforces: every `Evidence` cell must contain at least one Markdown link
  (relative path) pointing to a file that exists in the repo
- enforces: no Result cell contains banned phrases (case-insensitive):
  `verified against documentation`, `implementation-complete with saved
  evidence` in a closeout whose Evidence column has any `null` metric field,
  `all saved` when the saved artifact contains only pass-stamp booleans
- enforces: every `FALSE-POSITIVE` line is followed within the document by a
  paragraph explaining the retraction and linking to the disproving evidence
- enforces: every `PARTIAL` and `DEFERRED` line links to a follow-up ticket id
  in a declared-follow-up section

Exit codes: 0 pass, 1 violations found, 2 parse error (closeout missing gate
table).

Registration policy:
- Wave 4 adds the file and its own unit tests only.
- Wave 4 may expose a manual npm script such as
  `validate:closeout-honesty`, but it does not add the validator to
  `run-all.js`.
- Wave 5 WP-148 registers it in `run-all.js` and updates
  `validate-counts.js`: 10 → 11 validators after the closeouts are corrected.

Acceptance:
- the validator's fixture tests cover the violations listed in the forensic
  audit (Gate 17 tautology, `null`-metric patterns in phase3, missing
  follow-up links, and duplicate path handling)
- manual run against the current closeouts may fail before Wave 5; that failure
  is expected and must be documented, not wired into default CI yet
- Phase 5.5 cannot exit until Wave 5 registers this validator and it passes on
  all six closeouts
- regression test: `environment/tests/ci/validate-closeout-honesty.test.js`
  uses synthetic fixtures to exercise every enforcement rule

---

## Parallelism

- WP-136 can start once WP-120..WP-124 skeleton APIs are declared.
- WP-137 can start once WP-126..WP-131 skeleton APIs are declared.
- WP-138 can start once WP-132, WP-133 skeletons are declared.
- WP-139 depends on WP-133 (frontmatter contract) and on the frontmatter
  parser library (WP-138 test dependency).
- WP-140 depends on WP-119 (honesty standard); it does NOT depend on Wave 5
  closeout corrections because it is fixture-tested and manual-only until
  WP-148.
- All five WPs may land in parallel branches as long as their corresponding
  Wave 1-3 work packages have merged.

---

## Six Implementation Questions (wave-level answer)

1. **How does it enter the system?** Via `npm test` (test files) and `npm run
   validate` (new validators registered in `run-all.js`).
2. **Where does its state live?** No new persistent state; test files and CI
   validators read the repo.
3. **Who reads that state?** CI (GitHub Actions, `npm run check`), developers
   running `npm test` locally.
4. **Who writes that state?** Only Waves 1-3 (runtime) write the state these
   tests observe; closeout-honesty tests use synthetic fixtures until Wave 5.
5. **How is it tested or validated?** Every validator has its own regression
   test; every regression test is itself a regression guard that fails on
   baseline.
6. **How does it degrade without harming the kernel?** No kernel writes; if a
   validator crashes, CI fails loud, not silent. The kernel sibling is not
   required for any Wave 4 test (tests that need it are skipped with a clear
   reason).

---

## Exit Condition

Wave 4 is complete when:
- five regression test files are present (WP-136, WP-137, WP-138)
- each regression test fails on `main @ f06fe47` and passes after its
  corresponding Wave 1-3 fix
- `validate-commands-to-js.js` is registered as a CI validator
- `validate-closeout-honesty.js` exists with fixture tests but is not yet in
  the default CI validator list
- `validate-counts.js` expects 10 validators (up from 9)
- `npm run check` reports a test count delta and a validator count delta in
  the commit message for the Wave 4 landing
- no test introduced in Wave 4 is marked `skip` or `todo`
