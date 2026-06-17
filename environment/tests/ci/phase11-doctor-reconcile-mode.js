import { assert, isDirectRun, readJson, runValidator } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';
import {
  buildDoctorReconcilePlan,
  DOCTOR_RECONCILE_REASON_CODES
} from '../../phase11/doctor-reconcile-mode.js';

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
    gateExpectations: [],
    stateRisks: {
      'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
    },
    proposedActions: [],
    ...overrides
  };
}

export default async function validatePhase11DoctorReconcileMode() {
  const taxonomy = await readJson(
    'environment/tests/fixtures/phase11/state-source-taxonomy.json'
  );

  const projectionReport = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      checks: {
        ...makeObservedState().checks,
        'wiki-mirror': { status: 'fail' }
      }
    })
  });
  const projectionPlan = await buildDoctorReconcilePlan({
    taxonomy,
    doctorReport: projectionReport
  });

  assert(projectionPlan.ok, JSON.stringify(projectionPlan, null, 2));
  assert(
    projectionPlan.actions.some((action) =>
      action.type === 'regenerate-projection-plan'
        && action.sourceId === 'wiki-mirror'
        && action.execute === false
    ),
    'projection regeneration must remain plan-only'
  );

  const protectedReport = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      coverageEntries: ['analysis/scripts/hgsoc_cd8_subset.py']
    })
  });
  const protectedPlan = await buildDoctorReconcilePlan({
    taxonomy,
    doctorReport: protectedReport,
    dryRun: false,
    cleanupOwner: 'codex-test-harness'
  });

  assert(!protectedPlan.ok, 'analysis cleanup must fail closed');
  assert(
    protectedPlan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.protectedPathBlocked
        && action.sourceId === 'scratch-analysis'
    ),
    'analysis cleanup must be blocked by protected-path policy'
  );

  const authorityReport = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      proposedActions: [
        { type: 'regenerate', sourceId: 'decision-gates-json' }
      ]
    })
  });
  const authorityPlan = await buildDoctorReconcilePlan({
    taxonomy,
    doctorReport: authorityReport
  });

  assert(!authorityPlan.ok, 'authority regeneration must remain a conflict');
  assert(
    authorityPlan.conflicts.some((conflict) =>
      conflict.code === DOCTOR_RECONCILE_REASON_CODES.authorityRegenerationBlocked
    ),
    'authority regeneration conflict must be explicit'
  );
  assert(
    !authorityPlan.actions.some((action) =>
      action.sourceId === 'decision-gates-json'
        && action.type === 'regenerate-projection-plan'
    ),
    'authority source must not become a regeneration action'
  );

  const injectedPlan = await buildDoctorReconcilePlan({
    taxonomy,
    doctorReport: buildDoctorDriftReport({
      taxonomy,
      observedState: makeObservedState()
    }),
    callerActions: [
      { type: 'cleanup', sourceId: 'scratch-analysis', path: 'analysis/x.md' }
    ]
  });

  assert(!injectedPlan.ok, 'caller actions must fail closed');
  assert(
    injectedPlan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.callerActionsRejected
    ),
    'caller-supplied actions must not drive reconcile'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-doctor-reconcile-mode',
    validatePhase11DoctorReconcileMode
  );
}
