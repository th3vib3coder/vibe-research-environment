import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { createMetricsAccumulator } from '../../lib/session-metrics.js';
import { exportSessionDigest } from '../../flows/session-digest.js';

test('session digest export summarizes the current operator session after middleware activity', async () => {
  const projectRoot = await createFixtureProject('vre-int-digest-');

  try {
    const run = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => ({
        summary: 'status reviewed',
        payload: {},
      }),
    });

    const metrics = createMetricsAccumulator({
      sessionId: 'S-010',
      lastAttemptId: run.attempt.attemptId,
    });
    await metrics.flush(projectRoot, { recordedAt: '2026-04-02T16:00:00Z' });

    const exported = await exportSessionDigest(projectRoot, {
      now: '2026-04-02T16:05:00Z',
    });

    assert.equal(exported.digest.sourceSessionId, 'S-010');
    assert.equal(exported.digest.activeFlow, null);
    assert.equal(exported.digest.lastCommand, '/flow-status');
    assert.deepEqual(exported.digest.attemptIds, [run.attempt.attemptId]);

    const digestJson = JSON.parse(
      await readFile(path.join(exported.digestDir, 'session-digest.json'), 'utf8'),
    );
    assert.equal(digestJson.digestId, 'DIGEST-S-010');
    assert.equal(digestJson.lastCommand, '/flow-status');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
