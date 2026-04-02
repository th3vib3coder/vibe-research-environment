import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { readFlowIndex } from '../../lib/flow-state.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

function buildExperiment(overrides = {}) {
  return {
    experimentId: 'EXP-001',
    title: 'Packaging test experiment',
    objective: 'Verify deterministic bundle packaging',
    status: 'planned',
    createdAt: '2026-04-02T12:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 17,
    },
    codeRef: {
      entrypoint: 'scripts/run_experiment.py',
      gitCommit: 'abc1234',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/volcano.png', 'tables/summary.csv'],
    relatedClaims: ['C-014'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}

test('packageExperimentResults writes a deterministic bundle and updates flow index', async () => {
  const projectRoot = await createFixtureProject('vre-results-flow-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-001',
    });
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await mkdir(path.join(projectRoot, 'tables'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'volcano.png'), 'png-data', 'utf8');
    await writeFile(path.join(projectRoot, 'tables', 'summary.csv'), 'gene,p\nA,0.01\n', 'utf8');

    const packaged = await packageExperimentResults(projectRoot, 'EXP-001', {
      now: '2026-04-02T12:30:00Z',
      datasetHash: 'sha256:bundle-001',
      findings: ['Batch correction changes the sign of the primary effect.'],
      statistics: ['Mean delta = -0.42; 95% CI [-0.55, -0.30]; Welch t-test p=0.003.'],
      environment: ['Python: 3.11.8', 'Key packages: scanpy 1.10.1', 'GPU: none'],
      comparisonQuestion: 'Batch corrected vs uncorrected baseline on the primary metric.',
      artifactMetadata: {
        'plots/volcano.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Show the main differential effect after packaging.',
          caption: 'Primary volcano plot for EXP-001.',
          interpretation: 'The effect remains directionally stable after correction.',
        },
        'tables/summary.csv': {
          type: 'table',
          role: 'summary-stats',
        },
      },
    });

    const bundleRoot = path.join(
      projectRoot,
      '.vibe-science-environment',
      'results',
      'experiments',
      'EXP-001',
    );
    const bundleManifest = JSON.parse(
      await readFile(path.join(bundleRoot, 'bundle-manifest.json'), 'utf8'),
    );
    const analysisReport = await readFile(path.join(bundleRoot, 'analysis-report.md'), 'utf8');
    const figureCatalog = await readFile(path.join(bundleRoot, 'figure-catalog.md'), 'utf8');

    assert.equal(packaged.experimentId, 'EXP-001');
    assert.deepEqual(packaged.warnings, []);
    assert.equal(bundleManifest.sourceAttemptId, 'ATT-2026-04-02-001');
    assert.equal(bundleManifest.datasetHash, 'sha256:bundle-001');
    assert.ok(bundleManifest.artifacts.some((entry) => entry.path === 'analysis-report.md'));
    assert.ok(bundleManifest.artifacts.some((entry) => entry.path === 'figures/plots/volcano.png'));
    assert.ok(bundleManifest.artifacts.some((entry) => entry.path === 'tables/summary.csv'));
    assert.match(analysisReport, /Batch correction changes the sign/u);
    assert.match(figureCatalog, /Primary volcano plot for EXP-001/u);

    const flowIndex = await readFlowIndex(projectRoot);
    assert.equal(flowIndex.activeFlow, 'results');
    assert.equal(flowIndex.currentStage, 'result-packaging');
    assert.equal(flowIndex.lastCommand, '/flow-results');
    assert.ok(flowIndex.nextActions.includes('review packaged bundle for EXP-001'));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('packageExperimentResults fails honestly when the experiment is not completed or metadata is missing', async () => {
  const projectRoot = await createFixtureProject('vre-results-flow-fail-');

  try {
    await registerExperiment(projectRoot, buildExperiment({
      experimentId: 'EXP-002',
      outputArtifacts: ['plots/volcano.png'],
    }));

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'volcano.png'), 'png-data', 'utf8');

    await assert.rejects(
      () => packageExperimentResults(projectRoot, 'EXP-002'),
      /requires a completed manifest/u,
    );

    await updateExperiment(projectRoot, 'EXP-002', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-002',
    });
    await updateExperiment(projectRoot, 'EXP-002', {
      status: 'completed',
    });

    await assert.rejects(
      () => packageExperimentResults(projectRoot, 'EXP-002', {
        now: '2026-04-02T12:45:00Z',
      }),
      /missing typed packaging metadata/u,
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
