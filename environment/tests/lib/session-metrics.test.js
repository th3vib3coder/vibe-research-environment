import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { INTERNALS, createMetricsAccumulator } from '../../lib/session-metrics.js';

async function makeTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-session-metrics-'));
}

test('metrics accumulator records session counters and snapshots state', () => {
  const accumulator = createMetricsAccumulator({
    sessionId: 'S-001'
  });

  accumulator.record({
    type: 'tool_call',
    count: 2,
    estimatedCostUsd: 1.25,
    countingMode: 'provider_native'
  });
  accumulator.record({
    type: 'claim_produced'
  });
  accumulator.record({
    type: 'r2_review',
    count: 2,
    budgetState: 'advisory',
    lastAttemptId: 'ATT-2026-03-30-001'
  });

  assert.deepEqual(accumulator.snapshot(), {
    sessionId: 'S-001',
    lastAttemptId: 'ATT-2026-03-30-001',
    toolCalls: 2,
    claimsProduced: 1,
    claimsKilled: 0,
    r2Reviews: 2,
    estimatedCostUsd: 1.25,
    countingMode: 'provider_native',
    budgetState: 'advisory'
  });
});

test('metrics flush appends schema-valid JSONL records under the metrics path', async () => {
  const projectPath = await makeTempProject();
  const accumulator = createMetricsAccumulator({
    sessionId: 'S-002'
  });

  accumulator.record({
    type: 'tool_call',
    estimatedCostUsd: 0.5,
    countingMode: 'char_fallback'
  });
  accumulator.record({
    type: 'claim_killed',
    count: 2
  });

  const first = await accumulator.flush(projectPath, {
    recordedAt: '2026-03-30T10:00:00Z'
  });
  const second = await accumulator.flush(projectPath, {
    recordedAt: '2026-03-30T10:05:00Z'
  });

  assert.equal(first.written, true);
  assert.equal(second.written, false);
  assert.equal(
    first.path,
    path.join(projectPath, '.vibe-science-environment', 'metrics', 'costs.jsonl')
  );
  assert.equal(second.record.recordedAt, '2026-03-30T10:05:00Z');

  const raw = await readFile(first.path, 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 1);

  const records = lines.map((line) => JSON.parse(line));
  assert.equal(records[0].claimsKilled, 2);
  assert.equal(records[0].countingMode, 'char_fallback');
});

test('metrics flush resolves relative project paths before writing', async () => {
  const sandboxRoot = await makeTempProject();
  const relativeProjectName = 'relative-project';
  const relativeProjectPath = path.join(sandboxRoot, relativeProjectName);
  const accumulator = createMetricsAccumulator();

  accumulator.record({
    budgetState: 'ok'
  });

  const currentDirectory = process.cwd();
  process.chdir(sandboxRoot);

  try {
    const result = await accumulator.flush(`.${path.sep}${relativeProjectName}`, {
      recordedAt: '2026-03-30T10:06:00Z'
    });

    assert.equal(
      result.path,
      path.join(
        relativeProjectPath,
        '.vibe-science-environment',
        'metrics',
        'costs.jsonl'
      )
    );
  } finally {
    process.chdir(currentDirectory);
  }
});

test('metrics accumulator rejects unsupported event types', () => {
  const accumulator = createMetricsAccumulator();

  assert.throws(
    () => accumulator.record({ type: 'mystery' }),
    /unsupported metrics event/
  );
});

test('metrics flush fails closed when a record violates the costs schema', async () => {
  const projectPath = await makeTempProject();
  const accumulator = createMetricsAccumulator();

  accumulator.record({
    countingMode: 'provider_native',
    budgetState: 'ok'
  });

  assert.throws(
    () =>
      INTERNALS.normalizeInitialState({
        estimatedCostUsd: -1
      }),
    /estimatedCostUsd must be a non-negative number/
  );

  accumulator.record({
    budgetState: 'hard_stop'
  });

  const result = await accumulator.flush(projectPath, {
    recordedAt: '2026-03-30T10:10:00Z'
  });
  assert.equal(result.record.budgetState, 'hard_stop');
});
