import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { getResultsOverview } from '../../flows/results-discovery.js';
import { packageExperimentResults } from '../../flows/results.js';
import { exportSessionDigest } from '../../flows/session-digest.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

function buildExperiment(overrides = {}) {
  return {
    experimentId: 'EXP-001',
    title: 'Results discovery experiment',
    objective: 'Verify packaged bundles stay discoverable from read-only surfaces',
    status: 'planned',
    createdAt: '2026-04-02T14:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 11,
    },
    codeRef: {
      entrypoint: 'scripts/run_results_discovery.py',
      gitCommit: '1234abc',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/discovery.png'],
    relatedClaims: ['C-014'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}

test('getResultsOverview returns empty state without creating workspace directories', async () => {
  const projectRoot = await createFixtureProject('vre-results-discovery-empty-');

  try {
    const overview = await getResultsOverview(projectRoot);

    assert.equal(overview.totalBundles, 0);
    assert.equal(overview.totalSessionDigests, 0);
    assert.deepEqual(overview.bundles, []);
    assert.deepEqual(overview.sessionDigests, []);
    assert.deepEqual(overview.warnings, []);
    await assert.rejects(
      () => readdir(path.join(projectRoot, '.vibe-science-environment')),
      /ENOENT/u,
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('getResultsOverview discovers packaged bundles and latest digest pointers', async () => {
  const projectRoot = await createFixtureProject('vre-results-discovery-happy-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-020',
    });
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'discovery.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-001', {
      now: '2026-04-02T14:15:00Z',
      datasetHash: 'sha256:bundle-discovery-001',
      artifactMetadata: {
        'plots/discovery.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Show the discovery artifact in the packaged bundle.',
          caption: 'Discovery figure for EXP-001.',
          interpretation: 'The packaged output remains findable through read-only surfaces.',
        },
      },
    });

    await exportSessionDigest(projectRoot, {
      sourceSessionId: 'session-2026-04-02-discovery',
      now: '2026-04-02T14:20:00Z',
      experimentIds: ['EXP-001'],
      attemptIds: ['ATT-2026-04-02-020'],
    });

    const overview = await getResultsOverview(projectRoot, {
      experimentIds: ['EXP-001'],
      bundleLimit: 5,
      digestLimit: 5,
    });

    assert.equal(overview.totalBundles, 1);
    assert.equal(overview.totalSessionDigests, 1);
    assert.equal(overview.bundles[0].experimentId, 'EXP-001');
    assert.equal(
      overview.bundles[0].bundleManifestPath,
      '.vibe-science-environment/results/experiments/EXP-001/bundle-manifest.json',
    );
    assert.equal(
      overview.bundles[0].latestSessionDigest?.markdownPath,
      '.vibe-science-environment/results/summaries/DIGEST-session-2026-04-02-discovery/session-digest.md',
    );
    assert.deepEqual(overview.bundles[0].relatedClaims, ['C-014']);
    assert.equal(overview.sessionDigests[0].digestId, 'DIGEST-session-2026-04-02-discovery');
    assert.deepEqual(overview.warnings, []);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('getResultsOverview warns and skips corrupted result artifacts instead of fabricating discoverability', async () => {
  const projectRoot = await createFixtureProject('vre-results-discovery-corrupt-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-021',
    });
    await updateExperiment(projectRoot, 'EXP-001', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'discovery.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-001', {
      now: '2026-04-02T14:30:00Z',
      datasetHash: 'sha256:bundle-discovery-002',
      artifactMetadata: {
        'plots/discovery.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Corrupt the bundle after packaging.',
          caption: 'Corrupt bundle figure.',
          interpretation: 'Used only to verify degraded discoverability.',
        },
      },
    });

    await exportSessionDigest(projectRoot, {
      sourceSessionId: 'session-2026-04-02-corrupt',
      now: '2026-04-02T14:35:00Z',
      experimentIds: ['EXP-001'],
      attemptIds: ['ATT-2026-04-02-021'],
    });

    await writeFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'results',
        'experiments',
        'EXP-001',
        'bundle-manifest.json',
      ),
      '{invalid-json',
      'utf8',
    );
    await writeFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'results',
        'summaries',
        'DIGEST-session-2026-04-02-corrupt',
        'session-digest.json',
      ),
      '{invalid-json',
      'utf8',
    );

    const overview = await getResultsOverview(projectRoot);

    assert.equal(overview.totalBundles, 0);
    assert.equal(overview.totalSessionDigests, 0);
    assert.deepEqual(overview.bundles, []);
    assert.deepEqual(overview.sessionDigests, []);
    assert.equal(overview.warnings.length, 2);
    assert.match(overview.warnings.join('\n'), /Unable to read session digest/u);
    assert.match(overview.warnings.join('\n'), /Unable to read result bundle/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
