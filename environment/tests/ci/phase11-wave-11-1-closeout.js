import { assert, isDirectRun, readJson, runValidator } from './_helpers.js';

const REQUIRED_TASKS = Object.freeze([
  'T11.1.0',
  'T11.1.1',
  'T11.1.2',
  'T11.1.3',
  'T11.1.4'
]);

const REQUIRED_REGRESSION_FLAGS = Object.freeze([
  't1114ComposedExportEligibility',
  'structuralLineageBlockedThroughExportEligibility',
  'fakeExecutionNonAuthoritative'
]);

const FORBIDDEN_BOUNDARIES = Object.freeze([
  'realH5adRead',
  'cxcl13Cd8Denominator',
  'cxcl13Cd8Count',
  'cxcl13Cd8Fraction',
  'rscriptExecution',
  'notebookExecution',
  'network',
  'exportPackaging',
  'claimPromotion',
  'wave112Opened',
  'phase11FullCloseout'
]);

export const WAVE_11_1_CLOSEOUT_REASON_CODES = Object.freeze({
  invalidSchemaVersion: 'E_PHASE11_WAVE111_CLOSEOUT_SCHEMA_VERSION',
  wrongWave: 'E_PHASE11_WAVE111_CLOSEOUT_WRONG_WAVE',
  wrongClaim: 'E_PHASE11_WAVE111_CLOSEOUT_WRONG_CLAIM',
  missingTask: 'E_PHASE11_WAVE111_CLOSEOUT_TASK_MISSING',
  taskNotClosed: 'E_PHASE11_WAVE111_CLOSEOUT_TASK_NOT_CLOSED',
  missingCommit: 'E_PHASE11_WAVE111_CLOSEOUT_COMMIT_MISSING',
  missingCiRun: 'E_PHASE11_WAVE111_CLOSEOUT_CI_RUN_MISSING',
  ciNotSuccess: 'E_PHASE11_WAVE111_CLOSEOUT_CI_NOT_SUCCESS',
  missingRegressionEvidence: 'E_PHASE11_WAVE111_CLOSEOUT_REGRESSION_MISSING',
  forbiddenBoundaryOpen: 'E_PHASE11_WAVE111_CLOSEOUT_FORBIDDEN_BOUNDARY_OPEN',
  phase11Closed: 'E_PHASE11_WAVE111_CLOSEOUT_PHASE11_CLOSED'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

export function validateWave111CloseoutEvidence(evidence) {
  const issues = [];

  if (evidence?.schemaVersion !== 'phase11.wave11_1.closeout.v1') {
    issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.invalidSchemaVersion));
  }

  if (evidence?.wave !== '11.1') {
    issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.wrongWave));
  }

  if (evidence?.closeoutClaim !== 'scientific-lane-foundation') {
    issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.wrongClaim));
  }

  const tasks = Array.isArray(evidence?.tasks) ? evidence.tasks : [];
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  for (const taskId of REQUIRED_TASKS) {
    const task = tasksById.get(taskId);
    if (task == null) {
      issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.missingTask, { taskId }));
      continue;
    }

    if (task.status !== 'closed-pushed-ci-green') {
      issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.taskNotClosed, { taskId }));
    }

    if (!hasText(task.commit)) {
      issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.missingCommit, { taskId }));
    }

    if (!hasText(task.ciRun)) {
      issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.missingCiRun, { taskId }));
    }

    if (task.ciConclusion !== 'success') {
      issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.ciNotSuccess, { taskId }));
    }
  }

  const regression = evidence?.productionRegressionEvidence;
  for (const flag of REQUIRED_REGRESSION_FLAGS) {
    if (regression?.[flag] !== true) {
      issues.push(issue(
        WAVE_11_1_CLOSEOUT_REASON_CODES.missingRegressionEvidence,
        { flag }
      ));
    }
  }

  const boundaries = evidence?.forbiddenBoundaries;
  for (const boundary of FORBIDDEN_BOUNDARIES) {
    if (boundaries?.[boundary] === true) {
      issues.push(issue(
        WAVE_11_1_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen,
        { boundary }
      ));
    }
  }

  const closesPhase11 = evidence?.phase11Status === 'closed'
    || boundaries?.phase11FullCloseout === true;
  if (closesPhase11) {
    issues.push(issue(WAVE_11_1_CLOSEOUT_REASON_CODES.phase11Closed));
  }

  const biomedicalResult = [
    'realH5adRead',
    'cxcl13Cd8Denominator',
    'cxcl13Cd8Count',
    'cxcl13Cd8Fraction',
    'exportPackaging',
    'claimPromotion'
  ].some((boundary) => boundaries?.[boundary] === true);

  return {
    ok: issues.length === 0,
    issues,
    closesWave111: evidence?.wave === '11.1',
    closesPhase11,
    biomedicalResult
  };
}

export default async function validatePhase11Wave111Closeout() {
  const evidence = await readJson('environment/tests/fixtures/phase11/wave-11-1-closeout.json');
  const result = validateWave111CloseoutEvidence(evidence);

  assert(result.ok, `Wave 11.1 closeout evidence failed: ${JSON.stringify(result.issues)}`);
  assert(result.closesWave111 === true, 'Wave 11.1 closeout must close Wave 11.1');
  assert(result.closesPhase11 === false, 'Wave 11.1 closeout must not close Phase 11');
  assert(result.biomedicalResult === false, 'Wave 11.1 closeout must not be a biomedical result');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-wave-11-1-closeout', validatePhase11Wave111Closeout);
}
