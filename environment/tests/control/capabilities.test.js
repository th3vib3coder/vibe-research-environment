import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KernelBridgeContractMismatchError } from '../../lib/kernel-bridge.js';

const GOVERNANCE_CAPTURE_STUB = path.join(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'governance-log-capture-stub.js'
);

const PROJECTION_CASES = [
  ['overview', 'getProjectOverview'],
  ['claimHeads', 'listClaimHeads'],
  ['unresolvedClaims', 'listUnresolvedClaims'],
  ['citationChecks', 'listCitationChecks']
];

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

function assertKernelTruthMismatchEvent(event, { projectionName, sourceComponent = 'vre/control/capabilities' }) {
  assert.equal(event.event_type, 'kernel_vre_truth_mismatch');
  assert.equal(event.source_component, sourceComponent);
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

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-cap-'));
  await cp(
    path.join(process.cwd(), 'environment', 'schemas'),
    path.join(tmp, 'environment', 'schemas'),
    { recursive: true }
  );
  await cp(
    path.join(process.cwd(), 'environment', 'install', 'bundles'),
    path.join(tmp, 'environment', 'install', 'bundles'),
    { recursive: true }
  );
  return tmp;
}

function createReaderWithProjectionFailure(methodName, errorFactory) {
  const reader = {
    dbAvailable: true,
    capabilities: {
      governanceProfileAtCreation: true,
      claimSearch: true
    },
    async getProjectOverview() {
      return { ok: true };
    },
    async listClaimHeads() {
      return [{ id: 'C-001' }];
    },
    async listUnresolvedClaims() {
      return [];
    },
    async listCitationChecks() {
      return [{ id: 'CIT-001' }];
    }
  };
  reader[methodName] = async () => {
    throw errorFactory();
  };
  return reader;
}

describe('capabilities', () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import(`../../control/capabilities.js?${Date.now()}`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns conservative defaults and no installed bundles when no install-state exists', async () => {
    const snapshot = await mod.getCapabilitiesSnapshot(dir);

    assert.equal(snapshot.kernel.dbAvailable, false);
    assert.equal(snapshot.kernel.projections.claimHeads, false);
    assert.equal(snapshot.kernel.advanced.governanceProfileAtCreation, false);
    assert.deepEqual(snapshot.install.bundles, []);
  });

  it('publishes and reads back a valid snapshot', async () => {
    const snapshot = {
      schemaVersion: 'vibe-env.capabilities.v1',
      kernel: {
        dbAvailable: true,
        projections: {
          overview: true,
          claimHeads: true,
          unresolvedClaims: false,
          citationChecks: true
        },
        advanced: {
          governanceProfileAtCreation: true,
          claimSearch: false
        }
      },
      install: {
        bundles: ['governance-core', 'control-plane']
      },
      updatedAt: new Date().toISOString()
    };

    await mod.publishCapabilitiesSnapshot(dir, snapshot);
    const readBack = await mod.getCapabilitiesSnapshot(dir);

    assert.deepEqual(readBack, snapshot);
  });

  it('prefers install-state bundles when available', async () => {
    await mkdir(path.join(dir, '.vibe-science-environment'), {
      recursive: true
    });
    await writeFile(
      path.join(dir, '.vibe-science-environment', '.install-state.json'),
      JSON.stringify(
        {
          schemaVersion: 'vibe-env.install.v1',
          bundles: ['governance-core', 'control-plane']
        },
        null,
        2
      ),
      'utf8'
    );

    const snapshot = await mod.getCapabilitiesSnapshot(dir);
    assert.deepEqual(snapshot.install.bundles, [
      'control-plane',
      'governance-core'
    ]);
  });

  it('refreshes kernel projections, advanced features, and install bundles', async () => {
    const mockReader = {
      dbAvailable: true,
      capabilities: {
        governanceProfileAtCreation: true,
        claimSearch: true
      },
      getProjectOverview: async () => ({ ok: true }),
      listClaimHeads: async () => [{ id: 'C-001' }],
      listUnresolvedClaims: async () => [],
      listCitationChecks: async () => null
    };

    const snapshot = await mod.refreshCapabilitiesSnapshot(dir, mockReader);

    assert.equal(snapshot.kernel.dbAvailable, true);
    assert.equal(snapshot.kernel.projections.overview, true);
    assert.equal(snapshot.kernel.projections.claimHeads, true);
    assert.equal(snapshot.kernel.projections.citationChecks, false);
    assert.deepEqual(snapshot.kernel.projections.truthMismatch, []);
    assert.equal(snapshot.kernel.advanced.governanceProfileAtCreation, true);
    assert.equal(snapshot.kernel.advanced.claimSearch, true);
    assert.deepEqual(snapshot.install.bundles, []);
  });

  it('degrades honestly when reader is unavailable', async () => {
    const snapshot = await mod.refreshCapabilitiesSnapshot(dir, null);
    assert.equal(snapshot.kernel.dbAvailable, false);
    assert.equal(snapshot.kernel.projections.unresolvedClaims, false);
    assert.deepEqual(snapshot.kernel.projections.truthMismatch, []);
    assert.equal(snapshot.kernel.advanced.claimSearch, false);
  });

  it('emits kernel_vre_truth_mismatch for each soft-probe contract mismatch', async () => {
    for (const [projectionKey, methodName] of PROJECTION_CASES) {
      const capturePath = path.join(dir, `${projectionKey}-governance.jsonl`);
      const snapshot = await withGovernanceCapture(capturePath, () => mod.refreshCapabilitiesSnapshot(
        dir,
        createReaderWithProjectionFailure(
          methodName,
          () => new KernelBridgeContractMismatchError(
            `contract mismatch SECRET-seq126-truth-mismatch C:/private/path for ${methodName}`,
            { projection: methodName }
          )
        )
      ));
      const events = await readGovernanceEvents(capturePath);

      assert.equal(snapshot.kernel.projections[projectionKey], false);
      assert.deepEqual(snapshot.kernel.projections.truthMismatch, [projectionKey]);
      assert.equal(events.length, 1);
      assertKernelTruthMismatchEvent(events[0], { projectionName: methodName });
      assertNoDetailsLeak(events[0], [
        'SECRET-seq126-truth-mismatch',
        'C:/private/path',
        `contract mismatch SECRET-seq126-truth-mismatch C:/private/path for ${methodName}`
      ]);
    }
  });

  it('keeps capabilities soft-probe degraded when telemetry bridge is unavailable', async () => {
    const missingCli = path.join(dir, 'missing-governance-cli.js');
    const { result: snapshot, stderr } = await captureStderr(() => withGovernanceCapture(
      path.join(dir, 'missing-bridge.jsonl'),
      () => mod.refreshCapabilitiesSnapshot(
        dir,
        createReaderWithProjectionFailure(
          'listClaimHeads',
          () => new KernelBridgeContractMismatchError('contract mismatch for claim heads', {
            projection: 'listClaimHeads'
          })
        )
      ),
      { pluginCliPath: missingCli }
    ));

    assert.equal(snapshot.kernel.projections.claimHeads, false);
    assert.deepEqual(snapshot.kernel.projections.truthMismatch, ['claimHeads']);
    assert.match(stderr, /kernel_vre_truth_mismatch telemetry failed/u);
  });

  it('preserves non-contract projection error behavior without governance emission', async () => {
    const capturePath = path.join(dir, 'ordinary-error-governance.jsonl');
    const snapshot = await withGovernanceCapture(capturePath, () => mod.refreshCapabilitiesSnapshot(
      dir,
      createReaderWithProjectionFailure(
        'listClaimHeads',
        () => new Error('ordinary projection failure')
      )
    ));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(snapshot.kernel.projections.claimHeads, false);
    assert.deepEqual(snapshot.kernel.projections.truthMismatch, []);
    assert.equal(events.length, 0);
  });
});
