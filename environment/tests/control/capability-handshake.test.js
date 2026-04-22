import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DISPATCH_TABLE } from '../../../bin/vre';
import {
  generateCapabilityHandshake,
  HANDSHAKE_SCHEMA_FILE,
  INTERNALS as HANDSHAKE_INTERNALS
} from '../../control/capability-handshake.js';
import { loadValidator } from '../../control/_io.js';

const PROJECT_ROOT = process.cwd();
const FAKE_KERNEL_ROOT = path.join(
  PROJECT_ROOT,
  'environment',
  'tests',
  'fixtures',
  'fake-kernel-sibling'
);
const FIXED_GENERATED_AT = '2026-04-22T18:00:00.000Z';

test('capability-handshake generator produces a schema-valid full ontology payload from the live repo', async () => {
  const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: FIXED_GENERATED_AT,
    kernelRoot: FAKE_KERNEL_ROOT
  });
  const validate = await loadValidator(PROJECT_ROOT, HANDSHAKE_SCHEMA_FILE);

  assert.equal(validate(handshake), true);
  assert.equal(handshake.schemaVersion, 'phase9.capability-handshake.v1');
  assert.equal(handshake.vrePresent, true);
  assert.equal(handshake.kernel.mode, 'full');
  assert.equal(handshake.kernel.projections.probes.length, 8);
  assert.deepEqual(
    handshake.kernel.projections.availableNames,
    [
      'getProjectOverview',
      'getStateSnapshot',
      'listCitationChecks',
      'listClaimHeads',
      'listGateChecks',
      'listLiteratureSearches',
      'listObserverAlerts',
      'listUnresolvedClaims'
    ]
  );
  assert.deepEqual(handshake.vre.executableCommands, Object.keys(DISPATCH_TABLE).sort());
  assert.equal(handshake.vre.executableCommands.includes('capabilities --json'), true);
  assert.equal(handshake.vre.executableCommands.includes('flow-status'), true);
  assert.equal(handshake.vre.markdownOnlyContracts.includes('weekly-digest'), true);
  assert.equal(handshake.vre.markdownOnlyContracts.includes('flow-status'), false);
  assert.equal(handshake.vre.queueableTaskKinds.length > 0, true);
  assert.equal(
    handshake.vre.schemas.some((entry) => entry.name === 'phase9.capability-handshake.v1'),
    true
  );
  assert.equal(
    handshake.vre.connectors.some((entry) => entry.id === 'filesystem-export'),
    true
  );
  assert.equal(
    handshake.vre.automations.some((entry) => entry.id === 'stale-memory-reminder'),
    true
  );
  assert.equal(
    handshake.vre.domainPacks.some((entry) => entry.id === 'omics'),
    true
  );
  assert.equal(
    handshake.vre.memoryApis.some((entry) => entry.name === 'getMemoryFreshness'),
    true
  );
  assert.equal(
    handshake.vre.operatorSurface.commands.includes('research-loop'),
    true
  );
  assert.equal(
    handshake.vre.operatorSurface.doctorCommands.includes('capabilities doctor'),
    true
  );
  assert.equal(handshake.vre.operatorSurface.artifactPaths.length, 5);
  assert.equal(handshake.objective.activePointer, null);
  assert.equal(handshake.objective.activeObjectiveId, null);
  assert.equal(handshake.objective.status, null);
  assert.equal(handshake.vre.missingSurfaces.includes('active-objective path'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('capabilities --json'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('analysis-manifest schema'), true);
  // Round 36 invariant: operatorSurface enumerates only future/operator-only
  // commands. A command that is actually dispatched through bin/vre (and
  // therefore surfaced under executableCommands) MUST NOT also be reported
  // as a pending operator stub. The two sets must be disjoint.
  assert.equal(handshake.vre.operatorSurface.commands.includes('capabilities --json'), false);
  const operatorExecutableIntersection = handshake.vre.operatorSurface.commands.filter(
    (commandName) => handshake.vre.executableCommands.includes(commandName)
  );
  assert.deepEqual(operatorExecutableIntersection, []);
  const operatorDoctorExecutableIntersection = handshake.vre.operatorSurface.doctorCommands.filter(
    (commandName) => handshake.vre.executableCommands.includes(commandName)
  );
  assert.deepEqual(operatorDoctorExecutableIntersection, []);
});

test('capability-handshake generator reports an honest degraded kernel when no kernel root is available', async () => {
  const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: FIXED_GENERATED_AT,
    kernelRoot: null
  });

  assert.equal(handshake.kernel.mode, 'missing');
  assert.equal(handshake.kernel.dbAvailable, false);
  assert.equal(handshake.kernel.projections.availableNames.length, 0);
  assert.equal(handshake.kernel.projections.unavailable.length, 8);
  assert.equal(
    handshake.degradedReasons.some((reason) => reason.includes('kernel missing')),
    true
  );
});

test('canonical capability fixtures stay truthful once capabilities --json is a real executable command', async () => {
  const fullFixture = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        'capability-handshake',
        'valid-full.json'
      ),
      'utf8'
    )
  );
  const degradedFixture = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        'capability-handshake',
        'valid-degraded-no-kernel.json'
      ),
      'utf8'
    )
  );

  for (const fixture of [fullFixture, degradedFixture]) {
    assert.equal(fixture.vre.executableCommands.includes('capabilities --json'), true);
    assert.equal(fixture.vre.missingSurfaces.includes('capabilities --json'), false);
  }

  assert.equal(
    degradedFixture.degradedReasons.includes('kernel missing: CLI default: no reader provided'),
    true
  );
});

test('capability-handshake generator stays schema-valid when the target path is not a VRE repo', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-capability-missing-'));
  try {
    const handshake = await generateCapabilityHandshake(fixtureRoot, {
      generatedAt: FIXED_GENERATED_AT
    });
    const validate = await loadValidator(PROJECT_ROOT, HANDSHAKE_SCHEMA_FILE);

    assert.equal(validate(handshake), true);
    assert.equal(handshake.vrePresent, false);
    assert.equal(handshake.vrePath, null);
    assert.equal(handshake.kernel.mode, 'missing');
    assert.equal(handshake.kernel.projections.probes.length, 8);
    assert.equal(handshake.kernel.projections.unavailable.length, 8);
    assert.deepEqual(handshake.vre.missingSurfaces, []);
    assert.equal(
      handshake.degradedReasons.some((reason) => reason.startsWith('VRE_MISSING:')),
      true
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('reviewed ontology remains visible but degraded when connector, automation, and domain-pack bundles are not installed', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-capability-reviewed-'));
  try {
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'schemas'),
      path.join(fixtureRoot, 'environment', 'schemas'),
      { recursive: true }
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'connectors'),
      path.join(fixtureRoot, 'environment', 'connectors'),
      { recursive: true }
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'automation'),
      path.join(fixtureRoot, 'environment', 'automation'),
      { recursive: true }
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'domain-packs'),
      path.join(fixtureRoot, 'environment', 'domain-packs'),
      { recursive: true }
    );

    const connectorState = await HANDSHAKE_INTERNALS.collectConnectors(fixtureRoot);
    assert.equal(
      connectorState.connectors.some((entry) => entry.id === 'filesystem-export' && entry.status === 'degraded'),
      true
    );
    assert.equal(
      connectorState.degradedReasons.some((reason) => reason.includes('filesystem-export') && reason.includes('connectors-core bundle is not installed')),
      true
    );

    const automationState = await HANDSHAKE_INTERNALS.collectAutomations(fixtureRoot);
    assert.equal(
      automationState.automations.some((entry) => entry.id === 'stale-memory-reminder' && entry.status === 'degraded'),
      true
    );
    assert.equal(
      automationState.degradedReasons.some((reason) => reason.includes('stale-memory-reminder') && reason.includes('automation-core bundle is not installed')),
      true
    );

    const domainPackState = await HANDSHAKE_INTERNALS.collectDomainPacks(fixtureRoot);
    assert.equal(
      domainPackState.domainPacks.some((entry) => entry.id === 'omics' && entry.status === 'degraded'),
      true
    );
    assert.equal(
      domainPackState.degradedReasons.some((reason) => reason.includes('omics') && reason.includes('domain-packs-core bundle is not installed')),
      true
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('readObjectiveState returns the active pointer path, objective id, and status when the canonical files exist', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-capability-objective-'));
  try {
    await mkdir(path.join(fixtureRoot, 'environment', 'schemas'), { recursive: true });
    await mkdir(path.join(fixtureRoot, '.vibe-science-environment', 'objectives', 'OBJ-2026-04-22-001'), { recursive: true });
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'schemas', 'phase9-active-objective-pointer.schema.json'),
      path.join(fixtureRoot, 'environment', 'schemas', 'phase9-active-objective-pointer.schema.json')
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'schemas', 'phase9-objective.schema.json'),
      path.join(fixtureRoot, 'environment', 'schemas', 'phase9-objective.schema.json')
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'tests', 'fixtures', 'phase9', 'active-objective-pointer', 'valid-active.json'),
      path.join(fixtureRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')
    );
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'tests', 'fixtures', 'phase9', 'objective', 'valid-active.json'),
      path.join(fixtureRoot, '.vibe-science-environment', 'objectives', 'OBJ-2026-04-22-001', 'objective.json')
    );

    const objectiveState = await HANDSHAKE_INTERNALS.readObjectiveState(fixtureRoot);
    assert.deepEqual(objectiveState.degradedReasons, []);
    assert.deepEqual(objectiveState.objective, {
      activePointer: '.vibe-science-environment/objectives/active-objective.json',
      activeObjectiveId: 'OBJ-2026-04-22-001',
      status: 'active'
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('collectMemoryApis excludes on-disk exports that are not present in the reviewed allowlist', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-capability-memory-'));
  try {
    await mkdir(path.join(fixtureRoot, 'environment', 'control'), { recursive: true });
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'memory'),
      path.join(fixtureRoot, 'environment', 'memory'),
      { recursive: true }
    );
    await writeFile(
      path.join(fixtureRoot, 'environment', 'control', 'approved-memory-apis.json'),
      await readFile(
        path.join(PROJECT_ROOT, 'environment', 'control', 'approved-memory-apis.json'),
        'utf8'
      ),
      'utf8'
    );
    await writeFile(
      path.join(fixtureRoot, 'environment', 'memory', 'rogue.js'),
      'export function rogueMemoryApi() { return "rogue"; }\n',
      'utf8'
    );

    const { memoryApis } = await HANDSHAKE_INTERNALS.collectMemoryApis(fixtureRoot);
    assert.equal(
      memoryApis.some((entry) => entry.exportName === 'rogueMemoryApi'),
      false
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
