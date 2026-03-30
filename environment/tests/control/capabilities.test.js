import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cp } from 'node:fs/promises';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-cap-'));
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  return tmp;
}

describe('capabilities', async () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import('../../control/capabilities.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns conservative defaults when no file exists', async () => {
    const snap = await mod.getCapabilitiesSnapshot(dir);
    assert.equal(snap.kernel.dbAvailable, false);
    assert.equal(snap.kernel.projections.claimHeads, false);
    assert.equal(snap.kernel.advanced.governanceProfileAtCreation, false);
  });

  it('publishes and reads back a valid snapshot', async () => {
    const snap = {
      schemaVersion: 'vibe-env.capabilities.v1',
      kernel: {
        dbAvailable: true,
        projections: { overview: true, claimHeads: true, unresolvedClaims: false, citationChecks: true },
        advanced: { governanceProfileAtCreation: false, claimSearch: false }
      },
      install: { bundles: ['governance-core', 'control-plane'] },
      updatedAt: new Date().toISOString()
    };
    await mod.publishCapabilitiesSnapshot(dir, snap);
    const read = await mod.getCapabilitiesSnapshot(dir);
    assert.equal(read.kernel.dbAvailable, true);
    assert.equal(read.install.bundles.length, 2);
  });

  it('rejects invalid snapshot', async () => {
    await assert.rejects(
      () => mod.publishCapabilitiesSnapshot(dir, { bad: true }),
      /Invalid capabilities snapshot/
    );
  });

  it('refreshes from a mock reader', async () => {
    const mockReader = {
      dbAvailable: true,
      getProjectOverview: async () => ({ ok: true }),
      listClaimHeads: async () => [{ id: 'C-001' }],
      listUnresolvedClaims: async () => [],
      listCitationChecks: async () => null // returns null → probed as false
    };
    const snap = await mod.refreshCapabilitiesSnapshot(dir, mockReader);
    assert.equal(snap.kernel.dbAvailable, true);
    assert.equal(snap.kernel.projections.overview, true);
    assert.equal(snap.kernel.projections.claimHeads, true);
    assert.equal(snap.kernel.projections.citationChecks, false);
  });

  it('degrades when reader is unavailable', async () => {
    const snap = await mod.refreshCapabilitiesSnapshot(dir, null);
    assert.equal(snap.kernel.dbAvailable, false);
    assert.equal(snap.kernel.projections.overview, false);
  });
});
