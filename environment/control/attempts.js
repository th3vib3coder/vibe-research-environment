/**
 * Attempt ledger — append-only lifecycle tracking in attempts.jsonl.
 * Each update appends a NEW record (event-sourced, not in-place mutation).
 */

import path from 'node:path';
import {
  controlDir, ensureControlDir, appendJsonl, readJsonl,
  loadValidator, assertValid, now
} from './_io.js';

const SCHEMA = 'attempt-record.schema.json';
const FILE   = 'attempts.jsonl';

const TERMINAL = new Set(['succeeded', 'failed', 'blocked', 'timeout', 'unresponsive', 'abandoned']);

let attemptSeq = 0;

function filePath(projectPath) {
  return path.join(controlDir(projectPath), FILE);
}

function generateAttemptId() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  return `ATT-${date}-${String(++attemptSeq).padStart(3, '0')}`;
}

export async function openAttempt(projectPath, input = {}) {
  await ensureControlDir(projectPath);

  const timestamp = now();
  const record = {
    attemptId: input.attemptId ?? generateAttemptId(),
    scope: input.scope ?? null,
    targetId: input.targetId ?? null,
    status: 'preparing',
    startedAt: timestamp,
    lastHeartbeatAt: timestamp,
    endedAt: null,
    retryCount: input.retryCount ?? 0,
    errorCode: null,
    summary: null
  };

  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, record, 'attempt record');
  await appendJsonl(filePath(projectPath), record);
  return record;
}

export async function updateAttempt(projectPath, attemptId, patch = {}) {
  const all = await readJsonl(filePath(projectPath));

  // Find latest record for this attempt
  const previous = [...all].reverse().find(r => r.attemptId === attemptId);
  if (!previous) {
    throw new Error(`Attempt not found: ${attemptId}`);
  }

  // Terminal attempts cannot be reopened
  if (TERMINAL.has(previous.status) && !TERMINAL.has(patch.status)) {
    throw new Error(`Attempt ${attemptId} is terminal (${previous.status}), cannot reopen`);
  }

  const timestamp = now();
  const record = {
    ...previous,
    ...patch,
    attemptId,
    lastHeartbeatAt: timestamp,
    endedAt: TERMINAL.has(patch.status ?? previous.status)
      ? (patch.endedAt ?? timestamp)
      : previous.endedAt
  };

  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, record, 'attempt record');
  await appendJsonl(filePath(projectPath), record);
  return record;
}

export async function listAttempts(projectPath, filters = {}) {
  const all = await readJsonl(filePath(projectPath));

  // Build latest-state map (last record per attemptId wins)
  const latest = new Map();
  for (const record of all) {
    latest.set(record.attemptId, record);
  }
  let result = [...latest.values()];

  if (filters.status) {
    result = result.filter(r => r.status === filters.status);
  }
  if (filters.scope) {
    result = result.filter(r => r.scope === filters.scope);
  }
  if (filters.targetId) {
    result = result.filter(r => r.targetId === filters.targetId);
  }

  // Default sort: newest first
  result.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
