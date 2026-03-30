/**
 * Append-only telemetry events — events.jsonl
 * Observational only, never truth-creating.
 */

import path from 'node:path';
import {
  controlDir, ensureControlDir, appendJsonl, readJsonl,
  loadValidator, assertValid, now
} from './_io.js';

const SCHEMA = 'event-record.schema.json';
const FILE   = 'events.jsonl';

function filePath(projectPath) {
  return path.join(controlDir(projectPath), FILE);
}

let eventSeq = 0;

export async function appendEvent(projectPath, event) {
  await ensureControlDir(projectPath);

  const record = {
    eventId: event.eventId ?? `EVT-${Date.now()}-${++eventSeq}`,
    kind: event.kind,
    attemptId: event.attemptId ?? null,
    scope: event.scope ?? null,
    targetId: event.targetId ?? null,
    severity: event.severity ?? 'info',
    message: event.message ?? null,
    details: event.details ?? null,
    recordedAt: event.recordedAt ?? now()
  };

  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, record, 'event record');
  await appendJsonl(filePath(projectPath), record);
  return record;
}

export async function listEvents(projectPath, filters = {}) {
  const all = await readJsonl(filePath(projectPath));
  let result = all;

  if (filters.kind) {
    result = result.filter(e => e.kind === filters.kind);
  }
  if (filters.attemptId) {
    result = result.filter(e => e.attemptId === filters.attemptId);
  }
  if (filters.since) {
    result = result.filter(e => e.recordedAt >= filters.since);
  }

  // Default sort: newest first
  result.sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
