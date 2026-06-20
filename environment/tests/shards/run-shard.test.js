import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  formatErrors,
  repoRoot,
  validateWithSchema
} from '../ci/_helpers.js';
import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';
import {
  SHARD_BUDGET_EXCEEDED,
  runShard
} from './run-shard.js';

const RUNNER_PATH = path.join(repoRoot, 'environment/tests/shards/run-shard.js');
const EVIDENCE_SCHEMA_PATH = 'environment/tests/shards/shard-evidence.schema.json';

async function makeFixtureWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-shard-runner-'));
  const providerRoot = path.join(root, 'provider');
  await mkdir(path.join(providerRoot, 'tests'), { recursive: true });
  const mapPath = path.join(root, 'phase9-shard-map.json');
  const shards = [
    {
      id: 'phase9:fast-pass',
      scriptName: 'test:phase9:fast-pass',
      root: 'provider',
      budgetSeconds: 1,
      files: ['tests/fast-pass.test.mjs']
    },
    {
      id: 'phase9:slow-pass',
      scriptName: 'test:phase9:slow-pass',
      root: 'provider',
      budgetSeconds: 1,
      files: ['tests/slow-pass.test.mjs']
    },
    {
      id: 'phase9:fast-fail',
      scriptName: 'test:phase9:fast-fail',
      root: 'provider',
      budgetSeconds: 1,
      files: ['tests/fast-fail.test.mjs']
    },
    {
      id: 'phase9:slow-fail',
      scriptName: 'test:phase9:slow-fail',
      root: 'provider',
      budgetSeconds: 1,
      files: ['tests/slow-fail.test.mjs']
    }
  ];
  await writeMap(mapPath, shards);
  return { root, providerRoot, mapPath };
}

async function writeMap(mapPath, shards) {
  await import('node:fs/promises').then(({ writeFile }) => writeFile(
    mapPath,
    JSON.stringify({
      schemaVersion: 'phase14.phase9-shard-map.v1',
      source: {
        providerPackage: '../vibe-science/package.json',
        script: 'test:phase9'
      },
      shards
    }, null, 2)
  ));
}

function clockFrom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function fakeExecutor(exitCode) {
  return async ({ files, providerRoot }) => {
    assert.ok(path.isAbsolute(providerRoot), 'provider root must be absolute');
    assert.ok(files.every((file) => file.startsWith('tests/')), 'executor receives reviewed test files');
    return {
      exitCode,
      stdout: '',
      stderr: exitCode === 0 ? '' : 'fake test failure'
    };
  };
}

async function readEvidence(evidenceOut) {
  return JSON.parse(await readFile(evidenceOut, 'utf8'));
}

async function assertEvidenceValid(evidence) {
  const result = await validateWithSchema(EVIDENCE_SCHEMA_PATH, evidence);
  assert.equal(result.ok, true, formatErrors(result.errors));
}

test('runner source uses shell-free spawn with an args array', async () => {
  const source = await readFile(RUNNER_PATH, 'utf8');
  assert.match(source, /\bspawn\s*\(/u);
  assert.match(source, /shell:\s*false/u);
  assert.doesNotMatch(source, /\bexec(?:Sync)?\s*\(/u);
  assert.doesNotMatch(source, /node --test/u);
  assert.doesNotMatch(source, /shell:\s*true/u);
});

test('fast passing shard writes valid passing evidence and exits 0', async () => {
  const fixture = await makeFixtureWorkspace();
  const evidenceOut = path.join(fixture.root, 'fast-pass.json');

  const result = await runShard({
    shardId: 'phase9:fast-pass',
    mapPath: fixture.mapPath,
    evidenceOut,
    providerRoot: fixture.providerRoot,
    executeShard: fakeExecutor(0),
    nowMs: clockFrom([0, 250]),
    timestamp: '2026-06-20T00:00:00.000Z'
  });

  assert.equal(result.exitCode, 0);
  const evidence = await readEvidence(evidenceOut);
  await assertEvidenceValid(evidence);
  assert.equal(evidence.pass, true);
  assert.equal(evidence.testExitCode, 0);
  assert.equal(evidence.withinBudget, true);
  assert.equal(evidence.elapsedSeconds, 0.25);
});

test('slow passing shard fails the budget without hiding the passing test exit', async () => {
  const fixture = await makeFixtureWorkspace();
  const evidenceOut = path.join(fixture.root, 'slow-pass.json');

  const result = await runShard({
    shardId: 'phase9:slow-pass',
    mapPath: fixture.mapPath,
    evidenceOut,
    providerRoot: fixture.providerRoot,
    executeShard: fakeExecutor(0),
    nowMs: clockFrom([0, 1500]),
    timestamp: '2026-06-20T00:00:00.000Z'
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, new RegExp(`${SHARD_BUDGET_EXCEEDED} phase9:slow-pass`));
  const evidence = await readEvidence(evidenceOut);
  await assertEvidenceValid(evidence);
  assert.equal(evidence.pass, false);
  assert.equal(evidence.testExitCode, 0);
  assert.equal(evidence.withinBudget, false);
});

test('fast failing shard remains failed without budget masking', async () => {
  const fixture = await makeFixtureWorkspace();
  const evidenceOut = path.join(fixture.root, 'fast-fail.json');

  const result = await runShard({
    shardId: 'phase9:fast-fail',
    mapPath: fixture.mapPath,
    evidenceOut,
    providerRoot: fixture.providerRoot,
    executeShard: fakeExecutor(7),
    nowMs: clockFrom([0, 200]),
    timestamp: '2026-06-20T00:00:00.000Z'
  });

  assert.equal(result.exitCode, 7);
  assert.doesNotMatch(result.stderr, new RegExp(SHARD_BUDGET_EXCEEDED));
  const evidence = await readEvidence(evidenceOut);
  await assertEvidenceValid(evidence);
  assert.equal(evidence.pass, false);
  assert.equal(evidence.testExitCode, 7);
  assert.equal(evidence.withinBudget, true);
});

test('slow failing shard reports both test failure and budget breach', async () => {
  const fixture = await makeFixtureWorkspace();
  const evidenceOut = path.join(fixture.root, 'slow-fail.json');

  const result = await runShard({
    shardId: 'phase9:slow-fail',
    mapPath: fixture.mapPath,
    evidenceOut,
    providerRoot: fixture.providerRoot,
    executeShard: fakeExecutor(5),
    nowMs: clockFrom([0, 1500]),
    timestamp: '2026-06-20T00:00:00.000Z'
  });

  assert.equal(result.exitCode, 5);
  assert.match(result.stderr, /fake test failure/u);
  assert.match(result.stderr, new RegExp(SHARD_BUDGET_EXCEEDED));
  const evidence = await readEvidence(evidenceOut);
  await assertEvidenceValid(evidence);
  assert.equal(evidence.pass, false);
  assert.equal(evidence.testExitCode, 5);
  assert.equal(evidence.withinBudget, false);
});

test('runner fails closed for unknown shard and missing evidence path', async () => {
  const fixture = await makeFixtureWorkspace();

  await assert.rejects(
    () => runShard({
      shardId: 'phase9:missing',
      mapPath: fixture.mapPath,
      evidenceOut: path.join(fixture.root, 'missing.json'),
      providerRoot: fixture.providerRoot,
      executeShard: fakeExecutor(0)
    }),
    /E_SHARD_UNKNOWN/u
  );

  await assert.rejects(
    () => runShard({
      shardId: 'phase9:fast-pass',
      mapPath: fixture.mapPath,
      providerRoot: fixture.providerRoot,
      executeShard: fakeExecutor(0)
    }),
    /E_SHARD_EVIDENCE_OUT_REQUIRED/u
  );
});

test('runner rejects unsafe map files and unreviewed loop shards before spawn', async () => {
  const fixture = await makeFixtureWorkspace();
  const unsafeMap = path.join(fixture.root, 'unsafe-map.json');
  await writeMap(unsafeMap, [
    {
      id: 'phase9:absolute',
      scriptName: 'test:phase9:absolute',
      root: 'provider',
      budgetSeconds: 1,
      files: [path.join(fixture.providerRoot, 'tests/fast-pass.test.mjs')]
    },
    {
      id: 'phase9:escape',
      scriptName: 'test:phase9:escape',
      root: 'provider',
      budgetSeconds: 1,
      files: ['../escape.test.mjs']
    },
    {
      id: 'phase9:not-test',
      scriptName: 'test:phase9:not-test',
      root: 'provider',
      budgetSeconds: 1,
      files: ['tests/not-test.js']
    },
    {
      id: 'test:loop:clusters',
      scriptName: 'test:loop:clusters',
      root: 'vre',
      budgetSeconds: 1,
      files: ['environment/tests/cli/research-loop.test.js'],
      testNamePatterns: ['^research-loop returns']
    }
  ]);

  for (const shardId of ['phase9:absolute', 'phase9:escape', 'phase9:not-test', 'test:loop:clusters']) {
    await assert.rejects(
      () => runShard({
        shardId,
        mapPath: unsafeMap,
        evidenceOut: path.join(fixture.root, `${shardId.replaceAll(':', '-')}.json`),
        providerRoot: fixture.providerRoot,
        executeShard: fakeExecutor(0)
      }),
      /E_SHARD_(FILE_UNSAFE|VRE_LOCAL_UNREVIEWED|ROOT_INVALID)/u
    );
  }
});

test('evidence schema rejects dishonest evidence shapes', async () => {
  const invalidEvidenceRows = [
    {
      schemaVersion: 'phase14.shard-evidence.v1',
      id: 'phase9:bridge',
      scriptName: 'test:phase9:bridge',
      pass: true,
      elapsedSeconds: 1,
      budgetSeconds: 60,
      withinBudget: true,
      timestamp: '2026-06-20T00:00:00.000Z'
    },
    {
      schemaVersion: 'phase14.shard-evidence.v1',
      id: 'phase9:bridge',
      scriptName: 'test:phase9:bridge',
      pass: 'true',
      testExitCode: 0,
      elapsedSeconds: 1,
      budgetSeconds: 60,
      withinBudget: true,
      timestamp: '2026-06-20T00:00:00.000Z'
    },
    {
      schemaVersion: 'phase14.shard-evidence.v1',
      id: 'phase9:bridge',
      scriptName: 'test:phase9:bridge',
      pass: false,
      testExitCode: 1,
      elapsedSeconds: -1,
      budgetSeconds: 60,
      withinBudget: true,
      timestamp: '2026-06-20T00:00:00.000Z'
    }
  ];

  for (const evidence of invalidEvidenceRows) {
    const result = await validateWithSchema(EVIDENCE_SCHEMA_PATH, evidence);
    assert.equal(result.ok, false, 'invalid evidence shape must fail schema validation');
  }
});

test('validate-counts tracks the runner shard test lane', async () => {
  assert.equal(expectedCounts.shardTests, 5);
  await validateCounts();
});
