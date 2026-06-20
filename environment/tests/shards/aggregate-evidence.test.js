import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';
import {
  aggregateEvidence,
  runShardEvidenceReport
} from './aggregate-evidence.js';

const REVIEWED_SHARDS = [
  { id: 'phase9:bridge', scriptName: 'test:phase9:bridge' },
  { id: 'phase9:gate', scriptName: 'test:phase9:gate' },
  { id: 'phase9:loop', scriptName: 'test:phase9:loop' },
  { id: 'phase9:cli', scriptName: 'test:phase9:cli' },
  { id: 'loop:clusters', scriptName: 'test:loop:clusters' }
];

const SHARD_MAP = {
  schemaVersion: 'phase14.phase9-shard-map.v1',
  source: {
    providerPackage: '../vibe-science/package.json',
    script: 'test:phase9'
  },
  shards: REVIEWED_SHARDS.map((shard) => ({
    ...shard,
    root: shard.id === 'loop:clusters' ? 'vre' : 'provider',
    budgetSeconds: shard.id === 'loop:clusters' ? 420 : 60,
    files: shard.id === 'loop:clusters'
      ? ['environment/tests/cli/research-loop.test.js']
      : [`tests/${shard.id.replace(':', '-')}.test.mjs`],
    ...(shard.id === 'loop:clusters' ? { testNamePatterns: ['^research-loop returns'] } : {})
  }))
};

function evidenceFor(shard, overrides = {}) {
  return {
    schemaVersion: 'phase14.shard-evidence.v1',
    id: shard.id,
    scriptName: shard.scriptName,
    pass: true,
    testExitCode: 0,
    elapsedSeconds: 1,
    budgetSeconds: shard.id === 'loop:clusters' ? 420 : 60,
    withinBudget: true,
    timestamp: '2026-06-21T00:00:00.000Z',
    ...overrides
  };
}

function allEvidence() {
  return REVIEWED_SHARDS.map((shard) => evidenceFor(shard));
}

test('aggregate evidence computes top-level pass and budget truth from all rows', () => {
  const oneFailure = allEvidence();
  oneFailure[1] = evidenceFor(REVIEWED_SHARDS[1], {
    pass: false,
    testExitCode: 7
  });
  const oneOverBudget = allEvidence();
  oneOverBudget[3] = evidenceFor(REVIEWED_SHARDS[3], {
    pass: false,
    testExitCode: 0,
    withinBudget: false,
    elapsedSeconds: 90,
    budgetSeconds: 60
  });

  const passing = aggregateEvidence({
    shardMap: SHARD_MAP,
    evidenceRows: allEvidence(),
    generatedAt: '2026-06-21T00:00:01.000Z'
  });
  assert.equal(passing.allPass, true);
  assert.equal(passing.allWithinBudget, true);
  assert.deepEqual(passing.shards.map((row) => row.id), REVIEWED_SHARDS.map((row) => row.id));

  const failed = aggregateEvidence({
    shardMap: SHARD_MAP,
    evidenceRows: oneFailure,
    generatedAt: '2026-06-21T00:00:01.000Z'
  });
  assert.equal(failed.allPass, false);
  assert.equal(failed.allWithinBudget, true);

  const overBudget = aggregateEvidence({
    shardMap: SHARD_MAP,
    evidenceRows: oneOverBudget,
    generatedAt: '2026-06-21T00:00:01.000Z'
  });
  assert.equal(overBudget.allPass, false);
  assert.equal(overBudget.allWithinBudget, false);
});

test('aggregate evidence rejects incomplete, duplicate, unknown, and mismatched rows', () => {
  assert.throws(
    () => aggregateEvidence({
      shardMap: SHARD_MAP,
      evidenceRows: allEvidence().slice(1)
    }),
    /E_SHARD_AGGREGATE_MISSING/
  );

  assert.throws(
    () => aggregateEvidence({
      shardMap: SHARD_MAP,
      evidenceRows: [...allEvidence(), evidenceFor(REVIEWED_SHARDS[0])]
    }),
    /E_SHARD_AGGREGATE_DUPLICATE/
  );

  assert.throws(
    () => aggregateEvidence({
      shardMap: SHARD_MAP,
      evidenceRows: [
        ...allEvidence(),
        evidenceFor({ id: 'phase9:unknown', scriptName: 'test:phase9:unknown' })
      ]
    }),
    /E_SHARD_AGGREGATE_UNKNOWN/
  );

  const mismatched = allEvidence();
  mismatched[0] = evidenceFor(REVIEWED_SHARDS[0], { scriptName: 'test:phase9:wrong' });
  assert.throws(
    () => aggregateEvidence({
      shardMap: SHARD_MAP,
      evidenceRows: mismatched
    }),
    /E_SHARD_AGGREGATE_SCRIPT_MISMATCH/
  );
});

test('aggregate evidence rejects malformed rows and does not trust caller booleans', () => {
  const malformed = allEvidence();
  delete malformed[2].timestamp;
  assert.throws(
    () => aggregateEvidence({
      shardMap: SHARD_MAP,
      evidenceRows: malformed
    }),
    /E_SHARD_AGGREGATE_ROW_INVALID/
  );

  const lying = allEvidence();
  lying[4] = evidenceFor(REVIEWED_SHARDS[4], {
    pass: false,
    testExitCode: 1,
    withinBudget: false
  });
  const report = aggregateEvidence({
    shardMap: SHARD_MAP,
    evidenceRows: lying,
    allPass: true,
    allWithinBudget: true
  });
  assert.equal(report.allPass, false);
  assert.equal(report.allWithinBudget, false);
});

test('real report runner executes exactly the reviewed shard ids in map order', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-shard-aggregate-'));
  const reportOut = path.join(dir, 'shard-evidence.json');
  const calls = [];
  try {
    const result = await runShardEvidenceReport({
      shardMap: SHARD_MAP,
      reportOut,
      evidenceDir: path.join(dir, 'per-shard'),
      runShardImpl: async ({ shardId, evidenceOut }) => {
        calls.push({ shardId, evidenceOut });
        const shard = REVIEWED_SHARDS.find((candidate) => candidate.id === shardId);
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          evidence: evidenceFor(shard)
        };
      },
      generatedAt: '2026-06-21T00:00:01.000Z',
      timestamp: '2026-06-21T00:00:00.000Z'
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls.map((call) => call.shardId), REVIEWED_SHARDS.map((row) => row.id));
    const written = JSON.parse(await readFile(reportOut, 'utf8'));
    assert.equal(written.schemaVersion, 'phase14.shard-evidence-report.v1');
    assert.equal(written.allPass, true);
    assert.equal(written.allWithinBudget, true);
    assert.deepEqual(written.shards.map((row) => row.id), REVIEWED_SHARDS.map((row) => row.id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('aggregate evidence source uses runShard without shell or npm execution', async () => {
  const source = await readFile(
    path.resolve('environment/tests/shards/aggregate-evidence.js'),
    'utf8'
  );
  assert.match(source, /\brunShard\b/u);
  assert.doesNotMatch(source, /\bexec(?:Sync)?\s*\(/u);
  assert.doesNotMatch(source, /\bspawn\s*\(/u);
  assert.doesNotMatch(source, /\bnpm\s+run\b/u);
  assert.doesNotMatch(source, /shell:\s*true/u);
});

test('validate-counts tracks the aggregate evidence shard test', async () => {
  assert.equal(expectedCounts.shardTests, 5);
  await validateCounts();
});
