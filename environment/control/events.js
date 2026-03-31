import {
  appendJsonl,
  assertValid,
  controlDir,
  loadValidator,
  now,
  readJsonl,
  resolveInside
} from './_io.js';

const SCHEMA_FILE = 'event-record.schema.json';
const EVENTS_FILE = 'events.jsonl';

function eventsPath(projectPath) {
  return resolveInside(controlDir(projectPath), EVENTS_FILE);
}

function generateEventId() {
  return `EVT-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function appendEvent(projectPath, event) {
  const record = {
    eventId: event.eventId ?? generateEventId(),
    kind: event.kind,
    attemptId: event.attemptId ?? null,
    scope: event.scope ?? null,
    targetId: event.targetId ?? null,
    severity: event.severity ?? 'info',
    message: event.message ?? null,
    details: event.details ?? null,
    recordedAt: event.recordedAt ?? now()
  };

  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, record, 'event record');
  await appendJsonl(projectPath, EVENTS_FILE, record);
  return record;
}

export async function listEvents(projectPath, filters = {}) {
  let result = await readJsonl(eventsPath(projectPath));

  if (filters.kind) {
    result = result.filter((event) => event.kind === filters.kind);
  }
  if (filters.attemptId) {
    result = result.filter((event) => event.attemptId === filters.attemptId);
  }
  if (filters.since) {
    result = result.filter((event) => event.recordedAt >= filters.since);
  }

  result.sort((left, right) =>
    (right.recordedAt ?? '').localeCompare(left.recordedAt ?? '')
  );

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
