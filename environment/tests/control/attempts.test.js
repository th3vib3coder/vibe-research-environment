import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-att-'));
  await cp(
    path.join(process.cwd(), 'environment', 'schemas'),
    path.join(tmp, 'environment', 'schemas'),
    { recursive: true }
  );
  return tmp;
}

describe('attempts', () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import(`../../control/attempts.js?${Date.now()}`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('opens an attempt with preparing status and unique IDs', async () => {
    const first = await mod.openAttempt(dir, { scope: '/flow-status' });
    const second = await mod.openAttempt(dir, { scope: '/flow-status' });

    assert.match(first.attemptId, /^ATT-/);
    assert.equal(first.status, 'preparing');
    assert.equal(first.scope, 'flow-status');
    assert.notEqual(first.attemptId, second.attemptId);
  });

  it('updates attempt status and refreshes heartbeat', async () => {
    const attempt = await mod.openAttempt(dir, { scope: 'flow-experiment' });
    const running = await mod.updateAttempt(dir, attempt.attemptId, {
      status: 'running'
    });

    assert.equal(running.status, 'running');
    assert.ok(running.lastHeartbeatAt >= attempt.lastHeartbeatAt);
  });

  it('closes attempt with terminal status and sets endedAt', async () => {
    const attempt = await mod.openAttempt(dir, { scope: 'flow-experiment' });
    await mod.updateAttempt(dir, attempt.attemptId, { status: 'running' });

    const closed = await mod.updateAttempt(dir, attempt.attemptId, {
      status: 'succeeded',
      summary: 'Completed successfully'
    });

    assert.equal(closed.status, 'succeeded');
    assert.ok(closed.endedAt);
    assert.equal(closed.summary, 'Completed successfully');
  });

  it('prevents reopening terminal attempts', async () => {
    const attempt = await mod.openAttempt(dir);
    await mod.updateAttempt(dir, attempt.attemptId, { status: 'failed' });

    await assert.rejects(
      () => mod.updateAttempt(dir, attempt.attemptId, { status: 'running' }),
      /Invalid attempt transition/
    );
  });

  it('rejects terminal self-loop rewrites after closure', async () => {
    const attempt = await mod.openAttempt(dir);
    await mod.updateAttempt(dir, attempt.attemptId, {
      status: 'failed',
      summary: 'first failure'
    });

    await assert.rejects(
      () =>
        mod.updateAttempt(dir, attempt.attemptId, {
          status: 'failed',
          summary: 'rewritten failure'
        }),
      /Invalid attempt transition/
    );
  });

  it('filters by status, flow alias, and targetId', async () => {
    await mod.openAttempt(dir, { scope: '/flow-status' });
    const experiment = await mod.openAttempt(dir, {
      scope: '/flow-experiment',
      targetId: 'EXP-001'
    });
    await mod.updateAttempt(dir, experiment.attemptId, { status: 'running' });

    const filtered = await mod.listAttempts(dir, {
      flow: 'flow-experiment',
      targetId: 'EXP-001'
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].scope, 'flow-experiment');
    assert.equal(filtered[0].targetId, 'EXP-001');
  });

  it('returns empty list when no attempts exist', async () => {
    assert.deepEqual(await mod.listAttempts(dir), []);
  });
});
