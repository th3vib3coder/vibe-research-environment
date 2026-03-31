import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';

test('first flow invocation bootstraps flows and control state surfaces', async () => {
  const projectRoot = await createFixtureProject('vre-int-bootstrap-');

  try {
    const result = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => ({
        summary: 'bootstrap only',
        payload: {}
      })
    });

    assert.equal(result.attempt.status, 'succeeded');

    const topLevelStateDirs = await readdir(path.join(projectRoot, '.vibe-science-environment'));
    assert.ok(topLevelStateDirs.includes('flows'));
    assert.ok(topLevelStateDirs.includes('control'));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
