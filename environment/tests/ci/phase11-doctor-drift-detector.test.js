import assert from 'node:assert/strict';
import test from 'node:test';

import { readJson } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';

async function loadTaxonomy() {
  return readJson('environment/tests/fixtures/phase11/state-source-taxonomy.json');
}

function closedResearchLoopGovernanceFlake() {
  return {
    status: 'reviewed-closed',
    closureEvidence: {
      testPath: 'environment/tests/cli/research-loop.test.js',
      regressionTest: 'research-loop logs objective_blocked governance event for rule-only blocker',
      duplicateGuardTest: 'governance event selector fails closed on duplicate matching events'
    }
  };
}

function makeObservedState(overrides = {}) {
  return {
    checks: {
      'wiki-generated-registries': { status: 'pass' },
      'wiki-mirror': { status: 'pass' },
      'wiki-coverage-inventories': { status: 'pass' },
      'phase11-feature-ledger': { status: 'pass' },
      'phase9-feature-ledger': { status: 'pass' },
      'git-and-github-actions': { status: 'pass' }
    },
    coverageEntries: [],
    gateExpectations: [
      {
        expectedGateId: 'phase-11-t11.2.1-doctor-drift-detector',
        actualGateId: 'phase-11-t11.2.1-doctor-drift-detector',
        actualStatus: 'authored-pending-non-author-hat1-review',
        allowedStatuses: [
          'authored-pending-non-author-hat1-review',
          'hat1-reviewed-accepted-pending-operator-go',
          'authored-pending-non-author-hat3-review',
          'closed-operator-go-recorded'
        ]
      }
    ],
    stateRisks: {
      'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
    },
    proposedActions: [],
    ...overrides
  };
}

test('all-green observed state returns read-only report without actions', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState()
  });

  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.actions, []);
  assert.deepEqual(report.issues, []);
});

test('stale generated projection produces projection drift issue', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      checks: {
        ...makeObservedState().checks,
        'wiki-generated-registries': { status: 'fail', detail: 'changed files' }
      }
    })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
      && issue.sourceId === 'wiki-generated-registries'
  ));
});

test('missing mirror sync produces mirror drift issue', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      checks: {
        ...makeObservedState().checks,
        'wiki-mirror': { status: 'missing' }
      }
    })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.mirrorStale
      && issue.sourceId === 'wiki-mirror'
  ));
});

test('analysis coverage leakage is reported without delete action', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      coverageEntries: ['analysis/scripts/hgsoc_cd8_subset.py']
    })
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.actions, []);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
      && issue.sourceId === 'scratch-analysis'
      && issue.cleanupPolicy === 'never-auto-delete'
  ));
});

test('tmp coverage leakage is classified as owner-bound scratch', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      coverageEntries: ['.tmp-vre-run-analysis-env-timeout-c0ttv0/out.json']
    })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
      && issue.sourceId === 'scratch-tmp-vre'
      && issue.cleanupEligible === true
      && issue.cleanupOwner === 'codex-test-harness'
  ));
});

test('gate naming mismatch produces gate issue', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      gateExpectations: [
        {
          expectedGateId: 'phase-11-t11.2.1-doctor-drift-detector',
          actualGateId: 'phase-11-t11.2.1-doctor-drift',
          actualStatus: 'authored-pending-non-author-hat1-review'
        }
      ]
    })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.gateMismatch
  ));
});

test('authority regeneration attempt is semantic conflict, not an action', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      proposedActions: [
        { type: 'regenerate', sourceId: 'decision-gates-json' }
      ]
    })
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.actions, []);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.authorityRegenerationBlocked
      && issue.severity === 'conflict'
  ));
});

test('cleanup attempt on analysis is blocked by taxonomy policy', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      proposedActions: [
        { type: 'cleanup', sourceId: 'scratch-analysis' }
      ]
    })
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.actions, []);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.scratchCleanupBlocked
      && issue.sourceId === 'scratch-analysis'
  ));
});

test('missing research-loop governance flake state-risk is reported', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({ stateRisks: {} })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.stateRiskMissing
      && issue.followUpId === 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001'
  ));
});

test('reviewed-closed state-risk without closure evidence is reported', async () => {
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': {
          status: 'reviewed-closed'
        }
      }
    })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.stateRiskClosureEvidenceMissing
      && issue.followUpId === 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001'
  ));
});

test('missing Phase 9 ledger check produces ledger drift issue', async () => {
  const checks = { ...makeObservedState().checks };
  delete checks['phase9-feature-ledger'];
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({ checks })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.ledgerCheckNotGreen
      && issue.sourceId === 'phase9-feature-ledger'
  ));
});

test('missing GitHub shipped evidence produces shipped-evidence issue', async () => {
  const checks = { ...makeObservedState().checks };
  delete checks['git-and-github-actions'];
  const report = buildDoctorDriftReport({
    taxonomy: await loadTaxonomy(),
    observedState: makeObservedState({ checks })
  });

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.shippedEvidenceNotGreen
      && issue.sourceId === 'git-and-github-actions'
  ));
});
