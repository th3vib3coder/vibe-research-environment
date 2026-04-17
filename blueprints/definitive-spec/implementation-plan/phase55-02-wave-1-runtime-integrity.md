# Phase 5.5 Wave 1 — Runtime Integrity

**Goal:** Convert four aspirational invariants (export snapshot immutability,
seed regeneration policy, kernel-vs-fallback signal provenance, budget
advisory threshold, Phase 2→3 boundary) from closeout prose into enforced
runtime behavior. Every work package lands with a test that fails against
`main @ f06fe47` and passes after the fix.

---

## Scope Rule

Wave 1 touches exactly four runtime files plus one schema:
- `environment/lib/export-snapshot.js` (WP-120)
- `environment/flows/writing.js` (WP-121)
- `environment/control/middleware.js` and `environment/control/session-snapshot.js` (WP-122, WP-123)
- `environment/flows/results.js` (WP-124)
- `environment/schemas/session-snapshot.schema.json` (WP-122 schema diff)

No new top-level folder; no existing public export signature changes.

Wave 0 dependencies:
- WP-120, WP-121 consume WP-115 (export snapshot immutability contract).
- WP-122 consumes WP-114 (`signals.provenance` schema extension).
- WP-123, WP-124 have no Wave 0 dependency; they enforce existing contracts.

---

## WP-120 — Export Snapshot Immutability Runtime (F-02, half 1)

Today `lib/export-snapshot.js:83-92::writeExportSnapshot` calls
`atomicWriteJson` which renames a temp file over the final path. `rename`
silently overwrites on every platform VRE targets; a rerun with the same
`snapshotId` replaces the frozen artifact with no kernel, operator, or
replay-harness signal. Wave 0 WP-115 froze the contract; WP-120 enforces it.

**Approach (addresses audit P0-C on TOCTOU).** An `existsSync` guard before
`atomicWriteJson`'s temp-then-rename sequence is race-able: two concurrent
callers can both pass the guard and both succeed their renames, with the
second silently clobbering the first. The correct primitive for write-once
snapshot identity is a direct `writeFile` with `{ flag: 'wx' }` — the OS
atomically fails if the target already exists.

Trade-off, explicitly accepted: direct `wx` gives exclusive no-clobber
semantics, but it is not the same crash-safety property as temp+rename. Phase
5.5 chooses snapshot immutability over temp-file atomic replacement for this
one path, then verifies the written file by reading it back and validating the
same schema. `atomicWriteJson` remains the correct primitive for mutable state
surfaces.

Deliverables:
- New typed error `ExportSnapshotAlreadyExistsError` extending
  `ExportSnapshotError` (colocated at `export-snapshot.js:32-37`).
- `writeExportSnapshot` abandons `atomicWriteJson` for the snapshot JSON and
  writes directly with `{ flag: 'wx' }` (parent dir still ensured via
  `mkdir({recursive:true})`).
- Error payload `{ snapshotId, existingCreatedAt, attemptedAt }` so the
  caller can log escalation without re-reading the file.

Code diff (pseudo-form):
- Import `writeFile` from `node:fs/promises` (already present) and keep
  `mkdir` usage.
- Replace the `atomicWriteJson(targetPath, payload)` call at the end of
  `writeExportSnapshot` with:
  ```
  await mkdir(path.dirname(targetPath), { recursive: true });
  const serialized = JSON.stringify(payload, null, 2) + '\n';
  try {
    await writeFile(targetPath, serialized, { flag: 'wx', encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      const existing = JSON.parse(await readFile(targetPath, 'utf8'));
      throw new ExportSnapshotAlreadyExistsError(
        `Export snapshot ${snapshot.snapshotId} already exists (createdAt=${existing.createdAt}); refusing to overwrite.`,
        { snapshotId: snapshot.snapshotId, existingCreatedAt: existing.createdAt, attemptedAt: snapshot.createdAt }
      );
    }
    throw error;
  }
  ```
- `atomicWriteJson` is unchanged; the snapshot path simply stops using it. Other
  callers of `atomicWriteJson` are not in scope.
- After a successful `wx` write, read the file back and schema-validate it. If
  validation fails, throw a typed corruption error and leave the file for
  forensic inspection; do not retry with overwrite.

Rules / Contract:
- `EEXIST` is the only overwrite-refused signal; no pre-check race possible.
- `ExportSnapshotAlreadyExistsError` is exported so callers can branch on
  `error.name`.
- No force-overwrite flag; legitimate re-exports generate a new `snapshotId`.

Acceptance:
- Duplicate `writeExportSnapshot` call throws
  `ExportSnapshotAlreadyExistsError` on the second invocation.
- Concurrent duplicate calls both complete deterministically: exactly one
  succeeds, exactly one throws `ExportSnapshotAlreadyExistsError`
  (enforced by WP-136 concurrency test).
- Error message includes existing and attempted `createdAt`.
- No `.tmp` file remains in the snapshots directory after rejection (the
  new path writes no temp file at all).
- `npm run check` passes.

State ownership:
- enters via: any caller of `writeExportSnapshot` (today only the writing
  flow).
- state lives at:
  `.vibe-science-environment/writing/exports/snapshots/<snapshotId>.json`.
- written by: `lib/export-snapshot.js::writeExportSnapshot` only.
- read by: writing flow replay (`readExportSnapshots`), result-packaging
  alerts, future orchestrator replay.
- tested by: new `tests/lib/export-snapshot.test.js`.
- degradation: OS errors bubble unchanged; kernel not touched.

---

## WP-121 — Seed Regeneration Policy (F-02, half 2)

Today `flows/writing.js:87-89` does:
```
const seedRoot = resolveInside(projectRoot, ...SEEDS_SEGMENTS, snapshot.snapshotId);
await rm(seedRoot, { recursive: true, force: true });
await mkdir(seedRoot, { recursive: true });
```
This `rm` destroys any previously-frozen seeds under the same `snapshotId`
even when WP-120 refuses to overwrite the JSON envelope. The two halves must
move together.

Architectural choice — **reference immutable, not content immutable**: once
`<snapshotId>.json` is written, its companion seed tree at
`.vibe-science-environment/writing/exports/seeds/<snapshotId>/` is frozen
alongside. Reruns that need corrected prose generate a new `snapshotId`; old
seeds remain on disk as historical evidence. Minor fixes to prose happen in
the downstream draft, not the seed.

Deliverables:
- Delete `await rm(seedRoot, { recursive: true, force: true });` at
  `writing.js:88`.
- Replace with a pre-existence guard that throws
  `WritingFlowValidationError` if `seedRoot` already exists. In practice
  WP-120 catches this first (JSON envelope is written at line 53-77 before
  seed generation at line 87), so the seed guard is belt-and-suspenders.
- `mkdir(seedRoot, { recursive: true })` stays — it creates the directory
  only on the first, legitimate write.

Behavior on rerun:
- Same `snapshotId` → WP-120 throws first; WP-121's guard never runs; old
  seeds untouched.
- New `snapshotId` → new subdirectory coexists with prior seeds.
- Direct caller bypassing WP-120 with an existing seed dir → WP-121 guard
  throws; operator cleans up manually.

Rules / Contract:
- No code path under `flows/writing.js` deletes or truncates a seed file.
- The writing flow-index points at the latest snapshotId; older snapshots
  remain as history.

Acceptance:
- Integration test: call `buildWritingHandoff` twice with same `snapshotId`;
  second call throws; seed files from first call byte-identical.
- Regression test: call with two different `snapshotId`s; both seed
  directories coexist.

State ownership:
- enters via: `buildWritingHandoff`.
- state lives at:
  `.vibe-science-environment/writing/exports/seeds/<snapshotId>/`.
- written by: `flows/writing.js::buildWritingHandoff` only.
- read by: drafting tools, orchestrator replay, operators.
- tested by: new cases in `tests/flows/writing.test.js`.
- degradation: guard trip yields a typed flow-level error; kernel untouched.

---

## WP-122 — `signals.provenance` Population In Middleware (F-07)

Today `middleware.js:110-138::deriveSignals` calls reader methods when
`reader?.dbAvailable` is truthy and falls back to `0` otherwise. A reader
that is absent and a reader that legitimately reports zero unresolved claims
produce the same snapshot bytes. `session-snapshot.js:81-86` writes the
bare numbers. WP-114 froze the extension; WP-122 populates it.

Schema diff (`environment/schemas/session-snapshot.schema.json`, under
`signals.properties`):
```
"provenance": {
  "type": "object",
  "additionalProperties": false,
  "required": ["sourceMode", "degradedReason", "lastKernelContactAt"],
  "properties": {
    "sourceMode": { "type": "string", "enum": ["kernel-backed", "degraded", "mixed"] },
    "degradedReason": { "type": ["string", "null"] },
    "lastKernelContactAt": { "type": ["string", "null"], "format": "date-time" }
  }
}
```
Plus an `allOf` consistency rule: if
`signals.provenance.sourceMode === 'degraded'` then
`signals.unresolvedClaims` MUST be `0`. A degraded reader cannot see
unresolved claims; any non-zero value is a contract bug. `signals.required`
stays unchanged during the transitional release (WP-114 legacy branch).

`deriveSignals` computation:
- Per-field provenance tracking:
  - `unresolvedClaims`: `kernel` if `reader.dbAvailable && listUnresolvedClaims` returned without throwing; else `fallback`.
  - `blockedExperiments`, `staleMemory`, `exportAlerts`: `workspace`
    (on-disk scans, kernel-agnostic). These fields do not prevent the overall
    mode from being `kernel-backed` when they are read successfully.
- Collapse to one `sourceMode`:
  - all kernel-dependent fields are `kernel` and all workspace fields read
    successfully → `kernel-backed`
  - at least one field fell back because `reader.dbAvailable === false` → `degraded`
  - reader was available but threw on one field while another succeeded → `mixed`
- `degradedReason`: drawn from `reader.error` (already surfaced in
  `normalizeKernelState` at line 65-71) when sourceMode is `degraded` or
  `mixed`; `null` otherwise.
- `lastKernelContactAt`: `new Date().toISOString()` if any kernel call
  succeeded this attempt; `null` otherwise.

Write path: `rebuildSessionSnapshot` (`session-snapshot.js`) receives
`signals.provenance` via the existing `signals` field and passes it through
verbatim under the updated schema. No flow helper writes `signals.*`
directly.

Acceptance:
- `tests/control/middleware.signals-provenance.test.js`:
  - case A (kernel up, listUnresolvedClaims returns 2): `sourceMode === 'kernel-backed'`, `unresolvedClaims === 2`.
  - case B (reader absent): `sourceMode === 'degraded'`, `unresolvedClaims === 0`, `degradedReason` non-null.
  - case C (reader present but throws): `sourceMode === 'mixed'`, `degradedReason` references the throw.
- `tests/schemas/session-snapshot.schema.test.js`: rejects
  `sourceMode === 'degraded'` with `unresolvedClaims > 0`.

State ownership:
- enters via: `runWithMiddleware` on every command invocation.
- state lives at: `signals.provenance` slice of `session.json`.
- written by: `middleware.js::deriveSignals` →
  `session-snapshot.js::rebuildSessionSnapshot`.
- read by: `flow-status` surface, orchestrator `query.js`, future dashboards.
- tested by: the two new test files listed under Acceptance.
- degradation: reader wholly absent → `sourceMode === 'degraded'`, counts
  `0`, `degradedReason === 'kernel DB unavailable'`. Kernel never touched.

---

## WP-123 — Budget Advisory Tier Resolution (F-05)

Today the `advisory` value appears in
`session-snapshot.schema.json:111-116` and `costs-record.schema.json:62-68`
but no code computes it. `middleware.js:41-51::buildBudgetSnapshot` passes
through whatever `metricsAccumulator.snapshot().budgetState` reports —
caller-self-reported.

Architectural choice — **implement, do not remove**:
- The spec (`blueprints/definitive-spec/05-*`) treats the advisory tier as a
  recovery signal that prompts the operator to slow down before a hard stop.
  Removing the enum would change gate semantics, which Phase 5.5 forbids
  (`phase55-00-index.md` §Non-Negotiable Constraint).
- `maxUsd` already exists in `lane-policy.schema.json:203-208` and is
  consumed by `environment/orchestrator/state.js:46`. Phase 1 middleware has
  no channel to read it today; WP-123 adds a narrow bridge.

Bridge — minimal, no new schema:
- Phase 1 middleware must not import orchestrator code (boundary). Instead,
  callers of `runWithMiddleware` that have a policy context pass
  `budget.maxUsd` alongside the existing `budget.state` override.
- The new `bin/vre` dispatcher (Wave 3) is the first default caller that reads
  a cap from lane policy and forwards it to middleware. Existing markdown-only
  command contracts are not retroactively claimed to enforce advisory budget
  until they are routed through the dispatcher or pass an explicit cap.
- Eval harnesses that assert advisory behavior pass `budget.maxUsd` explicitly;
  tests without a cap remain `unknown` by design.
- `buildBudgetSnapshot` adds one step:
  ```
  const ADVISORY_RATIO = 0.8;
  if (explicitBudget.state === undefined && metrics.estimatedCostUsd != null && explicitBudget.maxUsd != null) {
    const ratio = metrics.estimatedCostUsd / explicitBudget.maxUsd;
    if (ratio >= 1)              state = 'hard_stop';
    else if (ratio >= ADVISORY_RATIO) state = 'advisory';
    else                          state = 'ok';
  }
  ```
- `explicitBudget.state` still wins if set (test/operator override path).
- If `maxUsd == null`, state collapses to `metrics.budgetState ?? 'unknown'`
  — no breaking migration.

Rules / Contract:
- Threshold constant declared once in `middleware.js`; not duplicated.
- `advisory` classifies, does not stop. Only `hard_stop` triggers the
  existing branch at `middleware.js:191-271`.
- A `cost-record` written after an attempt reflects the derived state when
  `maxUsd` is available; otherwise `unknown`.

Acceptance:
- `tests/control/middleware.budget-advisory.test.js`:
  - cost = 0.5 × cap → `state === 'ok'`.
  - cost = 0.85 × cap → `state === 'advisory'`.
  - cost = 1.0 × cap → `state === 'hard_stop'`, existing hard-stop branch
    fires (attempt `blocked`, `budget_hard_stop` decision appended).
- Regression: tests without `maxUsd` passed in continue to emit
  `state === metrics.budgetState ?? 'unknown'`.
- CLI dispatcher smoke test (Wave 3) proves at least one real command path
  forwards a policy-derived `maxUsd`; direct helper/eval callers must pass a
  cap explicitly or accept `unknown`.

State ownership:
- enters via: `runWithMiddleware` caller passing `budget.maxUsd` alongside
  the existing budget slice.
- state lives at: `budget.state` in `session.json` and `budgetState` in the
  costs-record ledger.
- written by: `middleware.js::buildBudgetSnapshot`.
- read by: `session-snapshot.js`, costs-record writer, operator surfaces.
- tested by: the new middleware test file listed under Acceptance.
- degradation: `maxUsd` absent → `unknown` → command proceeds. No hard stop
  from missing config. Kernel untouched.

---

## WP-124 — Phase 2→3 Boundary Fix (F-06)

Today `flows/results.js:4` imports `../lib/export-eligibility.js`, a Phase 3
module. Phase 2 Wave 0 WP-25 forbids this. The only internal use is
`collectClaimExportStatuses` at `results.js:356-376`, whose output feeds
`buildWarnings` and `buildBundleFiles`.

Minimal fix — **lift the call to the caller; make results eligibility-agnostic**:
- `packageExperimentResults` stops computing `claimExportStatuses`
  internally. It accepts `options.claimExportStatuses` (an already-computed
  array from the caller) and passes it through to render helpers unchanged.
- It also accepts `options.claimExportStatusWarnings` so caller-side failure to
  compute eligibility is visible in rendered warnings rather than silently
  becoming an empty status list.
- The import at `results.js:4` is removed. No Phase 3 module is referenced
  from Phase 2.
- Command wrappers or higher-level orchestration code that already sit in
  Phase 3 may compute statuses and pass them into `packageExperimentResults`.
  The Phase 2 packager itself never imports writing or export-eligibility code.
- When no caller supplies the list, `packageExperimentResults` treats it as
  empty and `results-render.js::buildWarnings` emits a warning if linked claims
  exist: "Claim eligibility unavailable at packaging time — run /flow-writing
  to validate."

Mechanical diff:
- `results.js:4`: delete `import { exportEligibility } from '../lib/export-eligibility.js';`.
- `results.js:55-58`: replace the internal call with
  ```
  const claimExportStatuses = Array.isArray(options.claimExportStatuses)
    ? options.claimExportStatuses
    : [];
  ```
- `results.js:356-383`: delete `collectClaimExportStatuses` and
  `hasExportEligibilityReader` (dead code after the rewrite).
- Callers of `packageExperimentResults` either already thread
  eligibility data through their pipeline or accept the empty-array
  degradation with a warning surface (existing `buildWarnings` path
  must be extended to warn on empty input when linked claims exist).
- `results-render.js`: add the explicit unavailable-eligibility warning path.

Rules / Contract:
- No file under `flows/results*` imports anything under `lib/export-*` or
  `flows/writing*`.
- Wave 4 (WP-137) adds a grep-based CI validator enforcing this.

Acceptance:
- Grep validator: no `export-eligibility` or `writing.js` import appears
  under `flows/results*`.
- `tests/integration/results-packaging.test.js`:
  - caller provides `claimExportStatuses` → bundle renders identically to
    today.
  - caller omits → bundle renders with empty eligibility section plus a
    "Claim eligibility unavailable at packaging time — run /flow-writing to
    validate." warning.
- test or validator proves `/flow-results` and eval callers do not imply that
  claim export statuses were checked when they were not supplied

State ownership:
- enters via: caller-supplied `options.claimExportStatuses`.
- state lives at: transient in the packager call; eligibility persistence
  remains in Phase 3 where it belongs.
- written by: the caller of `packageExperimentResults` (typically a command
  shim or the writing flow).
- read by: `buildWarnings`, `buildBundleFiles` (render helpers inside
  results.js).
- tested by: the new integration test plus the Wave 4 grep validator.
- degradation: absent input → empty list → warning; no exception. Phase 3
  module stays on the Phase 3 side of the boundary.

---

## WP-125 — Regression Guards (WP-120..WP-124)

Consolidates the acceptance tests into a Wave 1 closeout checklist so Wave 4
validators and Wave 5 closeout language can cite concrete files.

| WP | File | Type | Test names (minimum) |
|----|------|------|----------------------|
| WP-120 | `environment/tests/lib/export-snapshot.test.js` | unit | `rejects duplicate snapshotId with typed error`; `error payload carries existing and attempted createdAt`; `leaves no temp file after rejection` |
| WP-121 | `environment/tests/flows/writing.test.js` | integration | `rerun with same snapshotId does not mutate seed directory`; `rerun with new snapshotId coexists with prior seeds` |
| WP-122 | `environment/tests/control/middleware.signals-provenance.test.js` | integration | `kernel-backed path records sourceMode kernel-backed`; `absent reader records sourceMode degraded with reason`; `partial-failure reader records sourceMode mixed` |
| WP-122 | `environment/tests/schemas/session-snapshot.schema.test.js` | schema | `rejects degraded sourceMode with nonzero unresolvedClaims` |
| WP-123 | `environment/tests/control/middleware.budget-advisory.test.js` | unit | `ratio below 0.8 yields ok`; `ratio 0.8 to 1.0 yields advisory`; `ratio at or above 1.0 yields hard_stop and closes attempt` |
| WP-124 | `environment/tests/integration/results-packaging.test.js` | integration | `packager accepts caller-supplied claimExportStatuses`; `packager emits warning when eligibility unavailable`; `results flow imports do not reference export-eligibility` (grep assertion) |

Each test MUST fail against `main @ f06fe47` and pass after its WP lands.
Artifacts stored under `environment/evals/saved/phase55-wave1/` per the
WP-119 honesty standard.

---

## Parallelism

- WP-120 → WP-121 is sequential: WP-121's guard imports the
  `ExportSnapshotAlreadyExistsError` class surfaced by WP-120.
- WP-122 runs in parallel with WP-120/WP-121 (different files, different
  concerns).
- WP-123 is independent (middleware-only, schema additive).
- WP-124 is independent (results.js-only).
- WP-125 assembles the catalogue once WP-120..WP-124 have merged; it is the
  Wave 1 closeout gate.

---

## Exit Condition

Wave 1 is complete when **all** of the following hold:

1. `npm run check` passes; duplicate-snapshotId rerun throws
   `ExportSnapshotAlreadyExistsError` and prior seed directory is
   byte-identical after the rejected attempt (WP-120 + WP-121).
2. `session.json` produced after any `runWithMiddleware` call contains
   `signals.provenance.sourceMode` with a value drawn from the three
   declared enum values; the degraded+nonzero schema fixture rejects
   (WP-122).
3. Advisory tier computes deterministically from
   `estimatedCostUsd / maxUsd`; the three ratio bands produce the three
   documented `budgetState` values; `maxUsd` absent still yields `unknown`
   (WP-123).
4. No file under `environment/flows/results*` imports anything under
   `environment/lib/export-*` or `environment/flows/writing*`; grep
   validator passes (WP-124).
5. Each of the six listed test files exists, passes on the patched tree,
   and demonstrably fails on `main @ f06fe47` (WP-125).
