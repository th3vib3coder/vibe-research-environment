import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createManifest,
  ImmutableManifestError,
  listManifests,
  ManifestTransitionError,
  readManifest,
  updateManifest,
} from '../../lib/manifest.js';

test('manifest helper supports create, read, update, and atomic roundtrip writes', async () => {
  const projectPath = await createTempProject();

  try {
    const created = await createManifest(projectPath, buildManifest('EXP-001'));
    const manifestPath = getManifestPath(projectPath, 'EXP-001');

    assert.equal(created.experimentId, 'EXP-001');
    assert.equal(created.status, 'planned');
    assert.match(created.createdAt, /\d{4}-\d{2}-\d{2}T/u);

    const persisted = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.deepEqual(persisted, created);

    const readBack = await readManifest(projectPath, 'EXP-001');
    assert.deepEqual(readBack, created);

    const updated = await updateManifest(projectPath, 'EXP-001', {
      status: 'active',
      latestAttemptId: 'ATT-2026-03-30-001',
      blockers: ['Awaiting QC rerun'],
      parameters: {
        batchCorrection: false,
        seed: 21,
      },
    });

    assert.equal(updated.status, 'active');
    assert.equal(updated.latestAttemptId, 'ATT-2026-03-30-001');
    assert.deepEqual(updated.blockers, ['Awaiting QC rerun']);
    assert.deepEqual(updated.parameters, {
      batchCorrection: false,
      seed: 21,
    });

    const reread = await readManifest(projectPath, 'EXP-001');
    assert.deepEqual(reread, updated);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('manifest helper enforces conservative status transitions', async () => {
  const projectPath = await createTempProject();

  try {
    await assert.rejects(
      () => createManifest(projectPath, buildManifest('EXP-099', { status: 'active' })),
      ManifestTransitionError,
    );

    await createManifest(projectPath, buildManifest('EXP-002'));

    await assert.rejects(
      () => updateManifest(projectPath, 'EXP-002', { status: 'completed' }),
      ManifestTransitionError,
    );

    const active = await updateManifest(projectPath, 'EXP-002', { status: 'active' });
    assert.equal(active.status, 'active');

    const blocked = await updateManifest(projectPath, 'EXP-002', {
      status: 'blocked',
      blockers: ['Negative control missing'],
    });
    assert.equal(blocked.status, 'blocked');

    const reactivated = await updateManifest(projectPath, 'EXP-002', {
      status: 'active',
      blockers: [],
    });
    assert.equal(reactivated.status, 'active');

    const failed = await updateManifest(projectPath, 'EXP-002', { status: 'failed' });
    assert.equal(failed.status, 'failed');

    await assert.rejects(
      () => updateManifest(projectPath, 'EXP-002', { status: 'active' }),
      ManifestTransitionError,
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('completed manifests are immutable once status reaches completed', async () => {
  const projectPath = await createTempProject();

  try {
    await createManifest(projectPath, buildManifest('EXP-003'));
    await updateManifest(projectPath, 'EXP-003', { status: 'active' });

    const completed = await updateManifest(projectPath, 'EXP-003', {
      status: 'completed',
      outputArtifacts: ['results/exp-003.txt'],
    });

    assert.equal(completed.status, 'completed');
    assert.match(completed.completedAt, /\d{4}-\d{2}-\d{2}T/u);

    await assert.rejects(
      () => updateManifest(projectPath, 'EXP-003', { notes: 'retry with new seed' }),
      ImmutableManifestError,
    );

    const reread = await readManifest(projectPath, 'EXP-003');
    assert.deepEqual(reread, completed);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('listManifests filters by status and claim id', async () => {
  const projectPath = await createTempProject();

  try {
    await createManifest(projectPath, buildManifest('EXP-010', {
      relatedClaims: ['C-010'],
    }));
    await createManifest(projectPath, buildManifest('EXP-011', {
      relatedClaims: ['C-011', 'C-020'],
    }));
    await createManifest(projectPath, buildManifest('EXP-012', {
      relatedClaims: ['C-020'],
    }));

    await updateManifest(projectPath, 'EXP-011', {
      status: 'active',
      blockers: [],
    });
    await updateManifest(projectPath, 'EXP-011', {
      status: 'blocked',
      blockers: ['Dataset hash mismatch'],
    });
    await updateManifest(projectPath, 'EXP-012', { status: 'active' });

    const allManifests = await listManifests(projectPath);
    assert.deepEqual(
      allManifests.map((manifest) => manifest.experimentId),
      ['EXP-010', 'EXP-011', 'EXP-012'],
    );

    const blocked = await listManifests(projectPath, { status: 'blocked' });
    assert.deepEqual(
      blocked.map((manifest) => manifest.experimentId),
      ['EXP-011'],
    );

    const claimLinked = await listManifests(projectPath, { claimId: 'C-020' });
    assert.deepEqual(
      claimLinked.map((manifest) => manifest.experimentId),
      ['EXP-011', 'EXP-012'],
    );

    const blockedClaimLinked = await listManifests(projectPath, {
      status: 'blocked',
      claimId: 'C-020',
    });
    assert.deepEqual(
      blockedClaimLinked.map((manifest) => manifest.experimentId),
      ['EXP-011'],
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('manifest helper has no attempt side effects', async () => {
  const projectPath = await createTempProject();

  try {
    await createManifest(projectPath, buildManifest('EXP-020'));
    await updateManifest(projectPath, 'EXP-020', { status: 'active' });
    await listManifests(projectPath);

    const attemptsPath = path.join(
      projectPath,
      '.vibe-science-environment',
      'control',
      'attempts.jsonl',
    );

    await assert.rejects(
      () => readFile(attemptsPath, 'utf8'),
      (error) => error?.code === 'ENOENT',
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-manifest-test-'));
}

function getManifestPath(projectPath, experimentId) {
  return path.join(
    projectPath,
    '.vibe-science-environment',
    'experiments',
    'manifests',
    `${experimentId}.json`,
  );
}

function buildManifest(experimentId, overrides = {}) {
  return {
    experimentId,
    title: `Experiment ${experimentId}`,
    objective: `Validate ${experimentId} behavior`,
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    parameters: {
      batchCorrection: true,
      seed: 17,
    },
    codeRef: {
      entrypoint: 'scripts/run_experiment.py',
      gitCommit: 'abc1234',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: [],
    relatedClaims: ['C-001'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}
