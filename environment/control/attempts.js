import { randomUUID } from 'node:crypto';

import {
  appendJsonl,
  assertValid,
  controlDir,
  loadValidator,
  now,
  readJsonl,
  resolveInside
} from './_io.js';

const SCHEMA_FILE = 'attempt-record.schema.json';
const ATTEMPTS_FILE = 'attempts.jsonl';
const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'blocked',
  'timeout',
  'unresponsive',
  'abandoned'
]);

const ALLOWED_TRANSITIONS = new Map([
  ['preparing', new Set(['preparing', 'running', ...TERMINAL_STATUSES])],
  ['running', new Set(['running', ...TERMINAL_STATUSES])],
  ['succeeded', new Set()],
  ['failed', new Set()],
  ['blocked', new Set()],
  ['timeout', new Set()],
  ['unresponsive', new Set()],
  ['abandoned', new Set()]
]);

function attemptsPath(projectPath) {
  return resolveInside(controlDir(projectPath), ATTEMPTS_FILE);
}

function normalizeScope(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return value.replace(/^\//u, '');
}

function generateAttemptId() {
  const stamp = now()
    .replace(/[:.]/gu, '-')
    .replace('T', '-')
    .replace('Z', '');
  return `ATT-${stamp}-${randomUUID().slice(0, 8)}`;
}

function assertTransition(previousStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS.get(previousStatus);
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(
      `Invalid attempt transition: ${previousStatus} -> ${nextStatus}`
    );
  }
}

function latestAttempts(records) {
  const latestById = new Map();
  for (const record of records) {
    latestById.set(record.attemptId, record);
  }
  return [...latestById.values()];
}

export async function openAttempt(projectPath, input = {}) {
  const timestamp = now();
  const record = {
    attemptId: input.attemptId ?? generateAttemptId(),
    scope: normalizeScope(input.scope ?? input.flow),
    targetId: input.targetId ?? null,
    status: 'preparing',
    startedAt: timestamp,
    lastHeartbeatAt: timestamp,
    endedAt: null,
    retryCount: input.retryCount ?? 0,
    errorCode: null,
    summary: null
  };

  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, record, 'attempt record');
  await appendJsonl(projectPath, ATTEMPTS_FILE, record);
  return record;
}

export async function updateAttempt(projectPath, attemptId, patch = {}) {
  const records = await readJsonl(attemptsPath(projectPath));
  const previous = [...records].reverse().find((record) => record.attemptId === attemptId);

  if (!previous) {
    throw new Error(`Attempt not found: ${attemptId}`);
  }

  const nextStatus = patch.status ?? previous.status;
  assertTransition(previous.status, nextStatus);

  const heartbeatAt = now();
  const record = {
    ...previous,
    ...patch,
    attemptId,
    scope: patch.scope === undefined ? previous.scope : normalizeScope(patch.scope),
    lastHeartbeatAt: heartbeatAt,
    endedAt: TERMINAL_STATUSES.has(nextStatus)
      ? patch.endedAt ?? previous.endedAt ?? heartbeatAt
      : null
  };

  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, record, 'attempt record');
  await appendJsonl(projectPath, ATTEMPTS_FILE, record);
  return record;
}

export async function listAttempts(projectPath, filters = {}) {
  const records = await readJsonl(attemptsPath(projectPath));
  const flowFilter = normalizeScope(filters.flow ?? filters.scope);
  let result = latestAttempts(records);

  if (filters.status) {
    result = result.filter((record) => record.status === filters.status);
  }
  if (flowFilter) {
    result = result.filter((record) => record.scope === flowFilter);
  }
  if (filters.targetId) {
    result = result.filter((record) => record.targetId === filters.targetId);
  }

  result.sort((left, right) =>
    (right.lastHeartbeatAt ?? right.startedAt ?? '').localeCompare(
      left.lastHeartbeatAt ?? left.startedAt ?? ''
    )
  );

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
