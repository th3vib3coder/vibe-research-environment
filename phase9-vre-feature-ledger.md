# Phase 9 VRE Feature Ledger

## Purpose

This is the append-only VRE-side ledger for Phase 9 implementation.

It answers, at any point during Phase 9 implementation and afterward:

> Which VRE features were added, in which wave, in which files, and with
> which tests?

This file is updated in the same patch as every Phase 9 VRE code change.
It is never manually edited to make history prettier.

Companion files:

- **Spec-side status ledger**:
  `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
  tracks which spec contract clusters are `not-started`, `in-progress`,
  `implemented`, or `verified`.
- **Rotation index**: `phase9-vre-feature-ledger-index.md` (this directory)
  lists all ledger files (active + archived) by seq range and dates.
- **Machine surface inventory** (to land at Wave 0 `T0.4a-ter`):
  `phase9-vre-surface-index.json` is regenerated from the codebase and
  cross-checked against this ledger.

## Update Rules

- Append new rows. Do NOT rewrite old rows.
- If a past row is wrong, append a correction row that references the old
  `seq` and explains the superseding state.
- Co-update the spec-side status ledger in the same patch.
- CI enforcement: `npm run check:phase9-ledger` (owned by Wave 0 `T0.4a-bis`
  and extended by `T0.4a-ter`) fails if this ledger is not updated in the
  same patch as a covered VRE code change, or if cross-check against the
  machine surface inventory raises `E_LEDGER_MISSING_SURFACE` /
  `E_LEDGER_ORPHAN_ROW` / `E_LEDGER_INDEX_INCONSISTENT`.
- Rotation: once the active ledger reaches `400` rows, the next pass that
  appends new VRE feature rows MUST prepare the successor file; rotation is
  mandatory no later than `500` rows. File size (`250 KB`) remains a
  secondary safety trigger if hit earlier, and operator request may trigger
  earlier rotation for readability. Successors continue as
  `phase9-vre-feature-ledger-02.md`, `-03.md`, and so on; rotation is atomic
  and monotonic `seq` is preserved across files.

## Row Contract

| Field | Meaning |
|---|---|
| `seq` | Monotonic row id. Starts at `000`. |
| `date` | Landing date (ISO-8601). |
| `wave` | Wave that owns the change: `pre-wave-0`, `0`, `1`, `2`, `3`, `4`, `4.5`, `5`, `6`. |
| `feature id` | Short stable identifier, e.g. `W0-CLI-PARSER`, `W2-OBJECTIVE-POINTER`. |
| `surface` | Human-readable name of the feature. |
| `paths` | Main VRE code paths added or changed. |
| `flags` | Feature flags involved (`VIBE_PHASE9_ENABLED`, etc.), or `none`. |
| `tests` | Concrete tests or acceptance artifacts proving the surface, or `TBD` if deferred. |
| `status` | `ready` (surface exists, no runtime features yet), `implemented` (code landed, tests partial), or `verified` (code landed + required tests green). |
| `notes` | Short note for drift, rollback, correction references, or follow-up context. |

## Ledger

| seq | date | wave | feature id | surface | paths | flags | tests | status | notes |
|---|---|---|---|---|---|---|---|---|---|
| 000 | 2026-04-21 | 0 | TRACKING-BOOTSTRAP | Phase 9 VRE feature-ledger infrastructure | `phase9-vre-feature-ledger.md`, `phase9-vre-feature-ledger-index.md` | none | none | implemented | Bootstrap. Created by Wave 0 `T0.1a` after explicit operator GO recorded as Round 15 in both review logs (`../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/12-spec-self-review-log.md`, `../vibe-science/blueprints/private/phase9-implementation-plan/11-plan-self-review-log.md`). These two files are the first Phase 9 artifacts in the VRE repo. No Phase 9 runtime features have landed yet. Wave 0 tasks `T0.2`, `T0.3`, `T0.4`, `T0.4a`, `T0.4a-bis`, `T0.4a-ter`, `T0.5`, `T0.6` will append their rows here as they land. |
| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/check-phase9-ledger.test.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | `node --test environment/tests/ci/check-phase9-ledger.test.js`; `npm run check:phase9-ledger` | implemented | Wave 0 `T0.4a-bis`. Superseded in part by seq 002 correction: this row was initially marked `verified`, but the test suite covered only explicit mode and the checker silently skipped spec-ledger enforcement in discovered mode. See seq 002 (correction) and seq 003 (hardening). |
| 002 | 2026-04-21 | 0 | CORRECTION-001 | Ledger-row correction: downgrade seq 001 status and record partial-verify finding | `phase9-vre-feature-ledger.md` | none | none (correction row, no new tests) | implemented | Correction of seq 001. Root cause: `check-phase9-ledger.js` had `mustSeeSpecLedgerUpdate = mode === 'explicit'` on line 266, causing the spec-ledger enforcement to silently skip in discovered mode (local `npm run validate`). The test suite had 5 tests, all explicit-mode. Discovered mode was untested. The `verified` status on seq 001 was an over-claim. seq 003 lands the hardening fix. |
| 003 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK-HARDENING | Harden ledger CI enforcement to fire in discovered mode; add discovered-mode test coverage | `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/check-phase9-ledger.test.js`, `phase9-vre-feature-ledger.md` | none | `node --test environment/tests/ci/check-phase9-ledger.test.js` (7/7 pass, including 2 new discovered-mode tests); `npm run check:phase9-ledger` | implemented | Round 17. Removes the `mustSeeSpecLedgerUpdate = mode === 'explicit'` gating so spec-ledger enforcement fires unconditionally. Adds `options.discoveryOverride` test injection so discovered-mode fail-closed can be exercised without a live git workspace. Adds 2 new tests. Error message now includes triggering paths and mode for diagnostics. Superseded-in-part by seq 004: the hardening introduced a legitimate false-red for `npm run validate` because the spec ledger is gitignored in its host repo; seq 004 adds gitignore-aware handling. |
| 004 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK-GITIGNORE-AWARE | Make discovered-mode spec-ledger check gitignore-aware with loud diagnostic instead of false-red | `environment/tests/ci/check-phase9-ledger.js`, `phase9-vre-feature-ledger.md` | none | `node --test environment/tests/ci/check-phase9-ledger.test.js` (7/7 pass); `npm run validate` (emits stderr diagnostic, exits 0); `npm run check:phase9-ledger -- --changed-file=... (explicit mode remains strict)` | verified | Round 17 refinement. The seq 003 hardening correctly removed the unconditional silent-skip but created a false-red for local `npm run validate`: the spec-side ledger lives under `blueprints/private/` which is gitignored in the vibe-science repo, so discovered mode (git diff + git status) cannot see its updates. Seq 004 adds `isSpecLedgerInGitignoredTree()` helper (walks up to find `.git`, calls `git check-ignore`). When discovered mode detects the spec ledger is in a gitignored tree, the check emits a loud stderr diagnostic explaining the limitation and skips only the spec-ledger requirement. Explicit mode (CI, or `--changed-file=...` args) remains strict. The diagnostic is NOT silent: operator sees it on every `npm run validate`. Closes the local UX false-red without weakening CI enforcement. |
| 005 | 2026-04-21 | 0 | LEDGER-HEADER-ROTATION-POLICY-SYNC | Align active VRE ledger header with the canonical 400-prepare / 500-rotate policy | `phase9-vre-feature-ledger.md` | none | none (document sync only) | implemented | Documentary correction. The active ledger header still said "exceeds 500 / 250 KB / operator request" while the canonical policy in `../vibe-science/blueprints/private/phase9-implementation-plan/13-implementation-tracking-discipline.md` had already been tightened to "prepare in the 400-500 row window, MUST rotate no later than 500". This row records the sync so the live VRE ledger and the frozen blueprint stop saying different things about rotation. No runtime surface changed. |
| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Machine-generated Phase 9 surface inventory and CI cross-check against ledger + rotation index | `package.json`, `environment/tests/ci/phase9-surface-index.js`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/check-phase9-ledger.test.js`, `environment/tests/ci/phase9-surface-index.test.js`, `environment/tests/ci/validate-counts.js`, `phase9-vre-surface-index.json` | none | `node --test environment/tests/ci/check-phase9-ledger.test.js environment/tests/ci/phase9-surface-index.test.js` (13/13 pass); `npm run build:surface-index`; `npm run validate`; `npm run check:phase9-ledger -- --changed-file=...` | verified | Wave 0 `T0.4a-ter`. Lands the machine-generated `phase9-vre-surface-index.json`, the reviewed generator script, and the three drift checks promised by the plan: `E_LEDGER_MISSING_SURFACE`, `E_LEDGER_ORPHAN_ROW`, and `E_LEDGER_INDEX_INCONSISTENT`. `check-phase9-ledger` now cross-checks the live codebase inventory against the persisted inventory file and against inventory-eligible ledger rows; the rotation index is also validated for one active row, archived closed dates, and seq-range continuity. This closes the remaining silent-drift gap after `T0.4a-bis`: the human ledger and the codebase can no longer diverge quietly. Partially refined by seq 007 (Round 20) which closes the residual inventory-absence loophole observed during the Round 19 adversarial review. |
| 007 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK-INVENTORY-REQUIRED | Round 20 closure of Round 19 adversarial-review residuals: new `E_LEDGER_SURFACE_INDEX_MISSING` drift code plus 3 new regression tests | `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/check-phase9-ledger.test.js`, `phase9-vre-feature-ledger.md` | none | `node --test environment/tests/ci/check-phase9-ledger.test.js environment/tests/ci/phase9-surface-index.test.js` (16/16 pass); manual attack-retest `rm phase9-vre-surface-index.json && node environment/tests/ci/check-phase9-ledger.js` now exits 1 with the new code (was exit 0 green before Round 20); `npm run validate` green | verified | Round 20. Closes the Round 19 residual where deleting `phase9-vre-surface-index.json` silently disabled the entire cross-check block because the block was gated by `pathExists(surfaceIndex)`. The fix parses `eligibleLedgerRows` once and raises `E_LEDGER_SURFACE_INDEX_MISSING` when there is at least one eligible row but no inventory file. Also adds regression tests for the two rotation-index violations that existed in code but had no direct test (`seq-range gap`, `archived row missing closed date`). The path-overlap lenience in `surfaceMatchesLedgerRow` (Round 19 residual #2) is DEFERRED as a known follow-up: tightening it requires adding a `parent seq` field to the ledger schema and is out of scope for a hot-fix. The mid-dev bugs Codex caught during Round 19 (`pathExists-without-await`, `repoRoot-global`) never reached committed state and therefore do not require separate correction rows. Round 20 does NOT introduce new spec P0/P1. |
