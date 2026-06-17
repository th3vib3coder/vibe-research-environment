import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { readJson } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';
import {
  buildDoctorReconcilePlan,
  DOCTOR_RECONCILE_REASON_CODES
} from '../../phase11/doctor-reconcile-mode.js';

const execFileAsync = promisify(execFile);

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
    gateExpectations: [],
    stateRisks: {
      'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
    },
    proposedActions: [],
    ...overrides
  };
}

async function makeWorkspace() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-reconcile-'));
  await mkdir(path.join(workspaceRoot, 'analysis'), { recursive: true });
  await mkdir(path.join(workspaceRoot, '.tmp-vre-owned'), { recursive: true });
  await mkdir(path.join(workspaceRoot, '.tmp'), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, '.tmp-vre-owned', '.vre-owned-scratch.json'),
    JSON.stringify({
      sourceId: 'scratch-tmp-vre',
      cleanupOwner: 'codex-test-harness'
    })
  );
  await writeFile(
    path.join(workspaceRoot, '.tmp', '.vre-owned-scratch.json'),
    JSON.stringify({
      sourceId: 'scratch-tmp',
      cleanupOwner: 'codex-test-harness'
    })
  );
  await writeFile(path.join(workspaceRoot, 'analysis', 'keep.txt'), 'research');
  await writeFile(path.join(workspaceRoot, '.tmp-vre-owned', 'delete.txt'), 'tmp');
  await writeFile(path.join(workspaceRoot, '.tmp', 'delete.txt'), 'tmp');
  return workspaceRoot;
}

async function cleanupWorkspace(workspaceRoot) {
  await rm(workspaceRoot, { recursive: true, force: true });
}

async function reportForCoverageEntry(taxonomy, coverageEntry) {
  return buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({ coverageEntries: [coverageEntry] })
  });
}

async function makeNativeDirectoryLink({ target, linkPath }) {
  if (process.platform !== 'win32') {
    await symlink(target, linkPath, 'dir');
    return;
  }

  try {
    await execFileAsync('C:\\msys64\\usr\\bin\\ln.exe', [
      '-s',
      target,
      linkPath
    ]);
  } catch {
    await execFileAsync('cmd.exe', [
      '/c',
      'mklink',
      '/J',
      linkPath,
      target
    ]);
  }
}

test('dry-run is the default and mutates no owned scratch', async () => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  try {
    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-owned/delete.txt'
    );

    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot
    });

    assert.equal(plan.dryRun, true);
    assert.equal(plan.ok, true, JSON.stringify(plan, null, 2));
    assert.equal(plan.executedActions.length, 0);
    assert.equal(existsSync(path.join(workspaceRoot, '.tmp-vre-owned', 'delete.txt')), true);
    assert(plan.actions.some((action) =>
      action.type === 'cleanup-owned-scratch'
        && action.execute === false
        && action.sourceId === 'scratch-tmp-vre'
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('explicit non-dry-run deletes only taxonomy-owned scratch', async () => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  try {
    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-owned/delete.txt'
    );

    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, true, JSON.stringify(plan, null, 2));
    assert.equal(existsSync(path.join(workspaceRoot, '.tmp-vre-owned', 'delete.txt')), false);
    assert(plan.executedActions.some((action) =>
      action.type === 'cleanup-owned-scratch'
        && action.sourceId === 'scratch-tmp-vre'
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('protected analysis path from doctor report is blocked and preserved', async () => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  try {
    const report = await reportForCoverageEntry(
      taxonomy,
      'analysis/keep.txt'
    );

    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(existsSync(path.join(workspaceRoot, 'analysis', 'keep.txt')), true);
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.protectedPathBlocked
        && action.sourceId === 'scratch-analysis'
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('caller-supplied cleanup actions are rejected and never drive the plan', async () => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  try {
    const report = buildDoctorDriftReport({
      taxonomy,
      observedState: makeObservedState()
    });

    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness',
      callerActions: [
        { type: 'cleanup', sourceId: 'scratch-analysis', path: 'analysis/keep.txt' }
      ]
    });

    assert.equal(plan.ok, false);
    assert.equal(existsSync(path.join(workspaceRoot, 'analysis', 'keep.txt')), true);
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.callerActionsRejected
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('tmp symlink to analysis is blocked before recursive deletion', async (t) => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  const linkPath = path.join(workspaceRoot, '.tmp-vre-link');
  try {
    try {
      await symlink(
        path.join(workspaceRoot, 'analysis'),
        linkPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch (error) {
      t.skip(`directory symlink unavailable on this host: ${error.code}`);
      return;
    }

    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-link/keep.txt'
    );
    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.executedActions.length, 0);
    assert.equal(
      await readFile(path.join(workspaceRoot, 'analysis', 'keep.txt'), 'utf8'),
      'research'
    );
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked
        && action.symlinkPath.includes('/.tmp-vre-link')
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('tmp symlink to outside workspace is blocked before recursive deletion', async (t) => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-outside-'));
  const linkPath = path.join(workspaceRoot, '.tmp-vre-outside');
  try {
    await writeFile(path.join(outsideRoot, 'outside.txt'), 'outside-data');
    try {
      await symlink(
        outsideRoot,
        linkPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch (error) {
      t.skip(`directory symlink unavailable on this host: ${error.code}`);
      return;
    }

    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-outside'
    );
    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.executedActions.length, 0);
    assert.equal(
      await readFile(path.join(outsideRoot, 'outside.txt'), 'utf8'),
      'outside-data'
    );
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked
        && action.symlinkPath.includes('/.tmp-vre-outside')
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
    await cleanupWorkspace(outsideRoot);
  }
});

test('native ln/junction to analysis is blocked before deletion', async (t) => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  const linkPath = path.join(workspaceRoot, '.tmp-vre-native-link');
  try {
    try {
      await makeNativeDirectoryLink({
        target: path.join(workspaceRoot, 'analysis'),
        linkPath
      });
    } catch (error) {
      t.skip(`native directory link unavailable on this host: ${error.code}`);
      return;
    }

    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-native-link/keep.txt'
    );
    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.executedActions.length, 0);
    assert.equal(
      await readFile(path.join(workspaceRoot, 'analysis', 'keep.txt'), 'utf8'),
      'research'
    );
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked
        || action.code === DOCTOR_RECONCILE_REASON_CODES.scratchOwnershipMarkerMissing
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('native ln/junction to outside workspace is blocked before deletion', async (t) => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-native-outside-'));
  const linkPath = path.join(workspaceRoot, '.tmp-vre-native-outside');
  try {
    await writeFile(path.join(outsideRoot, 'outside.txt'), 'outside-data');
    try {
      await makeNativeDirectoryLink({ target: outsideRoot, linkPath });
    } catch (error) {
      t.skip(`native directory link unavailable on this host: ${error.code}`);
      return;
    }

    const report = await reportForCoverageEntry(
      taxonomy,
      '.tmp-vre-native-outside/outside.txt'
    );
    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport: report,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.executedActions.length, 0);
    assert.equal(
      await readFile(path.join(outsideRoot, 'outside.txt'), 'utf8'),
      'outside-data'
    );
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked
        || action.code === DOCTOR_RECONCILE_REASON_CODES.scratchOwnershipMarkerMissing
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
    await cleanupWorkspace(outsideRoot);
  }
});

test('projection drift produces a plan-only regeneration action', async () => {
  const taxonomy = await loadTaxonomy();
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      checks: {
        ...makeObservedState().checks,
        'wiki-mirror': { status: 'fail' }
      }
    })
  });

  const plan = await buildDoctorReconcilePlan({ taxonomy, doctorReport: report });

  assert.equal(plan.ok, true, JSON.stringify(plan, null, 2));
  assert(plan.actions.some((action) =>
    action.type === 'regenerate-projection-plan'
      && action.sourceId === 'wiki-mirror'
      && action.execute === false
      && action.command === 'node tools/sync-mirror.mjs --json'
  ));
});

test('authority regeneration remains a semantic conflict, not an action', async () => {
  const taxonomy = await loadTaxonomy();
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: makeObservedState({
      proposedActions: [
        { type: 'regenerate', sourceId: 'decision-gates-json' }
      ]
    })
  });

  const plan = await buildDoctorReconcilePlan({ taxonomy, doctorReport: report });

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.executedActions, []);
  assert(plan.conflicts.some((conflict) =>
    conflict.code === DOCTOR_RECONCILE_REASON_CODES.authorityRegenerationBlocked
      && conflict.sourceId === 'decision-gates-json'
  ));
});

test('mismatched source id and cleanup path fails closed', async () => {
  const taxonomy = await loadTaxonomy();
  const workspaceRoot = await makeWorkspace();
  try {
    const doctorReport = {
      schemaVersion: 'phase11.doctor-drift-report.v1',
      ok: false,
      actions: [],
      issues: [
        {
          code: DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak,
          sourceId: 'scratch-tmp-vre',
          path: 'analysis/keep.txt'
        }
      ]
    };

    const plan = await buildDoctorReconcilePlan({
      taxonomy,
      doctorReport,
      workspaceRoot,
      dryRun: false,
      cleanupOwner: 'codex-test-harness'
    });

    assert.equal(plan.ok, false);
    assert.equal(existsSync(path.join(workspaceRoot, 'analysis', 'keep.txt')), true);
    assert(plan.blockedActions.some((action) =>
      action.code === DOCTOR_RECONCILE_REASON_CODES.pathSourceMismatch
    ));
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
});

test('invalid report schema fails closed', async () => {
  const taxonomy = await loadTaxonomy();
  const plan = await buildDoctorReconcilePlan({
    taxonomy,
    doctorReport: { schemaVersion: 'wrong', issues: [] }
  });

  assert.equal(plan.ok, false);
  assert(plan.conflicts.some((conflict) =>
    conflict.code === DOCTOR_RECONCILE_REASON_CODES.invalidReport
  ));
});
