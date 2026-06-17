import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateWave111CloseoutEvidence,
  WAVE_11_1_CLOSEOUT_REASON_CODES
} from './phase11-wave-11-1-closeout.js';

function makeValidEvidence(overrides = {}) {
  const evidence = {
    schemaVersion: 'phase11.wave11_1.closeout.v1',
    wave: '11.1',
    phase11Status: 'open',
    closeoutClaim: 'scientific-lane-foundation',
    tasks: [
      {
        taskId: 'T11.1.0',
        status: 'closed-pushed-ci-green',
        commit: 'acb14c12d40dd4a38e0c8e2653d3b44e2bde8801',
        ciRun: '27642417346',
        ciConclusion: 'success'
      },
      {
        taskId: 'T11.1.1',
        status: 'closed-pushed-ci-green',
        commit: '07bcb1d0dd98f4332e3fcda0ecda483a0827ca31',
        ciRun: '27646516222',
        ciConclusion: 'success'
      },
      {
        taskId: 'T11.1.2',
        status: 'closed-pushed-ci-green',
        commit: 'c00cbf6eb9c26a810b6da40ab875953f4f28755e',
        ciRun: '27651569945',
        ciConclusion: 'success'
      },
      {
        taskId: 'T11.1.3',
        status: 'closed-pushed-ci-green',
        commit: '1de3eaf48b87a32f47c00f860e49851613f88270',
        ciRun: '27654090708',
        ciConclusion: 'success'
      },
      {
        taskId: 'T11.1.4',
        status: 'closed-pushed-ci-green',
        commit: '207c8dccd16cbc172e86966cc773e1e9dd90f7e6',
        ciRun: '27656607568',
        ciConclusion: 'success'
      }
    ],
    productionRegressionEvidence: {
      t1114ComposedExportEligibility: true,
      structuralLineageBlockedThroughExportEligibility: true,
      fakeExecutionNonAuthoritative: true
    },
    forbiddenBoundaries: {
      realH5adRead: false,
      cxcl13Cd8Denominator: false,
      cxcl13Cd8Count: false,
      cxcl13Cd8Fraction: false,
      rscriptExecution: false,
      notebookExecution: false,
      network: false,
      exportPackaging: false,
      claimPromotion: false,
      wave112Opened: false,
      phase11FullCloseout: false
    },
    ...overrides
  };

  return evidence;
}

test('valid Wave 11.1 closeout evidence passes as foundation only', () => {
  const result = validateWave111CloseoutEvidence(makeValidEvidence());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.closesWave111, true);
  assert.equal(result.closesPhase11, false);
  assert.equal(result.biomedicalResult, false);
});

test('missing required task fails closed', () => {
  const evidence = makeValidEvidence({
    tasks: makeValidEvidence().tasks.filter((task) => task.taskId !== 'T11.1.2')
  });
  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.missingTask
      && issue.taskId === 'T11.1.2'
  ));
});

test('task without commit or CI run fails closed', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[4] = {
    ...evidence.tasks[4],
    commit: '',
    ciRun: ''
  };

  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.missingCommit
      && issue.taskId === 'T11.1.4'
  ));
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.missingCiRun
      && issue.taskId === 'T11.1.4'
  ));
});

test('non-green task status fails closed', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[3] = {
    ...evidence.tasks[3],
    status: 'hat3-reviewed-accepted-pending-closure'
  };

  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.taskNotClosed
      && issue.taskId === 'T11.1.3'
  ));
});

test('forbidden biomedical/runtime boundary fails closed', () => {
  const evidence = makeValidEvidence({
    forbiddenBoundaries: {
      ...makeValidEvidence().forbiddenBoundaries,
      cxcl13Cd8Fraction: true
    }
  });

  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen
      && issue.boundary === 'cxcl13Cd8Fraction'
  ));
});

test('missing composed T11.1.4 regression evidence fails closed', () => {
  const evidence = makeValidEvidence({
    productionRegressionEvidence: {
      ...makeValidEvidence().productionRegressionEvidence,
      structuralLineageBlockedThroughExportEligibility: false
    }
  });

  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.missingRegressionEvidence
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

  const result = validateWave111CloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert.equal(result.closesPhase11, true);
  assert(result.issues.some((issue) =>
    issue.code === WAVE_11_1_CLOSEOUT_REASON_CODES.phase11Closed
  ));
});
