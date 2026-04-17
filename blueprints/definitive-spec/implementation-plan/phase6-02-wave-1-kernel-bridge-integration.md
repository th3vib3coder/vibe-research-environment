# Phase 6 Wave 1 — Kernel Bridge Integration

**Goal:** Ship the first real kernel-backed code path in VRE. Replace the three
tautological compatibility fixtures with a live probe that spawns the sibling
kernel's `plugin/scripts/core-reader-cli.js`, and prepare the Gate 17 upgrade
package for Wave 4. Closes gap G-03 (kernel bridge never exercised) and primes
G-01 (Gate 17 PARTIAL) for closeout.

---

## Scope Rule

Wave 1 implements only what WP-150 (Wave 0) froze:
- one new helper module `environment/lib/kernel-bridge.js`
- one new integration test using a fake-sibling fixture AND optional live
  sibling via `VRE_KERNEL_PATH`
- one new compatibility probe that actually touches the kernel surface
- one regression guard ensuring `middleware.deriveSignals` stays honest when
  the bridge is degraded
- one closeout-preparation bundle (text diff, follow-up retirement plan,
  evidence manifest, downgrade path) — the closeout edit itself lands in Wave 4

Out of scope:
- any change to kernel-side code under `../vibe-science/`
- the real-provider executor (Wave 2)
- adding new projections beyond the nine already frozen in WP-150
- semver/version assertion against the sibling (Wave 2+ consideration, see
  open questions)

---

## WP-155 — `environment/lib/kernel-bridge.js` Helper Module

Implement the WP-150 kernel-bridge contract as a standalone runtime module
that is the ONLY place in VRE allowed to spawn `core-reader-cli.js`. This
consolidates two pre-existing spawn patterns into one typed surface:
- the ad-hoc `callCoreReaderCli` + `resolveDefaultReader` in `bin/vre:111-168`
- the `spawn(process.execPath, [...])` pattern in
  `environment/evals/measure-context-baseline.js:55-106`

New code mirrors the `measure-context-baseline.js` spawn ergonomics
(stdin-JSON, stdout-JSON, stderr capture, typed error on non-zero exit) but
produces a reader whose shape matches the existing typed-duck consumed by
`middleware.deriveSignals`, `execution-lane.js`, `review-lane.js`, and the
`bin/vre` dispatcher.

### Deliverables

- `environment/lib/kernel-bridge.js` exporting:
  - `resolveKernelReader({ kernelRoot, timeoutMs, envPassthrough })` →
    reader object
  - `KernelBridgeUnavailableError` — kernel sibling not present (absent
    `VRE_KERNEL_PATH`, missing `core-reader-cli.js`, or `ENOENT` on spawn)
  - `KernelBridgeContractMismatchError` — envelope did not match
    `{ok, projection, projectPath, data}` shape OR projection name in
    envelope disagrees with the requested call
  - `KernelBridgeTimeoutError` — per-projection call exceeded `timeoutMs`
    (default 10 s per WP-150); carries which projection timed out
- the reader's signature matches WP-150's typed-duck contract:
  `{ dbAvailable, listClaimHeads, listUnresolvedClaims, listCitationChecks,
    getProjectOverview, listLiteratureSearches, listObserverAlerts,
    listGateChecks, getStateSnapshot, close() }`
- graceful degradation: if `kernelRoot` is absent OR
  `<kernelRoot>/plugin/scripts/core-reader-cli.js` does not exist, return
  the degraded sentinel `{ dbAvailable: false, error: '<reason>' }` that
  matches the existing sentinel from `bin/vre:140-156`

### Rules / Contract

Function signature (sync entry, async projection calls):

```
async function resolveKernelReader({
  kernelRoot,                    // absolute path to sibling (vibe-science) root
  timeoutMs = 10_000,            // WP-150 default
  envPassthrough = []            // extra env keys beyond DEFAULT_ENV_WHITELIST
}) => Reader
```

Per-projection spawn pseudocode (mirrors
`measure-context-baseline.js:56-106`):

```
const cliPath = path.resolve(kernelRoot, 'plugin', 'scripts', 'core-reader-cli.js');
const child = spawn(process.execPath, [cliPath, projectionName], {
  cwd: kernelRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: sanitizeEnv(envPassthrough),    // reuses DEFAULT_ENV_WHITELIST from
                                        // orchestrator/executors/local-subprocess.js:7-20
});
child.stdin.end(JSON.stringify({ projectPath, ...projectionArgs }));
// accumulate stdout; race against timeoutMs
// on close(0) → parse JSON envelope; assert shape; return envelope.data
// on close(!=0) → throw KernelBridgeContractMismatchError with stderr snippet
// on timer fire → SIGTERM, wait SIGKILL_GRACE_MS, then SIGKILL;
//                 throw KernelBridgeTimeoutError
```

Error class hierarchy:

```
class KernelBridgeError extends Error { name = 'KernelBridgeError' }
class KernelBridgeUnavailableError extends KernelBridgeError {}    // absent sibling
class KernelBridgeContractMismatchError extends KernelBridgeError {} // bad envelope
class KernelBridgeTimeoutError extends KernelBridgeError {}          // per-call timeout
```

Envelope contract (copied verbatim from WP-150):
`{ok: true, projection, projectPath, data}` on success,
`{ok: false, projection, error}` on failure. The bridge rejects envelopes
where `projection !== requestedProjectionName` with
`KernelBridgeContractMismatchError` — this is the guard that catches a
kernel sibling drifted from the contract.

Env var sanitization: the bridge passes only keys in `DEFAULT_ENV_WHITELIST`
(re-imported from `environment/orchestrator/executors/local-subprocess.js:7-20`)
plus any caller-supplied `envPassthrough`. `VRE_KERNEL_PATH` itself is NOT
passed to the child — the child is already told its own root via `cwd` and
the `projectPath` stdin payload.

No caching across calls (WP-150 rule): each projection re-spawns. A caller
that needs caching builds it OUTSIDE the bridge.

### Acceptance

- `environment/lib/kernel-bridge.js` implements the signature and error
  classes above with inline JSDoc citing WP-150
- unit tests under `environment/tests/lib/kernel-bridge.test.js` cover:
  - returns degraded sentinel when `kernelRoot` is undefined
  - returns degraded sentinel when CLI path does not exist
  - throws `KernelBridgeTimeoutError` when `timeoutMs` fires before child
    closes (use a blocking fixture stub)
  - throws `KernelBridgeContractMismatchError` when envelope has
    `{ok: true}` but no `data`, or when `projection` field mismatches
  - surfaces child stderr in error message (truncated like
    `MAX_STDERR_BYTES = 4 * 1024` from local-subprocess.js:5)
- `bin/vre:resolveDefaultReader` is NOT rewritten in this WP — refactoring it
  to consume the bridge is explicitly assigned to Wave 3 (WP-166)

### State ownership

- **enters via:** `import { resolveKernelReader } from 'environment/lib/kernel-bridge.js'`
  in Wave-1 tests; in Wave 3 by `bin/vre:resolveDefaultReader` (WP-166)
- **state lives at:** no durable state — the bridge is stateless; each call
  spawns fresh; the only persisted surface is the sibling's own
  `.claim-db.sqlite` which the bridge READS via the CLI
- **written by:** bridge never writes — kernel truth stays kernel-owned
- **read by:** Wave 3 `bin/vre:resolveDefaultReader`, middleware.deriveSignals,
  orchestrator lanes, eval harnesses, compatibility probe (WP-157)
- **tested how:** WP-156 integration test (fake-sibling fixture) +
  unit tests under `environment/tests/lib/kernel-bridge.test.js`
- **degrades how:** absent sibling → typed sentinel
  `{dbAvailable: false, error}`; spawn failure → typed error distinguishable
  by class; consumers keep their current Phase 5.7 degraded-mode fallback

---

## WP-156 — Integration Test `kernel-bridge.test.js` With Fake-Sibling Fixture

Ship the first VRE test that actually spawns `core-reader-cli.js`, using a
fake-sibling fixture checked into the test tree so the test passes on every
host. A second path opts into a REAL sibling checkout via `VRE_KERNEL_PATH`
for local-dev confidence.

### Deliverables

- `environment/tests/integration/kernel-bridge.test.js` with two test
  groups:
  - **fake-sibling group (mandatory, runs on every host):** spawns the
    bridge against a fixture at
    `environment/tests/fixtures/fake-kernel-sibling/` (see fixture shape
    below); asserts on every projection the reader exposes
  - **live-sibling group (opt-in):** runs only when `VRE_KERNEL_PATH` is
    set and `<VRE_KERNEL_PATH>/plugin/scripts/core-reader-cli.js` exists;
    otherwise emits a declared-skip line matching the Phase 1 skip-reason
    pattern (`t.skip('VRE_KERNEL_PATH not set; live kernel probe skipped')`)
- fixture at `environment/tests/fixtures/fake-kernel-sibling/plugin/scripts/core-reader-cli.js`:
  - minimal Node script, no external deps beyond stdlib
  - reads stdin JSON, reads first argv as projection name, writes a canned
    envelope `{ok: true, projection, projectPath, data: {...}}` for each of
    the nine projections in the WP-150 typed-duck contract
  - canned data is deterministic, schema-valid, and ENOUGH to satisfy the
    probe in WP-157 without being a full kernel replay (e.g.
    `listClaimHeads` returns one claim head matching the claim-head schema
    shape; `getStateSnapshot` returns one profile + one state-machine
    sequence)
  - the fixture also has a failure-mode branch triggered by setting
    projection name to `__bridge_test_timeout__` (sleep longer than 10 s)
    and `__bridge_test_bad_envelope__` (prints `{ok: true}` with no `data`)
    — these feed WP-155 unit coverage

### Rules / Contract

- fixture lives under `environment/tests/fixtures/` so it is NEVER confused
  with production code; path is asserted in the test to live under that
  prefix
- test uses `node:test` with `t.skip` for the live-sibling group (matches
  the skip-declaration style in `environment/evals/*` existing tests)
- cross-platform spawn note: the test invokes
  `process.execPath` against the fixture CLI identically on Windows and
  POSIX — both paths route through `child_process.spawn` with explicit
  `process.execPath`, never `shell: true`, per the
  `measure-context-baseline.js` precedent (shell-free, argv-explicit)
- path separators use `path.resolve` and `path.join` throughout — NO
  string concatenation with `/` so Windows CI passes
- the fake-sibling fixture does NOT depend on a `.claim-db.sqlite` — it
  serves canned JSON regardless of database presence, which makes the test
  hermetic and cacheable
- the test must assert the **envelope** shape, not just the final data:
  the stdout must match `^{.*}$`, `envelope.ok === true`,
  `envelope.projection === requested`, `envelope.projectPath === <abs>`,
  `envelope.data !== undefined`

### Acceptance

- fake-sibling group passes on linux-x64, darwin-arm64, windows-latest
  (asserted by running locally; CI verification in Wave 3)
- live-sibling group emits a declared skip when `VRE_KERNEL_PATH` is unset,
  observable in `node --test` output
- running with `VRE_KERNEL_PATH=../vibe-science` against the real sibling
  passes on the Carmine-local dev box (evidence artifact saved to
  `.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json`)
- the test fails loudly if the fake-sibling fixture ever drifts from the
  WP-150 typed-duck contract (catches contract regression)

### State ownership

- **enters via:** `node --test environment/tests/integration/kernel-bridge.test.js`
- **state lives at:** the fake-sibling fixture directory (checked in); the
  optional artifact at `wave1-live-kernel-run.json` (generated only when
  live-sibling group ran and succeeded)
- **written by:** fixture author during WP-156 implementation; artifact
  written only by Carmine-local runs when opting into live sibling
- **read by:** CI `npm run check` (fake-sibling group), Wave 3 validator
- **tested how:** the test IS the test — it is self-validating via the
  envelope-shape assertions
- **degrades how:** missing fixture → test fails fatally (fixture is a
  mandatory repo asset); live-sibling absent → declared skip, no silent
  pass

---

## WP-157 — Gate 17 Real Probe (`kernel-governance-probe.test.js`)

Replace the tautological behavior of the three existing compatibility tests
(`profiles.test.js`, `state-machine.test.js`, `config-protection.test.js`)
with a live probe that interrogates the sibling kernel's governance surface
via the bridge. The three existing tests are renamed to clearly label them
as "static contract documentation" rather than "governance verification."

### Deliverables

- new test `environment/tests/compatibility/kernel-governance-probe.test.js`
  that:
  - imports `resolveKernelReader` from WP-155
  - resolves the reader against `VRE_KERNEL_PATH` OR
    `environment/tests/fixtures/fake-kernel-sibling/` (default in CI)
  - calls THREE real projections to verify three governance claims from
    `phase1-closeout.md:80`:
    1. `getProjectOverview()` → asserts the returned `profile` field is
       one of the profile enum values documented in `profiles.test.js`
       (`'default'` | `'strict'`)
    2. `getStateSnapshot()` → asserts the returned state-machine transitions
       conform to the `validSequences` table in `state-machine.test.js`
       (claim state sequence `CREATED → R2_REVIEWED → PROMOTED|KILLED|DISPUTED`)
    3. `listGateChecks()` → asserts the kernel exposes, at minimum, the
       `schema_file_protection` non-negotiable hook referenced by
       `config-protection.test.js:3-8`
  - fails the test (not skip) if any of the three projections returns a
    shape that DISAGREES with the static compatibility tests — the failure
    message must cite both the kernel's actual value and the VRE-side
    expected value so a reader knows which side drifted
- the three existing compatibility tests are moved under
  `environment/tests/compatibility/contract-docs/` with a top-of-file
  comment:
  ```
  // Static contract documentation: asserts VRE's expectations of the
  // kernel governance surface. Runs without kernel access. Governance
  // verification against the live kernel is performed by
  // kernel-governance-probe.test.js via the kernel-bridge helper.
  ```
- (rename is optional if the three files stay in place with only the
  comment added; rename is preferred for discoverability)

### Rules / Contract

- the probe MUST read the fake-sibling fixture by default (so
  `npm run check` stays hermetic), and MUST additionally run against the
  real sibling whenever `VRE_KERNEL_PATH` is set
- the probe uses EXACTLY the projections listed above — no new projection
  is added; this keeps the probe aligned with WP-150's frozen typed-duck
- the probe asserts on three separate claims so a single kernel drift
  cannot silently pass two unrelated governance assertions
- the probe does NOT re-implement the governance logic — it only asks the
  kernel what the kernel thinks, and compares against the static VRE side

### Acceptance

- `node --test environment/tests/compatibility/kernel-governance-probe.test.js`
  passes against the fake-sibling fixture
- the probe FAILS when the fake-sibling fixture is deliberately edited to
  return `profile: 'bogus'` or an illegal state sequence — verified by a
  local mutation test described in Wave 3 (WP-167)
- the three existing compatibility tests are renamed OR annotated per the
  comment template above, and are no longer cited as evidence for Gate 17

### State ownership

- **enters via:** `npm run check` runs the node:test runner over
  `environment/tests/compatibility/*.test.js`
- **state lives at:** no durable state; probe output is stdout-only
- **written by:** nothing — probe is read-only
- **read by:** CI, Wave 4 closeout-evidence assembly (WP-171)
- **tested how:** the probe tests itself by running on every CI invocation;
  robustness verified by WP-167 mutation coverage in Wave 3
- **degrades how:** live kernel absent → probe runs against fake-sibling
  fixture (mandatory coverage); fake-sibling missing → test fails fatally;
  kernel drift → test fails with named drift message

---

## WP-158 — Degraded-Mode Honesty Regression Test

Prove that adding the kernel bridge does NOT regress the Phase 5.5 WP-122
degraded-mode-honesty invariant. Specifically: when the bridge returns the
degraded sentinel OR throws, `middleware.deriveSignals` must continue to
label `signals.provenance.sourceMode === 'degraded'` and must NOT
silently slot a zero value that looks kernel-backed.

### Deliverables

- new test `environment/tests/control/middleware-kernel-bridge-degraded.test.js`
- two cases:
  1. **absent sibling**: construct a reader via `resolveKernelReader({})`
     with no `kernelRoot` → reader is the degraded sentinel; invoke
     `deriveSignals(projectPath, reader)`; assert the returned object:
     ```
     {
       unresolvedClaims: 0,
       provenance: {
         sourceMode: 'degraded',
         degradedReason: <non-null string mentioning 'kernel' or 'sibling'>,
         lastKernelContactAt: null
       }
     }
     ```
  2. **bridge throws**: construct a reader where `listUnresolvedClaims()`
     returns a rejected promise (simulates spawn failure / timeout); invoke
     `deriveSignals`; assert the returned object has
     `provenance.sourceMode === 'mixed'` (per `deriveSignals:148`
     `kernelSignalProvenance = 'mixed'` when catch path runs) and
     `degradedReason === <error message>`

### Rules / Contract

Anchor to the CURRENT logic in `environment/control/middleware.js:126-193`,
specifically:
- lines 141-155: the try/catch that resolves `unresolvedClaims` and sets
  `kernelSignalProvenance` to `'kernel'`, `'mixed'`, or `'fallback'`
- lines 165-180: `sourceMode` derivation via `resolveSignalSourceMode`
- lines 183-193: the enum mapping `kernel→kernel-backed`,
  `mixed|explicit→mixed`, default→`degraded`

The test MUST NOT rewrite or shadow this logic — it consumes the real
`deriveSignals` export and asserts only on the observed output. The test's
purpose is precisely to pin the behavior so Wave 3 refactors (e.g. wiring
the bridge through `bin/vre` per WP-166) cannot weaken it.

### Acceptance

- test passes in all three cases (absent sibling, bridge throws, bridge
  returns a valid zero count) with provenance correctly labeled in each
- a deliberate regression — e.g. setting
  `provenance.sourceMode: 'kernel-backed'` when the reader is the sentinel —
  causes the test to fail with a specific assertion message
- the test is executable standalone (`node --test
  environment/tests/control/middleware-kernel-bridge-degraded.test.js`)
  without requiring `VRE_KERNEL_PATH`

### State ownership

- **enters via:** `npm run check`
- **state lives at:** no durable state; test is pure
- **written by:** nothing
- **read by:** CI, Wave 3 validator coverage
- **tested how:** self-validating assertion; regression tested by a
  follow-up in Wave 3 that tries (and should fail) to cheat the provenance
- **degrades how:** test cannot "degrade" — it IS the degradation-mode
  regression guard

---

## WP-159 — Gate 17 Closeout-Upgrade Preparation Package

Produce the artifacts Wave 4 (WP-171, the Gate 17 closeout edit) will consume.
This WP is deliberately NOT the closeout edit itself — it assembles the
inputs so the edit lands cleanly in Wave 4 once the Wave 1 runtime + Wave 2
provider evidence is in hand.

### Deliverables

A single markdown artifact at
`.vibe-science-environment/operator-validation/artifacts/wave1-gate17-upgrade-package.md`
containing four sections:

1. **Exact before/after text diff for `phase1-closeout.md:80`**

   Current line (quoted verbatim from `phase1-closeout.md:80`):
   ```
   | 17 | Kernel governance prerequisites automatically verified | PARTIAL | [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js); follow-up FU-55-001 |
   ```

   Proposed PASS-path replacement (used iff Wave 2 provider evidence + Wave 1
   probe both land):
   ```
   | 17 | Kernel governance prerequisites automatically verified | PASS | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) spawns the sibling kernel via [kernel-bridge.js](../../../environment/lib/kernel-bridge.js) and verifies profile, state-machine, and protected-config claims live; evidence at [wave1-live-kernel-run.json](../../../.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json). FU-55-001 retired. |
   ```

   Plus an addendum to the "Phase 5.5 Correction Note — Gate 17" section
   (`phase1-closeout.md:86-97`) noting the Phase 6 Wave 1 probe supersedes
   the 5.5 PARTIAL grade.

2. **Follow-up ticket retirement plan**

   - if probe passes against live kernel: **close `FU-55-001`** with
     explicit citation of the probe test and the live-kernel artifact
   - if probe passes only against fake-sibling (live sibling unavailable at
     closeout time): **reopen `FU-55-001` as `FU-6-001`** with scope:
     "run kernel-governance-probe against a real sibling checkout on a
     second host, archive the run artifact"

3. **Evidence manifest**

   Columns: evidence name | path | projection call cited | assertion cited
   | status at Wave 1 end.

   Seed rows:
   - `kernel-governance-probe` |
     `environment/tests/compatibility/kernel-governance-probe.test.js` |
     `getProjectOverview`, `getStateSnapshot`, `listGateChecks` |
     profile enum, valid claim sequences, protected-config hook |
     GREEN (fake-sibling) / PENDING (live sibling)
   - `kernel-bridge-integration-test` |
     `environment/tests/integration/kernel-bridge.test.js` |
     all nine WP-150 projections | envelope shape + data shape |
     GREEN (fake-sibling) / PENDING (live sibling)
   - `degraded-mode-honesty-regression` |
     `environment/tests/control/middleware-kernel-bridge-degraded.test.js` |
     N/A (no kernel call) | provenance.sourceMode label | GREEN
   - `live-kernel-run-artifact` |
     `.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json` |
     generated by test when `VRE_KERNEL_PATH` set | envelope captures from
     real sibling | PENDING (requires Carmine-local run)

4. **Downgrade path (if any of the above is inconclusive)**

   Proposed PARTIAL-path replacement for Gate 17 (used iff live probe is
   inconclusive):
   ```
   | 17 | Kernel governance prerequisites automatically verified | PARTIAL | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) against fake-sibling fixture verifies the three governance claims; live-sibling verification deferred to FU-6-002 |
   ```

   With a new follow-up `FU-6-002`: "capture kernel-governance-probe run
   artifact against live sibling on a non-Carmine host; attach to
   closeout." The old FU-55-001 stays closed (replaced, not merged).

### Rules / Contract

- no file under `blueprints/definitive-spec/implementation-plan/` is edited
  in Wave 1 — that is Wave 4 work
- the package is pure preparation: the Wave 4 author copies the chosen
  diff (PASS path or PARTIAL path) into `phase1-closeout.md` and
  simultaneously updates any closeout-honesty manifest that tracks
  `FU-55-001`
- the package explicitly names Carmine-local runs as the evidence source
  for the live-sibling path — no other host is assumed

### Acceptance

- `wave1-gate17-upgrade-package.md` exists with the four sections above
- the exact line number (`phase1-closeout.md:80`) is cited in the package
- both PASS and PARTIAL replacement diffs are present, so Wave 4 has a
  branch point regardless of how the live probe resolves
- the follow-up retirement plan names FU-55-001, FU-6-001, FU-6-002
  explicitly with exit criteria for each

### State ownership

- **enters via:** Wave 1 implementer writes the package alongside the
  other Wave 1 deliverables
- **state lives at:**
  `.vibe-science-environment/operator-validation/artifacts/wave1-gate17-upgrade-package.md`
- **written by:** Wave 1 implementer; Wave 4 reads it to apply the diff
- **read by:** WP-171 (Wave 4 closeout author), adversarial reviewer for
  Phase 6 exit gate
- **tested how:** not testable code; a WP-170 validator in Wave 3 may
  assert the package file exists and has the four required section
  headings
- **degrades how:** if any evidence row is PENDING at Wave 4 open, Wave 4
  uses the PARTIAL diff instead of the PASS diff — not a regression, a
  documented branch

---

## Parallelism

- WP-155 runs first; WP-156 and WP-158 depend on the bridge module
  existing
- WP-156 (integration test) and WP-157 (governance probe) can run in
  parallel once WP-155 is merged — they share the fake-sibling fixture but
  cover disjoint surfaces
- WP-158 (degraded-mode regression) can run in parallel with WP-156/WP-157
  because it depends only on the bridge module and the existing middleware
- WP-159 (closeout preparation) can start immediately — it does not depend
  on the other WPs compiling, only on the final test names and artifact
  paths being stable per Wave 0 WP-150

Max parallel fan-out: 3 (WP-156, WP-157, WP-158 after WP-155 lands).

---

## Exit Condition

Wave 1 is complete when ALL of the following hold:

1. `environment/lib/kernel-bridge.js` exists with the three error classes,
   and its unit tests pass; `npm run check` total remains ≥ 420 tests.
2. `environment/tests/integration/kernel-bridge.test.js` passes against
   the fake-sibling fixture on every CI platform; the live-sibling group
   emits a declared skip when `VRE_KERNEL_PATH` is unset.
3. `environment/tests/compatibility/kernel-governance-probe.test.js`
   passes against the fake-sibling fixture AND the three existing
   compatibility tests are either renamed under `contract-docs/` or
   carry the static-contract comment header.
4. `environment/tests/control/middleware-kernel-bridge-degraded.test.js`
   passes and a deliberate provenance-mislabel edit to `middleware.js`
   would make it fail (regression-guard property).
5. `wave1-gate17-upgrade-package.md` is checked in with PASS/PARTIAL diffs
   and a named follow-up retirement plan.

---

## Open Questions (Deferred)

- **Projection caching within one `runWithMiddleware` call.** The bridge
  re-spawns per projection per WP-150 rule. A single operator invocation
  that calls `listUnresolvedClaims` five times would spawn five children.
  If benchmarks in Wave 3 show this is costly, a caller-layer cache in
  `middleware.js` can hold results for the duration of one attempt without
  changing the bridge contract. Deferred to Wave 3 benchmarking.
- **Sibling semver assertion.** The bridge does not assert the sibling
  kernel's version against VRE. A drift-catch could be added by calling a
  hypothetical `getKernelVersion()` projection and comparing against a
  pinned range, but that projection does not exist in WP-150's
  typed-duck. Deferred to Phase 7 or later, pending a kernel-side version
  contract.
