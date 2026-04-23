import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  DISPATCH_TABLE,
  IMPLEMENTED_PHASE9_COMMANDS,
  PHASE9_STUB_DEFINITIONS
} from '../../../bin/vre';
import { generateCapabilityHandshake, INTERNALS as HANDSHAKE_INTERNALS } from '../../control/capability-handshake.js';
import { getTaskRegistry } from '../../orchestrator/task-registry.js';

const PROJECT_ROOT = process.cwd();
const FAKE_KERNEL_ROOT = path.join(
  PROJECT_ROOT,
  'environment',
  'tests',
  'fixtures',
  'fake-kernel-sibling'
);
const FIXED_GENERATED_AT = '2026-04-22T18:00:00.000Z';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertExactStringSet(actualValues, expectedValues, label) {
  assert.deepEqual(
    sortedUnique(actualValues),
    sortedUnique(expectedValues),
    `${label} drifted away from its authoritative reviewed source`
  );
}

function assertContainsWarning(reasons, commandName) {
  assert.equal(
    reasons.some(
      (reason) =>
        reason.includes(`executable command ${commandName}`) &&
        reason.includes('missing a reviewed markdown contract')
    ),
    true,
    `Expected a degradedReasons warning for undocumented executable command ${commandName}`
  );
}

function assertOntologyKeysMatch(actualEntries, expectedEntries, keySelector, label) {
  assertExactStringSet(
    actualEntries.map(keySelector),
    expectedEntries.map(keySelector),
    label
  );
}

async function assertProjectionProbeFixturesExist(handshake) {
  for (const probe of handshake.kernel.projections.probes) {
    assert.ok(probe.fixturePath, `projection probe ${probe.name} must declare fixturePath`);
    const absolutePath = path.join(PROJECT_ROOT, probe.fixturePath);
    try {
      await access(absolutePath);
    } catch {
      assert.fail(`missing projection fixture for ${probe.name}: ${probe.fixturePath}`);
    }
  }
}

async function buildFullHandshake() {
  return generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: FIXED_GENERATED_AT,
    kernelRoot: FAKE_KERNEL_ROOT
  });
}

test('T1.4 drift classification keeps docs-only commands markdown-only and flags undocumented executable commands', () => {
  const classification = HANDSHAKE_INTERNALS.classifyCommandSurface(
    ['capabilities --json', 'flow-status'],
    ['flow-status', 'weekly-digest'],
    PHASE9_STUB_DEFINITIONS
  );
  const expectedOperatorCommands = PHASE9_STUB_DEFINITIONS
    .filter((definition) => definition.kind !== 'doctor-surface')
    .map((definition) => definition.canonicalCommand);

  assert.deepEqual(classification.markdownOnlyContracts, ['weekly-digest']);
  assertContainsWarning(classification.undocumentedExecutableWarnings, 'capabilities --json');
  assertExactStringSet(
    classification.operatorSurface.commands,
    expectedOperatorCommands,
    'operatorSurface.commands'
  );
});

test('T1.4 live handshake stays aligned with reviewed docs-vs-dispatch truth', async () => {
  const handshake = await buildFullHandshake();
  const markdownContracts = await HANDSHAKE_INTERNALS.collectMarkdownContracts(PROJECT_ROOT);
  const executableCommands = sortedUnique([
    ...Object.keys(DISPATCH_TABLE),
    ...IMPLEMENTED_PHASE9_COMMANDS
  ]);

  const expectedMarkdownOnly = markdownContracts.filter(
    (commandName) => !executableCommands.includes(commandName)
  );
  const undocumentedExecutable = executableCommands.filter(
    (commandName) => !markdownContracts.includes(commandName)
  );

  assertExactStringSet(
    handshake.vre.markdownOnlyContracts,
    expectedMarkdownOnly,
    'markdownOnlyContracts'
  );
  assertExactStringSet(
    handshake.vre.executableCommands,
    executableCommands,
    'executableCommands'
  );
  assertExactStringSet(
    handshake.vre.operatorSurface.commands,
    PHASE9_STUB_DEFINITIONS
      .filter((definition) => definition.kind !== 'doctor-surface')
      .map((definition) => definition.canonicalCommand),
    'operatorSurface.commands'
  );
  assertExactStringSet(
    handshake.vre.operatorSurface.doctorCommands,
    PHASE9_STUB_DEFINITIONS
      .filter((definition) => definition.kind === 'doctor-surface')
      .map((definition) => definition.canonicalCommand),
    'operatorSurface.doctorCommands'
  );
  for (const commandName of undocumentedExecutable) {
    assertContainsWarning(handshake.degradedReasons, commandName);
  }
});

test('T1.4 drift tests fail when a kernel projection fixture path goes missing', async () => {
  const handshake = await buildFullHandshake();
  await assertProjectionProbeFixturesExist(handshake);

  const tampered = cloneJson(handshake);
  tampered.kernel.projections.probes[0].fixturePath =
    'environment/tests/fixtures/phase9/capability-handshake/does-not-exist.json';

  await assert.rejects(
    () => assertProjectionProbeFixturesExist(tampered),
    /missing projection fixture/u
  );
});

test('T1.4 drift tests fail when queueableTaskKinds diverge from the task registry', async () => {
  const handshake = await buildFullHandshake();
  const registry = await getTaskRegistry();
  const expectedTaskKinds = [...registry.keys()].sort();

  assertExactStringSet(handshake.vre.queueableTaskKinds, expectedTaskKinds, 'queueableTaskKinds');

  const tampered = cloneJson(handshake);
  tampered.vre.queueableTaskKinds.pop();

  assert.throws(
    () => assertExactStringSet(tampered.vre.queueableTaskKinds, expectedTaskKinds, 'queueableTaskKinds'),
    /queueableTaskKinds drifted/u
  );
});

test('T1.4 drift tests fail when a schema file on disk is omitted from the handshake ontology', async () => {
  const handshake = await buildFullHandshake();
  const expectedSchemas = await HANDSHAKE_INTERNALS.collectSchemas(PROJECT_ROOT);

  assertOntologyKeysMatch(
    handshake.vre.schemas,
    expectedSchemas,
    (entry) => `${entry.name}:${entry.path}`,
    'schema ontology'
  );

  const tampered = cloneJson(handshake);
  tampered.vre.schemas.pop();

  assert.throws(
    () =>
      assertOntologyKeysMatch(
        tampered.vre.schemas,
        expectedSchemas,
        (entry) => `${entry.name}:${entry.path}`,
        'schema ontology'
      ),
    /schema ontology drifted/u
  );
});

test('T1.4 drift tests fail when a connector manifest is omitted from the handshake ontology', async () => {
  const handshake = await buildFullHandshake();
  const connectorState = await HANDSHAKE_INTERNALS.collectConnectors(PROJECT_ROOT);

  assertOntologyKeysMatch(
    handshake.vre.connectors,
    connectorState.connectors,
    (entry) => `${entry.id}:${entry.path}`,
    'connector ontology'
  );

  const tampered = cloneJson(handshake);
  tampered.vre.connectors.pop();

  assert.throws(
    () =>
      assertOntologyKeysMatch(
        tampered.vre.connectors,
        connectorState.connectors,
        (entry) => `${entry.id}:${entry.path}`,
        'connector ontology'
      ),
    /connector ontology drifted/u
  );
});

test('T1.4 drift tests fail when an automation definition is omitted from the handshake ontology', async () => {
  const handshake = await buildFullHandshake();
  const automationState = await HANDSHAKE_INTERNALS.collectAutomations(PROJECT_ROOT);

  assertOntologyKeysMatch(
    handshake.vre.automations,
    automationState.automations,
    (entry) => `${entry.id}:${entry.path}`,
    'automation ontology'
  );

  const tampered = cloneJson(handshake);
  tampered.vre.automations.pop();

  assert.throws(
    () =>
      assertOntologyKeysMatch(
        tampered.vre.automations,
        automationState.automations,
        (entry) => `${entry.id}:${entry.path}`,
        'automation ontology'
      ),
    /automation ontology drifted/u
  );
});

test('T1.4 drift tests fail when a domain pack is omitted from the handshake ontology', async () => {
  const handshake = await buildFullHandshake();
  const domainPackState = await HANDSHAKE_INTERNALS.collectDomainPacks(PROJECT_ROOT);

  assertOntologyKeysMatch(
    handshake.vre.domainPacks,
    domainPackState.domainPacks,
    (entry) => `${entry.id}:${entry.path}`,
    'domain-pack ontology'
  );

  const tampered = cloneJson(handshake);
  tampered.vre.domainPacks.pop();

  assert.throws(
    () =>
      assertOntologyKeysMatch(
        tampered.vre.domainPacks,
        domainPackState.domainPacks,
        (entry) => `${entry.id}:${entry.path}`,
        'domain-pack ontology'
      ),
    /domain-pack ontology drifted/u
  );
});

test('T1.4 drift tests fail when a reviewed memory API is omitted from the handshake ontology', async () => {
  const handshake = await buildFullHandshake();
  const memoryState = await HANDSHAKE_INTERNALS.collectMemoryApis(PROJECT_ROOT);

  assertOntologyKeysMatch(
    handshake.vre.memoryApis,
    memoryState.memoryApis,
    (entry) => `${entry.modulePath}:${entry.exportName}`,
    'memory API ontology'
  );

  const tampered = cloneJson(handshake);
  tampered.vre.memoryApis.pop();

  assert.throws(
    () =>
      assertOntologyKeysMatch(
        tampered.vre.memoryApis,
        memoryState.memoryApis,
        (entry) => `${entry.modulePath}:${entry.exportName}`,
        'memory API ontology'
      ),
    /memory API ontology drifted/u
  );
});
