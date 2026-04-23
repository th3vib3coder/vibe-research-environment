import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  objectiveHandoffsPath,
  activateObjective
} from '../../objectives/store.js';
import {
  appendObjectiveEvent,
  readResumeSnapshot,
  writeObjectiveResumeSnapshot
} from '../../objectives/resume-snapshot.js';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9'
);

async function readFixture(section, fileName) {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, section, fileName), 'utf8'));
}

test('writeObjectiveResumeSnapshot writes a schema-valid heartbeat snapshot from durable objective state', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-resume-snapshot-heartbeat-'));
  try {
    const objectiveRecord = await readFixture('objective', 'valid-active.json');
    const activation = await activateObjective(projectRoot, objectiveRecord, {
      sessionId: 'sess-resume-snapshot'
    });
    const wakeLease = {
      wakeId: 'WAKE-T2-4-001',
      leaseAcquiredAt: '2026-04-23T10:00:00Z',
      leaseExpiresAt: '2026-04-23T10:15:00Z',
      acquiredBy: 'scheduler',
      previousWakeId: null
    };
    const handoff = await readFixture('handoff', 'valid-basic.json');
    await writeFile(
      objectiveHandoffsPath(projectRoot, objectiveRecord.objectiveId),
      `${JSON.stringify(handoff)}\n`,
      'utf8'
    );
    await appendObjectiveEvent(
      projectRoot,
      objectiveRecord.objectiveId,
      'loop-iteration',
      {
        iteration: 1,
        status: 'completed'
      },
      '2026-04-23T10:01:00Z'
    );

    const result = await writeObjectiveResumeSnapshot(projectRoot, objectiveRecord.objectiveId, {
      writtenReason: 'heartbeat',
      writtenAt: '2026-04-23T10:02:00Z',
      notes: 'Heartbeat no-op checkpoint.',
      activePointer: {
        ...activation.activeObjectivePointer,
        currentWakeLease: wakeLease
      }
    });

    assert.equal(result.snapshot.schemaVersion, 'phase9.resume-snapshot.v1');
    assert.equal(result.snapshot.writtenReason, 'heartbeat');
    assert.equal(result.snapshot.objectiveStatusAtSnapshot, 'active');
    assert.equal(result.snapshot.reasoningMode, 'rule-only');
    assert.equal(result.snapshot.budgetRemaining.maxIterationsLeft, 19);
    assert.deepEqual(result.snapshot.openHandoffs, ['H-0007']);
    assert.deepEqual(result.snapshot.wakeLease, wakeLease);
    assert.deepEqual(result.snapshot.nextAction, {
      kind: 'enqueue-task',
      params: {
        stageId: 'analysis'
      }
    });

    const freshRead = await readResumeSnapshot(projectRoot, objectiveRecord.objectiveId);
    assert.equal(freshRead.exists, true);
    assert.equal(freshRead.validationError, null);
    assert.deepEqual(freshRead.snapshot, result.snapshot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('writeObjectiveResumeSnapshot treats active pointer as lease authority and does not mutate immutable objective fields', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-resume-snapshot-immutable-'));
  try {
    const objectiveRecord = await readFixture('objective', 'valid-active.json');
    await activateObjective(projectRoot, objectiveRecord, {
      sessionId: 'sess-resume-snapshot-immutability'
    });

    const before = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'objectives',
          objectiveRecord.objectiveId,
          'objective.json'
        ),
        'utf8'
      )
    );
    const result = await writeObjectiveResumeSnapshot(projectRoot, objectiveRecord.objectiveId, {
      writtenReason: 'pre-compact',
      writtenAt: '2026-04-23T10:20:00Z'
    });
    const after = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'objectives',
          objectiveRecord.objectiveId,
          'objective.json'
        ),
        'utf8'
      )
    );

    assert.equal(result.snapshot.writtenReason, 'pre-compact');
    assert.deepEqual(result.snapshot.wakeLease, {
      wakeId: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      acquiredBy: null,
      previousWakeId: null
    });
    assert.deepEqual(after, before);
    assert.equal(after.reasoningMode, 'rule-only');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
