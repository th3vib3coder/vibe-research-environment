import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PHASE_12_FULL_CLOSEOUT_REASON_CODES,
  validatePhase12FullCloseoutEvidence
} from '../../phase12/phase-12-closeout.js';
import {
  default as validatePhase12FullCloseout
} from './phase12-full-closeout.js';
import { validateCloseoutText } from './validate-closeout-honesty.js';

const FIXTURE_PATH = 'environment/tests/fixtures/phase12/phase-12-closeout.json';
const CLOSEOUT_PATH = 'environment/closures/phase12-full-closeout-2026-06-18.md';
const STACK_COMMIT = 'f5af4f1ceb8c10c1ae6115ec2e9934e29f6e7ec2';
const STACK_CI_RUN = '27742208747';

async function loadFixture() {
  return JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
}

test('valid Phase 12 closeout closes scaffold only', async () => {
  const evidence = await loadFixture();
  const result = validatePhase12FullCloseoutEvidence(evidence);

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.closesPhase12Scaffold, true);
  assert.equal(result.liveRuntimeReady, false);
  assert.equal(result.biomedicalResult, false);
});

test('missing roster task fails closed', async () => {
  const evidence = await loadFixture();
  evidence.tasks = evidence.tasks.filter((task) => task.taskId !== 'T12.4.0');

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.taskMissing &&
      issue.taskId === 'T12.4.0'
  ));
});

test('wrong stack commit or CI run fails closed', async () => {
  const evidence = await loadFixture();
  evidence.phase12StackCommit = 'deadbeef';
  evidence.phase12StackCiRun = '0';

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.stackCommitWrong
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.stackCiWrong
  ));
});

test('committed task must match stack commit and CI', async () => {
  const evidence = await loadFixture();
  const task = evidence.tasks.find((item) => item.taskId === 'T12.3.0');
  task.commit = 'deadbeef';
  task.ciRun = '0';

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.committedTaskWrongCommit &&
      issue.taskId === 'T12.3.0'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.committedTaskWrongCi &&
      issue.taskId === 'T12.3.0'
  ));
});

test('T12.0.0 cannot be represented as a runtime commit', async () => {
  const evidence = await loadFixture();
  const task = evidence.tasks.find((item) => item.taskId === 'T12.0.0');
  task.status = 'closed-pushed-ci-green';
  task.documentationOnly = false;
  task.commit = STACK_COMMIT;
  task.ciRun = STACK_CI_RUN;

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.taskNotClosed &&
      issue.taskId === 'T12.0.0'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.documentationOnlyHasCommit &&
      issue.taskId === 'T12.0.0'
  ));
});

test('forbidden live runtime and biomedical boundaries fail closed', async () => {
  const evidence = await loadFixture();
  evidence.liveRuntime.readyForAutonomousExecution = true;
  evidence.forbiddenBoundaries.providerAutomation = true;
  evidence.forbiddenBoundaries.graphifyAsEvidence = true;
  evidence.evidencePolicy.biomedicalClaimAuthority = true;

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert.equal(result.liveRuntimeReady, true);
  assert.equal(result.biomedicalResult, true);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.liveRuntimeOverclaim
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen &&
      issue.boundary === 'providerAutomation'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen &&
      issue.boundary === 'graphifyAsEvidence'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.evidencePolicyWrong
  ));
});

test('delivery and residual risk records are required', async () => {
  const evidence = await loadFixture();
  evidence.residualRisks = evidence.residualRisks.filter((risk) =>
    risk.id !== 'PHASE12-BIOMEDICAL-AUTHORITY-DEFERRED'
  );
  evidence.deliveryAttestation.statusProjectionRefreshed = false;
  evidence.deliveryAttestation.closeoutHonestyValidated = false;
  evidence.deliveryAttestation.exitGateResults.push('DONE');

  const result = validatePhase12FullCloseoutEvidence(evidence, { verifyGit: false });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.residualRiskMissing &&
      issue.riskId === 'PHASE12-BIOMEDICAL-AUTHORITY-DEFERRED'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.statusProjectionMissing
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.closeoutHonestyMissing
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_12_FULL_CLOSEOUT_REASON_CODES.invalidExitGateResult &&
      issue.result === 'DONE'
  ));
});

test('closeout honesty catches overbroad implementation-complete claims', async () => {
  const markdown = [
    '# Synthetic Bad Closeout',
    '',
    '| # | Gate | Result | Evidence |',
    '|---:|---|---|---|',
    '| 1 | implementation-complete with saved evidence | PASS | '
      + '[evidence](phase12-full-closeout-evidence-2026-06-18.json) |',
    ''
  ].join('\n');
  const violations = await validateCloseoutText(CLOSEOUT_PATH, markdown);

  assert(violations.some((violation) =>
    violation.includes('implementation-complete claim links to null metrics')
  ));
});

test('phase12 closeout source stays pure and avoids sibling WIKI dependency', async () => {
  const source = await readFile('environment/phase12/phase-12-closeout.js', 'utf8');
  const validator = await readFile('environment/tests/ci/phase12-full-closeout.js', 'utf8');

  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
  assert(!/vibe-science\/blueprints\/private\/WIKI_VRE/u.test(validator));
});

test('phase12 full closeout CI module passes production cases', async () => {
  await validatePhase12FullCloseout();
});
