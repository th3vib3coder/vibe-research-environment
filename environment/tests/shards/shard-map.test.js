import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  formatErrors,
  readJson,
  repoRoot,
  validateWithSchema
} from '../ci/_helpers.js';
import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';

const SHARD_MAP_PATH = 'environment/tests/shards/phase9-shard-map.json';
const SHARD_MAP_SCHEMA_PATH = 'environment/tests/shards/phase9-shard-map.schema.json';
const PROVIDER_PACKAGE_PATH = path.resolve(repoRoot, '..', 'vibe-science', 'package.json');
const EXPECTED_SHARD_IDS = [
  'phase9:bridge',
  'phase9:gate',
  'phase9:loop',
  'phase9:cli',
  'loop:clusters'
];
const PROVIDER_SHARD_IDS = EXPECTED_SHARD_IDS.filter((id) => id.startsWith('phase9:'));

function extractNodeTestFiles(command) {
  return command
    .split(/\s+/u)
    .filter((token) => token.endsWith('.test.mjs'))
    .map((token) => token.replaceAll('\\', '/'));
}

async function readShardMap() {
  return readJson(SHARD_MAP_PATH);
}

async function readProviderPhase9Files() {
  const packageJson = JSON.parse(await readFile(PROVIDER_PACKAGE_PATH, 'utf8'));
  const command = packageJson.scripts?.['test:phase9'];
  assert.equal(typeof command, 'string', 'provider package.json must expose test:phase9');
  const files = extractNodeTestFiles(command);
  assert.equal(files.length, 10, 'live provider test:phase9 file count must be 10');
  assert.ok(
    files.includes('tests/core-reader-projections.test.mjs'),
    'live provider test:phase9 must include the Wave-13 core-reader projection test'
  );
  return files;
}

test('phase9 shard map validates against its schema', async () => {
  const map = await readShardMap();
  const result = await validateWithSchema(SHARD_MAP_SCHEMA_PATH, map);
  assert.equal(result.ok, true, formatErrors(result.errors));
});

test('phase9 shard map defines the reviewed provider shard ids and budgets', async () => {
  const map = await readShardMap();
  const ids = map.shards.map((shard) => shard.id);
  assert.deepEqual(ids, EXPECTED_SHARD_IDS);

  for (const shard of map.shards) {
    assert.equal(Number.isInteger(shard.budgetSeconds), true, `${shard.id} budget must be integer`);
    assert.ok(shard.budgetSeconds > 0, `${shard.id} budget must be positive`);
    if (PROVIDER_SHARD_IDS.includes(shard.id)) {
      assert.equal(shard.root, 'provider');
      assert.match(shard.scriptName, /^test:phase9:/u);
    }
  }

  const loopShard = map.shards.find((shard) => shard.id === 'loop:clusters');
  assert.equal(loopShard.root, 'vre');
  assert.equal(loopShard.scriptName, 'test:loop:clusters');
  assert.deepEqual(loopShard.files, ['environment/tests/cli/research-loop.test.js']);
});

test('phase9 shard map covers the live provider test:phase9 files exactly once', async () => {
  const map = await readShardMap();
  const providerFiles = await readProviderPhase9Files();
  const shardFiles = map.shards
    .filter((shard) => PROVIDER_SHARD_IDS.includes(shard.id))
    .flatMap((shard) => shard.files);

  assert.equal(new Set(shardFiles).size, shardFiles.length, 'shard files must not be duplicated');
  assert.deepEqual([...shardFiles].sort(), [...providerFiles].sort());
  assert.ok(
    shardFiles.includes('tests/core-reader-projections.test.mjs'),
    'shard map must not preserve the stale nine-file baseline'
  );
});

test('validate-counts tracks the shard test lane', async () => {
  assert.equal(expectedCounts.shardTests, 5);
  await validateCounts();
});
