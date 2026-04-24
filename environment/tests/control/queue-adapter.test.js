import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createObjectiveStore } from '../../objectives/store.js';
import {
  appendObjectiveQueueRecord,
  deriveObjectiveQueueState,
  objectiveQueuePath,
  readObjectiveQueueRecords
} from '../../orchestrator/queue-adapter.js';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'objective'
);

async function readObjectiveFixture(fileName = 'valid-active.json') {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, fileName), 'utf8'));
}

async function createObjectiveFixtureProject() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-queue-adapter-'));
  const objectiveRecord = await readObjectiveFixture();
  await createObjectiveStore(projectRoot, objectiveRecord);
  return {
    projectRoot,
    objectiveId: objectiveRecord.objectiveId
  };
}

test('objective queue adapter reconstructs pending and completed task state from queue.jsonl', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    await appendObjectiveQueueRecord(projectRoot, objectiveId, {
      objectiveId,
      taskId: 'analysis-execution-run:ANL-001',
      taskKind: 'analysis-execution-run',
      analysisId: 'ANL-001',
      status: 'running',
      taskAttemptId: 'TASK-ANL-001-A',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-a',
      wakeId: 'WAKE-A',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/a.json'],
      resultArtifactPaths: [],
      resumeCursor: {
        manifestPath: 'analysis/manifests/a.json',
        queueRecordSeq: null
      }
    });
    await appendObjectiveQueueRecord(projectRoot, objectiveId, {
      objectiveId,
      taskId: 'analysis-execution-run:ANL-001',
      taskKind: 'analysis-execution-run',
      analysisId: 'ANL-001',
      status: 'completed',
      taskAttemptId: 'TASK-ANL-001-A',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:01:00Z',
      sessionId: 'sess-a',
      wakeId: 'WAKE-A',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/a.json'],
      resultArtifactPaths: ['artifacts/a.json'],
      resumeCursor: {
        manifestPath: 'analysis/manifests/a.json',
        queueRecordSeq: 1
      }
    });
    await appendObjectiveQueueRecord(projectRoot, objectiveId, {
      objectiveId,
      taskId: 'analysis-execution-run:ANL-002',
      taskKind: 'analysis-execution-run',
      analysisId: 'ANL-002',
      status: 'queued',
      taskAttemptId: 'TASK-ANL-002-A',
      createdAt: '2026-04-24T10:02:00Z',
      updatedAt: '2026-04-24T10:02:00Z',
      sessionId: 'sess-b',
      wakeId: 'WAKE-B',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/b.json'],
      resultArtifactPaths: [],
      resumeCursor: {
        manifestPath: 'analysis/manifests/b.json',
        queueRecordSeq: null
      }
    });

    const records = await readObjectiveQueueRecords(projectRoot, objectiveId);
    const queueState = deriveObjectiveQueueState(records);

    assert.deepEqual(records.map((record) => record.recordSeq), [1, 2, 3]);
    assert.deepEqual(queueState.latestRecords.map((record) => record.status), ['completed', 'queued']);
    assert.equal(queueState.pendingCount, 1);
    assert.equal(queueState.runningCount, 0);
    assert.equal(queueState.lastTaskId, 'analysis-execution-run:ANL-002');
    assert.equal(queueState.queueCursor, 3);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('objective queue adapter rejects queue lines that miss required fields', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    await writeFile(queuePath, `${JSON.stringify({
      recordSeq: 1,
      objectiveId,
      taskKind: 'analysis-execution-run',
      status: 'running',
      taskAttemptId: 'TASK-BAD-001',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-bad',
      wakeId: 'WAKE-BAD',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/bad.json'],
      resultArtifactPaths: [],
      resumeCursor: {}
    })}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /taskId must be a non-empty string/u
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('objective queue adapter rejects queue lines whose objectiveId does not match the owning objective', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    await writeFile(queuePath, `${JSON.stringify({
      recordSeq: 1,
      objectiveId: 'OBJ-999',
      taskId: 'analysis-execution-run:ANL-999',
      taskKind: 'analysis-execution-run',
      status: 'running',
      taskAttemptId: 'TASK-BAD-999',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-bad',
      wakeId: 'WAKE-BAD',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/bad.json'],
      resultArtifactPaths: [],
      resumeCursor: {}
    })}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      new RegExp(`does not match expected ${objectiveId}`, 'u')
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
