import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-snap-'));
  await cp(
    path.join(process.cwd(), 'environment', 'schemas'),
    path.join(tmp, 'environment', 'schemas'),
    { recursive: true }
  );
  return tmp;
}

describe('session-snapshot', () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import(`../../control/session-snapshot.js?${Date.now()}`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when no snapshot exists', async () => {
    assert.equal(await mod.getSessionSnapshot(dir), null);
  });

  it('rebuilds a valid snapshot from inputs', async () => {
    const snapshot = await mod.rebuildSessionSnapshot(dir, {
      flowState: {
        activeFlow: 'experiment',
        currentStage: 'registration',
        nextActions: ['register experiment'],
        blockers: []
      },
      kernel: {
        dbAvailable: true
      }
    });

    assert.equal(snapshot.schemaVersion, 'vibe-env.session.v1');
    assert.equal(snapshot.activeFlow, 'experiment');
    assert.equal(snapshot.kernel.dbAvailable, true);
    assert.ok(snapshot.updatedAt);
  });

  it('reads back a published snapshot', async () => {
    await mod.rebuildSessionSnapshot(dir, {
      flowState: { activeFlow: 'literature' },
      lastCommand: '/flow-literature'
    });

    const readBack = await mod.getSessionSnapshot(dir);
    assert.equal(readBack.activeFlow, 'literature');
    assert.equal(readBack.lastCommand, '/flow-literature');
  });

  it('preserves advanced capability fields from a full capabilities snapshot', async () => {
    const snapshot = await mod.rebuildSessionSnapshot(dir, {
      capabilities: {
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
            claimSearch: true
          }
        },
        install: {
          bundles: ['control-plane']
        },
        updatedAt: new Date().toISOString()
      }
    });

    assert.equal(snapshot.capabilities.claimHeads, true);
    assert.equal(snapshot.capabilities.citationChecks, true);
    assert.equal(snapshot.capabilities.governanceProfileAtCreation, true);
    assert.equal(snapshot.capabilities.claimSearch, true);
  });

  it('rejects invalid snapshot on publish', async () => {
    await assert.rejects(
      () => mod.publishSessionSnapshot(dir, { bad: true }),
      /Invalid session snapshot/
    );
  });

  it('builds with all defaults when no inputs are given', async () => {
    const snapshot = await mod.rebuildSessionSnapshot(dir);
    assert.equal(snapshot.activeFlow, null);
    assert.equal(snapshot.budget.state, 'unknown');
    assert.equal(snapshot.signals.unresolvedClaims, 0);
  });
});
