/**
 * Append-only decision log — decisions.jsonl
 * Records workflow decisions that must not live only in chat.
 */

import path from 'node:path';
import {
  controlDir, ensureControlDir, appendJsonl, readJsonl,
  loadValidator, assertValid, now
} from './_io.js';

const SCHEMA = 'decision-record.schema.json';
const FILE   = 'decisions.jsonl';

let decisionSeq = 0;

function filePath(projectPath) {
  return path.join(controlDir(projectPath), FILE);
}

export async function appendDecision(projectPath, decision) {
  await ensureControlDir(projectPath);

  const record = {
    decisionId: decision.decisionId ?? `DEC-${Date.now()}-${++decisionSeq}`,
    flow: decision.flow,
    targetId: decision.targetId ?? null,
    attemptId: decision.attemptId ?? null,
    kind: decision.kind,
    reason: decision.reason,
    details: decision.details ?? null,
    recordedAt: decision.recordedAt ?? now()
  };

  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, record, 'decision record');
  await appendJsonl(filePath(projectPath), record);
  return record;
}

export async function listDecisions(projectPath, filters = {}) {
  const all = await readJsonl(filePath(projectPath));
  let result = all;

  if (filters.flow) {
    result = result.filter(d => d.flow === filters.flow);
  }
  if (filters.targetId) {
    result = result.filter(d => d.targetId === filters.targetId);
  }
  if (filters.attemptId) {
    result = result.filter(d => d.attemptId === filters.attemptId);
  }

  // Default sort: newest first
  result.sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return result.slice(offset, offset + limit);
}
