import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  L0HaltSnapshotError,
  attachL0HaltSnapshotFields,
  writeL0HaltSnapshotBeforeAction
} from '../../../autonomous/l0/halt-snapshot.js';

function baseSnapshot() {
  return {
    schemaVersion: 'phase9.resume-snapshot.v1',
    writtenAt: '2026-06-22T20:00:00.000Z',
    writtenReason: 'loop-iteration',
    objectiveId: 'OBJ-L0-HALT-SNAPSHOT',
    objectiveStatusAtSnapshot: 'active',
    runtimeMode: 'attended-batch',
    reasoningMode: 'rule-only',
    wakePolicySnapshot: {
      wakeOwner: 'manual',
      wakeSourceId: 'operator-session',
      heartbeatIntervalSeconds: 1800,
      leaseTtlSeconds: 900,
      duplicateWakePolicy: 'no-op'
    },
    budgetRemaining: {
      maxWallSecondsLeft: 300,
      maxIterationsLeft: 4,
      costCeilingLeft: null
    },
    queueVisibility: {
      queuePath: '.vibe-science-environment/objectives/OBJ-L0-HALT-SNAPSHOT/queue.json',
      queueCursor: '2',
      pendingCount: 1,
      runningCount: 0,
      lastTaskId: null
    },
    stageCursor: {
      current: 'analysis',
      stageStatus: 'active',
      lastCompleteStage: 'orientation'
    },
    nextAction: {
      kind: 'run-analysis',
      params: {
        analysisId: 'AN-L0-001'
      }
    },
    openBlockers: [],
    openHandoffs: [],
    wakeLease: {
      wakeId: 'WAKE-L0-001',
      leaseAcquiredAt: '2026-06-22T19:59:00.000Z',
      leaseExpiresAt: '2026-06-22T20:14:00.000Z',
      acquiredBy: 'operator',
      previousWakeId: null
    },
    kernelFingerprint: {
      lastClaimId: null,
      lastCitationCheckId: null,
      lastR2VerdictId: null,
      lastObserverAlertId: null,
      lastGateCheckId: null,
      lastPatternId: null,
      takenAt: '2026-06-22T19:59:30.000Z'
    },
    notes: 'L0 write-ahead fixture.'
  };
}

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-l0-halt-snapshot-'));
  try {
    return await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

test('attaches L0 halt metadata from the existing budget snapshot', () => {
  const snapshot = attachL0HaltSnapshotFields(baseSnapshot(), {
    iteration: 3,
    haltChecked: true
  });

  assert.equal(snapshot.iteration, 3);
  assert.deepEqual(snapshot.budget_left, {
    maxWallSecondsLeft: 300,
    maxIterationsLeft: 4,
    costCeilingLeft: null
  });
  assert.equal(snapshot.halt_checked, true);
});

test('rejects stale caller-supplied budget_left instead of trusting it', () => {
  assert.throws(
    () => attachL0HaltSnapshotFields(baseSnapshot(), {
      iteration: 3,
      haltChecked: true,
      budget_left: { maxIterationsLeft: 999 }
    }),
    (error) => error instanceof L0HaltSnapshotError
      && error.code === 'E_L0_HALT_SNAPSHOT_BUDGET_MANUAL'
  );
});

test('writes the recovery snapshot before the candidate action runs', async () => {
  await withTempProject(async (projectRoot) => {
    const snapshotPath = path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-L0-HALT-SNAPSHOT', 'resume-snapshot.json');
    const events = [];

    const result = await writeL0HaltSnapshotBeforeAction({
      projectRoot,
      objectiveRecord: { objectiveId: 'OBJ-L0-HALT-SNAPSHOT' },
      activePointer: null,
      queueState: {},
      iteration: 2,
      haltChecked: true,
      action: async ({ snapshot }) => {
        events.push('action');
        const fromDisk = JSON.parse(await readFile(snapshotPath, 'utf8'));
        assert.equal(fromDisk.iteration, 2);
        assert.deepEqual(fromDisk.budget_left, snapshot.budget_left);
        assert.equal(fromDisk.halt_checked, true);
        return 'action-result';
      }
    }, {
      writeRuntimeResumeSnapshot: async () => {
        events.push('phase9-write');
        return {
          snapshot: baseSnapshot(),
          snapshotPath
        };
      },
      validateSnapshot: async () => {
        events.push('validate');
      },
      atomicWriteJson: async (targetPath, value) => {
        events.push('write-ahead');
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      }
    });

    assert.equal(result.actionResult, 'action-result');
    assert.deepEqual(events, ['phase9-write', 'validate', 'write-ahead', 'action']);
  });
});

test('a crash after write-ahead leaves the L0 cursor recoverable from disk', async () => {
  await withTempProject(async (projectRoot) => {
    const snapshotPath = path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-L0-HALT-SNAPSHOT', 'resume-snapshot.json');

    await assert.rejects(
      () => writeL0HaltSnapshotBeforeAction({
        projectRoot,
        objectiveRecord: { objectiveId: 'OBJ-L0-HALT-SNAPSHOT' },
        activePointer: null,
        queueState: {},
        iteration: 5,
        haltChecked: true,
        action: async () => {
          throw new Error('simulated crash after write-ahead');
        }
      }, {
        writeRuntimeResumeSnapshot: async () => ({
          snapshot: baseSnapshot(),
          snapshotPath
        }),
        validateSnapshot: async () => {}
      }),
      /simulated crash/u
    );

    const fromDisk = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(fromDisk.iteration, 5);
    assert.deepEqual(fromDisk.budget_left, {
      maxWallSecondsLeft: 300,
      maxIterationsLeft: 4,
      costCeilingLeft: null
    });
    assert.equal(fromDisk.halt_checked, true);
  });
});

test('halt guard must be checked before the action can run', async () => {
  await withTempProject(async (projectRoot) => {
    let actionRan = false;

    await assert.rejects(
      () => writeL0HaltSnapshotBeforeAction({
        projectRoot,
        objectiveRecord: { objectiveId: 'OBJ-L0-HALT-SNAPSHOT' },
        activePointer: null,
        queueState: {},
        iteration: 1,
        haltChecked: false,
        action: async () => {
          actionRan = true;
        }
      }),
      (error) => error instanceof L0HaltSnapshotError
        && error.code === 'E_L0_HALT_SNAPSHOT_NOT_CHECKED'
    );

    assert.equal(actionRan, false);
  });
});
