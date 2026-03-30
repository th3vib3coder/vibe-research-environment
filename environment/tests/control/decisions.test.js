import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cp } from 'node:fs/promises';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-dec-'));
  await cp(path.join(process.cwd(), 'environment', 'schemas'), path.join(tmp, 'environment', 'schemas'), { recursive: true });
  return tmp;
}

describe('decisions', async () => {
  let dir;
  let mod;

  beforeEach(async () => {
    dir = await setup();
    mod = await import('../../control/decisions.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends a valid decision and reads it back', async () => {
    const dec = await mod.appendDecision(dir, {
      flow: 'experiment',
      kind: 'blocker_escalation',
      reason: 'Missing negative control for EXP-004'
    });
    assert.match(dec.decisionId, /^DEC-/);
    assert.equal(dec.flow, 'experiment');

    const list = await mod.listDecisions(dir);
    assert.equal(list.length, 1);
  });

  it('rejects invalid flow name', async () => {
    await assert.rejects(
      () => mod.appendDecision(dir, {
        flow: 'not_a_flow',
        kind: 'test',
        reason: 'test'
      }),
      /Invalid decision record/
    );
  });

  it('filters by flow and targetId', async () => {
    await mod.appendDecision(dir, { flow: 'experiment', kind: 'escalation', reason: 'r1', targetId: 'EXP-001' });
    await mod.appendDecision(dir, { flow: 'literature', kind: 'gap_flagged', reason: 'r2' });

    const byFlow = await mod.listDecisions(dir, { flow: 'experiment' });
    assert.equal(byFlow.length, 1);

    const byTarget = await mod.listDecisions(dir, { targetId: 'EXP-001' });
    assert.equal(byTarget.length, 1);
  });

  it('returns empty list when no decisions exist', async () => {
    const list = await mod.listDecisions(dir);
    assert.deepEqual(list, []);
  });
});
