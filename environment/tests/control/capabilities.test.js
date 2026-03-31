import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
    assert.equal(snapshot.kernel.advanced.governanceProfileAtCreation, true);
    assert.equal(snapshot.kernel.advanced.claimSearch, true);
    assert.deepEqual(snapshot.install.bundles, []);
  });

  it('degrades honestly when reader is unavailable', async () => {
    const snapshot = await mod.refreshCapabilitiesSnapshot(dir, null);
    assert.equal(snapshot.kernel.dbAvailable, false);
    assert.equal(snapshot.kernel.projections.unresolvedClaims, false);
    assert.equal(snapshot.kernel.advanced.claimSearch, false);
  });
});
