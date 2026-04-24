import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { readJsonl, withLock } from '../control/_io.js';
import { objectiveDir } from '../objectives/store.js';

export const OBJECTIVE_QUEUE_FILE = 'queue.jsonl';
export const TERMINAL_OBJECTIVE_QUEUE_STATUSES = new Set([
  'completed',
  'blocked',
  'failed',
  'cancelled',
  'interrupted'
]);

const NON_TERMINAL_OBJECTIVE_QUEUE_STATUSES = new Set([
  'queued',
  'running'
]);

const OBJECTIVE_QUEUE_STATUSES = new Set([
  ...NON_TERMINAL_OBJECTIVE_QUEUE_STATUSES,
  ...TERMINAL_OBJECTIVE_QUEUE_STATUSES
]);

function objectiveQueueLockName(objectiveId) {
  return `${objectiveId}-${OBJECTIVE_QUEUE_FILE}`;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid phase9 objective queue record: ${label} must be a non-empty string.`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid phase9 objective queue record: ${label} must be an array.`);
  }
  for (const entry of value) {
    assertNonEmptyString(entry, `${label}[]`);
  }
}

function assertIsoDateTime(value, label) {
  assertNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid phase9 objective queue record: ${label} must be an ISO-8601 date-time string.`);
  }
}

function assertResumeCursor(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid phase9 objective queue record: resumeCursor must be an object.');
  }

  if ('queueRecordSeq' in value && value.queueRecordSeq != null) {
    if (!Number.isInteger(value.queueRecordSeq) || value.queueRecordSeq <= 0) {
      throw new Error('Invalid phase9 objective queue record: resumeCursor.queueRecordSeq must be a positive integer or null.');
    }
  }
}

export function isTerminalObjectiveQueueStatus(status) {
  return TERMINAL_OBJECTIVE_QUEUE_STATUSES.has(status);
}

export function objectiveQueuePath(projectPath, objectiveId) {
  return path.join(objectiveDir(projectPath, objectiveId), OBJECTIVE_QUEUE_FILE);
}

export function assertValidObjectiveQueueRecord(record, expectedObjectiveId) {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Invalid phase9 objective queue record: record must be an object.');
  }

  if (!Number.isInteger(record.recordSeq) || record.recordSeq <= 0) {
    throw new Error('Invalid phase9 objective queue record: recordSeq must be a positive integer.');
  }

  assertNonEmptyString(record.objectiveId, 'objectiveId');
  if (record.objectiveId !== expectedObjectiveId) {
    throw new Error(
      `Invalid phase9 objective queue record: objectiveId ${record.objectiveId} does not match expected ${expectedObjectiveId}.`
    );
  }

  assertNonEmptyString(record.taskId, 'taskId');
  assertNonEmptyString(record.taskKind, 'taskKind');
  assertNonEmptyString(record.taskAttemptId, 'taskAttemptId');
  assertNonEmptyString(record.sessionId, 'sessionId');
  assertNonEmptyString(record.wakeId, 'wakeId');
  assertIsoDateTime(record.createdAt, 'createdAt');
  assertIsoDateTime(record.updatedAt, 'updatedAt');

  if (!OBJECTIVE_QUEUE_STATUSES.has(record.status)) {
    throw new Error(
      `Invalid phase9 objective queue record: status must be one of ${[...OBJECTIVE_QUEUE_STATUSES].join(', ')}.`
    );
  }

  if (record.handoffId != null) {
    assertNonEmptyString(record.handoffId, 'handoffId');
  }

  assertStringArray(record.sourceArtifactPaths, 'sourceArtifactPaths');
  assertStringArray(record.resultArtifactPaths, 'resultArtifactPaths');
  assertResumeCursor(record.resumeCursor);
}

export async function appendObjectiveQueueRecord(projectPath, objectiveId, record) {
  const queuePath = objectiveQueuePath(projectPath, objectiveId);
  return withLock(projectPath, objectiveQueueLockName(objectiveId), async () => {
    await mkdir(path.dirname(queuePath), { recursive: true });
    const existing = await readJsonl(queuePath);
    const nextRecord = {
      recordSeq: (existing.at(-1)?.recordSeq ?? 0) + 1,
      ...record
    };
    assertValidObjectiveQueueRecord(nextRecord, objectiveId);
    await appendFile(queuePath, `${JSON.stringify(nextRecord)}\n`, 'utf8');
    return nextRecord;
  });
}

export async function readObjectiveQueueRecords(projectPath, objectiveId) {
  const records = await readJsonl(objectiveQueuePath(projectPath, objectiveId));
  let previousSeq = 0;
  for (const record of records) {
    assertValidObjectiveQueueRecord(record, objectiveId);
    if (record.recordSeq <= previousSeq) {
      throw new Error('Invalid phase9 objective queue record: recordSeq must be strictly monotonic within queue.jsonl.');
    }
    previousSeq = record.recordSeq;
  }
  return records;
}

export function deriveObjectiveQueueState(records) {
  const latestByAttempt = new Map();
  for (const record of records) {
    const current = latestByAttempt.get(record.taskAttemptId);
    if (!current || record.recordSeq > current.recordSeq) {
      latestByAttempt.set(record.taskAttemptId, record);
    }
  }

  const latestRecords = [...latestByAttempt.values()].sort((left, right) => left.recordSeq - right.recordSeq);
  const incompleteAttempts = latestRecords.filter((record) => !isTerminalObjectiveQueueStatus(record.status));

  return {
    records,
    latestRecords,
    incompleteAttempts,
    pendingCount: latestRecords.filter((record) => record.status === 'queued').length,
    runningCount: latestRecords.filter((record) => record.status === 'running').length,
    lastTaskId: latestRecords.at(-1)?.taskId ?? null,
    queueCursor: records.at(-1)?.recordSeq ?? null
  };
}

export function latestTerminalQueueRecord(queueState) {
  const terminalRecords = queueState.latestRecords.filter((record) => isTerminalObjectiveQueueStatus(record.status));
  return terminalRecords.at(-1) ?? null;
}

export function findIncompleteAttempt(queueState) {
  return queueState.incompleteAttempts.at(-1) ?? null;
}
