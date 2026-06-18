# Phase 12 VRE Feature Ledger

This is the append-only VRE-side feature ledger for Phase 12 implementation
work.

Do not use this ledger as biomedical evidence. It records software governance,
artifact contracts, validation evidence, and adversarial review state only.

## T12.6.0 Acceptance Harness

who: Codex authored the review-only acceptance harness after Claude Code
non-author HAT 1 ACCEPT.

when: 2026-06-18.

why: Phase 12 needs a final fixture-based proof that the relay foundation
handles happy and failure paths before any live adversarial loop, provider
automation, GUI/clipboard relay, run-state, publication, Graphify, claim, or
export surface is opened. T12.6.0 composes the accepted T12.1 artifact
contracts, T12.4 loop controller, and T12.5 bridge validators over tracked
A-H scenarios instead of re-implementing their semantics.

what:

- `environment/phase12/acceptance-harness.js`
- `environment/tests/fixtures/phase12/acceptance-harness/`
- `environment/tests/ci/phase12-acceptance-harness.js`
- `environment/tests/ci/phase12-acceptance-harness.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `README.md`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node environment/tests/ci/phase12-acceptance-harness.js` failed with
  `MODULE_NOT_FOUND` before the CI validator existed.
- RED: `node --test environment/tests/ci/phase12-acceptance-harness.test.js`
  failed before the regression test existed.
- GREEN: target acceptance harness test PASS 8/8.
- GREEN: direct `phase12-acceptance-harness` validator PASS.
- GREEN: `validate-counts.js` PASS with `ciValidators:65`.
- GREEN: `phase11-current-status.js` and `run-all.js` PASS after projection
  refresh.

scope:

- scenarios A-H cover non-author ACCEPT, self-ACCEPT rejection, REDIRECT,
  BLOCK requiring operator decision evidence, stale packet, budget cap, Phase
  10 provenance bypass, and Phase 11 graph-as-evidence failure paths;
- the harness delegates reused checks to `validatePhase12ArtifactSet`,
  `evaluatePhase12LoopStep`, and `validatePhase12BridgeReview`;
- disk-backed evidence content is hashed and compared to SHA-256 declarations;
- the source imports no filesystem write API and creates no run state;
- no live `.vibe-science-environment/adversarial-*` run state, provider
  automation, GUI/clipboard relay, Phase 10 publication/writeback, Graphify
  execution/writeback, claim/export, real H5AD/GEO read, biomedical claim,
  commit, or push is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.6.0-acceptance-harness-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. HAT 3
requires Claude Code non-author review before any Phase 12 closeout, commit,
push, or live-runtime continuation.

Claude Code issued non-author HAT 3 ACCEPT via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat3-t12.6.0-acceptance-harness-verdict-2026-06-18.md`.

## T12.5.0 Phase 10 And Phase 11 Bridge Validators

who: Codex authored the review-only bridge validator after Claude Code
non-author HAT 1 ACCEPT of the amended STOP.

when: 2026-06-18.

why: Phase 12 needs a composition layer that checks Phase 10 LAW 13 review
extensions and Phase 11 Graphify review extensions without letting relay
reviews, query outputs, validator output, or Graphify paths become evidence.
The layer must delegate existing enforcement to T12.1 artifact contracts and
the Phase 10 bridge validator, adding only net-new cross-field review
consistency checks.

what:

- `environment/phase12/bridge-validators.js`
- `environment/tests/ci/phase12-bridge-validators.js`
- `environment/tests/ci/phase12-bridge-validators.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `README.md`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase12-bridge-validators.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before `bridge-validators.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 63, got 64 before the count repair.
- GREEN: target bridge validator test PASS 10/10.
- GREEN: direct `phase12-bridge-validators` validator PASS.
- GREEN: `validate-counts.js` PASS with `ciValidators:64`.
- GREEN: `phase11-current-status.js` and `run-all.js` PASS after projection
  refresh.

scope:

- `bridge-validators.js` delegates reused checks to
  `validatePhase12ArtifactSet` and `validateLaw13BridgeArtifact`;
- net-new checks cover graph paths marked as implementation proof, Phase 10
  publication/writeback requests, Graphify execution/writeback requests, and
  bridge validator output treated as LAW 13 provenance;
- no Phase 10 publication, Graphify execution/writeback, claim promotion,
  export packaging, provider automation, GUI/clipboard relay, live run-state,
  real data read, biomedical claim, commit, or push is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.5.0-phase10-phase11-bridge-validators-amended-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and did not self-ACCEPT it. Claude
Code issued non-author HAT 3 ACCEPT via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat3-t12.5.0-phase10-phase11-bridge-validators-verdict-2026-06-18.md`.

## T12.4.0 Bounded Loop Controller

who: Codex authored the pure controller engine after Claude Code non-author
HAT 1 ACCEPT.

when: 2026-06-18.

why: Phase 12 needs deterministic stop/cap semantics before any live
adversarial relay can exist. T12.4.0 deliberately implements only a pure
in-memory single-step policy/state-transition engine, leaving live loop
execution, run-state creation, provider invocation, and auto-wake for a later
explicit gate.

what:

- `environment/phase12/loop-controller.js`
- `environment/tests/ci/phase12-loop-controller.js`
- `environment/tests/ci/phase12-loop-controller.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `README.md`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase12-loop-controller.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before `loop-controller.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 62, got 63 before the count repair.
- RED: `node environment/tests/ci/run-all.js` failed before the controller
  implementation/current-status projection refresh.
- GREEN: target controller test PASS 8/8.
- GREEN: direct `phase12-loop-controller` validator PASS.
- GREEN: `validate-counts.js` PASS with `ciValidators:63`.
- GREEN: `phase11-current-status.js` and `run-all.js` PASS after projection
  refresh.

scope:

- controller mode is `pure-in-memory-single-step`;
- output records `runStateCreated:false` and `providerAutomationInvoked:false`;
- no filesystem write API is imported by `loop-controller.js`;
- self-ACCEPT, provider/gui automation, live writeback, multi-step advance,
  stale context, iteration cap, turn cap, and operator abort fail closed;
- no `.vibe-science-environment/adversarial-*` run state is created;
- no `vre adversarial step/run/loop`, scheduler/auto-wake, provider execution,
  GUI/clipboard relay, claim promotion, export packaging, Graphify
  execution/writeback, real data read, biomedical claim, publication artifact,
  commit, or push is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.4.0-bounded-loop-controller-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and did not self-ACCEPT it. Claude
Code issued non-author HAT 3 ACCEPT via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat3-t12.4.0-bounded-loop-controller-verdict-2026-06-18.md`.

The live-runtime threshold remains closed after ACCEPT: no
`vre adversarial step/run/loop`, no adversarial run-state creation, no
scheduler/auto-wake, and no provider invocation.

## T12.1.0 Artifact Contracts

who: Codex authored the Phase 12 artifact-contract implementation after
Claude Code non-author HAT 1 ACCEPT of the amended STOP.

when: 2026-06-18.

why: Phase 12 needs a filesystem-artifact substrate for adversarial pairing
before any controller, provider adapter, GUI automation, claim promotion,
export, Graphify writeback, or run-state is allowed. The contracts must make
the reviewer/author split, evidence hashes, no-review-as-provenance rule,
LAW 13 bridge checks, and Phase 11 Graphify-navigation boundary enforceable
before runtime exists.

what:

- `environment/phase12/artifact-contracts.js`
- `environment/schemas/phase12-relay-run.schema.json`
- `environment/schemas/phase12-relay-candidate.schema.json`
- `environment/schemas/phase12-relay-review.schema.json`
- `environment/schemas/phase12-relay-rebuttal.schema.json`
- `environment/schemas/phase12-relay-final-verdict.schema.json`
- `environment/schemas/phase12-relay-evidence-bundle.schema.json`
- `environment/schemas/phase12-phase10-law13-review-extension.schema.json`
- `environment/schemas/phase12-phase11-graph-review-extension.schema.json`
- `environment/tests/schemas/phase12-schema-fixtures.js`
- `environment/tests/schemas/phase12-relay-run.schema.test.js`
- `environment/tests/schemas/phase12-relay-candidate.schema.test.js`
- `environment/tests/schemas/phase12-relay-review.schema.test.js`
- `environment/tests/schemas/phase12-relay-rebuttal.schema.test.js`
- `environment/tests/schemas/phase12-relay-final-verdict.schema.test.js`
- `environment/tests/schemas/phase12-relay-evidence-bundle.schema.test.js`
- `environment/tests/schemas/phase12-phase10-law13-review-extension.schema.test.js`
- `environment/tests/schemas/phase12-phase11-graph-review-extension.schema.test.js`
- `environment/tests/ci/phase12-artifact-contracts.js`
- `environment/tests/ci/phase12-artifact-contracts.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase12-artifact-contracts.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the semantic helper existed.
- GREEN: the semantic test rejects reviewer self-ACCEPT, ACCEPT without
  non-author `acceptedBy`, ACCEPT without residual-risk acknowledgement,
  REDIRECT without required actions, BLOCK without findings, missing SHA-256,
  raw chat as authority, query output as provenance, review verdict as
  provenance, Graphify output as implementation evidence, runtime under a
  planning-only override, clipboard/GUI substrate, provider/GUI automation,
  stale accepted runs, missing caps, and missing LAW 13 / Graphify bridge
  checks.
- GREEN: `phase12.relay-final-verdict.v1` preserves the Phase 10 bridge
  vocabulary by accepting `phase12-relay-verdict` and `relay-verdict`.
- GREEN so far: targeted semantic validator, schema tests, count invariant,
  Phase 9 / 10 / 11 ledger checks, and aggregate CI are run as part of the
  HAT 3 handoff.

scope:

- no `.vibe-science-environment/adversarial-*` run state is created;
- no controller, scheduler loop, provider adapter, GUI automation, clipboard
  substrate, claim promotion, export packaging, Graphify execution/writeback,
  real H5AD/GEO read, biomedical claim, or publication artifact is opened;
- Phase 12 remains artifact-contract foundation until a later HAT cycle opens
  runtime explicitly.

reviewer:

Claude Code HAT 1 ACCEPT for the amended T12.1.0 STOP is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.1.0-artifact-contracts-amended-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. The
HAT 3 handoff requires Claude Code non-author review before any commit/push or
Phase 12 continuation.

## 2026-06-18 - T12.7.0 Phase 12 Full Closeout

status: `hat2-authored-pending-hat3-review`

files:

- `README.md`
- `environment/phase11/current-status.js`
- `environment/phase12/phase-12-closeout.js`
- `environment/closures/phase12-full-closeout-2026-06-18.md`
- `environment/closures/phase12-full-closeout-evidence-2026-06-18.json`
- `environment/tests/fixtures/phase12/phase-12-closeout.json`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `environment/tests/ci/phase12-full-closeout.js`
- `environment/tests/ci/phase12-full-closeout.test.js`
- `environment/tests/ci/phase11-current-status.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `phase9-vre-feature-ledger.md`
- `phase12-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase12-full-closeout.test.js`
  failed because the test file was absent before implementation.
- RED: `validate-counts` would fail until `ciValidators` moved from 65 to 66.
- RED: aggregate `run-all.js` would fail until closeout validator wiring.
- RED: stale README/current-status text would remain "Phase 12 remains gated"
  until the generated projection was refreshed.
- GREEN pending final run: target closeout test, direct closeout validator,
  current-status validator, `validate-counts`, `run-all.js`, ledger checks, and
  `npm run check`.

scope:

- closes Phase 12 only as a governed adversarial-relay scaffold;
- pins stack commit `f5af4f1ceb8c10c1ae6115ec2e9934e29f6e7ec2` and GitHub
  Actions run `27742208747` as the scaffold baseline;
- keeps live runtime, provider automation, GUI/clipboard relay,
  `.vibe-science-environment/adversarial-*` run state, Phase 10
  publication/writeback, Graphify execution/writeback, claim/export,
  real-data reads, biomedical claims, commit, and push closed.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.7.0-phase-12-full-closeout-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. Claude
Code non-author HAT 3 review is required before any Phase 12 closeout claim is
accepted and before any commit/push.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat3-t12.2.0-manual-relay-dry-run-verdict-2026-06-18.md`.

## T12.3.0 CLI And Adapter Surface

who: Codex authored the minimal manual CLI surface after Claude Code
non-author HAT 1 ACCEPT.

when: 2026-06-18.

why: Phase 12 needs an operator-readable surface over saved relay artifacts,
but must not become provider automation. The CLI therefore reads existing
artifact directories, validates them, emits deterministic JSON, and leaves
controller/runtime/provider execution for later gated waves.

what:

- `bin/vre`
- `environment/phase12/manual-adapter.js`
- `environment/tests/cli/bin-vre-adversarial.test.js`
- `environment/tests/ci/validate-counts.js`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/cli/bin-vre-adversarial.test.js`
  failed 11/11 because `vre adversarial` was still unknown.
- GREEN: the CLI test passes 11/11 after adding read-only
  `adversarial status|packet --fixture <dir> --json`.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `cliTests` expected 11, got 12 before the count repair.
- GREEN: `validate-counts.js` passes with `cliTests:12`.
- GREEN: `phase11-current-status.js`, Phase 9/10/11 ledger checks, and
  `run-all.js` pass.
- GREEN: `npm run check` passes with 1622 tests, 1613 pass, 0 fail, 9
  skipped.

scope:

- the CLI is read-only over existing fixture/artifact directories;
- provider options such as `--provider`, `--adapter`, `--auto`, and `--exec`
  fail closed;
- invalid schema artifacts and mismatched evidence hashes fail closed;
- no `.vibe-science-environment/adversarial-*` run state is created;
- no controller, scheduler loop, provider execution, GUI/clipboard relay,
  claim promotion, export packaging, Graphify execution/writeback, real data
  read, biomedical claim, publication artifact, commit, or push is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.3.0-cli-and-adapter-surface-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and did not self-ACCEPT it. Claude
Code issued non-author HAT 3 ACCEPT via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat3-t12.3.0-cli-and-adapter-surface-verdict-2026-06-18.md`.

Claude's non-blocking gate-breadth note is recorded in the private gate:
`runtimeCodeAllowed:true` is bounded by
`runtimeScope: additive-read-only-cli-and-manual-adapter-only`. T12.4.0 still
requires its own gate before loop controller runtime, run-state creation,
auto-wake, or provider automation.

## T12.2.0 Manual Relay Dry Run

who: Codex authored the manual relay dry-run fixtures and validator after
Claude Code non-author HAT 1 ACCEPT.

when: 2026-06-18.

why: Phase 12 must prove the artifact contracts with saved files before any
controller, provider adapter, GUI automation, or runtime adversarial run state
exists. The dry run demonstrates that ACCEPT and REDIRECT paths can be
reconstructed from tracked files alone and that evidence hashes are checked
against disk, not trusted from fixture declarations.

what:

- `environment/tests/fixtures/phase12/manual-relay-dry-run/accept/`
- `environment/tests/fixtures/phase12/manual-relay-dry-run/redirect/`
- `environment/tests/ci/phase12-manual-relay-dry-run.js`
- `environment/tests/ci/phase12-manual-relay-dry-run.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `README.md`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase12-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase12-manual-relay-dry-run.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the CI validator existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 61, got 62 before the count repair.
- RED: `node environment/tests/ci/run-all.js` failed through the aggregate
  count/current-status path before count wiring and projection refresh.
- GREEN so far: target dry-run test PASS 14/14; direct validator PASS; count
  validator PASS with `ciValidators:62`; final aggregate checks are recorded
  in the HAT 3 handoff.

scope:

- fixtures are tracked test data under `environment/tests/fixtures/phase12/`;
- no `.vibe-science-environment/adversarial-*` run state is created;
- no controller, scheduler loop, CLI command, provider adapter, GUI/clipboard
  relay, claim promotion, export packaging, Graphify execution/writeback, real
  data read, biomedical claim, or publication artifact is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns/claude-hat1-t12.2.0-manual-relay-dry-run-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. The
HAT 3 handoff requires Claude Code non-author review before any commit/push or
Phase 12 continuation.
