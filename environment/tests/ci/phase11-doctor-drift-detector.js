import { assert, isDirectRun, readJson, runValidator } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';

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
        actualStatus: 'authored-pending-non-author-hat3-review',
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

export default async function validatePhase11DoctorDriftDetector() {
  const taxonomy = await readJson(
    'environment/tests/fixtures/phase11/state-source-taxonomy.json'
  );
  const greenReport = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState()
  });

  assert(greenReport.ok, JSON.stringify(greenReport.issues));
  assert(greenReport.readOnly === true, 'doctor drift report must be read-only');
  assert(
    Array.isArray(greenReport.actions) && greenReport.actions.length === 0,
    'doctor drift report must not emit actions'
  );

  const scratchReport = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      coverageEntries: ['analysis/scripts/hgsoc_cd8_subset.py'],
      proposedActions: [{ type: 'cleanup', sourceId: 'scratch-analysis' }]
    })
  });

  assert(!scratchReport.ok, 'analysis scratch leak must be reported');
  assert(
    scratchReport.actions.length === 0,
    'analysis scratch leak must not become a delete action'
  );
  assert(
    scratchReport.issues.some((item) =>
      item.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
        && item.sourceId === 'scratch-analysis'
    ),
    'analysis scratch leak must consume taxonomy scratch source'
  );
  assert(
    scratchReport.issues.some((item) =>
      item.code === DOCTOR_DRIFT_REASON_CODES.scratchCleanupBlocked
        && item.sourceId === 'scratch-analysis'
    ),
    'analysis scratch cleanup must be blocked by taxonomy policy'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-doctor-drift-detector',
    validatePhase11DoctorDriftDetector
  );
}
