import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cp } from 'node:fs/promises';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-att-'));
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  return tmp;
}

describe('attempts', async () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import('../../control/attempts.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('opens an attempt with preparing status', async () => {
    const att = await mod.openAttempt(dir, { scope: 'flow-status' });
    assert.match(att.attemptId, /^ATT-/);
    assert.equal(att.status, 'preparing');
    assert.equal(att.scope, 'flow-status');
    assert.ok(att.startedAt);
    assert.ok(att.lastHeartbeatAt);
  });

  it('updates attempt status and refreshes heartbeat', async () => {
    const att = await mod.openAttempt(dir, { scope: 'flow-experiment' });
    const updated = await mod.updateAttempt(dir, att.attemptId, { status: 'running' });
    assert.equal(updated.status, 'running');
    assert.ok(updated.lastHeartbeatAt >= att.lastHeartbeatAt);
  });

  it('closes attempt with terminal status and sets endedAt', async () => {
    const att = await mod.openAttempt(dir);
    await mod.updateAttempt(dir, att.attemptId, { status: 'running' });
    const closed = await mod.updateAttempt(dir, att.attemptId, {
      status: 'succeeded',
      summary: 'Completed successfully'
    });
    assert.equal(closed.status, 'succeeded');
    assert.ok(closed.endedAt);
    assert.equal(closed.summary, 'Completed successfully');
  });

  it('prevents reopening terminal attempts', async () => {
    const att = await mod.openAttempt(dir);
    await mod.updateAttempt(dir, att.attemptId, { status: 'failed', errorCode: 'E001' });
    await assert.rejects(
      () => mod.updateAttempt(dir, att.attemptId, { status: 'running' }),
      /terminal/
    );
  });

  it('lists attempts with filters', async () => {
    await mod.openAttempt(dir, { scope: 'flow-status' });
    await mod.openAttempt(dir, { scope: 'flow-experiment', targetId: 'EXP-001' });
    const all = await mod.listAttempts(dir);
    assert.equal(all.length, 2);
    const filtered = await mod.listAttempts(dir, { scope: 'flow-experiment' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].targetId, 'EXP-001');
  });

  it('returns empty list when no attempts exist', async () => {
    const list = await mod.listAttempts(dir);
    assert.deepEqual(list, []);
  });
});
