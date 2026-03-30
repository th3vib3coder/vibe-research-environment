import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cp } from 'node:fs/promises';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-snap-'));
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  return tmp;
}

describe('session-snapshot', async () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import('../../control/session-snapshot.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when no snapshot exists', async () => {
    const snap = await mod.getSessionSnapshot(dir);
    assert.equal(snap, null);
  });

  it('rebuilds a valid snapshot from inputs', async () => {
    const snap = await mod.rebuildSessionSnapshot(dir, {
      flowState: { activeFlow: 'experiment', currentStage: 'registration' },
      kernel: { dbAvailable: true }
    });
    assert.equal(snap.schemaVersion, 'vibe-env.session.v1');
    assert.equal(snap.activeFlow, 'experiment');
    assert.equal(snap.kernel.dbAvailable, true);
    assert.ok(snap.updatedAt);
  });

  it('reads back a published snapshot', async () => {
    await mod.rebuildSessionSnapshot(dir, {
      flowState: { activeFlow: 'literature' },
      lastCommand: '/flow-literature'
    });
    const read = await mod.getSessionSnapshot(dir);
    assert.equal(read.activeFlow, 'literature');
    assert.equal(read.lastCommand, '/flow-literature');
  });

  it('rejects invalid snapshot on publish', async () => {
    await assert.rejects(
      () => mod.publishSessionSnapshot(dir, { bad: true }),
      /Invalid session snapshot/
    );
  });

  it('builds with all defaults when no inputs given', async () => {
    const snap = await mod.rebuildSessionSnapshot(dir);
    assert.equal(snap.activeFlow, null);
    assert.equal(snap.budget.state, 'unknown');
    assert.equal(snap.signals.unresolvedClaims, 0);
  });
});
