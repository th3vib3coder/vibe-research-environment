import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readJson, repoRoot } from '../ci/_helpers.js';
import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';

const SHARD_MAP_PATH = 'environment/tests/shards/phase9-shard-map.json';
const PROVIDER_PACKAGE_PATH = path.resolve(repoRoot, '..', 'vibe-science', 'package.json');

const LEGACY_PHASE9_COMMAND = 'node --test tests/kernel-bridge-projection-count.test.mjs '
  + 'tests/core-reader-projections.test.mjs tests/phase9-handshake-injection.test.mjs '
  + 'tests/phase9-vre-command-gate.test.mjs '
  + 'tests/phase9-pre-tool-use-nuclear-bash-events.test.mjs '
  + 'tests/phase9-loop-wake.test.mjs tests/phase9-r2-bridge-writer.test.mjs '
  + 'tests/phase9-governance-log-cli.test.mjs tests/claim-resolver-cli.test.mjs '
  + 'tests/audit-query-cli.test.mjs';

const EXPECTED_SCRIPT_NAMES = [
  'test:phase9:bridge',
  'test:phase9:gate',
  'test:phase9:loop',
  'test:phase9:cli'
];

function extractNodeTestFiles(command) {
  assert.equal(typeof command, 'string', 'script command must be a string');
  return command
    .split(/\s+/u)
    .filter((token) => token.endsWith('.test.mjs'))
    .map((token) => token.replaceAll('\\', '/'));
}

async function readProviderPackage() {
  try {
    return JSON.parse(await readFile(PROVIDER_PACKAGE_PATH, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readShardMapByScript() {
  const map = await readJson(SHARD_MAP_PATH);
  return new Map(map.shards.map((shard) => [shard.scriptName, shard.files]));
}

test('provider named phase9 shard scripts exist and match the shard map', async (t) => {
  const packageJson = await readProviderPackage();
  if (!packageJson) {
    t.skip('sibling vibe-science package.json is absent in VRE-only CI');
    return;
  }
  const scriptToFiles = await readShardMapByScript();

  assert.equal(packageJson.scripts?.['test:phase9'], LEGACY_PHASE9_COMMAND);

  for (const scriptName of EXPECTED_SCRIPT_NAMES) {
    assert.equal(
      typeof packageJson.scripts?.[scriptName],
      'string',
      `${scriptName} must exist in the provider package`
    );

    const actualFiles = extractNodeTestFiles(packageJson.scripts[scriptName]);
    assert.deepEqual(actualFiles, scriptToFiles.get(scriptName), `${scriptName} must match shard map`);
  }
});

test('provider phase9 shard scripts partition the legacy provider phase9 command', async (t) => {
  const packageJson = await readProviderPackage();
  if (!packageJson) {
    t.skip('sibling vibe-science package.json is absent in VRE-only CI');
    return;
  }
  const legacyFiles = extractNodeTestFiles(packageJson.scripts?.['test:phase9']);
  const shardFiles = EXPECTED_SCRIPT_NAMES.flatMap((scriptName) => (
    extractNodeTestFiles(packageJson.scripts?.[scriptName])
  ));

  assert.equal(new Set(shardFiles).size, shardFiles.length, 'shard scripts must not duplicate files');
  assert.deepEqual([...shardFiles].sort(), [...legacyFiles].sort());
  assert.ok(
    shardFiles.includes('tests/core-reader-projections.test.mjs'),
    'shard scripts must include the Wave-13 provider projection test'
  );
});

test('provider phase9 aggregate invokes only the four named phase9 shards', async (t) => {
  const packageJson = await readProviderPackage();
  if (!packageJson) {
    t.skip('sibling vibe-science package.json is absent in VRE-only CI');
    return;
  }
  const aggregate = packageJson.scripts?.['test:phase9:all'];
  assert.equal(typeof aggregate, 'string', 'test:phase9:all must exist in the provider package');
  assert.doesNotMatch(aggregate, /test:loop:clusters/u);

  for (const scriptName of EXPECTED_SCRIPT_NAMES) {
    assert.ok(aggregate.includes(`npm run ${scriptName}`), `aggregate must run ${scriptName}`);
  }
});

test('validate-counts tracks both shard tests', async () => {
  assert.equal(expectedCounts.shardTests, 5);
  await validateCounts();
});
