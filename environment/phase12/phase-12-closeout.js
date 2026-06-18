import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RELAY_BASE = 'C:/Users/Test-User/.codex/relay/nuove_skill_phase12/turns';
const STACK_COMMIT = 'f5af4f1ceb8c10c1ae6115ec2e9934e29f6e7ec2';
const STACK_CI_RUN = '27742208747';

export const EXPECTED_PHASE12_TASKS = Object.freeze([
  {
    taskId: 'T12.0.0',
    status: 'closed-documentation-state-only',
    documentationOnly: true,
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.0.0-phase12-plan-freeze-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.1.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.1.0-artifact-contracts-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.2.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.2.0-manual-relay-dry-run-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.3.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.3.0-cli-and-adapter-surface-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.4.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.4.0-bounded-loop-controller-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.5.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.5.0-phase10-phase11-bridge-validators-verdict-2026-06-18.md`
  },
  {
    taskId: 'T12.6.0',
    status: 'closed-pushed-ci-green',
    hat3AcceptRelay:
      `${RELAY_BASE}/claude-hat3-t12.6.0-acceptance-harness-verdict-2026-06-18.md`
  }
]);

const FORBIDDEN_BOUNDARIES = Object.freeze([
  'liveRuntime',
  'phase12RunState',
  'providerAutomation',
  'guiClipboardRelay',
  'phase10Publication',
  'phase10Writeback',
  'graphifyExecution',
  'graphifyWriteback',
  'graphifyAsEvidence',
  'claimLedgerMutation',
  'claimEdgeCreation',
  'exportPackaging',
  'realDataRead',
  'biomedicalClaim',
  'privateWikiCiDependency'
]);

const REQUIRED_RESIDUAL_RISKS = Object.freeze([
  'PHASE12-LIVE-RUNTIME-DEFERRED',
  'PHASE12-PROVIDER-GUI-DEFERRED',
  'PHASE12-PUBLICATION-GRAPHIFY-DEFERRED',
  'PHASE12-BIOMEDICAL-AUTHORITY-DEFERRED'
]);

const ALLOWED_EXIT_GATE_RESULTS = new Set([
  'PASS',
  'PARTIAL',
  'FALSE-POSITIVE',
  'DEFERRED'
]);

export const PHASE_12_FULL_CLOSEOUT_REASON_CODES = Object.freeze({
  invalidSchemaVersion: 'E_PHASE12_FULL_CLOSEOUT_SCHEMA_VERSION',
  wrongPhase: 'E_PHASE12_FULL_CLOSEOUT_WRONG_PHASE',
  wrongStatus: 'E_PHASE12_FULL_CLOSEOUT_WRONG_STATUS',
  wrongClaim: 'E_PHASE12_FULL_CLOSEOUT_WRONG_CLAIM',
  stackCommitMissing: 'E_PHASE12_FULL_CLOSEOUT_STACK_COMMIT_MISSING',
  stackCommitWrong: 'E_PHASE12_FULL_CLOSEOUT_STACK_COMMIT_WRONG',
  gitCommitMissing: 'E_PHASE12_FULL_CLOSEOUT_GIT_COMMIT_MISSING',
  gitCommitNotAncestor: 'E_PHASE12_FULL_CLOSEOUT_GIT_COMMIT_NOT_ANCESTOR',
  stackCiWrong: 'E_PHASE12_FULL_CLOSEOUT_STACK_CI_WRONG',
  taskMissing: 'E_PHASE12_FULL_CLOSEOUT_TASK_MISSING',
  taskNotClosed: 'E_PHASE12_FULL_CLOSEOUT_TASK_NOT_CLOSED',
  documentationOnlyHasCommit: 'E_PHASE12_FULL_CLOSEOUT_DOC_ONLY_HAS_COMMIT',
  committedTaskMissingCommit: 'E_PHASE12_FULL_CLOSEOUT_TASK_COMMIT_MISSING',
  committedTaskWrongCommit: 'E_PHASE12_FULL_CLOSEOUT_TASK_COMMIT_WRONG',
  committedTaskWrongCi: 'E_PHASE12_FULL_CLOSEOUT_TASK_CI_WRONG',
  hat3AcceptMissing: 'E_PHASE12_FULL_CLOSEOUT_HAT3_ACCEPT_MISSING',
  hat3RelayWrong: 'E_PHASE12_FULL_CLOSEOUT_HAT3_RELAY_WRONG',
  forbiddenBoundaryOpen: 'E_PHASE12_FULL_CLOSEOUT_FORBIDDEN_BOUNDARY_OPEN',
  liveRuntimeOverclaim: 'E_PHASE12_FULL_CLOSEOUT_LIVE_RUNTIME_OVERCLAIM',
  evidencePolicyWrong: 'E_PHASE12_FULL_CLOSEOUT_EVIDENCE_POLICY_WRONG',
  residualRiskMissing: 'E_PHASE12_FULL_CLOSEOUT_RESIDUAL_RISK_MISSING',
  deliveryAttestationMissing: 'E_PHASE12_FULL_CLOSEOUT_ATTESTATION_MISSING',
  statusProjectionMissing: 'E_PHASE12_FULL_CLOSEOUT_STATUS_PROJECTION_MISSING',
  closeoutHonestyMissing: 'E_PHASE12_FULL_CLOSEOUT_HONESTY_MISSING',
  invalidExitGateResult: 'E_PHASE12_FULL_CLOSEOUT_EXIT_GATE_RESULT_INVALID'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function gitCommandOk(args) {
  try {
    execFileSync('git', args, { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function validateStackCommit(evidence, issues, options) {
  if (!hasText(evidence?.phase12StackCommit)) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.stackCommitMissing));
    return;
  }

  if (evidence.phase12StackCommit !== STACK_COMMIT) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.stackCommitWrong,
      { expected: STACK_COMMIT, actual: evidence.phase12StackCommit }
    ));
    return;
  }

  if (options.verifyGit === false) {
    return;
  }

  if (!gitCommandOk(['cat-file', '-e', `${STACK_COMMIT}^{commit}`])) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.gitCommitMissing));
  } else if (!gitCommandOk(['merge-base', '--is-ancestor', STACK_COMMIT, 'HEAD'])) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.gitCommitNotAncestor));
  }
}

function validateStackCi(evidence, issues) {
  if (
    evidence?.phase12StackCiRun !== STACK_CI_RUN ||
    evidence?.phase12StackCiConclusion !== 'success'
  ) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.stackCiWrong, {
      expectedRun: STACK_CI_RUN,
      actualRun: evidence?.phase12StackCiRun,
      actualConclusion: evidence?.phase12StackCiConclusion
    }));
  }
}

function validateDocumentationOnlyTask(task, expected, issues) {
  if (task.status !== expected.status || task.documentationOnly !== true) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.taskNotClosed,
      { taskId: expected.taskId }
    ));
  }

  if (hasText(task.commit) || hasText(task.ciRun)) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.documentationOnlyHasCommit,
      { taskId: expected.taskId }
    ));
  }
}

function validateCommittedTask(task, expected, issues) {
  if (task.status !== expected.status) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.taskNotClosed,
      { taskId: expected.taskId }
    ));
  }

  if (!hasText(task.commit)) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.committedTaskMissingCommit,
      { taskId: expected.taskId }
    ));
  } else if (task.commit !== STACK_COMMIT) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.committedTaskWrongCommit,
      { taskId: expected.taskId, expected: STACK_COMMIT, actual: task.commit }
    ));
  }

  if (task.ciRun !== STACK_CI_RUN || task.ciConclusion !== 'success') {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.committedTaskWrongCi,
      { taskId: expected.taskId }
    ));
  }
}

function validateHat3(task, expected, issues) {
  if (task.hat3Verdict !== 'ACCEPT') {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.hat3AcceptMissing,
      { taskId: expected.taskId }
    ));
  }

  if (task.hat3AcceptRelay !== expected.hat3AcceptRelay) {
    issues.push(issue(
      PHASE_12_FULL_CLOSEOUT_REASON_CODES.hat3RelayWrong,
      { taskId: expected.taskId }
    ));
  }
}

function validateTasks(evidence, issues) {
  const tasks = Array.isArray(evidence?.tasks) ? evidence.tasks : [];
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  for (const expected of EXPECTED_PHASE12_TASKS) {
    const task = tasksById.get(expected.taskId);
    if (task == null) {
      issues.push(issue(
        PHASE_12_FULL_CLOSEOUT_REASON_CODES.taskMissing,
        { taskId: expected.taskId }
      ));
      continue;
    }

    if (expected.documentationOnly) {
      validateDocumentationOnlyTask(task, expected, issues);
    } else {
      validateCommittedTask(task, expected, issues);
    }

    validateHat3(task, expected, issues);
  }
}

function validateBoundaries(evidence, issues) {
  const boundaries = evidence?.forbiddenBoundaries ?? {};
  for (const boundary of FORBIDDEN_BOUNDARIES) {
    if (boundaries[boundary] !== false) {
      issues.push(issue(
        PHASE_12_FULL_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen,
        { boundary }
      ));
    }
  }

  const runtime = evidence?.liveRuntime ?? {};
  if (
    runtime.enabled !== false ||
    runtime.runStateCreated !== false ||
    runtime.readyForAutonomousExecution !== false
  ) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.liveRuntimeOverclaim));
  }
}

function validateEvidencePolicy(evidence, issues) {
  const policy = evidence?.evidencePolicy ?? {};
  const valid = policy.docsTestsCloseoutsReviewerAcceptSubstituteForResearchEvidence === false &&
    policy.reviewVerdictAsLaw13Provenance === false &&
    policy.queryOutputAsLaw13Provenance === false &&
    policy.graphifyOutputAsImplementationEvidence === false &&
    policy.siblingPrivateWikiRequiredForCi === false &&
    policy.biomedicalClaimAuthority === false;

  if (!valid) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.evidencePolicyWrong));
  }
}

function validateResidualRisks(evidence, issues) {
  const riskIds = new Set((evidence?.residualRisks ?? []).map((risk) => risk.id));
  for (const id of REQUIRED_RESIDUAL_RISKS) {
    if (!riskIds.has(id)) {
      issues.push(issue(
        PHASE_12_FULL_CLOSEOUT_REASON_CODES.residualRiskMissing,
        { riskId: id }
      ));
    }
  }
}

function validateDelivery(evidence, issues) {
  const delivery = evidence?.deliveryAttestation ?? {};
  if (delivery.present !== true) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.deliveryAttestationMissing));
  }
  if (delivery.statusProjectionRefreshed !== true) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.statusProjectionMissing));
  }
  if (delivery.closeoutHonestyValidated !== true) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.closeoutHonestyMissing));
  }

  const results = Array.isArray(delivery.exitGateResults) ? delivery.exitGateResults : [];
  for (const result of results) {
    if (!ALLOWED_EXIT_GATE_RESULTS.has(result)) {
      issues.push(issue(
        PHASE_12_FULL_CLOSEOUT_REASON_CODES.invalidExitGateResult,
        { result }
      ));
    }
  }
}

export function validatePhase12FullCloseoutEvidence(evidence, options = {}) {
  const issues = [];

  if (evidence?.schemaVersion !== 'phase12.full_closeout.v1') {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.invalidSchemaVersion));
  }
  if (evidence?.phase !== 12) {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.wrongPhase));
  }
  if (evidence?.phase12Status !== 'scaffold-closed-live-runtime-closed') {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.wrongStatus));
  }
  if (evidence?.closeoutClaim !== 'governed-adversarial-relay-scaffold') {
    issues.push(issue(PHASE_12_FULL_CLOSEOUT_REASON_CODES.wrongClaim));
  }

  validateStackCommit(evidence, issues, options);
  validateStackCi(evidence, issues);
  validateTasks(evidence, issues);
  validateBoundaries(evidence, issues);
  validateEvidencePolicy(evidence, issues);
  validateResidualRisks(evidence, issues);
  validateDelivery(evidence, issues);

  return {
    ok: issues.length === 0,
    issues,
    closesPhase12Scaffold: evidence?.phase12Status === 'scaffold-closed-live-runtime-closed',
    liveRuntimeReady: evidence?.liveRuntime?.readyForAutonomousExecution === true,
    biomedicalResult: evidence?.evidencePolicy?.biomedicalClaimAuthority === true ||
      evidence?.forbiddenBoundaries?.biomedicalClaim === true
  };
}
