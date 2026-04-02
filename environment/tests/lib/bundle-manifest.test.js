import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBundleManifest,
  BundleManifestValidationError,
  writeBundleManifest,
} from '../../lib/bundle-manifest.js';

const REPORT_CREATED_AT = '2026-04-02T09:00:00Z';
const FIGURE_CREATED_AT = '2026-04-02T09:05:00Z';

test('bundle manifest helper normalizes string artifacts through explicit metadata and writes atomically', async () => {
  const projectPath = await createTempProject();

  try {
    const manifest = await buildBundleManifest(
      {
        experimentId: 'EXP-001',
        sourceAttemptId: 'ATT-2026-04-02-001',
        outputArtifacts: [
          'analysis-report.md',
          'figures\\fig-01-volcano.png',
        ],
        relatedClaims: ['C-001'],
        datasetHash: 'sha256:bundle-001',
      },
      {
        bundledAt: '2026-04-02T09:10:00Z',
        artifactMetadata: {
          'analysis-report.md': {
            type: 'report',
            role: 'analysis-report',
            createdAt: REPORT_CREATED_AT,
          },
          'figures/fig-01-volcano.png': {
            type: 'figure',
            role: 'main-result',
            createdAt: FIGURE_CREATED_AT,
            size: 145000,
          },
        },
      },
    );

    assert.equal(manifest.schemaVersion, 'vibe-env.experiment-bundle.v1');
    assert.equal(manifest.artifacts[0].path, 'analysis-report.md');
    assert.equal(manifest.artifacts[1].path, 'figures/fig-01-volcano.png');
    assert.equal(manifest.artifacts[1].size, 145000);

    const manifestPath = path.join(projectPath, 'bundle-manifest.json');
    const written = await writeBundleManifest(
      manifestPath,
      {
        experimentId: 'EXP-001',
        sourceAttemptId: 'ATT-2026-04-02-001',
        outputArtifacts: ['analysis-report.md'],
        relatedClaims: ['C-001'],
        datasetHash: 'sha256:bundle-001',
      },
      {
        bundledAt: '2026-04-02T09:10:00Z',
        artifactMetadata: {
          'analysis-report.md': {
            type: 'report',
            role: 'analysis-report',
            createdAt: REPORT_CREATED_AT,
          },
        },
      },
    );

    const persisted = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.deepEqual(persisted, written);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('bundle manifest helper rejects raw string artifacts without explicit metadata', async () => {
  await assert.rejects(
    () => buildBundleManifest({
      experimentId: 'EXP-002',
      sourceAttemptId: 'ATT-2026-04-02-002',
      outputArtifacts: ['stats-appendix.md'],
      relatedClaims: ['C-002'],
      datasetHash: 'sha256:bundle-002',
    }),
    (error) =>
      error instanceof BundleManifestValidationError &&
      /missing a valid type/u.test(error.message),
  );
});

test('bundle manifest helper rejects invalid attempt ids and unsafe artifact paths', async () => {
  await assert.rejects(
    () => buildBundleManifest({
      experimentId: 'EXP-003',
      sourceAttemptId: null,
      artifacts: [
        {
          path: 'analysis-report.md',
          type: 'report',
          role: 'analysis-report',
          createdAt: REPORT_CREATED_AT,
        },
      ],
      relatedClaims: ['C-003'],
      datasetHash: 'sha256:bundle-003',
    }),
    BundleManifestValidationError,
  );

  await assert.rejects(
    () => buildBundleManifest({
      experimentId: 'EXP-003',
      sourceAttemptId: 'ATT-2026-04-02-003',
      artifacts: [
        {
          path: '../outside.md',
          type: 'report',
          role: 'analysis-report',
          createdAt: REPORT_CREATED_AT,
        },
      ],
      relatedClaims: ['C-003'],
      datasetHash: 'sha256:bundle-003',
    }),
    (error) =>
      error instanceof BundleManifestValidationError &&
      /unsupported segments/u.test(error.message),
  );
});

test('bundle manifest helper can fill createdAt from an explicit default without guessing type or role', async () => {
  const manifest = await buildBundleManifest(
    {
      experimentId: 'EXP-004',
      sourceAttemptId: 'ATT-2026-04-02-004',
      artifacts: [
        {
          path: 'stats-appendix.md',
          type: 'report',
          role: 'stats-appendix',
        },
      ],
      relatedClaims: ['C-004'],
      datasetHash: 'sha256:bundle-004',
    },
    {
      bundledAt: '2026-04-02T09:20:00Z',
      defaultArtifactCreatedAt: '2026-04-02T09:18:00Z',
    },
  );

  assert.equal(manifest.artifacts[0].createdAt, '2026-04-02T09:18:00Z');
});

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-bundle-manifest-test-'));
}
