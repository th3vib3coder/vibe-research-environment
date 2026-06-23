# Phase 13 VRE Feature Ledger

This is the append-only VRE-side feature ledger for Phase 13 implementation
work.

Do not use this ledger as biomedical evidence. It records software governance,
edition isolation, runtime safety boundaries, validation evidence, and
adversarial review state only.

## T13.0.1 Wave 0 Tracking And Isolation Scaffold

who: Codex authored the Wave 0 default-off tracking and isolation scaffold
after Claude Code non-author HAT 1 ACCEPT.

when: 2026-06-18.

why: Phase 13 needs a tested edition boundary before any autonomous-scientist
layer can be built. The base VRE must not expose autonomous behavior by default,
and future runtime work must be traceable through Phase 13 ledgers, WIKI, count
invariants, and aggregate CI.

what:

- `phase13-vre-feature-ledger.md`
- `phase13-vre-feature-ledger-index.md`
- `environment/autonomous/ENTRYPOINTS.json`
- `environment/autonomous/gate.js`
- `bin/vre`
- `environment/tests/autonomous/isolation/autonomy-gate.test.js`
- `environment/tests/ci/validate-edition-isolation.js`
- `environment/tests/ci/validate-edition-isolation.test.js`
- `environment/tests/ci/check-phase13-ledger.js`
- `environment/tests/ci/check-phase13-ledger.test.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/ci/run-all.js`
- `environment/phase11/current-status.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `README.md`
- `package.json`
- `.github/workflows/ci.yml`
- `phase9-vre-feature-ledger.md`
- `phase11-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/13-hat3-t13-0-1-wave0-tracking-isolation-closure-2026-06-18.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`
- `C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/codex-hat3-t13.1.1-l1-decision-table-review-request-2026-06-18.md`
- `C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/codex-hat3-t13.0.1-wave0-tracking-isolation-review-request-2026-06-18.md`

verification:

- RED: `node --test environment/tests/autonomous/isolation/autonomy-gate.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before `environment/autonomous/gate.js`
  existed.
- RED: `node --test environment/tests/ci/validate-edition-isolation.test.js
  environment/tests/ci/check-phase13-ledger.test.js` failed while both CI
  validators were absent.
- RED: `validate-counts.js` required repair because two non-test CI validators
  and one autonomous test family were added.
- GREEN verification is recorded in the HAT 3 handoff before non-author review.
- CI backstop: initial push run `27753878436` failed in
  `check-phase9-ledger` because this task touched Phase9-covered
  `package.json` and `environment/tests/ci/validate-counts.js` without a
  Phase9 bridge row. Corrective bridge trace is recorded in
  `phase9-vre-feature-ledger.md` row 189.
- Supplemental N1/N2 hardening: the disabled Phase 13 error envelope now emits
  `runtimeOpened:false`, and edition-isolation has a negative import-boundary
  fixture for `E_PHASE13_BASE_IMPORTS_AUTONOMOUS`.

scope:

- Wave 0 opens only a default-off gate and edition-isolation enforcement.
- `environment/orchestrator/autonomy-runtime.js` remains the existing Phase 9
  unattended-objective runtime and is not duplicated under
  `environment/autonomous/**`.
- `capabilities --json` and the base task registry expose no autonomous command
  or autonomous task kind while the tier is off.
- no L0 reasoning loop, L1 skill orchestration runtime, L2 utilities, L4 swarm,
  L5 capstone, provider automation, GUI/clipboard relay, live Phase 12 run
  state, claim/export, publication/Graphify writeback, real-data read,
  biomedical claim, commit, or push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.0.1-wave0-tracking-isolation-verdict-2026-06-18.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat3-t13.0.1-wave0-tracking-isolation-verdict-2026-06-18.md`.

Claude Code supplemental HAT 3 ACCEPT for the N1/N2 hardening delta is recorded
via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-supplemental-hat3-t13.0.1-wave0-n1-n2-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and did not self-ACCEPT it. Commit and
push are authorized only for the scoped T13.0.1 patch after non-author HAT 3
ACCEPT.

## T13.1.1 L1 Decision Table Artifact

who: Codex authored the L1 policy-only decision table artifact after Claude
Code non-author HAT 1 ACCEPT and scoped operator GO.

when: 2026-06-18.

why: Phase 13 Wave 1 needs a deterministic stage-to-skill policy map before
any L1 runtime, availability probe, or missing-skill degrade path can be built.
The table must preserve the design distinction between Vibe Science workflow
use and ordinary host skills, and it must keep closeout/adversarial review
explicit instead of implicit.

what:

- `environment/autonomous/l1/stage-skill-table.json`
- `environment/tests/autonomous/l1/decision-table.test.js`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/phase11/current-status.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `README.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/15-hat3-t13-1-1-l1-decision-table-closure-2026-06-18.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `node --test environment/tests/autonomous/l1/decision-table.test.js`
  failed with `ENOENT` before
  `environment/autonomous/l1/stage-skill-table.json` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `autonomousTests` expected `1`, got `2` after the counted test was added.
- RED: `node environment/tests/ci/check-phase13-ledger.js` failed with
  `E_PHASE13_TRACE_MISSING environment/autonomous/l1/stage-skill-table.json`
  before this row existed.
- RED: `node environment/tests/ci/phase11-current-status.js` failed until
  README and WIKI current-status projections were regenerated from the updated
  count authority.
- GREEN verification is recorded in the HAT 3 handoff before non-author review.

scope:

- This row opens only policy data and tests for the L1 decision table.
- `vibe` is classified as `vibe-science-workflow`, not as a guaranteed ordinary
  host skill.
- T13.1.2 availability probing and T13.1.3 missing-skill degrade remain
  deferred.
- no L1 runtime, L0 reasoning loop, L2 utility, L4 swarm, L5 capstone, provider
  automation, GUI/clipboard relay, live Phase 12 run state, claim/export,
  publication/Graphify writeback, real-data read, biomedical claim, commit, or
  push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.1.1-l1-decision-table-verdict-2026-06-18.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat3-t13.1.1-l1-decision-table-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and did not self-ACCEPT it. Commit and
push are authorized only for the scoped T13.1.1 patch after non-author HAT 3
ACCEPT.

## T13.1.2 L1 Installed-Skill Availability Probe

who: Codex authored the pure L1 availability probe after Claude Code
non-author HAT 1 ACCEPT, HAT 1 amendment confirmation, and scoped operator GO.

when: 2026-06-18.

why: The Phase 13 L1 playbook needs a deterministic way to mark table targets
as available or missing before any runtime consumer can exist. The probe must
preserve the naming distinction between host skills, Vibe Science workflow
targets, and future Codex-global installs without invoking any skill.

what:

- `environment/autonomous/l1/skill-probe.js`
- `environment/tests/autonomous/l1/skill-probe.test.js`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/phase11/current-status.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `README.md`
- `phase9-vre-feature-ledger.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `node --test environment/tests/autonomous/l1/skill-probe.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/autonomous/l1/skill-probe.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `autonomousTests` expected `2`, got `3` after the counted test was added.
- RED: `node environment/tests/ci/check-phase13-ledger.js` failed with
  `E_PHASE13_TRACE_MISSING environment/autonomous/l1/skill-probe.js` before
  this row existed.
- RED: `node environment/tests/ci/phase11-current-status.js` failed until
  README and WIKI current-status projections were regenerated from the updated
  count authority.
- RED: explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=package.json
  --changed-file=environment/tests/ci/validate-counts.js` failed with
  `E_VRE_LEDGER_UPDATE_REQUIRED` before Phase9 bridge row 190.
- RED: `node --test environment/tests/autonomous/l1/skill-probe.test.js`
  failed the blank identifier regression before `stageId` and `targetId` were
  normalized as non-empty strings.
- GREEN verification is recorded in the HAT 3 handoff before non-author review.

scope:

- This row opens only a pure registry-injected availability probe and tests.
- The probe reads no real `.codex/skills`, provider, browser, GUI, scheduler, or
  runtime host state.
- The probe marks targets as `available` or `missing` and records
  `skillInvocationAttempted:false`, `runtimeOpened:false`, and
  `degradeApplied:false`.
- T13.1.3 `SKILL_UNAVAILABLE` degrade remains deferred.
- no L1 runtime consumer, L0 reasoning loop, L2 utility, L4 swarm, L5 capstone,
  provider automation, GUI/clipboard relay, live Phase 12 run state,
  claim/export, publication/Graphify writeback, real-data read, biomedical
  claim, commit, or push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.1.2-l1-skill-probe-verdict-2026-06-18.md`.

Claude Code HAT 1 amendment confirmation is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.1.2-l1-skill-probe-amendment-confirm-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. HAT 3
requires Claude Code non-author review before any scoped commit/push.

## T13.1.3 L1 Missing-Skill Degrade

who: Codex authored the pure L1 missing-skill degrade report builder after
Claude Code non-author HAT 1 ACCEPT and scoped operator GO.

when: 2026-06-18.

why: Phase 13 Wave 1 needs missing L1 skills to degrade visibly instead of
silently proceeding as if a skill ran. The degrade behavior must stay separate
from the base availability report so T13.1.2 remains true: the probe reports
availability only and does not emit `SKILL_UNAVAILABLE`.

what:

- `environment/autonomous/l1/skill-probe.js`
- `environment/tests/autonomous/l1/degrade.test.js`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `README.md`
- `phase9-vre-feature-ledger.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `node --test environment/tests/autonomous/l1/degrade.test.js` failed with
  missing `buildMissingSkillDegradeReport` export before implementation.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `autonomousTests` expected `3`, got `4` after the counted test was added.
- RED: package script probe failed with `E_PHASE13_TEST_SCRIPT_MISSING_DEGRADE`
  before `degrade.test.js` was wired into `test:phase13`.
- RED: `node environment/tests/ci/check-phase13-ledger.js` failed with
  `E_PHASE13_TRACE_MISSING environment/tests/autonomous/l1/degrade.test.js`
  before this row existed.
- GREEN so far: target degrade test PASS 7/7; existing skill-probe test PASS
  8/8; `npm run test:phase13` PASS 27/27; `validate-counts.js` PASS with
  `autonomousTests=4`; `phase11-current-status.js` PASS.
- Final aggregate GREEN verification is recorded in the HAT 3 handoff before
  non-author review.

scope:

- This row opens only a pure policy-level degrade report builder and tests.
- `evaluateSkillAvailability(...)` remains the clean availability report and
  still serializes without `SKILL_UNAVAILABLE`.
- `buildMissingSkillDegradeReport(...)` consumes a clean availability report and
  emits `SKILL_UNAVAILABLE` only for missing required targets.
- Missing optional targets remain visible but non-blocking.
- The degrade report records `runtimeOpened:false`,
  `skillInvocationAttempted:false`, and `providerAutomationInvoked:false`.
- no L1 runtime consumer, L0 reasoning loop, L2 utility, L4 swarm, L5 capstone,
  skill invocation, skill installation, provider automation, GUI/clipboard
  relay, live Phase 12 run state, claim/export, publication/Graphify writeback,
  real-data read, biomedical claim, commit, or push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.1.3-l1-missing-skill-degrade-verdict-2026-06-18.md`.

Codex authored this HAT 2 implementation and must not self-ACCEPT it. HAT 3
requires Claude Code non-author review before any scoped commit/push.

## T13.2.2 L2 Ingestion Utilities

who: Codex authored the pure L2 ingest utility module after Claude Code
non-author HAT 1 ACCEPT and scoped operator GO.

when: 2026-06-18.

why: Phase 13 Wave 2 needs a small VRE-local L2 utility layer before any later
autonomous ingestion work. T13.2.1 allowed only five GROUNDED+L2 rows to be
consumed, so this task adopts only dependency-free behavior shapes for alias
normalization, injected staleness status, text structure detection, approximate
token estimation, and stable extraction failure wrapping.

what:

- `environment/autonomous/l2/ingest-utils.js`
- `environment/tests/autonomous/l2/ingest-utils.test.js`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `README.md`
- `phase9-vre-feature-ledger.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `node --test environment/tests/autonomous/l2/ingest-utils.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/autonomous/l2/ingest-utils.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed with
  `autonomousTests` expected `4`, got `5` after the counted test was added.
- GREEN: target L2 ingest utility test PASS 9/9; `npm run test:phase13`
  PASS 36/36; `validate-counts.js` PASS with `autonomousTests=5`;
  `phase11-current-status.js` PASS.
- GREEN: explicit Phase 9 and Phase 13 ledger checks PASS; `run-all.js`
  PASS; `npm run check` PASS 1696/1687/0/9; `git diff --check` PASS with
  CRLF warnings only for ledger files.
- REVIEW: Claude Code non-author HAT 3 ACCEPT recorded no blocker and two
  non-blocking hardening notes for a later pass.

scope:

- This row opens only pure L2 utility code and tests under
  `environment/autonomous/l2/`.
- The utility layer reads no filesystem, shells no `git`, imports no `zod`, and
  adds no runtime dependency.
- Alias normalization uses only a VRE-local dependency-free map shape; it does
  not adopt `normalizeGraph` or `validateGraph`.
- Staleness is computed only from injected changed-file metadata.
- Utility outputs record `sourcePath`, `provenanceClass`, and
  `runtimeOpened:false`.
- Wiki/query/chat/review output is rejected as LAW 13 provenance.
- no L2-authoritative wiki behavior, wikilink/frontmatter parser,
  `fingerprint.ts`, multi-parser fallback, Hermes L0 guardrail, L1 runtime
  consumer, L0 reasoning loop, L4 swarm, L5 capstone, provider automation,
  GUI/clipboard relay, live Phase 12 run state, claim/export,
  publication/Graphify writeback, real-data read, biomedical claim, commit, or
  push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.2.2-l2-ingest-utils-verdict-2026-06-18.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat3-t13.2.2-l2-ingest-utils-verdict-2026-06-18.md`.

Codex authored this implementation and did not self-ACCEPT it. Scoped commit
and push may proceed only by explicit path staging, excluding pre-existing
Phase 10 diffs and scratch/noise.

## T13.3.3 L0 Operator Halt Request Contract

who: Codex authored the deterministic L0 halt request contract after two
Claude Code non-author HAT 1 ACCEPT reviews and scoped operator GO.

when: 2026-06-18.

why: T13.3.2 could only satisfy the L0 readiness classifier with
`injected-hypothetical` halt evidence. Before any future L0 selector/runtime
HAT, Wave 3 needs a reviewed operator-owned halt request artifact plus a
pre-iteration guard, without claiming process-kill semantics or opening L0.

what:

- `bin/vre`
- `environment/autonomous/ENTRYPOINTS.json`
- `environment/autonomous/gate.js`
- `environment/autonomous/l0/halt.js`
- `environment/tests/autonomous/l0/halt.test.js`
- `README.md`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase9-vre-feature-ledger.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `VRE_AUTONOMY_TIER=phase13 node bin/vre autonomous halt --json
  --operator Carmine --reason "red missing halt"` failed with
  `E_PHASE13_AUTONOMOUS_UNKNOWN_ACTION` before `autonomous halt` existed.
- RED: `node --test environment/tests/autonomous/l0/halt.test.js` failed
  because the test file was absent before implementation.
- RED: `node environment/tests/ci/run-all.js` failed
  `phase11-current-status` until README/current-status projections were
  regenerated from the new `autonomousTests=7` count and failed
  `check-phase13-ledger` until this row traced `halt.js`.
- GREEN: target L0 halt test PASS 8/8; `validate-counts.js` PASS with
  `autonomousTests=7`; `phase11-current-status.js` PASS;
  `npm run test:phase13` PASS 51/51; explicit Phase9/13 ledger checks PASS;
  `run-all.js` PASS; `npm run check` PASS 1711 tests, 1702 pass, 0 fail,
  9 skipped.

scope:

- This row opens only the deterministic `autonomous halt` request safety
  surface under the Phase 13 autonomy tier.
- The command writes a reviewed halt request artifact only under
  `.vibe-science-environment/autonomous/l0/halt-request.json`.
- Allowed halt operators are exactly `{Carmine, Elisa}`.
- The artifact records `reviewed-runtime-evidence`,
  `checked-before-next-l0-iteration`, `interruptsWithinOneIteration:true`,
  `resumeRequiresOperatorGo:true`, `actualProcessKill:false`,
  `runtimeOpened:false`, and `l0RuntimeAllowed:false`.
- The pre-iteration guard fails closed with `E_L0_OPERATOR_HALT_REQUESTED`
  before any future L0 work runs.
- `classifyL0Readiness()` consumes helper-produced reviewed halt guard evidence
  without weakening its existing blockers.
- no L0 selector/runtime, process kill, signal/AbortController interruption,
  Phase 9 objective lifecycle mutation, L1 runtime consumer,
  L2-authoritative wiki behavior, L4 swarm, L5 capstone, provider automation,
  GUI/clipboard relay, live Phase 12 run state, claim/export,
  publication/Graphify writeback, real-data read, biomedical claim, commit, or
  push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.3.3-l0-operator-halt-contract-verdict-2026-06-18.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat3-t13.3.3-l0-operator-halt-contract-verdict-2026-06-18.md`.

Codex authored this implementation and did not self-ACCEPT it. Scoped commit
and push are authorized by the standing operator instruction after non-author
HAT 3 ACCEPT, with pre-existing Phase 10 diffs and scratch/noise excluded.

## T13.3.2 L0 Readiness Classifier

who: Codex authored the pure L0 readiness classifier after Claude Code
non-author HAT 1 ACCEPT and scoped operator GO.

when: 2026-06-18.

why: T13.3.1 repaired provider kernel projections, but `kernel.mode:"full"`
does not mean L0 is safe to run. Wave 3 needs a deterministic fail-closed
classifier that turns the remaining capability degraded reasons plus explicit
halt and multi-operator evidence into blockers/warnings before any future L0
selector HAT can open.

what:

- `environment/autonomous/l0/preflight.js`
- `environment/tests/autonomous/l0/preflight.test.js`
- `README.md`
- `package.json`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `phase9-vre-feature-ledger.md`
- `phase13-vre-feature-ledger.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/phase13-implementation-plan/phase13-implementation-status-ledger.md`
- `../vibe-science/blueprints/private/WIKI_VRE/sources/phase13-implementation-plan.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

verification:

- RED: `node --test environment/tests/autonomous/l0/preflight.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/autonomous/l0/preflight.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` must fail with
  `autonomousTests` expected `5`, got `6` if the counted test is present
  without the count repair.
- RED: `node environment/tests/ci/run-all.js` failed
  `phase11-current-status` until README/current-status projections were
  regenerated from the new `autonomousTests=6` count.
- GREEN: target L0 readiness test PASS 7/7; `npm run test:phase13`
  PASS 43/43; `validate-counts.js` PASS with `autonomousTests=6`;
  `phase11-current-status.js` PASS; explicit Phase 9 and Phase 13 ledger
  checks PASS; `run-all.js` PASS; `npm run check` PASS 1703 tests, 1694 pass,
  0 fail, 9 skipped; `git diff --check` PASS with CRLF warning only for the
  ledger.

scope:

- This row opens only a pure injected-input readiness classifier under
  `environment/autonomous/l0/`.
- The classifier reads no filesystem state, shells out to nothing, calls no
  `bin/vre`, creates no run state, reads no real research data, and always
  returns `runtimeOpened:false`.
- It classifies kernel non-full, unavailable projections, stale memory, missing
  command contracts, missing halt evidence, invalid halt operator, and
  incomplete `{Carmine, Elisa}` operator evidence as blockers.
- Connector, automation, domain-pack bundle absence, and unresolved-R2 derived
  count remain visible warnings unless an injected run profile requires them.
- The happy path uses explicitly `injected-hypothetical` halt evidence; it does
  not imply the halt runtime exists.
- no L0 selector/runtime, halt CLI runtime, L1 runtime consumer,
  L2-authoritative wiki behavior, L4 swarm, L5 capstone, provider automation,
  GUI/clipboard relay, live Phase 12 run state, claim/export,
  publication/Graphify writeback, real-data read, biomedical claim, commit, or
  push is opened by this row.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat1-t13.3.2-l0-readiness-classifier-verdict-2026-06-18.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase13/turns/claude-hat3-t13.3.2-l0-readiness-classifier-verdict-2026-06-18.md`.

Codex authored this implementation and did not self-ACCEPT it. Scoped commit
and push may proceed only by explicit path staging, excluding pre-existing
Phase 10 diffs and scratch/noise.

## T15.2 Edition-Isolation Validators

who: Codex authored the validator/test-only hardening after Claude Code
non-author HAT 1 ACCEPT and standing operator GO.

when: 2026-06-21.

why: T15.1 proved the default-off autonomy tier, but the six-check
edition-isolation contract still lacked a state-namespace split and an
end-to-end smoke proof that base readers ignore autonomous-state residue.
Without this guard, a future base reader could accidentally surface records
from .vibe-science-environment/autonomous/** while the tier remains off.

what:

- environment/tests/ci/validate-edition-isolation.js
- environment/tests/autonomous/isolation/state-namespace-split.test.js
- environment/tests/autonomous/isolation/isolation-smoke.test.js
- environment/tests/ci/validate-counts.js
- package.json
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase13-vre-feature-ledger-index.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/81-hat1-stop-t15-2-edition-isolation-validators-2026-06-21.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json
- ../vibe-science/blueprints/private/WIKI_VRE/tools/check-decision-gates.states.test.mjs

verification:

- RED: node --test environment/tests/autonomous/isolation/state-namespace-split.test.js failed because the test file did not exist.
- RED: node --test environment/tests/autonomous/isolation/isolation-smoke.test.js failed because the test file did not exist.
- RED: explicit check-phase13-ledger failed with E_PHASE13_TRACE_MISSING for state-namespace-split before this row.
- RED: explicit check-phase9-ledger failed with E_VRE_LEDGER_UPDATE_REQUIRED and E_SPEC_LEDGER_UPDATE_REQUIRED for package.json, validate-counts.js, and validate-edition-isolation.js before the bridge rows.
- GREEN: state-namespace-split.test.js PASS 5/5.
- GREEN: isolation-smoke.test.js PASS 1/1.
- GREEN: validate-edition-isolation.test.js PASS 2/2 and validate-edition-isolation.js PASS.
- GREEN: validate-counts.js PASS with autonomousTests=9.
- GREEN: npm run test:phase13 PASS 57/57.
- GREEN: run-all.js initially exposed the expected generated current-status count drift; README.md and the tracked Phase 11 current-status WIKI fixture were regenerated from the live count model, then phase11-current-status.js and run-all.js both passed.

scope:

- This row opens only validator/test hardening for edition isolation.
- The static guard scans reviewed base reader files and rejects direct literal, path.join, and resolveInside references to .vibe-science-environment/autonomous/**.
- The smoke test creates a real autonomous residue file and calls production getOperatorStatus() and getOrchestratorStatus(), asserting that no autonomous state reference is surfaced.
- No autonomy tier value, entrypoint, T15.5 mid-loop runtime, provider automation, OBDK execution, real-data read, biomedical claim authority, claim/export, Graphify, commit, or push is opened.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-t15.2-edition-isolation-validators-verdict-2026-06-21.md.

Codex authored this HAT2 patch and must not self-ACCEPT it. HAT3 review is required before closure.

## TL0.1 L0 Halt-Snapshot Write-Ahead Contract

who: Codex authored the TL0.1 safety write-ahead helper after Claude Code
non-author HAT 1 ACCEPT and runtime-GO adjudication for TL0.1 only.

when: 2026-06-22.

why: TL0.1 is the first L0 safety infrastructure slice. Before any future
bounded L0 reasoning loop can run, the system needs a write-ahead recovery
contract that records the iteration, budget left, and operator-halt check in
the existing Phase 9 resume snapshot before a candidate action executes.

what:

- environment/autonomous/l0/halt-snapshot.js
- environment/tests/autonomous/l0/halt-snapshot.test.js
- environment/schemas/phase9-resume-snapshot.schema.json
- environment/tests/schemas/phase9-resume-snapshot.schema.test.js
- environment/tests/fixtures/phase9/resume-snapshot/valid-l0-write-ahead.json
- environment/tests/fixtures/phase9/resume-snapshot/invalid-l0-missing-halt-checked.json
- environment/tests/ci/validate-counts.js
- package.json
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/176-hat1-stop-tl0-1-l0-halt-snapshot-contract-2026-06-22.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l0/halt-snapshot.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before `halt-snapshot.js` existed.
- RED: `node --test environment/tests/schemas/phase9-resume-snapshot.schema.test.js`
  failed because the valid L0 write-ahead fixture was rejected by
  `additionalProperties:false` before the schema extension.
- RED: `node environment/tests/ci/validate-counts.js` failed
  `autonomousTests` expected 9, got 10 before the count repair.
- RED: `node environment/tests/ci/check-phase13-ledger.js` failed
  `E_PHASE13_TRACE_MISSING environment/autonomous/l0/halt-snapshot.js`
  before this row.
- GREEN: target halt-snapshot test PASS 5/5.
- GREEN: phase9 resume-snapshot schema test PASS 13/13.
- GREEN: `node environment/tests/ci/validate-counts.js` PASS with
  `autonomousTests=10`.
- GREEN: `npm run test:phase13` PASS 62/62.
- GREEN: explicit Phase9 changed-file ledger probe PASS.
- GREEN: `node environment/tests/ci/phase11-current-status.js` PASS.
- GREEN: `node environment/tests/ci/run-all.js` PASS.
- GREEN: `npm run check` PASS 1935 tests, 1926 pass, 0 fail, 9 skipped.

scope:

- TL0.1 adds only the write-ahead safety helper and tests. It writes L0
  recovery metadata into the existing `resume-snapshot.json` path and does not
  create a sidecar truth source.
- The helper runs no autonomous reasoning. It creates no bounded loop, selector,
  high-stakes gate, guardrail controller, CLI command, provider call, OBDK
  call, real-data read, claim/export path, Graphify write, commit, or push.
- Claude HAT 1 explicitly moved the specific runtime-GO requirement to TL0.2,
  the first task that would actually run the bounded L0 reasoning loop.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.1-l0-halt-snapshot-contract-verdict-2026-06-22.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.1-l0-halt-snapshot-contract-verdict-2026-06-22.md`.

Codex authored this HAT2 patch and did not self-ACCEPT it. Commit/push is
scoped to the reviewed TL0.1 VRE payload only.

## TL0.2 L0 Bounded Reasoning Loop Policy

who: Codex authored the TL0.2 bounded L0 reasoning-loop policy after Claude
Code non-author HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: TL0.2 is the first L0 slice that may execute a bounded attended-batch
reasoning loop. It must prove hard stop-hooks, tier hierarchy, and TL0.1
write-ahead-before-action before any later selector, high-stakes gate,
guardrail, CLI, provider, or real-data integration can be opened.

what:

- environment/autonomous/l0/reasoning-loop.js
- environment/tests/autonomous/l0/reasoning-loop.test.js
- environment/autonomous/ENTRYPOINTS.json
- environment/tests/ci/validate-counts.js
- package.json
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/178-hat1-stop-tl0-2-l0-bounded-reasoning-loop-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l0/reasoning-loop.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before `reasoning-loop.js` existed.
- RED: `node environment/tests/ci/validate-counts.js` failed
  `autonomousTests` expected 10, got 11 before the count repair.
- RED: explicit Phase13 ledger probe failed
  `E_PHASE13_TRACE_MISSING environment/tests/autonomous/l0/reasoning-loop.test.js`
  before this row.
- RED: explicit Phase9 ledger probe failed for `package.json` and
  `environment/tests/ci/validate-counts.js` before the Phase9 bridge rows.
- GREEN: target reasoning-loop test PASS 10/10.
- GREEN: `node environment/tests/ci/validate-counts.js` PASS with
  `autonomousTests=11`.
- GREEN: explicit Phase13 and Phase9 changed-file ledger probes PASS.
- GREEN: `npm run test:phase13` PASS 72/72.
- GREEN: `node environment/tests/ci/run-all.js` PASS.
- GREEN: `npm run check` PASS 1945 tests, 1936 pass, 0 fail, 9 skipped.
- GREEN: WIKI decision-gate tests PASS 21/21; WIKI lint issueCount 0;
  registry check and mirror check PASS.
- GREEN: Claude Code HAT3 ACCEPT recorded via the canonical relay.

scope:

- TL0.2 adds only a pure, injected, attended-batch bounded L0 loop policy and
  metadata allowlist extension. It enforces runtime mode, max-iteration and
  budget stop-hooks, tier hierarchy, worker non-authority, and TL0.1
  write-ahead-before-action.
- The loop creates no CLI dispatch, provider call, OBDK execution, real-data
  read, biomedical claim authority, accepted claim-edge write, claim promotion,
  export/publication path, Graphify write, high-stakes operator gate,
  guardrail controller, Hermes symbol import, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.2-l0-bounded-reasoning-loop-verdict-2026-06-23.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.2-l0-bounded-reasoning-loop-verdict-2026-06-23.md`.

Codex authored this HAT2 patch and did not self-ACCEPT it. Commit/push is
scoped to the reviewed TL0.2 VRE payload only.

## TL0.3 Next-Scientific-Action Selector Policy

who: Codex authored the TL0.3 next-scientific-action selector after Claude
Code non-author HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: TL0.3 is the L0 decision component that selects one next scientific action
inside the attended lane. It must prove read-only direction-memory discipline,
deterministic ranking, LAW 12 INSTINCT non-override, and proposal-only
high-stakes handling before TL0.4 high-stakes operator-gate work can start.

what:

- environment/autonomous/l0/action-selector.js
- environment/tests/autonomous/l0/action-selector.test.js
- environment/autonomous/ENTRYPOINTS.json
- package.json
- environment/tests/ci/validate-counts.js
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/180-hat1-stop-tl0-3-next-scientific-action-selector-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l0/action-selector.test.js`
  first failed because the test file was absent, then failed with
  `ERR_MODULE_NOT_FOUND` while `action-selector.js` was absent.
- RED: `node environment/tests/ci/validate-counts.js` failed
  `autonomousTests` expected 11, got 12 before the count repair.
- RED: package-script probe failed
  `E_PHASE13_TEST_SCRIPT_MISSING_ACTION_SELECTOR` before `test:phase13` wiring.
- RED: explicit Phase13 ledger probe failed
  `E_PHASE13_TRACE_MISSING environment/autonomous/l0/action-selector.js`
  before this row.
- GREEN: target action-selector test PASS 11/11; `validate-counts.js` PASS
  with `autonomousTests=12`; package-script probe PASS;
  `phase11-current-status.js` PASS; explicit Phase13 and Phase9 ledger probes
  PASS; `npm run test:phase13` PASS 83/83; `run-all.js` PASS; WIKI checks
  PASS; `npm run check` PASS 1956 tests, 1947 pass, 0 fail, 9 skipped; Claude
  Code HAT3 ACCEPT recorded.

scope:

- TL0.3 adds only a pure next-scientific-action selector and counted autonomous
  test. The selector reads durable objective, gate, and direction-memory inputs;
  returns exactly one proposal and JSON-serializable rationale; uses only an
  injected artifact writer; blocks killed/contradicted directions unless the
  exact `doNotRepeatUnless` condition is satisfied; and marks high-stakes work
  as `requiresOperatorGate:true` for TL0.4.
- It writes no direction lifecycle event, promotes no claim, creates no
  accepted claim edge, widens no dataset, dispatches no CLI command, executes
  no provider or OBDK call, reads no real biomedical data, exports nothing, and
  performs no Graphify write.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.3-next-scientific-action-selector-verdict-2026-06-23.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.3-next-scientific-action-selector-verdict-2026-06-23.md`.

Codex authored this HAT2 patch and did not self-ACCEPT it. Commit/push is
scoped to the reviewed TL0.3 VRE payload only.

## TL0.4 High-Stakes Operator Gate

who: Codex authored the TL0.4 high-stakes operator gate after Claude Code
non-author HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: TL0.4 is the L0 brake that turns TL0.3 high-stakes proposals into durable
operator STOP records before any high-stakes action can run. It must prove
pre-action halt ordering, artifact-based resume metadata, writer-failure
fail-closed behavior, and preservation of TL0.1/TL0.2 halt semantics.

what:

- environment/autonomous/l0/high-stakes-gate.js
- environment/autonomous/l0/reasoning-loop.js
- environment/tests/autonomous/l0/high-stakes-gate.test.js
- package.json
- environment/tests/ci/validate-counts.js
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/182-hat1-stop-tl0-4-high-stakes-operator-gate-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l0/high-stakes-gate.test.js`
  first failed because the test file was absent, then failed with
  `ERR_MODULE_NOT_FOUND` while `high-stakes-gate.js` was absent.
- RED: `node environment/tests/ci/validate-counts.js` failed
  `autonomousTests` expected 12, got 13 before the count repair.
- RED: package-script probe failed
  `E_PHASE13_TEST_SCRIPT_MISSING_HIGH_STAKES_GATE` before `test:phase13`
  wiring.
- GREEN: target high-stakes gate test PASS 10/10.
- GREEN: `node environment/tests/ci/validate-counts.js` PASS with
  `autonomousTests=13`.
- GREEN: `node environment/tests/ci/phase11-current-status.js` PASS.
- GREEN: explicit Phase13 and Phase9 changed-file ledger probes PASS.
- GREEN: `npm run test:phase13` PASS 93/93.
- GREEN: `node environment/tests/ci/run-all.js` PASS.
- GREEN: WIKI mirror/gate/registry/lint suite PASS 30/30.
- GREEN: `npm run check` PASS 1966 tests, 1957 pass, 0 fail, 9 skipped.

scope:

- TL0.4 adds only a high-stakes STOP/brake helper, one counted autonomous
  test, and minimal reasoning-loop pre-action integration. It classifies
  TL0.3 `requiresOperatorGate:true` proposals plus named high-stakes actions,
  writes durable operator-gate records with `actionExecuted:false`,
  `resumeRequiresOperatorGo:true`, and `runtimeOpened:false`, and returns a
  stop result before the action callback can mutate state.
- It preserves TL0.2 forbidden errors for claim promotion, accepted claim-edge,
  export, and Graphify. It does not execute high-stakes work, write direction
  lifecycle events, promote claims, create accepted claim edges, widen datasets,
  dispatch CLI commands, execute provider/OBDK calls, read real biomedical
  data, export, perform Graphify writes, implement TL0.5+, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.4-high-stakes-operator-gate-verdict-2026-06-23.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.4-high-stakes-operator-gate-verdict-2026-06-23.md`.

Codex authored this HAT2 patch and did not self-ACCEPT it. Commit/push is
scoped to the reviewed TL0.4 VRE payload only.

## TL0.5 Guardrail Controller Hermes Symbols

who: Codex authored the TL0.5 guardrail controller after Claude Code
non-author HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: TL0.5 is the L0 tool-intent brake that rejects destructive shell commands,
untrusted tool calls, and never-parallel actions before a worker-tier action can
run. It consumes only reviewed MIT Hermes symbols through a VRE-local Node
adaptation and must preserve TL0.2 hard blockers plus TL0.4 high-stakes STOP
semantics.

what:

- environment/autonomous/l0/guardrail-controller.js
- environment/autonomous/l0/reasoning-loop.js
- environment/tests/autonomous/l0/guardrail-controller.test.js
- package.json
- environment/tests/ci/validate-counts.js
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase13-implementation-plan/tl0-5-hermes-l0-guardrail-provenance-verdict-2026-06-23.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/184-hat1-stop-tl0-5-guardrail-controller-hermes-symbols-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: per-symbol Hermes L0 provenance verdict was absent before runtime code.
- RED: `node --test environment/tests/autonomous/l0/guardrail-controller.test.js`
  first failed with `ERR_MODULE_NOT_FOUND` while `guardrail-controller.js` was
  absent.
- RED: `node environment/tests/ci/validate-counts.js` failed
  `autonomousTests` expected 13, got 14 before the count repair.
- RED: package-script probe failed
  `E_PHASE13_TEST_SCRIPT_MISSING_GUARDRAIL_CONTROLLER` before `test:phase13`
  wiring.
- GREEN: target guardrail-controller test PASS 9/9; `validate-counts.js` PASS
  with `autonomousTests=14`; package-script probe PASS;
  `phase11-current-status.js` PASS; explicit Phase13 and Phase9 ledger probes
  PASS; `npm run test:phase13` PASS 103/103; `run-all.js` PASS; WIKI
  mirror/gate/registry/lint suite PASS 32/32; `npm run check` PASS 1976
  tests, 1967 pass, 0 fail, 9 skipped.

scope:

- TL0.5 adds only a pure L0 guardrail-controller helper, one counted
  autonomous test, and minimal reasoning-loop worker-tier pre-action
  integration. It rejects destructive terminal commands, overwrite redirects,
  unreviewed untrusted tool calls, untrusted tool prefixes, and never-parallel
  actions with `runtimeOpened:false` and `autonomousRuntimeAllowed:false`.
- The implementation is VRE-local Node code adapted only from reviewed MIT
  Hermes symbols recorded in the durable per-symbol provenance verdict. It does
  not copy Python bodies, consume OpenHuman/AGPL/CC symbols, dispatch tools,
  call providers or OBDK, read real biomedical data, write direction lifecycle
  events, promote claims, create accepted claim edges, export, perform Graphify
  writes, implement TL0.6+, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.5-guardrail-controller-hermes-symbols-verdict-2026-06-23.md`.

Claude Code HAT 3 review is pending. Codex authored this HAT2 patch and did
not self-ACCEPT it.

## TL1.4 L1 Runtime Consumer

who: Codex authored the TL1.4 L1 runtime consumer after Claude Code
non-author HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: Phase 13 delivered the L1 table, availability probe, and missing-skill
degrade path as policy-only surfaces. TL1.4 is the narrow runtime consumer:
given a reviewed stage, injected availability inputs, an injected executor,
and an injected writer, it produces a durable invocation or unavailable
record without installing skills, discovering host skills ambiently, or
opening L4/L5/provider/OBDK/real-data work.

what:

- environment/autonomous/l1/skill-runtime.js
- environment/tests/autonomous/l1/skill-runtime.test.js
- environment/autonomous/ENTRYPOINTS.json
- package.json
- environment/tests/ci/validate-counts.js
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/190-hat1-stop-tl1-4-l1-runtime-consumer-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l1/skill-runtime.test.js`
  failed with `ERR_MODULE_NOT_FOUND` while `skill-runtime.js` was absent.
- RED: `node environment/tests/ci/validate-counts.js` would fail until
  `autonomousTests` moved from 15 to 16; `phase11-current-status.js` then
  caught stale README/current-status projections until they were repaired.
- GREEN: target skill-runtime test PASS 6/6; `validate-counts.js` PASS with
  `autonomousTests=16`; `phase11-current-status.js` PASS; explicit Phase13
  and Phase9 changed-file ledger probes PASS; `npm run test:phase13` PASS
  112/112; `node environment/tests/ci/run-all.js` PASS; WIKI decision-gates,
  registry, entity export, schema field, lint, mirror, and WIKI tool tests
  PASS; `git diff --check` PASS with CRLF warnings only; `npm run check`
  PASS 1985 tests, 1976 pass, 0 fail, 9 skipped.
- HAT3 remains required before closure.

scope:

- TL1.4 adds only a deterministic L1 runtime consumer, one counted
  autonomous test, entrypoint metadata with `runtimeOpened:false`,
  `test:phase13` wiring, count/current-status repair, and trace.
- It uses only injected executor and writer callbacks; missing required
  skills route through reviewed `SKILL_UNAVAILABLE` degrade and optional
  missing skills stay visible but non-blocking.
- It records reconstructable invocation/degrade artifacts with
  `runtimeOpened:false`, `unattendedRuntimeOpened:false`,
  `providerAutomationInvoked:false`, `skillInstallAttempted:false`, and
  `hostSkillDiscoveryAttempted:false`.
- It does not call providers, OBDK, reviewed-api automation, browser/GUI,
  skill installation, host skill discovery, real data, direction lifecycle
  writers, claim/export paths, Graphify, L4/L5 orchestration, CLI dispatch,
  unattended runtime, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl1.4-l1-runtime-consumer-verdict-2026-06-23.md`.

Claude Code HAT 3 review is pending. Codex authored this HAT2 patch and did
not self-ACCEPT it.

## TL0.6 Attended Dry Run

who: Codex authored the TL0.6 attended dry-run after Claude Code non-author
HAT 1 ACCEPT and the operator's specific runtime GO.

when: 2026-06-23.

why: TL0.6 is the final TL0 composition seam. It must prove that the reviewed
TL0.1 through TL0.5 surfaces can run together as an attended dry run: selector
rationale is persisted, high-stakes proposals stop before execution, the
operator-gate artifact is reconstructable after a cold restart, and resume is
allowed only after an explicit operator GO while TL0.2/TL0.5 blockers stay
active.

what:

- environment/autonomous/l0/attended-dry-run.js
- environment/tests/autonomous/l0/attended-dry-run.test.js
- package.json
- environment/tests/ci/validate-counts.js
- README.md
- environment/tests/fixtures/phase11/current-status-wiki.md
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/188-hat1-stop-tl0-6-attended-dry-run-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: `node --test environment/tests/autonomous/l0/attended-dry-run.test.js`
  failed with `ERR_MODULE_NOT_FOUND` while `attended-dry-run.js` was absent.
- RED: after implementation, the target test initially exposed a real semantic
  mismatch: resume stopped with TL0.2 `budget-exhausted`, not `max-iterations`,
  because the final allowed dry-run resume iteration consumes the last budget.
- RED: `node environment/tests/ci/validate-counts.js` would fail until
  `autonomousTests` moved from 14 to 15; explicit Phase13 and Phase9 ledger
  probes failed before this section and the Phase9 bridge row existed.
- GREEN: target attended-dry-run test PASS 3/3; `validate-counts.js` PASS with
  `autonomousTests=15`; `phase11-current-status.js` PASS; explicit Phase13
  and Phase9 changed-file ledger probes PASS; `npm run test:phase13` PASS
  106/106; `node environment/tests/ci/run-all.js` PASS; WIKI decision-gates,
  registry, entity export, schema field, lint, and mirror checks PASS;
  `git diff --check` PASS with CRLF warnings only; `npm run check` PASS 1979
  tests, 1970 pass, 0 fail, 9 skipped.
- Claude Code HAT3 ACCEPT is recorded in
  `C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.6-attended-dry-run-verdict-2026-06-23.md`.

scope:

- TL0.6 adds only a pure attended dry-run orchestrator, one counted autonomous
  test, package-script inclusion, count/current-status repair, and trace. It
  composes the reviewed selector, bounded loop, high-stakes gate, guardrail
  controller, and halt-snapshot write-ahead through injected/default local
  APIs.
- It writes dry-run artifacts under the L0 dry-run namespace and marks
  `runtimeOpened:false`, `autonomousRuntimeAllowed:false`,
  `actionExecuted:false`, and `resumeRequiresOperatorGo:true`. Missing tier,
  non-attended mode, and unattended-batch attempts fail before any artifact is
  written.
- It does not open provider/OBDK execution, reviewed-api automation, real-data
  reads, direction lifecycle writers, claim promotion, accepted claim-edge
  writers, export/publication paths, Graphify writes, CLI dispatch, unattended
  runtime, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-tl0.6-attended-dry-run-verdict-2026-06-23.md`.

Claude Code HAT 3 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat3-tl0.6-attended-dry-run-verdict-2026-06-23.md`.

Codex authored this HAT2 patch and did not self-ACCEPT it. Commit/push is
scoped to the reviewed TL0.6 VRE payload only.

## FU TL0 Action Selector High-Stakes Aliases

who: Codex authored the follow-up after Claude Code non-author HAT 1 ACCEPT
and the operator's specific runtime GO.

when: 2026-06-23.

why: Claude's TL0.5 HAT3 review found that `action-selector.js` and its test
contained a coupled, un-gated dirty change. This follow-up adopts that pair
under its own gate because the four names are genuine TL0.4 high-stakes action
types that the TL0.3 selector should mark proposal-only.

what:

- environment/autonomous/l0/action-selector.js
- environment/tests/autonomous/l0/action-selector.test.js
- phase13-vre-feature-ledger.md
- phase9-vre-feature-ledger.md
- ../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/186-hat1-stop-fu-tl0-action-selector-high-stakes-aliases-2026-06-23.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-status-ledger.md
- ../vibe-science/blueprints/private/phase14-world-class-vre/phase14-world-class-changelog.md
- ../vibe-science/blueprints/private/WIKI_VRE/log.md
- ../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json

verification:

- RED: a temporary clean worktree at committed HEAD `a215592` copied in the
  candidate test while preserving HEAD `action-selector.js`; the HEAD source
  lacked all four aliases and the candidate test failed
  `TL0.3 high-stakes classification mirrors TL0.4 named gate actions` with
  `false !== true` and `RED_EXIT=1`.
- GREEN so far: current target action-selector test PASS 12/12; explicit
  Phase13 and Phase9 changed-file ledger probes PASS.
- Full aggregate, WIKI checks, `npm run check`, and HAT3 remain required before
  closure.

scope:

- This follow-up only extends the TL0.3 selector high-stakes action set with
  `promote-claim`, `write-accepted-claim-edge`, `new-direction`, and
  `direction-revival`, plus one regression in the existing test file.
- No new test file is added, so `autonomousTests` stays 14 and
  `validate-counts.js` must not change.
- It does not touch `reasoning-loop.js`, `guardrail-controller.js`,
  `high-stakes-gate.js`, provider/OBDK, real-data reads, direction lifecycle
  writes, claim/export paths, Graphify, TL0.6 attended dry run, unattended
  runtime, commit, or push.

reviewer:

Claude Code HAT 1 ACCEPT is recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase14/turns/claude-hat1-fu-tl0-action-selector-high-stakes-aliases-verdict-2026-06-23.md`.

Claude Code HAT 3 review is pending. Codex authored this HAT2 patch and did
not self-ACCEPT it.
