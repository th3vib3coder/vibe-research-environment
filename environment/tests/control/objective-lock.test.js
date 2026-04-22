import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { activateObjective } from '../../objectives/store.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from '../cli/_fixture.js';

const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling'
  )
};

function objectiveStartArgs() {
  return [
    'objective',
    'start',
    '--title',
    'demo objective',
    '--question',
    'why-now',
    '--mode',
    'unattended-batch',
    '--reasoning-mode',
    'rule-only',
    '--budget',
    'maxWallSeconds=600,maxIterations=5,heartbeatIntervalSeconds=60,costCeiling=2.5',
    '--wake-policy',
    'wakeOwner=windows-task-scheduler,leaseTtlSeconds=90,duplicateWakePolicy=no-op'
  ];
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function readObjectiveFixture(fileName) {
  return JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        'objective',
        fileName
      ),
      'utf8'
    )
  );
}

test('objective start writes an active pointer with an empty wake lease and persists a post-start handshake carrying the active objective id', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-start-');
  try {
    const result = await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-test-start'
      }
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'objective start');
    assert.equal(payload.objectiveId, 'OBJ-001');
    assert.equal(payload.activePointer, '.vibe-science-environment/objectives/active-objective.json');

    const pointer = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
    );
    assert.deepEqual(pointer.currentWakeLease, {
      wakeId: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      acquiredBy: null,
      previousWakeId: null
    });
    assert.equal(pointer.lockAcquiredBySession, 'sess-test-start');

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'active');
    assert.equal(objectiveRecord.runtimeMode, 'unattended-batch');
    assert.equal(objectiveRecord.reasoningMode, 'rule-only');
    assert.equal(objectiveRecord.createdBySession, 'sess-test-start');
    assert.deepEqual(objectiveRecord.stages, [{ stageId: 'orientation', status: 'active' }]);
    assert.equal(objectiveRecord.budget.maxTaskCount, 10);
    assert.equal(objectiveRecord.budget.maxExternalCalls, 8);
    assert.equal(objectiveRecord.wakePolicy.wakeOwner, 'windows-task-scheduler');

    const handshake = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'capability-handshake.json')
    );
    assert.equal(handshake.objective.activeObjectiveId, 'OBJ-001');
    assert.equal(handshake.objective.status, 'active');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective start fails with OBJECTIVE_LOCK_HELD when an active pointer already exists', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-double-start-');
  try {
    const first = await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-test-first'
      }
    });
    assert.equal(first.code, 0, `stderr=${first.stderr}`);

    const second = await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-test-second'
      }
    });
    assert.equal(second.code, 1, `stderr=${second.stderr}`);
    assert.equal(second.stderr, '');

    const payload = JSON.parse(second.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'OBJECTIVE_LOCK_HELD');
    assert.equal(payload.activeObjectiveId, 'OBJ-001');
    assert.equal(payload.activePointer, '.vibe-science-environment/objectives/active-objective.json');
    assert.match(payload.stopCommand, /objective stop --objective OBJ-001/u);
    assert.match(payload.pauseCommand, /objective pause --objective OBJ-001/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective pause keeps the pointer while transitioning the objective to paused', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-pause-');
  try {
    await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-test-pause'
      }
    });

    const result = await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      'OBJ-001',
      '--reason',
      'operator pause'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'paused');
    assert.equal(payload.activePointerReleased, false);
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
      ),
      true
    );

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'paused');

    const handshake = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'capability-handshake.json')
    );
    assert.equal(handshake.objective.activeObjectiveId, 'OBJ-001');
    assert.equal(handshake.objective.status, 'paused');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective stop transitions to abandoned, releases the pointer, and clears the active objective from the handshake artifact', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-stop-');
  try {
    await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-test-stop'
      }
    });

    const result = await runVre(projectRoot, [
      'objective',
      'stop',
      '--objective',
      'OBJ-001',
      '--reason',
      'operator stop'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'abandoned');
    assert.equal(payload.releasedPointer, '.vibe-science-environment/objectives/active-objective.json');
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
      ),
      false
    );

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'abandoned');

    const handshake = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'capability-handshake.json')
    );
    assert.equal(handshake.objective.activeObjectiveId, null);
    assert.equal(handshake.objective.status, null);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('activateObjective rolls back the objective directory and leaves no active pointer behind when the pointer write fails', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-atomic-fail-');
  try {
    const objectiveRecord = await readObjectiveFixture('valid-active.json');
    objectiveRecord.objectiveId = 'OBJ-001';

    await assert.rejects(
      activateObjective(projectRoot, objectiveRecord, {
        sessionId: 'sess-test-atomic-fail',
        atomicWriteJsonImpl: async () => {
          throw new Error('simulated pointer write failure');
        }
      }),
      /simulated pointer write failure/u
    );

    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001')
      ),
      false
    );
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
      ),
      false
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
