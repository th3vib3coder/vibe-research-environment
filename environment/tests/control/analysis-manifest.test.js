import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createManifest } from '../../lib/manifest.js';
import { activateObjective } from '../../objectives/store.js';
import { bindExperimentManifestToObjective } from '../../orchestrator/experiment-binding.js';
import {
  readAndValidateAnalysisManifest,
  validateAnalysisManifest
} from '../../orchestrator/analysis-manifest.js';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9'
);

async function readFixture(section, fileName) {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, section, fileName), 'utf8'));
}

async function writeProjectFile(projectRoot, repoRelativePath, contents = '') {
  const absolutePath = path.join(projectRoot, repoRelativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
  return absolutePath;
}

async function activateFixtureObjective(projectRoot, overrides = {}) {
  const objectiveRecord = await readFixture('objective', 'valid-active.json');
  const merged = {
    ...objectiveRecord,
    ...overrides,
    artifactsIndex: {
      ...objectiveRecord.artifactsIndex,
      ...(overrides.artifactsIndex ?? {})
    }
  };

  await activateObjective(projectRoot, merged, {
    sessionId: 'sess-wave3-analysis'
  });

  return merged;
}

test('readAndValidateAnalysisManifest accepts a safe manifest without executing the script', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-analysis-manifest-safe-'));
  try {
    const manifest = await readFixture('analysis-manifest', 'valid-python.json');
    await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: []
      }
    });
    await createManifest(projectRoot, {
      experimentId: manifest.experimentId,
      title: 'Wave 3 safe analysis',
      objective: manifest.objectiveId
    });
    await bindExperimentManifestToObjective(projectRoot, manifest.objectiveId, manifest.experimentId, {
      updatedAt: '2026-04-23T12:00:00Z'
    });
    await writeProjectFile(projectRoot, manifest.script.path, '# safe python script\n');
    await writeProjectFile(projectRoot, manifest.inputs[0].path, 'dataset\n');
    const manifestPath = path.join('analysis', 'manifests', 'valid-python.json');
    await writeProjectFile(projectRoot, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await readAndValidateAnalysisManifest(projectRoot, manifestPath);

    assert.equal(result.manifest.analysisId, manifest.analysisId);
    assert.equal(result.objectiveRecord.objectiveId, manifest.objectiveId);
    assert.equal(result.activePointer.objectiveId, manifest.objectiveId);
    assert.equal(result.experimentManifest.experimentId, manifest.experimentId);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateAnalysisManifest accepts same-transaction experiment registration without an existing experiment manifest', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-analysis-manifest-register-'));
  try {
    const manifest = await readFixture('analysis-manifest', 'valid-notebook.json');
    await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: []
      }
    });
    await writeProjectFile(projectRoot, manifest.script.path, '{}\n');
    await writeProjectFile(projectRoot, manifest.experimentRegistration.registerInputPath, '{}\n');

    const result = await validateAnalysisManifest(projectRoot, manifest);

    assert.equal(result.manifest.analysisId, manifest.analysisId);
    assert.equal(result.experimentManifest, null);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateAnalysisManifest rejects a manifest whose experiment manifest does not exist', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-analysis-manifest-missing-exp-'));
  try {
    const manifest = await readFixture('analysis-manifest', 'invalid-nonexistent-experiment-manifest.json');
    await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: [manifest.experimentId]
      }
    });
    await writeProjectFile(projectRoot, manifest.script.path, '# safe python script\n');

    await assert.rejects(
      validateAnalysisManifest(projectRoot, manifest),
      /does not reference an existing experiment manifest/
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateAnalysisManifest rejects destructive or tree-wide manifests without human approval', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-analysis-manifest-approval-'));
  try {
    const manifest = await readFixture('analysis-manifest', 'invalid-destructive-without-approval.json');
    await activateFixtureObjective(projectRoot);
    await createManifest(projectRoot, {
      experimentId: manifest.experimentId,
      title: 'Dangerous analysis',
      objective: manifest.objectiveId
    });
    await writeProjectFile(projectRoot, manifest.script.path, '# dangerous script\n');

    await assert.rejects(
      validateAnalysisManifest(projectRoot, manifest),
      /Invalid phase9 analysis manifest|requires explicit human approval/
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
