import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { listAttempts } from '../../control/attempts.js';
import {
  listExperiments,
  registerExperiment,
  updateExperiment
} from '../../flows/experiment.js';

test('experiment flow creates and updates manifests without duplicating attempt lifecycle', async () => {
  const projectRoot = await createFixtureProject('vre-int-exp-');

  try {
    const registerRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-experiment',
      scope: 'flow-experiment',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async ({ attempt }) => {
        const created = await registerExperiment(projectRoot, {
          experimentId: 'EXP-001',
          title: 'Integration lifecycle experiment',
          objective: 'Verify manifest lifecycle through middleware',
          executionPolicy: {
            timeoutSeconds: 3600,
            unresponsiveSeconds: 300,
            maxAttempts: 2
          },
          latestAttemptId: attempt.attemptId,
          parameters: { seed: 17 },
          codeRef: {
            entrypoint: 'scripts/run.py',
            gitCommit: 'abc1234'
          },
          inputArtifacts: [],
          outputArtifacts: [],
          relatedClaims: ['C-001'],
          blockers: [],
          notes: ''
        });
        return {
          summary: 'experiment registered',
          payload: { experimentId: created.manifest.experimentId }
        };
      }
    });

    const updateRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-experiment',
      scope: 'flow-experiment',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => {
        await updateExperiment(projectRoot, 'EXP-001', {
          status: 'active'
        });
        const updated = await updateExperiment(projectRoot, 'EXP-001', {
          status: 'blocked',
          blockers: ['Missing control dataset']
        });
        return {
          summary: 'experiment updated',
          payload: { status: updated.manifest.status }
        };
      }
    });

    const listRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-experiment',
      scope: 'flow-experiment',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => {
        const listed = await listExperiments(projectRoot);
        return {
          summary: 'experiments listed',
          payload: { count: listed.experiments.length }
        };
      }
    });

    assert.equal(registerRun.attempt.status, 'succeeded');
    assert.equal(updateRun.attempt.status, 'succeeded');
    assert.equal(listRun.attempt.status, 'succeeded');

    const attempts = await listAttempts(projectRoot, { flow: 'flow-experiment' });
    assert.equal(attempts.length, 3);

    const manifestPath = path.join(projectRoot, '.vibe-science-environment', 'experiments', 'manifests', 'EXP-001.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.status, 'blocked');
    assert.deepEqual(manifest.blockers, ['Missing control dataset']);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
