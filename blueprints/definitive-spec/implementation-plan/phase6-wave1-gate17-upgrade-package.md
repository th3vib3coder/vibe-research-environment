# Phase 6 Wave 1 — Gate 17 Closeout-Upgrade Package (WP-159)

This document is **not** the Phase 1 closeout edit itself. It assembles the
inputs Wave 4 (WP-171) will consume to apply the Gate 17 regrade once the
Wave 2 provider evidence and the Wave 1 probe evidence both land.

**Path note:** WP-159's original spec text
(`phase6-02-wave-1-kernel-bridge-integration.md:403`) places this package at
`.vibe-science-environment/operator-validation/artifacts/wave1-gate17-upgrade-package.md`.
The Phase 6 Wave 1 implementer was instructed to place the package under
`blueprints/definitive-spec/implementation-plan/` so that the plan tree
stays self-contained. Wave 4 can copy or symlink as needed.

---

## 1. Exact Before/After Text Diff For `phase1-closeout.md:80`

### Current line (verbatim from phase1-closeout.md:80)

```
| 17 | Kernel governance prerequisites automatically verified | PARTIAL | [profiles.test.js](../../../environment/tests/compatibility/profiles.test.js), [state-machine.test.js](../../../environment/tests/compatibility/state-machine.test.js); follow-up FU-55-001 |
```

### Proposed PASS-path replacement

Used iff Wave 2 provider evidence **and** Wave 1 probe both land with
live-sibling evidence recorded at `wave1-live-kernel-run.json`.

```
| 17 | Kernel governance prerequisites automatically verified | PASS | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) spawns the sibling kernel via [kernel-bridge.js](../../../environment/lib/kernel-bridge.js) and verifies profile, state-machine, and protected-config claims live; evidence at [wave1-live-kernel-run.json](../../../.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json). FU-55-001 retired. |
```

### Addendum to the "Phase 5.5 Correction Note — Gate 17" section

Appended after `phase1-closeout.md:97`:

```
## Phase 6 Wave 1 Correction Note — Gate 17

Gate 17 was held at PARTIAL through Phase 5.5 because the VRE compatibility
tests (profiles.test.js, state-machine.test.js, config-protection.test.js)
were static contract documentation, not a live kernel probe. Phase 6
Wave 1 (WP-155..WP-157) replaced this with a real kernel-bridge probe
that spawns the sibling `plugin/scripts/core-reader-cli.js` and asserts
three governance claims (profile enum, valid claim-state sequences,
protected-config hook). The Phase 5.5 PARTIAL grade is therefore
superseded. See the evidence manifest below for the pass-condition set.
```

---

## 2. Follow-Up Ticket Retirement Plan

### If probe passes against live kernel (PASS path)

- **Close `FU-55-001`** with explicit citation of
  `environment/tests/compatibility/kernel-governance-probe.test.js`
  and the live-kernel artifact at
  `.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json`.
- No new follow-up is required.

### If probe passes only against fake-sibling fixture (PARTIAL path)

- **Retire `FU-55-001`** (replaced, not merged) — the original scope
  ("add a VRE compatibility test that runs against the sibling") has
  landed with the Wave 1 probe.
- **Open `FU-6-001`** with scope:
  > Run `kernel-governance-probe.test.js` against a real sibling checkout
  > on a non-Carmine host, archive the run artifact under
  > `.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json`,
  > and upgrade Gate 17 from PARTIAL to PASS per the PASS-path diff above.
- **Open `FU-6-002`** with scope:
  > Capture the `kernel-governance-probe` run artifact against live sibling
  > on a second host (CI-backed if possible); attach to the Phase 6 closeout.

### Exit criteria for each ticket

| ticket | exit criterion |
|---|---|
| FU-55-001 | Closed iff `kernel-governance-probe.test.js` exists AND a live-kernel run artifact is archived (PASS path) OR retired-replaced (PARTIAL path) |
| FU-6-001  | Closed iff `wave1-live-kernel-run.json` is written by a non-Carmine host |
| FU-6-002  | Closed iff a second-host artifact is attached to the Phase 6 closeout |

---

## 3. Evidence Manifest

| evidence name | path | projection call cited | assertion cited | status at Wave 1 end |
|---|---|---|---|---|
| kernel-governance-probe | `environment/tests/compatibility/kernel-governance-probe.test.js` | `getProjectOverview`, `getStateSnapshot`, `listGateChecks` | profile enum, valid claim sequences, `schema_file_protection` hook | GREEN (fake-sibling) / PENDING (live sibling) |
| kernel-bridge-integration-test | `environment/tests/integration/kernel-bridge.test.js` | all nine WP-150 projections | envelope shape + projection match + data presence | GREEN (fake-sibling) / PENDING (live sibling) |
| kernel-bridge-unit-tests | `environment/tests/lib/kernel-bridge.test.js` | N/A (unit) | error taxonomy (Unavailable/ContractMismatch/Timeout) + degraded sentinel + env hygiene | GREEN |
| degraded-mode-honesty-regression | `environment/tests/control/middleware-kernel-bridge-degraded.test.js` | N/A (no kernel call) | `provenance.sourceMode` label (degraded vs mixed vs kernel-backed) | GREEN |
| fake-sibling-fixture | `environment/tests/fixtures/fake-kernel-sibling/plugin/scripts/core-reader-cli.js` | canned envelopes for nine projections + five trigger projections | envelope shape conformance | GREEN |
| live-kernel-run-artifact | `.vibe-science-environment/operator-validation/artifacts/wave1-live-kernel-run.json` | generated by integration test when `VRE_KERNEL_PATH` set | envelope captures from real sibling | PENDING (requires Carmine-local run) |

---

## 4. Downgrade Path (if evidence is inconclusive)

Used iff Wave 2 provider evidence lands but the live-kernel probe is
inconclusive (no Carmine-local run, or live sibling disagrees with fake
sibling).

### Proposed PARTIAL-path replacement for `phase1-closeout.md:80`

```
| 17 | Kernel governance prerequisites automatically verified | PARTIAL | [kernel-governance-probe.test.js](../../../environment/tests/compatibility/kernel-governance-probe.test.js) against fake-sibling fixture verifies the three governance claims; live-sibling verification deferred to FU-6-002 |
```

### Associated follow-up

- Open `FU-6-002`: "capture kernel-governance-probe run artifact against
  live sibling on a non-Carmine host; attach to closeout." The old
  FU-55-001 stays closed (replaced, not merged).

### Decision rule

Wave 4's closeout author chooses PASS vs PARTIAL by inspecting
`wave1-live-kernel-run.json`:

- file present + all three claims green → PASS diff
- file absent OR any claim red → PARTIAL diff

---

## Appendix A — File Inventory For Wave 1 Implementation

Files created by this wave (WP-155/156/157/158/159):

| path | WP |
|---|---|
| `environment/lib/kernel-bridge.js` | WP-155 |
| `environment/tests/lib/kernel-bridge.test.js` | WP-155 |
| `environment/tests/fixtures/fake-kernel-sibling/plugin/scripts/core-reader-cli.js` | WP-156 |
| `environment/tests/integration/kernel-bridge.test.js` | WP-156 |
| `environment/tests/compatibility/kernel-governance-probe.test.js` | WP-157 |
| `environment/tests/control/middleware-kernel-bridge-degraded.test.js` | WP-158 |
| `blueprints/definitive-spec/implementation-plan/phase6-wave1-gate17-upgrade-package.md` | WP-159 (this file) |

Files modified (count updates only — no runtime changes):

| path | what changed |
|---|---|
| `environment/tests/ci/validate-counts.js` | bumped `libTests`, `integrationTests`, `controlTests`, `compatibilityTests` |

No other files were touched in Wave 1. `bin/vre` refactoring to consume the
bridge is deferred to WP-166 (Wave 3).
