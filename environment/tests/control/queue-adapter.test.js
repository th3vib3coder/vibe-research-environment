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

// Round 71 adversarial coverage: `assertValidObjectiveQueueRecord`
// (queue-adapter.js:72-109) has ~15 defensive validator branches. seq 086
// pinned only 2 of them (missing taskId + mismatched objectiveId). The rest
// were claim-without-pin gaps since the seq-086 ledger asserted "queue line
// validates required fields and objective id" without evidence for every
// enforced field. Round 71 closes three of the most regression-prone
// branches: the status enum membership check (line 96), the resumeCursor
// shape check (lines 52-62), and the strictly-monotonic recordSeq guard in
// `readObjectiveQueueRecords` (lines 131-133). These are the branches
// whose silent regression would cause the hardest failures downstream
// (stale status accepted, resumeCursor corruption accepted, backward-moving
// recordSeq accepted). Remaining validator branches (taskKind,
// taskAttemptId, sessionId, wakeId, dates, sourceArtifactPaths,
// resultArtifactPaths, handoffId, recordSeq positive-integer) are tracked
// as an explicit out-of-scope follow-up in seq 087 because they follow the
// same `assertNonEmptyString`/`assertIsoDateTime`/`assertStringArray`
// pattern already pinned by the taskId regression.

test('objective queue adapter rejects queue lines whose status is outside the reviewed enum', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    await writeFile(queuePath, `${JSON.stringify({
      recordSeq: 1,
      objectiveId,
      taskId: 'analysis-execution-run:ANL-BAD-STATUS',
      taskKind: 'analysis-execution-run',
      status: 'zombie',
      taskAttemptId: 'TASK-BAD-STATUS',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-bad-status',
      wakeId: 'WAKE-BAD-STATUS',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/bad-status.json'],
      resultArtifactPaths: [],
      resumeCursor: {
        manifestPath: 'analysis/manifests/bad-status.json',
        queueRecordSeq: null
      }
    })}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /status must be one of/u
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('objective queue adapter rejects queue lines whose resumeCursor is not an object', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    await writeFile(queuePath, `${JSON.stringify({
      recordSeq: 1,
      objectiveId,
      taskId: 'analysis-execution-run:ANL-BAD-CURSOR',
      taskKind: 'analysis-execution-run',
      status: 'running',
      taskAttemptId: 'TASK-BAD-CURSOR',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-bad-cursor',
      wakeId: 'WAKE-BAD-CURSOR',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/bad-cursor.json'],
      resultArtifactPaths: [],
      resumeCursor: 'not-an-object'
    })}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /resumeCursor must be an object/u
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('objective queue adapter rejects queue.jsonl whose recordSeq is not strictly monotonic', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    const first = {
      recordSeq: 1,
      objectiveId,
      taskId: 'analysis-execution-run:ANL-MONOTONIC',
      taskKind: 'analysis-execution-run',
      status: 'running',
      taskAttemptId: 'TASK-MONOTONIC-A',
      createdAt: '2026-04-24T10:00:00Z',
      updatedAt: '2026-04-24T10:00:00Z',
      sessionId: 'sess-monotonic',
      wakeId: 'WAKE-MONOTONIC',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/monotonic.json'],
      resultArtifactPaths: [],
      resumeCursor: {
        manifestPath: 'analysis/manifests/monotonic.json',
        queueRecordSeq: null
      }
    };
    // Append a second record with the same recordSeq value to simulate a
    // corrupted or hand-edited queue file where the append-only monotonic
    // invariant has been violated. `readObjectiveQueueRecords` must fail
    // closed rather than accept it and silently degrade later downstream.
    const duplicate = { ...first, taskAttemptId: 'TASK-MONOTONIC-B' };
    await writeFile(
      queuePath,
      `${JSON.stringify(first)}\n${JSON.stringify(duplicate)}\n`,
      'utf8'
    );

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /recordSeq must be strictly monotonic/u
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

// Round 72 symmetry coverage: pin the 10 remaining `assertValidObjectiveQueueRecord`
// (queue-adapter.js:72-109) defensive validator branches that Round 71 seq 087
// transparently deferred as "pure symmetry following the taskId pattern already
// pinned by seq 086". These regressions are pure coverage hardening — they do
// not close a claim-without-pin gap from any ledger row, but they prevent silent
// regression across every validator path so a future refactor cannot silently
// drop any individual guard without at least one test catching it. Round 72 is
// labeled honestly in seq 088 as symmetry-only, not drift closure.
//
// The remaining 10 branches split by error-message family:
//   - 4 non-empty-string fields: taskKind, taskAttemptId, sessionId, wakeId
//   - 2 ISO-datetime fields: createdAt, updatedAt
//   - 2 string-array fields: sourceArtifactPaths, resultArtifactPaths
//   - 1 conditional-non-null-string field: handoffId
//   - 1 positive-integer field: recordSeq

function buildValidObjectiveQueueRecord(objectiveId, overrides = {}) {
  return {
    recordSeq: 1,
    objectiveId,
    taskId: 'analysis-execution-run:ANL-SYMMETRY-001',
    taskKind: 'analysis-execution-run',
    status: 'running',
    taskAttemptId: 'TASK-SYMMETRY-001-A',
    createdAt: '2026-04-24T10:00:00Z',
    updatedAt: '2026-04-24T10:00:00Z',
    sessionId: 'sess-symmetry',
    wakeId: 'WAKE-SYMMETRY',
    handoffId: null,
    sourceArtifactPaths: ['analysis/manifests/symmetry.json'],
    resultArtifactPaths: [],
    resumeCursor: {
      manifestPath: 'analysis/manifests/symmetry.json',
      queueRecordSeq: null
    },
    ...overrides
  };
}

test('objective queue adapter rejects queue lines that miss each individually required string field', async () => {
  const requiredStringFields = ['taskKind', 'taskAttemptId', 'sessionId', 'wakeId'];
  for (const field of requiredStringFields) {
    const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
    try {
      const queuePath = objectiveQueuePath(projectRoot, objectiveId);
      const record = buildValidObjectiveQueueRecord(objectiveId);
      delete record[field];
      await writeFile(queuePath, `${JSON.stringify(record)}\n`, 'utf8');

      await assert.rejects(
        readObjectiveQueueRecords(projectRoot, objectiveId),
        new RegExp(`${field} must be a non-empty string`, 'u'),
        `expected rejection for missing ${field}, but adapter did not throw the canonical error`
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test('objective queue adapter rejects queue lines whose ISO date-time fields are not parseable', async () => {
  const dateFields = ['createdAt', 'updatedAt'];
  for (const field of dateFields) {
    const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
    try {
      const queuePath = objectiveQueuePath(projectRoot, objectiveId);
      const record = buildValidObjectiveQueueRecord(objectiveId, { [field]: 'not-an-iso-datetime' });
      await writeFile(queuePath, `${JSON.stringify(record)}\n`, 'utf8');

      await assert.rejects(
        readObjectiveQueueRecords(projectRoot, objectiveId),
        new RegExp(`${field} must be an ISO-8601 date-time string`, 'u'),
        `expected rejection for invalid ${field} ISO value`
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test('objective queue adapter rejects queue lines whose artifact-path fields are not arrays', async () => {
  const arrayFields = ['sourceArtifactPaths', 'resultArtifactPaths'];
  for (const field of arrayFields) {
    const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
    try {
      const queuePath = objectiveQueuePath(projectRoot, objectiveId);
      // Pass a non-array value (string) to trigger the `assertStringArray`
      // top-level branch; a separate test below covers the per-entry
      // non-empty-string guard for entries inside the array.
      const record = buildValidObjectiveQueueRecord(objectiveId, { [field]: 'not-an-array' });
      await writeFile(queuePath, `${JSON.stringify(record)}\n`, 'utf8');

      await assert.rejects(
        readObjectiveQueueRecords(projectRoot, objectiveId),
        new RegExp(`${field} must be an array`, 'u'),
        `expected rejection for non-array ${field}`
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test('objective queue adapter rejects queue lines whose handoffId is a non-null empty string', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    const record = buildValidObjectiveQueueRecord(objectiveId, { handoffId: '' });
    await writeFile(queuePath, `${JSON.stringify(record)}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /handoffId must be a non-empty string/u,
      'expected rejection for empty handoffId (non-null path)'
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('objective queue adapter rejects queue lines whose recordSeq is not a positive integer', async () => {
  const { projectRoot, objectiveId } = await createObjectiveFixtureProject();
  try {
    const queuePath = objectiveQueuePath(projectRoot, objectiveId);
    // recordSeq must be Number.isInteger AND > 0. Zero is the clearest
    // rejection case: it is a finite integer that violates the
    // positive-integer guard without ambiguity with undefined/null
    // handling, which the JSON parser would normalize differently.
    const record = buildValidObjectiveQueueRecord(objectiveId, { recordSeq: 0 });
    await writeFile(queuePath, `${JSON.stringify(record)}\n`, 'utf8');

    await assert.rejects(
      readObjectiveQueueRecords(projectRoot, objectiveId),
      /recordSeq must be a positive integer/u,
      'expected rejection for recordSeq=0'
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
