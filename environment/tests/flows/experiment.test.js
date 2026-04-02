import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readFlowIndex, readFlowState } from '../../lib/flow-state.js';
import { readManifest } from '../../lib/manifest.js';
import {
  listExperiments,
  registerExperiment,
  surfaceBlockers,
  updateExperiment
} from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function createFixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-experiment-flow-'));
  await mkdir(path.join(root, 'environment'), { recursive: true });
  await cp(path.join(repoRoot, 'environment', 'templates'), path.join(root, 'environment', 'templates'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'environment', 'schemas'), path.join(root, 'environment', 'schemas'), {
    recursive: true
  });
  return root;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function listFiles(root) {
  const files = [];

  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else {
        files.push(relativePath.split(path.sep).join('/'));
      }
    }
  }

  await walk(root);
  return files.sort();
}

function baseExperiment(overrides = {}) {
  return {
    experimentId: 'EXP-001',
    title: 'Batch correction ablation',
    objective: 'Measure whether removing batch correction changes sign of claim C-014',
    status: 'planned',
    createdAt: '2026-03-30T09:45:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2
    },
    latestAttemptId: null,
    parameters: {
      batchCorrection: false,
      seed: 17
    },
    codeRef: {
      entrypoint: 'scripts/run_ablation.py',
      gitCommit: 'abc1234'
    },
    inputArtifacts: ['data/processed/matrix.h5ad'],
    outputArtifacts: [],
    relatedClaims: ['C-014'],
    blockers: [],
    notes: '',
    ...overrides
  };
}

test('register and update keep manifest lifecycle synced with summary index', async () => {
  const projectRoot = await createFixtureProject();

  const created = await registerExperiment(projectRoot, baseExperiment());
  const stored = await readManifest(projectRoot, 'EXP-001');

  assert.deepStrictEqual(created.manifest, stored);
  assert.equal(created.manifest.status, 'planned');

  const plannedSummary = await readFlowState(projectRoot, 'experiment');
  assert.deepStrictEqual(plannedSummary.experiments, [
    {
      id: 'EXP-001',
      title: 'Batch correction ablation',
      status: 'planned',
      createdAt: '2026-03-30T09:45:00Z',
      latestAttemptId: null,
      relatedClaims: ['C-014'],
      outputArtifacts: [],
      blockers: []
    }
  ]);

  const activated = await updateExperiment(projectRoot, 'EXP-001', {
    status: 'active',
    latestAttemptId: 'ATT-2026-03-30-001'
  });

  assert.equal(activated.manifest.status, 'active');
  assert.equal(activated.manifest.latestAttemptId, 'ATT-2026-03-30-001');

  const activeSummary = await readFlowState(projectRoot, 'experiment');
  assert.deepStrictEqual(activeSummary.experiments, [
    {
      id: 'EXP-001',
      title: 'Batch correction ablation',
      status: 'active',
      createdAt: '2026-03-30T09:45:00Z',
      latestAttemptId: 'ATT-2026-03-30-001',
      relatedClaims: ['C-014'],
      outputArtifacts: [],
      blockers: []
    }
  ]);

  const blocked = await updateExperiment(projectRoot, 'EXP-001', {
    status: 'blocked',
    blockers: ['Missing negative control dataset', 'Kernel gate check stale']
  });

  assert.equal(blocked.manifest.status, 'blocked');

  const updatedSummary = await readFlowState(projectRoot, 'experiment');
  assert.deepStrictEqual(updatedSummary.experiments, [
    {
      id: 'EXP-001',
      title: 'Batch correction ablation',
      status: 'blocked',
      createdAt: '2026-03-30T09:45:00Z',
      latestAttemptId: 'ATT-2026-03-30-001',
      relatedClaims: ['C-014'],
      outputArtifacts: [],
      blockers: ['Missing negative control dataset', 'Kernel gate check stale']
    }
  ]);

  const summaryKeys = Object.keys(updatedSummary.experiments[0]).sort();
  assert.deepStrictEqual(summaryKeys, [
    'blockers',
    'createdAt',
    'id',
    'latestAttemptId',
    'outputArtifacts',
    'relatedClaims',
    'status',
    'title'
  ]);
  assert.equal(typeof updatedSummary.updatedAt, 'string');
  assert.ok(updatedSummary.updatedAt.length > 0);

  const flowIndex = await readFlowIndex(projectRoot);
  assert.equal(flowIndex.activeFlow, 'experiment');
  assert.equal(flowIndex.lastCommand, '/flow-experiment --update');
  assert.equal(flowIndex.currentStage, 'experiment-blocked');
  assert.deepEqual(flowIndex.nextActions, ['resolve blockers for EXP-001']);
  assert.deepEqual(flowIndex.blockers, [
    'EXP-001: Missing negative control dataset',
    'EXP-001: Kernel gate check stale'
  ]);
});

test('listExperiments filters by claim without touching control-plane records', async () => {
  const projectRoot = await createFixtureProject();

  await registerExperiment(projectRoot, baseExperiment());
  await registerExperiment(projectRoot, baseExperiment({
    experimentId: 'EXP-002',
    title: 'Alternative baseline',
    relatedClaims: ['C-999'],
    createdAt: '2026-03-30T10:00:00Z',
    codeRef: {
      entrypoint: 'scripts/run_alt.py',
      gitCommit: 'def5678'
    }
  }));

  const filtered = await listExperiments(projectRoot, { claimId: 'C-014' });
  assert.deepStrictEqual(filtered.experiments, [
    {
      id: 'EXP-001',
      title: 'Batch correction ablation',
      status: 'planned',
      createdAt: '2026-03-30T09:45:00Z',
      latestAttemptId: null,
      relatedClaims: ['C-014'],
      outputArtifacts: [],
      blockers: []
    }
  ]);

  const rootEntries = await readdir(path.join(projectRoot, '.vibe-science-environment'), {
    withFileTypes: true
  });
  assert.equal(rootEntries.some((entry) => entry.name === 'control'), false);

  const flowIndex = await readFlowIndex(projectRoot);
  assert.equal(flowIndex.lastCommand, '/flow-experiment');
  assert.equal(flowIndex.currentStage, 'experiment-planning');
});

test('surfaceBlockers returns explicit blocker reasons', async () => {
  const projectRoot = await createFixtureProject();

  await registerExperiment(projectRoot, baseExperiment());
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'active',
    latestAttemptId: 'ATT-2026-03-30-001'
  });
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'blocked',
    blockers: ['Missing negative control dataset']
  });

  const blockers = await surfaceBlockers(projectRoot, {
    unresolvedClaims: [{ claimId: 'C-014' }],
    gateChecks: [{ experimentId: 'EXP-001', status: 'FAIL', message: 'Recent gate check failed' }]
  });
  assert.deepStrictEqual(blockers.blockers, [
    {
      id: 'EXP-001',
      title: 'Batch correction ablation',
      status: 'blocked',
      createdAt: '2026-03-30T09:45:00Z',
      latestAttemptId: 'ATT-2026-03-30-001',
      relatedClaims: ['C-014'],
      outputArtifacts: [],
      blockers: ['Missing negative control dataset']
    }
  ]);
  assert.deepStrictEqual(blockers.blockerMessages, [
    'EXP-001: Missing negative control dataset',
    'EXP-001: linked claim C-014 is unresolved',
    'EXP-001: Recent gate check failed'
  ]);

  const flowIndex = await readFlowIndex(projectRoot);
  assert.equal(flowIndex.lastCommand, '/flow-experiment --blockers');
  assert.equal(flowIndex.currentStage, 'experiment-blocked');
});

test('listExperiments surfaces packaged bundle paths without rewriting manifest-backed claims', async () => {
  const projectRoot = await createFixtureProject();

  await registerExperiment(projectRoot, baseExperiment({
    outputArtifacts: ['plots/volcano.png']
  }));
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'active',
    latestAttemptId: 'ATT-2026-03-30-009'
  });
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'completed'
  });

  await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
  await writeFile(path.join(projectRoot, 'plots', 'volcano.png'), 'png-data', 'utf8');

  await packageExperimentResults(projectRoot, 'EXP-001', {
    now: '2026-03-30T11:00:00Z',
    datasetHash: 'sha256:bundle-exp-001',
    artifactMetadata: {
      'plots/volcano.png': {
        type: 'figure',
        role: 'main-result',
        purpose: 'Show the packaged primary effect.',
        caption: 'Volcano plot for EXP-001.',
        interpretation: 'The primary signal remains stable after packaging.'
      }
    }
  });

  const listed = await listExperiments(projectRoot, { claimId: 'C-014' });

  assert.equal(listed.experiments.length, 1);
  assert.deepEqual(listed.experiments[0].relatedClaims, ['C-014']);
  assert.deepEqual(listed.experiments[0].blockers, []);
  assert.deepEqual(listed.experiments[0].resultBundle, {
    hasBundle: true,
    experimentId: 'EXP-001',
    manifestPath: '.vibe-science-environment/experiments/manifests/EXP-001.json',
    bundleDir: '.vibe-science-environment/results/experiments/EXP-001',
    bundleManifestPath: '.vibe-science-environment/results/experiments/EXP-001/bundle-manifest.json',
    bundledAt: '2026-03-30T11:00:00Z',
    sourceAttemptId: 'ATT-2026-03-30-009',
    relatedClaims: ['C-014'],
    datasetHash: 'sha256:bundle-exp-001',
    artifactCount: 4,
    analysisReportPath: '.vibe-science-environment/results/experiments/EXP-001/analysis-report.md',
    statsAppendixPath: '.vibe-science-environment/results/experiments/EXP-001/stats-appendix.md',
    figureCatalogPath: '.vibe-science-environment/results/experiments/EXP-001/figure-catalog.md',
    latestSessionDigest: null
  });
});

test('helper operations keep the control-plane empty', async () => {
  const projectRoot = await createFixtureProject();

  await registerExperiment(projectRoot, baseExperiment());
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'active',
    latestAttemptId: 'ATT-2026-03-30-001'
  });
  await updateExperiment(projectRoot, 'EXP-001', {
    status: 'blocked',
    blockers: ['Missing negative control dataset']
  });
  await listExperiments(projectRoot, { claimId: 'C-014' });
  await surfaceBlockers(projectRoot);

  const rootEntries = await readdir(path.join(projectRoot, '.vibe-science-environment'), {
    withFileTypes: true
  });
  assert.equal(rootEntries.some((entry) => entry.name === 'control'), false);

  const files = await listFiles(path.join(projectRoot, '.vibe-science-environment'));
  assert.deepStrictEqual(files, [
    'experiments/manifests/EXP-001.json',
    'flows/experiment.json',
    'flows/index.json'
  ]);
});

test('schema-valid manifest file is created without hidden side effects', async () => {
  const projectRoot = await createFixtureProject();

  await registerExperiment(projectRoot, baseExperiment());
  const manifest = await readJson(
    path.join(projectRoot, '.vibe-science-environment', 'experiments', 'manifests', 'EXP-001.json')
  );

  assert.equal(manifest.schemaVersion, 'vibe.experiment.manifest.v1');
  assert.equal(manifest.experimentId, 'EXP-001');
  assert.equal(manifest.status, 'planned');
  assert.equal(manifest.latestAttemptId, null);
  assert.equal(manifest.blockers.length, 0);
});
