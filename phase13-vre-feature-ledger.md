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
