import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  formatErrors,
  readJson,
  repoRoot,
  validateWithSchema
} from '../ci/_helpers.js';
import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';
import { runShard } from './run-shard.js';

const SHARD_MAP_PATH = 'environment/tests/shards/phase9-shard-map.json';
const SHARD_MAP_SCHEMA_PATH = 'environment/tests/shards/phase9-shard-map.schema.json';
const RESEARCH_LOOP_TEST = 'environment/tests/cli/research-loop.test.js';
const VRE_PACKAGE_PATH = path.resolve(repoRoot, 'package.json');

async function readVrePackage() {
  return JSON.parse(await readFile(VRE_PACKAGE_PATH, 'utf8'));
}

async function readShardMap() {
  return readJson(SHARD_MAP_PATH);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeTempMap(map) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-loop-shard-map-'));
  const mapPath = path.join(dir, 'phase9-shard-map.json');
  await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  return { dir, mapPath };
}

function extractResearchLoopTestNames(source) {
  const names = [];
  const pattern = /^test\('([^']+)'/gmu;
  for (const match of source.matchAll(pattern)) {
    if (match[1].startsWith('research-loop ')) {
      names.push(match[1]);
    }
  }
  return names;
}

function matchCount(name, patterns) {
  return patterns.filter((pattern) => new RegExp(pattern, 'u').test(name)).length;
}

test('VRE package exposes the reviewed loop cluster script', async () => {
  const packageJson = await readVrePackage();
  const command = packageJson.scripts?.['test:loop:clusters'];

  assert.equal(typeof command, 'string');
  assert.match(command, /environment\/tests\/shards\/run-shard\.js/u);
  assert.match(command, /\bloop:clusters\b/u);
  assert.match(command, /--evidence-out/u);
  assert.doesNotMatch(command, /vibe-science/u, 'loop shard must be VRE-local');
});

test('loop cluster shard map entry is exact and schema-valid', async () => {
  const map = await readShardMap();
  const result = await validateWithSchema(SHARD_MAP_SCHEMA_PATH, map);
  assert.equal(result.ok, true, formatErrors(result.errors));

  const loopShard = map.shards.find((shard) => shard.id === 'loop:clusters');
  assert.equal(loopShard?.scriptName, 'test:loop:clusters');
  assert.equal(loopShard?.root, 'vre');
  assert.deepEqual(loopShard?.files, [RESEARCH_LOOP_TEST]);
  assert.ok(loopShard.budgetSeconds >= 90, 'loop budget must start from the reviewed floor');
  assert.ok(Array.isArray(loopShard.testNamePatterns));
  assert.ok(loopShard.testNamePatterns.length > 0);
});

test('loop cluster patterns cover every research-loop test exactly once', async () => {
  const map = await readShardMap();
  const loopShard = map.shards.find((shard) => shard.id === 'loop:clusters');
  const source = await readFile(path.resolve(repoRoot, RESEARCH_LOOP_TEST), 'utf8');
  const researchLoopTests = extractResearchLoopTestNames(source);

  assert.ok(researchLoopTests.length > 0, 'research-loop tests must be detected');
  for (const name of researchLoopTests) {
    assert.equal(matchCount(name, loopShard.testNamePatterns), 1, name);
  }
});

test('loop cluster schema rejects over-broad VRE-local execution', async () => {
  const map = await readShardMap();
  const invalidSecondLocal = cloneJson(map);
  invalidSecondLocal.shards.push({
    id: 'loop:other',
    scriptName: 'test:loop:other',
    root: 'vre',
    budgetSeconds: 90,
    files: [RESEARCH_LOOP_TEST],
    testNamePatterns: ['^research-loop returns']
  });

  const invalidFile = cloneJson(map);
  invalidFile.shards.find((shard) => shard.id === 'loop:clusters').files = [
    'environment/tests/cli/objective-cli.test.js'
  ];

  const invalidProviderRoot = cloneJson(map);
  invalidProviderRoot.shards.find((shard) => shard.id === 'phase9:bridge').root = 'vre';

  for (const invalid of [invalidSecondLocal, invalidFile, invalidProviderRoot]) {
    const result = await validateWithSchema(SHARD_MAP_SCHEMA_PATH, invalid);
    assert.equal(result.ok, false, 'over-broad loop shard shape must fail schema');
  }
});

test('runner drives only the reviewed VRE-local loop shard', async () => {
  const map = await readShardMap();
  const { dir, mapPath } = await writeTempMap(map);
  try {
    const evidenceOut = path.join(dir, 'loop-evidence.json');
    const result = await runShard({
      shardId: 'loop:clusters',
      mapPath,
      evidenceOut,
      executeShard: async ({ executionRoot, files, testNamePattern }) => {
        assert.equal(executionRoot, repoRoot);
        assert.deepEqual(files, [RESEARCH_LOOP_TEST]);
        assert.equal(typeof testNamePattern, 'string');
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      nowMs: (() => {
        let now = 0;
        return () => {
          now += 50;
          return now;
        };
      })(),
      timestamp: '2026-06-20T00:00:00.000Z'
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.evidence.id, 'loop:clusters');
    assert.equal(result.evidence.pass, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runner rejects unreviewed VRE-local shard ids before spawn', async () => {
  const map = await readShardMap();
  const invalid = cloneJson(map);
  invalid.shards.push({
    id: 'loop:other',
    scriptName: 'test:loop:other',
    root: 'vre',
    budgetSeconds: 90,
    files: [RESEARCH_LOOP_TEST],
    testNamePatterns: ['^research-loop returns']
  });
  const { dir, mapPath } = await writeTempMap(invalid);
  try {
    await assert.rejects(
      () => runShard({
        shardId: 'loop:other',
        mapPath,
        evidenceOut: path.join(dir, 'bad.json'),
        executeShard: async () => {
          throw new Error('spawn must not run for unreviewed VRE-local shards');
        }
      }),
      /E_SHARD_VRE_LOCAL_UNREVIEWED/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validate-counts tracks the loop cluster shard test', async () => {
  assert.equal(expectedCounts.shardTests, 5);
  await validateCounts();
});
