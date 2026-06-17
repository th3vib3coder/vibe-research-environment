import { assert, isDirectRun, readJson, runValidator } from './_helpers.js';

const REQUIRED_TASKS = Object.freeze([
  'T11.2.0',
  'T11.2.1',
  'T11.2.2',
  'T11.2.3',
  'T11.2.4'
]);

const REQUIRED_FOLLOW_UP = Object.freeze({
  key: 'researchLoopGovernanceFlake',
  followUpId: 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001',
  closureTaskId: 'T11.2.4'
});

const FORBIDDEN_BOUNDARIES = Object.freeze([
  'rootDoctorCli',
  'privateWikiRuntimeWrite',
  'runtimeSpawnedGenerator',
  'scratchCleanupOutsideOwnedMarkerRules',
  'semanticAutoResolution',
  'authorityRegeneration',
  'realH5adRead',
  'realGeoRead',
  'cxcl13Cd8Denominator',
  'cxcl13Cd8Count',
  'cxcl13Cd8Fraction',
  'exportPackaging',
  'claimPromotion',
  'phase11FullCloseout'
]);

export const WAVE_11_2_CLOSEOUT_REASON_CODES = Object.freeze({
  invalidSchemaVersion: 'E_PHASE11_WAVE112_CLOSEOUT_SCHEMA_VERSION',
  wrongWave: 'E_PHASE11_WAVE112_CLOSEOUT_WRONG_WAVE',
  wrongClaim: 'E_PHASE11_WAVE112_CLOSEOUT_WRONG_CLAIM',
  missingTask: 'E_PHASE11_WAVE112_CLOSEOUT_TASK_MISSING',
  taskNotClosed: 'E_PHASE11_WAVE112_CLOSEOUT_TASK_NOT_CLOSED',
  missingCommit: 'E_PHASE11_WAVE112_CLOSEOUT_COMMIT_MISSING',
  missingCiRun: 'E_PHASE11_WAVE112_CLOSEOUT_CI_RUN_MISSING',
  ciNotSuccess: 'E_PHASE11_WAVE112_CLOSEOUT_CI_NOT_SUCCESS',
  missingDeliveredSurface: 'E_PHASE11_WAVE112_CLOSEOUT_SURFACE_MISSING',
  missingFollowUpClosure: 'E_PHASE11_WAVE112_CLOSEOUT_FU_CLOSURE_MISSING',
  forbiddenBoundaryOpen: 'E_PHASE11_WAVE112_CLOSEOUT_FORBIDDEN_BOUNDARY_OPEN',
  phase11Closed: 'E_PHASE11_WAVE112_CLOSEOUT_PHASE11_CLOSED'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function hasClosedResearchLoopFollowUp(evidence) {
  const closure = evidence?.followUpClosures?.[REQUIRED_FOLLOW_UP.key];
  return closure?.followUpId === REQUIRED_FOLLOW_UP.followUpId
    && closure?.closureTaskId === REQUIRED_FOLLOW_UP.closureTaskId
    && closure?.status === 'closed-pushed-ci-green'
    && hasText(closure?.hat3AcceptRelay)
    && hasText(closure?.commit)
    && hasText(closure?.ciRun)
    && closure?.taxonomyStateRiskStatus === 'reviewed-closed'
    && closure?.doctorEvidenceBacked === true;
}

export function validateWave112CloseoutEvidence(evidence) {
  const issues = [];

  if (evidence?.schemaVersion !== 'phase11.wave11_2.closeout.v1') {
    issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.invalidSchemaVersion));
  }

  if (evidence?.wave !== '11.2') {
    issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.wrongWave));
  }

  if (evidence?.closeoutClaim !== 'state-reconciliation-foundation') {
    issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.wrongClaim));
  }

  const tasks = Array.isArray(evidence?.tasks) ? evidence.tasks : [];
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  for (const taskId of REQUIRED_TASKS) {
    const task = tasksById.get(taskId);
    if (task == null) {
      issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.missingTask, { taskId }));
      continue;
    }

    if (task.status !== 'closed-pushed-ci-green') {
      issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.taskNotClosed, { taskId }));
    }

    if (!hasText(task.commit)) {
      issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.missingCommit, { taskId }));
    }

    if (!hasText(task.ciRun)) {
      issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.missingCiRun, { taskId }));
    }

    if (task.ciConclusion !== 'success') {
      issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.ciNotSuccess, { taskId }));
    }

    if (!hasText(task.deliveredSurface)) {
      issues.push(issue(
        WAVE_11_2_CLOSEOUT_REASON_CODES.missingDeliveredSurface,
        { taskId }
      ));
    }
  }

  if (!hasClosedResearchLoopFollowUp(evidence)) {
    issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.missingFollowUpClosure, {
      followUpId: REQUIRED_FOLLOW_UP.followUpId
    }));
  }

  const boundaries = evidence?.forbiddenBoundaries;
  for (const boundary of FORBIDDEN_BOUNDARIES) {
    if (boundaries?.[boundary] === true) {
      issues.push(issue(
        WAVE_11_2_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen,
        { boundary }
      ));
    }
  }

  const closesPhase11 = evidence?.phase11Status === 'closed'
    || boundaries?.phase11FullCloseout === true;
  if (closesPhase11) {
    issues.push(issue(WAVE_11_2_CLOSEOUT_REASON_CODES.phase11Closed));
  }

  const runtimeOrBiomedicalBoundary = FORBIDDEN_BOUNDARIES
    .filter((boundary) => boundary !== 'phase11FullCloseout')
    .some((boundary) => boundaries?.[boundary] === true);

  return {
    ok: issues.length === 0,
    issues,
    closesWave112: evidence?.wave === '11.2',
    closesPhase11,
    runtimeOrBiomedicalBoundary
  };
}

export default async function validatePhase11Wave112Closeout() {
  const evidence = await readJson('environment/tests/fixtures/phase11/wave-11-2-closeout.json');
  const result = validateWave112CloseoutEvidence(evidence);

  assert(result.ok, `Wave 11.2 closeout evidence failed: ${JSON.stringify(result.issues)}`);
  assert(result.closesWave112 === true, 'Wave 11.2 closeout must close Wave 11.2');
  assert(result.closesPhase11 === false, 'Wave 11.2 closeout must not close Phase 11');
  assert(
    result.runtimeOrBiomedicalBoundary === false,
    'Wave 11.2 closeout must not open runtime or biomedical result boundaries'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-wave-11-2-closeout', validatePhase11Wave112Closeout);
}
