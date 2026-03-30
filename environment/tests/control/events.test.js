import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cp } from 'node:fs/promises';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-evt-'));
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  return tmp;
}

describe('events', async () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import('../../control/events.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends a valid event and reads it back', async () => {
    const evt = await mod.appendEvent(dir, {
      kind: 'attempt_opened',
      attemptId: 'ATT-2026-03-31-001',
      severity: 'info',
      message: 'test event'
    });
    assert.match(evt.eventId, /^EVT-/);
    assert.equal(evt.kind, 'attempt_opened');

    const list = await mod.listEvents(dir);
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'attempt_opened');
  });

  it('rejects invalid event kind', async () => {
    await assert.rejects(
      () => mod.appendEvent(dir, { kind: 'not_a_real_event' }),
      /Invalid event record/
    );
  });

  it('filters by kind and attemptId', async () => {
    await mod.appendEvent(dir, { kind: 'attempt_opened', attemptId: 'ATT-2026-03-31-001' });
    await mod.appendEvent(dir, { kind: 'degraded_mode_entered', attemptId: 'ATT-2026-03-31-001' });
    await mod.appendEvent(dir, { kind: 'attempt_opened', attemptId: 'ATT-2026-03-31-002' });

    const byKind = await mod.listEvents(dir, { kind: 'attempt_opened' });
    assert.equal(byKind.length, 2);

    const byAttempt = await mod.listEvents(dir, { attemptId: 'ATT-2026-03-31-001' });
    assert.equal(byAttempt.length, 2);
  });

  it('returns empty list when no events exist', async () => {
    const list = await mod.listEvents(dir);
    assert.deepEqual(list, []);
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await mod.appendEvent(dir, { kind: 'attempt_opened' });
    }
    const page = await mod.listEvents(dir, { limit: 2, offset: 1 });
    assert.equal(page.length, 2);
  });
});
