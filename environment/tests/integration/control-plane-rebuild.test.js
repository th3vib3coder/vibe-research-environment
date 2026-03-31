import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { writeFlowIndex } from '../../lib/flow-state.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { getSessionSnapshot } from '../../control/session-snapshot.js';

test('flow-status rebuilds a missing session snapshot from flow state plus current signals', async () => {
  const projectRoot = await createFixtureProject('vre-int-rebuild-');

  try {
    await writeFlowIndex(projectRoot, {
      schemaVersion: 'vibe.flow.index.v1',
      activeFlow: 'experiment',
      currentStage: 'experiment-running',
      nextActions: ['review outputs for EXP-001'],
      blockers: [],
      lastCommand: '/flow-experiment',
      updatedAt: '2026-03-31T10:00:00Z'
    });

    await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader: {
        dbAvailable: true,
        listUnresolvedClaims: async () => [{ claimId: 'C-001' }]
      },
      commandFn: async () => ({
        summary: 'status rebuilt',
        payload: {}
      })
    });

    const sessionPath = path.join(projectRoot, '.vibe-science-environment', 'control', 'session.json');
    await rm(sessionPath, { force: true });

    const rerun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader: {
        dbAvailable: true,
        listUnresolvedClaims: async () => [{ claimId: 'C-001' }]
      },
      commandFn: async () => ({
        summary: 'status rebuilt again',
        payload: {}
      })
    });

    assert.equal(rerun.attempt.status, 'succeeded');

    const snapshot = await getSessionSnapshot(projectRoot);
    assert.equal(snapshot.activeFlow, 'experiment');
    assert.equal(snapshot.currentStage, 'experiment-running');
    assert.equal(snapshot.signals.unresolvedClaims, 1);

    const persisted = JSON.parse(await readFile(sessionPath, 'utf8'));
    assert.equal(persisted.lastCommand, '/flow-status');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
