import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PHASE9_STUB_DEFINITIONS } from '../../../bin/vre';
import { generateCapabilityHandshake } from '../../control/capability-handshake.js';
import {
  buildLiveCommandClassificationManifest,
  discoverMarkdownCommandContracts
} from '../../control/command-classification.js';

const PROJECT_ROOT = process.cwd();

const EXPECTED_OPERATOR_CONTRACT_COMMANDS = Object.freeze([
  'capabilities --json',
  'direction check',
  'direction contradict',
  'direction kill',
  'direction list',
  'direction park',
  'direction record',
  'direction revive',
  'objective doctor',
  'objective pause',
  'objective resume',
  'objective start',
  'objective status',
  'objective stop',
  'research-loop',
  'run-analysis',
  'scheduler doctor',
  'scheduler install',
  'scheduler remove',
  'scheduler status'
]);

const REQUIRED_SECTIONS = Object.freeze([
  '## Purpose',
  '## Invocation',
  '## Arguments',
  '## Side Effects',
  '## Dependencies',
  '## Degraded Mode',
  '## Rules'
]);

function mutatingByCommand() {
  return new Map(
    PHASE9_STUB_DEFINITIONS.map((definition) => [
      definition.canonicalCommand,
      definition.mutating
    ])
  );
}

function extractFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  assert.ok(match, 'command contracts must start with YAML frontmatter');
  return match[1];
}

test('all live executable commands are reviewed after TW14oc.2 contracts land', async () => {
  const manifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT
  });

  assert.equal(manifest.runtimeOpened, false);
  assert.equal(manifest.source.executableCommandCount, 23);
  assert.equal(manifest.source.markdownContractCount, 32);
  assert.equal(manifest.source.reviewedExecutableContractCount, 23);
  assert.equal(manifest.source.markdownOnlyContractCount, 9);
  assert.equal(manifest.records.length, 23);
  assert.equal(
    manifest.records.every((record) => record.classification === 'reviewed'),
    true
  );
  assert.equal(
    manifest.records.some((record) => /TW14oc\.2/.test(record.reason ?? '')),
    false
  );
  for (const record of manifest.records) {
    assert.equal(record.reason, null);
    assert.equal(record.runtimeOpened, false);
    assert.match(record.contractPath, /^commands\/.+\.md$/);
  }
});

test('TW14oc.2 command contract filenames round-trip exact command names', async () => {
  const contracts = await discoverMarkdownCommandContracts({
    rootDir: PROJECT_ROOT
  });

  for (const commandName of EXPECTED_OPERATOR_CONTRACT_COMMANDS) {
    assert.equal(
      contracts.get(commandName),
      `commands/${commandName}.md`,
      `${commandName} contract path must preserve spaces and --json`
    );
  }
  assert.equal(contracts.has('capabilities doctor'), false);
});

test('new command contracts carry reviewed operator metadata and mutability truth', async () => {
  const expectedMutating = mutatingByCommand();

  for (const commandName of EXPECTED_OPERATOR_CONTRACT_COMMANDS) {
    const contractPath = path.join(PROJECT_ROOT, 'commands', `${commandName}.md`);
    const content = await readFile(contractPath, 'utf8');
    const frontmatter = extractFrontmatter(content);

    assert.match(frontmatter, /^description:\s+.+$/m);
    assert.match(frontmatter, /^allowed-tools:\s+.+$/m);
    assert.match(frontmatter, /^model:\s+.+$/m);
    assert.match(frontmatter, /^dispatch:\s*$/m);
    assert.match(content, new RegExp(`^# /${commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(
      content,
      new RegExp(`^- Mutating: ${expectedMutating.get(commandName)}$`, 'm'),
      `${commandName} must cite PHASE9_STUB_DEFINITIONS mutating truth`
    );
    for (const section of REQUIRED_SECTIONS) {
      assert.ok(content.includes(section), `${commandName} missing ${section}`);
    }
  }
});

test('capability handshake has no undocumented executable warnings after contracts land', async () => {
  const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: '2026-06-20T00:00:00.000Z'
  });

  assert.equal(
    handshake.degradedReasons.some((reason) =>
      reason.includes('missing a reviewed markdown contract')
    ),
    false
  );
  assert.equal(handshake.vre.markdownOnlyContracts.length, 9);
});
