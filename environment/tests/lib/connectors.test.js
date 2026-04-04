import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeBundleManifest } from '../../lib/bundle-manifest.js';
import {
  ConnectorExportError,
  exportResultsBundle,
  exportWritingPack,
} from '../../connectors/filesystem-export.js';
import { getConnectorHealth, getConnectorHealthOverview } from '../../connectors/health.js';
import { exportMemoryMirror } from '../../connectors/obsidian-export.js';
import { getConnectorRegistry } from '../../connectors/registry.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('connector registry discovers built-in manifests and rejects overlapping workspace ownership', async () => {
  const projectRoot = await createFixtureProject('vre-connectors-registry-');

  try {
    await writeInstallState(projectRoot);

    const registry = await getConnectorRegistry(projectRoot);
    assert.equal(registry.runtimeInstalled, true);
    assert.deepEqual(
      registry.connectors.map((entry) => entry.connectorId),
      ['filesystem-export', 'obsidian-export'],
    );

    const duplicatePath = path.join(
      projectRoot,
      'environment',
      'connectors',
      'manifests',
      'filesystem-export-copy.connector.json',
    );
    const { manifestPath: _ignoredManifestPath, ...baseManifest } = registry.connectors[0];
    await writeFile(
      duplicatePath,
      `${JSON.stringify({
        ...baseManifest,
        connectorId: 'filesystem-export-copy',
      }, null, 2)}\n`,
      'utf8',
    );

    await assert.rejects(
      () => getConnectorRegistry(projectRoot),
      /Connector workspace path overlap/u,
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('filesystem connector exports results bundles and writing packs through derived artifacts only', async () => {
  const projectRoot = await createFixtureProject('vre-connectors-filesystem-');
  const targetDir = path.join(projectRoot, 'external-target');

  try {
    await writeInstallState(projectRoot);
    await seedResultsBundle(projectRoot, 'EXP-201');
    await seedAdvisorPack(projectRoot, '2026-04-04');

    const bundleExport = await exportResultsBundle(projectRoot, 'EXP-201', {
      targetDir,
      now: '2026-04-04T09:00:00Z',
    });
    const packExport = await exportWritingPack(projectRoot, {
      kind: 'advisor',
      packId: '2026-04-04',
      targetDir,
      now: '2026-04-04T09:01:00Z',
    });

    const copiedManifest = JSON.parse(
      await readFile(
        path.join(targetDir, 'results', 'experiments', 'EXP-201', 'bundle-manifest.json'),
        'utf8',
      ),
    );
    const copiedPackSummary = await readFile(
      path.join(targetDir, 'writing', 'advisor-packs', '2026-04-04', 'status-summary.md'),
      'utf8',
    );

    assert.equal(bundleExport.connectorId, 'filesystem-export');
    assert.equal(bundleExport.experimentId, 'EXP-201');
    assert.equal(packExport.packId, '2026-04-04');
    assert.equal(copiedManifest.experimentId, 'EXP-201');
    assert.match(copiedPackSummary, /Advisor Pack/u);

    const health = await getConnectorHealth(projectRoot, 'filesystem-export');
    assert.equal(health.healthStatus, 'ok');
    assert.equal(health.lastRunStatus, 'completed');
    assert.equal(health.totalRuns, 2);

    const overview = await getConnectorHealthOverview(projectRoot);
    const filesystem = overview.connectors.find((entry) => entry.connectorId === 'filesystem-export');
    assert.equal(filesystem.lastRunStatus, 'completed');
    assert.equal(filesystem.totalRuns, 2);
    assert.equal(filesystem.healthStatus, 'ok');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('filesystem connector records visible failure when the requested artifact does not exist', async () => {
  const projectRoot = await createFixtureProject('vre-connectors-failure-');
  const targetDir = path.join(projectRoot, 'external-target');

  try {
    await writeInstallState(projectRoot);

    await assert.rejects(
      () => exportResultsBundle(projectRoot, 'EXP-404', {
        targetDir,
        now: '2026-04-04T10:00:00Z',
      }),
      ConnectorExportError,
    );

    const health = await getConnectorHealth(projectRoot, 'filesystem-export');
    assert.equal(health.healthStatus, 'degraded');
    assert.equal(health.lastRunStatus, 'failed');
    assert.equal(health.totalRuns, 1);
    assert.match(health.failureMessage, /No packaged results bundle exists for EXP-404/u);

    const runLogPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'connectors',
      'filesystem-export',
      'run-log.jsonl',
    );
    const [failedRun] = (await readFile(runLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(failedRun.status, 'failed');
    assert.equal(failedRun.visibleFailure.failureKind, 'contract-error');
    assert.equal(failedRun.visibleFailure.surfacedInStatus, true);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('obsidian connector exports memory mirrors and tracks healthy connector state', async () => {
  const projectRoot = await createFixtureProject('vre-connectors-obsidian-');
  const vaultDir = path.join(projectRoot, 'obsidian-vault');

  try {
    await writeInstallState(projectRoot);
    const memoryFile = path.join(
      projectRoot,
      '.vibe-science-environment',
      'memory',
      'project-overview.md',
    );
    await mkdir(path.dirname(memoryFile), { recursive: true });
    await writeFile(memoryFile, '# Project Overview\n', 'utf8');

    const exported = await exportMemoryMirror(projectRoot, {
      mirrorKind: 'projectOverview',
      vaultDir,
      now: '2026-04-04T11:00:00Z',
    });

    const mirrored = await readFile(
      path.join(vaultDir, 'VRE', 'project-overview.md'),
      'utf8',
    );
    const health = await getConnectorHealth(projectRoot, 'obsidian-export');

    assert.equal(exported.connectorId, 'obsidian-export');
    assert.equal(exported.mirrorKind, 'projectOverview');
    assert.match(mirrored, /Project Overview/u);
    assert.equal(health.healthStatus, 'ok');
    assert.equal(health.lastRunStatus, 'completed');
    assert.equal(health.totalRuns, 1);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

async function writeInstallState(projectRoot) {
  const installStatePath = path.join(
    projectRoot,
    '.vibe-science-environment',
    '.install-state.json',
  );
  await mkdir(path.dirname(installStatePath), { recursive: true });
  await writeFile(
    installStatePath,
    `${JSON.stringify({
      schemaVersion: 'vibe-env.install.v1',
      installedAt: '2026-04-04T08:00:00Z',
      bundles: ['governance-core', 'control-plane', 'connectors-core'],
      bundleManifestVersion: '1.0.0',
      operations: [],
      source: {
        version: '0.1.0',
        commit: 'connectors-test',
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

async function seedResultsBundle(projectRoot, experimentId) {
  const bundleDir = path.join(
    projectRoot,
    '.vibe-science-environment',
    'results',
    'experiments',
    experimentId,
  );
  await mkdir(bundleDir, { recursive: true });
  await writeFile(path.join(bundleDir, 'analysis-report.md'), '# Analysis\n', 'utf8');

  await writeBundleManifest(
    path.join(bundleDir, 'bundle-manifest.json'),
    {
      experimentId,
      sourceAttemptId: 'ATT-2026-04-04-201',
      outputArtifacts: ['analysis-report.md'],
      relatedClaims: ['C-201'],
      datasetHash: 'sha256:exp-201',
    },
    {
      bundledAt: '2026-04-04T08:55:00Z',
      artifactMetadata: {
        'analysis-report.md': {
          type: 'report',
          role: 'analysis-report',
          createdAt: '2026-04-04T08:54:00Z',
        },
      },
    },
  );
}

async function seedAdvisorPack(projectRoot, packId) {
  const packDir = path.join(
    projectRoot,
    '.vibe-science-environment',
    'writing',
    'advisor-packs',
    packId,
  );
  await mkdir(packDir, { recursive: true });
  await writeFile(path.join(packDir, 'status-summary.md'), '# Advisor Pack\n', 'utf8');
}
