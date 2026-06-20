import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, mkdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DISPATCH_TABLE, IMPLEMENTED_PHASE9_COMMANDS, PHASE9_STUB_DEFINITIONS } from '../../../bin/vre';
import {
  generateCapabilityHandshake,
  HANDSHAKE_SCHEMA_FILE,
  INTERNALS as HANDSHAKE_INTERNALS
} from '../../control/capability-handshake.js';
import { buildLiveCommandClassificationManifest } from '../../control/command-classification.js';
import { loadValidator } from '../../control/_io.js';
import { KernelBridgeContractMismatchError } from '../../lib/kernel-bridge.js';

const PROJECT_ROOT = process.cwd();
const FAKE_KERNEL_ROOT = path.join(
  PROJECT_ROOT,
  'environment',
  'tests',
  'fixtures',
  'fake-kernel-sibling'
);
const FIXED_GENERATED_AT = '2026-04-22T18:00:00.000Z';
const GOVERNANCE_CAPTURE_STUB = path.join(
  PROJECT_ROOT,
  'environment',
  'tests',
  'fixtures',
  'governance-log-capture-stub.js'
);
const EXPECTED_OPERATOR_COMMANDS = PHASE9_STUB_DEFINITIONS
  .filter((definition) => definition.kind !== 'doctor-surface')
  .map((definition) => definition.canonicalCommand)
  .sort();
const EXPECTED_OPERATOR_DOCTOR_COMMANDS = PHASE9_STUB_DEFINITIONS
  .filter((definition) => definition.kind === 'doctor-surface')
  .map((definition) => definition.canonicalCommand)
  .sort();
const STUB_DEFINITION_BY_COMMAND = new Map(
  PHASE9_STUB_DEFINITIONS.map((definition) => [
    definition.canonicalCommand,
    definition
  ])
);
const DISPATCH_COMMAND_METADATA = Object.freeze({
  'flow-status': { kind: 'dispatch-command', mutating: false },
  'orchestrator-status': { kind: 'dispatch-command', mutating: false },
  'sync-memory': { kind: 'dispatch-command', mutating: true }
});

function hasMissingContractWarning(degradedReasons) {
  return degradedReasons.some((reason) =>
    reason.includes('missing a reviewed markdown contract')
  );
}

function expectedCommandClassificationRecords(manifest) {
  return manifest.records.map((record) => {
    const metadata =
      STUB_DEFINITION_BY_COMMAND.get(record.command) ??
      DISPATCH_COMMAND_METADATA[record.command];
    assert.notEqual(metadata, undefined, `missing command metadata for ${record.command}`);
    return {
      command: record.command,
      kind: metadata.kind,
      mutating: metadata.mutating,
      classification: record.classification,
      contractPath: record.contractPath,
      reason: record.reason,
      runtimeOpened: record.runtimeOpened
    };
  });
}

async function readGovernanceEvents(capturePath) {
  try {
    const raw = await readFile(capturePath, 'utf8');
    return raw
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function withGovernanceCapture(capturePath, fn, overrides = {}) {
  const previousCapturePath = process.env.VRE_GOVERNANCE_CAPTURE_PATH;
  const previousPluginCli = process.env.VIBE_SCIENCE_PLUGIN_CLI;
  await mkdir(path.dirname(capturePath), { recursive: true });
  process.env.VRE_GOVERNANCE_CAPTURE_PATH = capturePath;
  process.env.VIBE_SCIENCE_PLUGIN_CLI = overrides.pluginCliPath ?? GOVERNANCE_CAPTURE_STUB;
  try {
    return await fn();
  } finally {
    if (previousCapturePath == null) {
      delete process.env.VRE_GOVERNANCE_CAPTURE_PATH;
    } else {
      process.env.VRE_GOVERNANCE_CAPTURE_PATH = previousCapturePath;
    }
    if (previousPluginCli == null) {
      delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
    } else {
      process.env.VIBE_SCIENCE_PLUGIN_CLI = previousPluginCli;
    }
  }
}

async function captureStderr(fn) {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  try {
    return {
      result: await fn(),
      stderr
    };
  } finally {
    process.stderr.write = originalWrite;
  }
}

async function createKernelFixtureWithProjectionFailure({
  failProjection = 'listClaimHeads',
  mode = 'contract-mismatch',
  sentinel = 'SECRET-seq125-truth-mismatch'
} = {}) {
  const kernelRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-kernel-truth-mismatch-'));
  const scriptPath = path.join(kernelRoot, 'plugin', 'scripts', 'core-reader-cli.js');
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node
const projection = process.argv[2] || '<missing>';
let stdin = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  stdin += chunk;
}
let input = {};
try {
  input = JSON.parse(stdin || '{}');
} catch {}
if (projection === ${JSON.stringify(failProjection)}) {
  if (${JSON.stringify(mode)} === 'contract-mismatch') {
    process.stdout.write(JSON.stringify({
      ok: true,
      projection: ${JSON.stringify(sentinel)},
      projectPath: input.projectPath || '',
      data: {}
    }));
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({
    ok: false,
    projection,
    error: ${JSON.stringify(sentinel)}
  }));
  process.exit(0);
}
function dataFor(name) {
  if (name === 'getProjectOverview') {
    return { profile: 'default', projectId: 'fake-project' };
  }
  if (name === 'getStateSnapshot') {
    return { sequences: [] };
  }
  if (name.startsWith('list')) {
    return [];
  }
  return {};
}
process.stdout.write(JSON.stringify({
  ok: true,
  projection,
  projectPath: input.projectPath || '',
  data: dataFor(projection),
  meta: {
    sourceMode: 'kernel-backed',
    dbAvailable: true
  }
}));
`,
    'utf8'
  );
  return kernelRoot;
}

async function createKernelFixtureWithProjectionData({
  listUnresolvedClaims = [],
  listR2Reviews = {
    schemaVersion: 'phase9.r2-projection.v1',
    records: []
  }
} = {}) {
  const kernelRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-kernel-projection-data-'));
  const scriptPath = path.join(kernelRoot, 'plugin', 'scripts', 'core-reader-cli.js');
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node
const projection = process.argv[2] || '<missing>';
let stdin = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  stdin += chunk;
}
let input = {};
try {
  input = JSON.parse(stdin || '{}');
} catch {}
const listUnresolvedClaims = ${JSON.stringify(listUnresolvedClaims)};
const listR2Reviews = ${JSON.stringify(listR2Reviews)};
function dataFor(name) {
  if (name === 'getProjectOverview') {
    return { profile: 'default', projectId: 'fake-project' };
  }
  if (name === 'getStateSnapshot') {
    return { sequences: [] };
  }
  if (name === 'listUnresolvedClaims') {
    return listUnresolvedClaims;
  }
  if (name === 'listR2Reviews') {
    return listR2Reviews;
  }
  if (name.startsWith('list')) {
    return [];
  }
  return {};
}
process.stdout.write(JSON.stringify({
  ok: true,
  projection,
  projectPath: input.projectPath || '',
  data: dataFor(projection),
  meta: {
    sourceMode: 'kernel-backed',
    dbAvailable: true
  }
}));
`,
    'utf8'
  );
  return kernelRoot;
}

function assertKernelTruthMismatchEvent(event, { projectionName = 'listClaimHeads' } = {}) {
  assert.equal(event.event_type, 'kernel_vre_truth_mismatch');
  assert.equal(event.source_component, 'vre/control/capability-handshake');
  assert.equal(event.objective_id, null);
  assert.equal(event.severity, 'critical');
  assert.deepEqual(event.details, {
    projectionName,
    errorClass: 'KernelBridgeContractMismatchError'
  });
}

function assertNoDetailsLeak(event, forbiddenValues) {
  const serialized = JSON.stringify(event.details);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `governance details leaked ${value}`);
  }
}

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
  assert.equal(handshake.kernel.projections.probes.length, 9);
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
      'listR2Reviews',
      'listUnresolvedClaims'
    ]
  );
  assert.deepEqual(
    handshake.vre.executableCommands,
    [...new Set([...Object.keys(DISPATCH_TABLE), ...IMPLEMENTED_PHASE9_COMMANDS])].sort()
  );
  assert.equal(handshake.vre.executableCommands.includes('capabilities --json'), true);
  assert.equal(handshake.vre.executableCommands.includes('flow-status'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective doctor'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective resume'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective start'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective status'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective pause'), true);
  assert.equal(handshake.vre.executableCommands.includes('objective stop'), true);
  assert.equal(handshake.vre.executableCommands.includes('research-loop'), true);
  assert.equal(handshake.vre.executableCommands.includes('run-analysis'), true);
  assert.equal(handshake.vre.executableCommands.includes('scheduler install'), true);
  assert.equal(handshake.vre.executableCommands.includes('scheduler status'), true);
  assert.equal(handshake.vre.executableCommands.includes('scheduler doctor'), true);
  assert.equal(handshake.vre.executableCommands.includes('scheduler remove'), true);
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
  assert.deepEqual(handshake.vre.operatorSurface.commands, EXPECTED_OPERATOR_COMMANDS);
  assert.deepEqual(handshake.vre.operatorSurface.doctorCommands, EXPECTED_OPERATOR_DOCTOR_COMMANDS);
  assert.equal(handshake.vre.operatorSurface.artifactPaths.length, 5);
  const classificationManifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT
  });
  assert.deepEqual(
    handshake.vre.commandClassification,
    expectedCommandClassificationRecords(classificationManifest)
  );
  assert.equal(handshake.vre.commandClassification.length, 16);
  assert.equal(
    new Set(handshake.vre.commandClassification.map((record) => record.command)).size,
    16
  );
  assert.equal(
    handshake.vre.commandClassification.some(
      (record) => record.command === 'capabilities doctor'
    ),
    false
  );
  assert.equal(handshake.objective.activePointer, null);
  assert.equal(handshake.objective.activeObjectiveId, null);
  assert.equal(handshake.objective.status, null);
  assert.equal(handshake.vre.missingSurfaces.includes('active-objective path'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('capabilities --json'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('analysis-manifest schema'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('research-loop'), false);
  assert.equal(handshake.vre.missingSurfaces.includes('run-analysis'), false);
  assert.equal(
    handshake.vre.schemas.some((entry) => entry.name === 'phase9.analysis-manifest.v1'),
    true
  );
  assert.equal(hasMissingContractWarning(handshake.degradedReasons), false);
  // Round 65 invariant: operatorSurface is the canonical agent-facing list from
  // file 13, so it MUST keep listing the reviewed operator/doctor commands even
  // after they become executable.
  assert.equal(handshake.vre.operatorSurface.commands.includes('capabilities --json'), true);
  assert.equal(handshake.vre.operatorSurface.commands.includes('research-loop'), true);
  assert.equal(handshake.vre.operatorSurface.doctorCommands.includes('objective doctor'), true);
  assert.equal(handshake.vre.operatorSurface.doctorCommands.includes('scheduler doctor'), true);
});

test('capability-handshake derives unresolvedR2Count from listR2Reviews, not unresolved claims', async () => {
  const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: FIXED_GENERATED_AT,
    kernelRoot: FAKE_KERNEL_ROOT
  });

  assert.equal(handshake.kernel.unresolvedR2Count, 1);
  assert.equal(
    handshake.degradedReasons.some((reason) =>
      reason.includes('currently derived from listUnresolvedClaims')
    ),
    false
  );
});

test('capability-handshake treats an empty listR2Reviews projection as a true zero', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionData({
    listUnresolvedClaims: [
      { claimId: 'claim-001', updatedAt: '2026-06-20T00:00:00.000Z' },
      { claimId: 'claim-002', updatedAt: '2026-06-20T00:01:00.000Z' }
    ],
    listR2Reviews: {
      schemaVersion: 'phase9.r2-projection.v1',
      records: []
    }
  });
  try {
    const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
      generatedAt: FIXED_GENERATED_AT,
      kernelRoot
    });

    assert.equal(handshake.kernel.unresolvedR2Count, 0);
    assert.equal(
      handshake.degradedReasons.some((reason) =>
        reason.includes('unresolvedR2Count is unavailable')
      ),
      false
    );
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('capability-handshake degrades unresolvedR2Count when listR2Reviews is unavailable', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionFailure({
    failProjection: 'listR2Reviews',
    mode: 'projection-error',
    sentinel: 'r2 projection offline'
  });
  try {
    const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
      generatedAt: FIXED_GENERATED_AT,
      kernelRoot
    });

    assert.equal(handshake.kernel.unresolvedR2Count, 0);
    assert.equal(
      handshake.degradedReasons.includes(
        'kernel unresolvedR2Count is unavailable because listR2Reviews is not currently available'
      ),
      true
    );
    assert.equal(
      handshake.degradedReasons.some((reason) =>
        reason.includes('listUnresolvedClaims is not currently available')
      ),
      false
    );
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('capability-handshake ignores listUnresolvedClaims when listR2Reviews is available', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionData({
    listUnresolvedClaims: [
      { claimId: 'claim-001', updatedAt: '2026-06-20T00:00:00.000Z' },
      { claimId: 'claim-002', updatedAt: '2026-06-20T00:01:00.000Z' },
      { claimId: 'claim-003', updatedAt: '2026-06-20T00:02:00.000Z' }
    ],
    listR2Reviews: {
      schemaVersion: 'phase9.r2-projection.v1',
      records: [{
        claimId: 'CLAIM-0001',
        r2VerdictEventId: 'EV-0001',
        status: 'open',
        resolved: false,
        severity: 'medium',
        reviewedAt: '2026-06-20T00:00:00.000Z'
      }, {
        claimId: 'CLAIM-0002',
        r2VerdictEventId: 'EV-0002',
        status: 'disputed',
        resolved: false,
        severity: 'high',
        reviewedAt: '2026-06-20T00:01:00.000Z'
      }, {
        claimId: 'CLAIM-0003',
        r2VerdictEventId: 'EV-0003',
        status: 'resolved',
        resolved: true,
        severity: 'low',
        reviewedAt: '2026-06-20T00:02:00.000Z'
      }]
    }
  });
  try {
    const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
      generatedAt: FIXED_GENERATED_AT,
      kernelRoot
    });

    assert.equal(handshake.kernel.unresolvedR2Count, 2);
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('capability-handshake generator reports an honest degraded kernel when no kernel root is available', async () => {
  const handshake = await generateCapabilityHandshake(PROJECT_ROOT, {
    generatedAt: FIXED_GENERATED_AT,
    kernelRoot: null
  });

  assert.equal(handshake.kernel.mode, 'missing');
  assert.equal(handshake.kernel.dbAvailable, false);
  assert.equal(handshake.kernel.projections.availableNames.length, 0);
  assert.equal(handshake.kernel.projections.unavailable.length, 9);
  assert.equal(
    handshake.degradedReasons.some((reason) => reason.includes('kernel missing')),
    true
  );
});

test('capability-handshake preserves missing-contract warnings as degraded reasons', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-capability-missing-contract-'));
  try {
    await mkdir(path.join(fixtureRoot, 'bin'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'environment', 'control'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'environment', 'schemas'), { recursive: true });
    await cp(path.join(PROJECT_ROOT, 'commands'), path.join(fixtureRoot, 'commands'), {
      recursive: true
    });
    await cp(
      path.join(PROJECT_ROOT, 'environment', 'control', 'approved-memory-apis.json'),
      path.join(fixtureRoot, 'environment', 'control', 'approved-memory-apis.json')
    );
    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({ name: 'vibe-research-environment' }),
      'utf8'
    );
    await writeFile(path.join(fixtureRoot, 'bin', 'vre'), 'fixture only\n', 'utf8');
    await unlink(path.join(fixtureRoot, 'commands', 'capabilities --json.md'));

    const handshake = await generateCapabilityHandshake(fixtureRoot, {
      generatedAt: FIXED_GENERATED_AT,
      kernelRoot: null,
      cliMetadata: {
        DISPATCH_TABLE,
        IMPLEMENTED_PHASE9_COMMANDS,
        PHASE9_STUB_DEFINITIONS
      }
    });

    assert.equal(hasMissingContractWarning(handshake.degradedReasons), true);
    assert.equal(
      handshake.degradedReasons.some((reason) =>
        reason.includes('capabilities --json')
      ),
      true
    );
    assert.equal(Object.hasOwn(handshake.vre, 'undocumentedExecutableWarnings'), false);
    assert.equal(Object.hasOwn(handshake.vre, 'commandClassification'), false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
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
  const classificationManifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT
  });
  const expectedClassification =
    expectedCommandClassificationRecords(classificationManifest);

  for (const fixture of [fullFixture, degradedFixture]) {
    assert.equal(fixture.vre.executableCommands.includes('capabilities --json'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective doctor'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective resume'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective start'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective status'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective pause'), true);
    assert.equal(fixture.vre.executableCommands.includes('objective stop'), true);
    assert.equal(fixture.vre.executableCommands.includes('research-loop'), true);
    assert.equal(fixture.vre.executableCommands.includes('run-analysis'), true);
    assert.equal(fixture.vre.executableCommands.includes('scheduler install'), true);
    assert.equal(fixture.vre.executableCommands.includes('scheduler status'), true);
    assert.equal(fixture.vre.executableCommands.includes('scheduler doctor'), true);
    assert.equal(fixture.vre.executableCommands.includes('scheduler remove'), true);
    assert.equal(fixture.vre.missingSurfaces.includes('plugin handshake injection'), false);
    assert.equal(fixture.vre.missingSurfaces.includes('capabilities --json'), false);
    assert.equal(fixture.vre.missingSurfaces.includes('analysis-manifest schema'), false);
    assert.equal(fixture.vre.missingSurfaces.includes('research-loop'), false);
    assert.equal(fixture.vre.missingSurfaces.includes('run-analysis'), false);
    assert.deepEqual(fixture.vre.operatorSurface.commands, EXPECTED_OPERATOR_COMMANDS);
    assert.deepEqual(fixture.vre.operatorSurface.doctorCommands, EXPECTED_OPERATOR_DOCTOR_COMMANDS);
    assert.deepEqual(fixture.vre.commandClassification, expectedClassification);
    assert.equal(
      fixture.vre.schemas.some((entry) => entry.name === 'phase9.analysis-manifest.v1'),
      true
    );
    assert.equal(hasMissingContractWarning(fixture.degradedReasons), false);
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
    assert.equal(handshake.kernel.projections.probes.length, 9);
    assert.equal(handshake.kernel.projections.unavailable.length, 9);
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

test('kernel bridge contract mismatch emits kernel_vre_truth_mismatch and rethrows the original error', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionFailure();
  const capturePath = path.join(kernelRoot, 'governance-events.jsonl');
  try {
    await assert.rejects(
      () => withGovernanceCapture(capturePath, () => generateCapabilityHandshake(PROJECT_ROOT, {
        generatedAt: FIXED_GENERATED_AT,
        kernelRoot
      })),
      KernelBridgeContractMismatchError
    );

    const events = await readGovernanceEvents(capturePath);
    assert.equal(events.length, 1);
    assertKernelTruthMismatchEvent(events[0]);
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('kernel_vre_truth_mismatch governance details do not leak raw mismatch messages', async () => {
  const sentinel = 'SECRET-seq125-truth-mismatch C:/private/kernel/path';
  const kernelRoot = await createKernelFixtureWithProjectionFailure({ sentinel });
  const capturePath = path.join(kernelRoot, 'governance-events.jsonl');
  try {
    await assert.rejects(
      () => withGovernanceCapture(capturePath, () => generateCapabilityHandshake(PROJECT_ROOT, {
        generatedAt: FIXED_GENERATED_AT,
        kernelRoot
      })),
      KernelBridgeContractMismatchError
    );

    const events = await readGovernanceEvents(capturePath);
    assert.equal(events.length, 1);
    assertKernelTruthMismatchEvent(events[0]);
    assertNoDetailsLeak(events[0], [
      sentinel,
      'SECRET-seq125-truth-mismatch',
      'C:/private/kernel/path',
      'someOtherProjection',
      'stdout is not valid JSON'
    ]);
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('kernel_vre_truth_mismatch telemetry failure still rethrows the original contract mismatch', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionFailure();
  const missingCli = path.join(kernelRoot, 'missing-governance-log.js');
  try {
    const { stderr } = await captureStderr(() => assert.rejects(
      () => withGovernanceCapture(
        path.join(kernelRoot, 'governance-events.jsonl'),
        () => generateCapabilityHandshake(PROJECT_ROOT, {
          generatedAt: FIXED_GENERATED_AT,
          kernelRoot
        }),
        { pluginCliPath: missingCli }
      ),
      KernelBridgeContractMismatchError
    ));

    assert.match(stderr, /kernel_vre_truth_mismatch telemetry failed/u);
    assert.equal(stderr.includes(missingCli), false);
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});

test('non-contract kernel bridge errors preserve degraded handshake behavior without governance emission', async () => {
  const kernelRoot = await createKernelFixtureWithProjectionFailure({
    mode: 'kernel-error',
    sentinel: 'SECRET-seq125-non-contract'
  });
  const capturePath = path.join(kernelRoot, 'governance-events.jsonl');
  try {
    const handshake = await withGovernanceCapture(capturePath, () => generateCapabilityHandshake(PROJECT_ROOT, {
      generatedAt: FIXED_GENERATED_AT,
      kernelRoot
    }));

    assert.equal(handshake.kernel.mode, 'degraded');
    assert.equal(
      handshake.kernel.projections.unavailable.some((entry) => entry.name === 'listClaimHeads'),
      true
    );
    assert.equal(
      handshake.degradedReasons.some((reason) => reason.includes('SECRET-seq125-non-contract')),
      true
    );
    assert.deepEqual(await readGovernanceEvents(capturePath), []);
  } finally {
    await rm(kernelRoot, { recursive: true, force: true });
  }
});
