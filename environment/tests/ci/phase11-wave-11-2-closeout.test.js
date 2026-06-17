import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateWave112CloseoutEvidence,
  WAVE_11_2_CLOSEOUT_REASON_CODES
} from './phase11-wave-11-2-closeout.js';

function makeValidEvidence(overrides = {}) {
  const evidence = {
    schemaVersion: 'phase11.wave11_2.closeout.v1',
    phase: 11,
    wave: '11.2',
    phase11Status: 'open',
    closeoutClaim: 'state-reconciliation-foundation',
    tasks: [
      {
        taskId: 'T11.2.0',
        status: 'closed-pushed-ci-green',
        commit: '064cb768173395327b8b3165a79566ab454db91c',
        ciRun: '27659773549',
        ciConclusion: 'success',
        deliveredSurface: 'state-source-taxonomy'
      },
      {
        taskId: 'T11.2.1',
        status: 'closed-pushed-ci-green',
        commit: '94920878c43382635350b992f6d15313deee9769',
        ciRun: '27661167360',
        ciConclusion: 'success',
        deliveredSurface: 'read-only-doctor-drift-detector-helper'
      },
      {
        taskId: 'T11.2.2',
        status: 'closed-pushed-ci-green',
        commit: 'd3f534907f73f8383cf5f898890f3a332c1c55d1',
        ciRun: '27664530420',
        ciConclusion: 'success',
        deliveredSurface: 'bounded-doctor-reconcile-mode-helper'
      },
      {
        taskId: 'T11.2.3',
        status: 'closed-pushed-ci-green',
        commit: '011b119ff2158247d4dc22fe4112fcf29a508834',
        ciRun: '27667207681',
        ciConclusion: 'success',
        deliveredSurface: 'wiki-fidelity-observer'
      },
      {
        taskId: 'T11.2.4',
        status: 'closed-pushed-ci-green',
        commit: '1f7fcc257e9afcd990418e3c25a82fc0b81124fa',
        ciRun: '27670625590',
        ciConclusion: 'success',
        deliveredSurface: 'research-loop-governance-flake-closure'
      }
    ],
    followUpClosures: {
      researchLoopGovernanceFlake: {
        followUpId: 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001',
        status: 'closed-pushed-ci-green',
        closureTaskId: 'T11.2.4',
        hat3AcceptRelay:
          'C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.4-research-loop-governance-flake-verdict-2026-06-17.md',
        commit: '1f7fcc257e9afcd990418e3c25a82fc0b81124fa',
        ciRun: '27670625590',
        taxonomyStateRiskStatus: 'reviewed-closed',
        doctorEvidenceBacked: true
      }
    },
    forbiddenBoundaries: {
      rootDoctorCli: false,
      privateWikiRuntimeWrite: false,
      runtimeSpawnedGenerator: false,
      scratchCleanupOutsideOwnedMarkerRules: false,
      semanticAutoResolution: false,
      authorityRegeneration: false,
      realH5adRead: false,
      realGeoRead: false,
      cxcl13Cd8Denominator: false,
      cxcl13Cd8Count: false,
      cxcl13Cd8Fraction: false,
      exportPackaging: false,
      claimPromotion: false,
      phase11FullCloseout: false
    },
    ...overrides
  };

  return evidence;
}

test('valid Wave 11.2 closeout evidence passes as state foundation only', () => {
  const result = validateWave112CloseoutEvidence(makeValidEvidence());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.closesWave112, true);
  assert.equal(result.closesPhase11, false);
  assert.equal(result.runtimeOrBiomedicalBoundary, false);
});

test('missing required task fails closed', () => {
  const evidence = makeValidEvidence({
    tasks: makeValidEvidence().tasks.filter((task) => task.taskId !== 'T11.2.2')
  });
  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.missingTask
      && issue.taskId === 'T11.2.2'
  ));
});

test('task without commit or CI run fails closed', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[4] = {
    ...evidence.tasks[4],
    commit: '',
    ciRun: ''
  };

  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.missingCommit
      && issue.taskId === 'T11.2.4'
  ));
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.missingCiRun
      && issue.taskId === 'T11.2.4'
  ));
});

test('non-green task status fails closed', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[0] = {
    ...evidence.tasks[0],
    status: 'hat3-reviewed-accepted-pending-closure'
  };

  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.taskNotClosed
      && issue.taskId === 'T11.2.0'
  ));
});

test('missing governance-flake follow-up closure evidence fails closed', () => {
  const evidence = makeValidEvidence({
    followUpClosures: {
      researchLoopGovernanceFlake: {
        ...makeValidEvidence().followUpClosures.researchLoopGovernanceFlake,
        status: 'open-wave-11.2-backlog',
        hat3AcceptRelay: ''
      }
    }
  });

  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.missingFollowUpClosure
  ));
});

test('forbidden root CLI/runtime boundary fails closed', () => {
  const evidence = makeValidEvidence({
    forbiddenBoundaries: {
      ...makeValidEvidence().forbiddenBoundaries,
      rootDoctorCli: true
    }
  });

  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen
      && issue.boundary === 'rootDoctorCli'
  ));
});

test('Phase 11 full closeout claim fails closed', () => {
  const evidence = makeValidEvidence({
    phase11Status: 'closed',
    forbiddenBoundaries: {
      ...makeValidEvidence().forbiddenBoundaries,
      phase11FullCloseout: true
    }
  });

  const result = validateWave112CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert.equal(result.closesPhase11, true);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_2_CLOSEOUT_REASON_CODES.phase11Closed
  ));
});
