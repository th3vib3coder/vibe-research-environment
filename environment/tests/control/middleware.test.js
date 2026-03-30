import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-mw-'));
  // Copy schemas and templates for flow-state bootstrap
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  await cp(path.join(process.cwd(), 'environment', 'templates'), path.join(tmp, 'environment', 'templates'), { recursive: true });
  return tmp;
}

describe('middleware', async () => {
  let dir;
  let mw, attempts, events, snapshot;

  beforeEach(async () => {
    dir = await setup();
    mw = await import('../../control/middleware.js');
    attempts = await import('../../control/attempts.js');
    events = await import('../../control/events.js');
    snapshot = await import('../../control/session-snapshot.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('runs the full 7-step chain for a successful command', async () => {
    const { result, attempt, snapshot: snap } = await mw.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: null,
      commandFn: async (ctx) => {
        assert.equal(ctx.commandName, '/flow-status');
        assert.equal(ctx.degraded, true); // reader is null
        return { summary: 'Status retrieved' };
      }
    });

    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.summary, 'Status retrieved');
    assert.ok(snap.updatedAt);
    assert.equal(snap.lastCommand, '/flow-status');

    // Verify telemetry was written
    const evts = await events.listEvents(dir);
    const kinds = evts.map(e => e.kind);
    assert.ok(kinds.includes('attempt_opened'));
    assert.ok(kinds.includes('degraded_mode_entered'));
    assert.ok(kinds.includes('session_snapshot_published'));
    assert.ok(kinds.includes('attempt_updated'));
  });

  it('handles command failure gracefully', async () => {
    const { attempt } = await mw.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-experiment',
      reader: null,
      commandFn: async () => {
        throw new Error('Experiment registration failed');
      }
    });

    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.summary, 'Experiment registration failed');
    assert.ok(attempt.errorCode);
  });

  it('creates exactly one attempt per invocation', async () => {
    await mw.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-literature',
      reader: null,
      commandFn: async () => ({})
    });

    const all = await attempts.listAttempts(dir);
    assert.equal(all.length, 1);
  });

  it('publishes session snapshot with kernel degraded info', async () => {
    await mw.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: null,
      commandFn: async () => ({})
    });

    const snap = await snapshot.getSessionSnapshot(dir);
    assert.equal(snap.kernel.dbAvailable, false);
    assert.ok(snap.kernel.degradedReason);
  });
});
