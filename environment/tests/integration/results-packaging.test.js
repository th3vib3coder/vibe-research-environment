import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';

function buildExperiment() {
  return {
    experimentId: 'EXP-003',
    title: 'Middleware packaging experiment',
    objective: 'Verify results packaging through middleware',
    status: 'planned',
    createdAt: '2026-04-02T13:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 42,
    },
    codeRef: {
      entrypoint: 'scripts/run_packaging.py',
      gitCommit: 'def5678',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/heatmap.png'],
    relatedClaims: ['C-020'],
    blockers: [],
    notes: '',
  };
}

test('results packaging can run through middleware and publish a results-focused snapshot', async () => {
  const projectRoot = await createFixtureProject('vre-int-results-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-003', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-010',
    });
    await updateExperiment(projectRoot, 'EXP-003', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'heatmap.png'), 'png-data', 'utf8');

    const result = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-results',
      scope: 'flow-results',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => {
        const packaged = await packageExperimentResults(projectRoot, 'EXP-003', {
          now: '2026-04-02T13:15:00Z',
          datasetHash: 'sha256:bundle-003',
          artifactMetadata: {
            'plots/heatmap.png': {
              type: 'figure',
              role: 'supporting-figure',
              purpose: 'Show cluster-level stability.',
              caption: 'Heatmap for EXP-003.',
              interpretation: 'Signal remains localized to the expected cluster.',
            },
          },
        });

        return {
          summary: 'results packaged',
          payload: {
            experimentId: packaged.experimentId,
            warnings: packaged.warnings,
          },
        };
      },
    });

    assert.equal(result.attempt.status, 'succeeded');
    assert.equal(result.snapshot.activeFlow, 'results');
    assert.equal(result.snapshot.currentStage, 'result-packaging');
    assert.equal(result.snapshot.lastCommand, '/flow-results');
    assert.equal(result.snapshot.kernel.dbAvailable, false);

    const bundleManifest = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'results',
          'experiments',
          'EXP-003',
          'bundle-manifest.json',
        ),
        'utf8',
      ),
    );

    assert.equal(bundleManifest.sourceAttemptId, 'ATT-2026-04-02-010');
    assert.ok(bundleManifest.artifacts.some((entry) => entry.path === 'figures/plots/heatmap.png'));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
