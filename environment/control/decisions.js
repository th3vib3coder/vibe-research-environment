import {
  appendJsonl,
  assertValid,
  controlDir,
  loadValidator,
  now,
  readJsonl,
  resolveInside
} from './_io.js';

const SCHEMA_FILE = 'decision-record.schema.json';
const DECISIONS_FILE = 'decisions.jsonl';

function decisionsPath(projectPath) {
  return resolveInside(controlDir(projectPath), DECISIONS_FILE);
}

function generateDecisionId() {
  return `DEC-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function appendDecision(projectPath, decision) {
  const record = {
    decisionId: decision.decisionId ?? generateDecisionId(),
    flow: decision.flow,
    targetId: decision.targetId ?? null,
    attemptId: decision.attemptId ?? null,
    kind: decision.kind,
    reason: decision.reason,
    details: decision.details ?? null,
    recordedAt: decision.recordedAt ?? now()
  };

  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, record, 'decision record');
  await appendJsonl(projectPath, DECISIONS_FILE, record);
  return record;
}

export async function listDecisions(projectPath, filters = {}) {
  let result = await readJsonl(decisionsPath(projectPath));

  if (filters.flow) {
    result = result.filter((decision) => decision.flow === filters.flow);
  }
  if (filters.targetId) {
    result = result.filter((decision) => decision.targetId === filters.targetId);
  }
  if (filters.attemptId) {
    result = result.filter((decision) => decision.attemptId === filters.attemptId);
  }

  result.sort((left, right) =>
    (right.recordedAt ?? '').localeCompare(left.recordedAt ?? '')
  );

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
