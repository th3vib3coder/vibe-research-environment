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
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'resume-snapshot.json')
      ),
      true
    );

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
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'resume-snapshot.json')
      ),
      true
    );

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

// Round 46 coverage hardening: the following tests close T2.2 branches
// that were implemented by seq 059-060 but left without dedicated tests.
// They do not change any reviewed contract; they pin implemented behavior
// against silent regression.

test('objective stop without an active pointer fails with a clear error message and leaves no pointer behind', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-stop-no-pointer-');
  try {
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
    assert.equal(result.code, 1);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective stop');
    assert.equal(payload.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
    assert.match(payload.message, /No active objective pointer exists/u);
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

test('objective stop with a mismatched objectiveId preserves the active pointer and reports the mismatch', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-stop-mismatch-');
  try {
    const start = await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-mismatch'
      }
    });
    assert.equal(start.code, 0, `stderr=${start.stderr}`);

    const stop = await runVre(projectRoot, [
      'objective',
      'stop',
      '--objective',
      'OBJ-999',
      '--reason',
      'wrong id'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(stop.code, 1);
    assert.equal(stop.stderr, '');
    const payload = JSON.parse(stop.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective stop');
    assert.equal(payload.code, 'E_OBJECTIVE_ID_MISMATCH');
    assert.match(payload.message, /references OBJ-001, not OBJ-999/u);

    // Pointer MUST still exist: a mismatched stop cannot silently release
    // the lock.
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
      ),
      true
    );

    // The handshake artifact MUST still show the original active objective.
    const handshake = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'capability-handshake.json')
    );
    assert.equal(handshake.objective.activeObjectiveId, 'OBJ-001');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective pause on an already-paused objective fails instead of silently re-pausing', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-pause-already-paused-');
  try {
    await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-pause-twice'
      }
    });

    const firstPause = await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      'OBJ-001',
      '--reason',
      'first pause'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(firstPause.code, 0, `stderr=${firstPause.stderr}`);

    const secondPause = await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      'OBJ-001',
      '--reason',
      'second pause'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(secondPause.code, 1);
    assert.equal(secondPause.stderr, '');
    const payload = JSON.parse(secondPause.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective pause');
    assert.equal(payload.code, 'E_OBJECTIVE_STATE_INVALID');
    assert.equal(payload.status, 'paused');
    assert.match(payload.message, /Cannot pause objective in status paused/u);

    // Pointer must still be there and objective must still be paused, not
    // accidentally reset to active.
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
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective stop called a second time after a successful stop fails because the pointer is already released', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-lock-double-stop-');
  try {
    await runVre(projectRoot, objectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-double-stop'
      }
    });

    const firstStop = await runVre(projectRoot, [
      'objective',
      'stop',
      '--objective',
      'OBJ-001',
      '--reason',
      'first stop'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(firstStop.code, 0, `stderr=${firstStop.stderr}`);

    const secondStop = await runVre(projectRoot, [
      'objective',
      'stop',
      '--objective',
      'OBJ-001',
      '--reason',
      'second stop'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(secondStop.code, 1);
    assert.equal(secondStop.stderr, '');
    const payload = JSON.parse(secondStop.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective stop');
    assert.equal(payload.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
    assert.match(payload.message, /No active objective pointer exists/u);

    // After both calls the pointer stays released (idempotent safety).
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
      ),
      false
    );
    // The objective record remains at its terminal state, not overwritten.
    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'abandoned');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
