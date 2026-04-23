import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { activateObjective, readObjectiveRecord } from '../../objectives/store.js';
import {
  bindExperimentManifestToObjective,
  readExistingExperimentManifest
} from '../../orchestrator/experiment-binding.js';

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

async function writeProjectJson(projectRoot, repoRelativePath, value) {
  const absolutePath = path.join(projectRoot, repoRelativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    sessionId: 'sess-wave3-binding'
  });

  return merged;
}

async function seedLegacyExperimentManifest(projectRoot) {
  const manifest = await readFixture('experiment-binding', 'legacy-vre-experiment-manifest.json');
  await writeProjectJson(
    projectRoot,
    path.join(
      '.vibe-science-environment',
      'experiments',
      'manifests',
      `${manifest.experimentId}.json`
    ),
    manifest
  );
  return manifest;
}

test('readExistingExperimentManifest discovers a legacy VRE experiment manifest fixture', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-experiment-binding-discover-'));
  try {
    const manifest = await seedLegacyExperimentManifest(projectRoot);

    const discovered = await readExistingExperimentManifest(projectRoot, manifest.experimentId);

    assert.deepEqual(discovered, manifest);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('bindExperimentManifestToObjective appends the experiment id into objective.artifactsIndex.experiments', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-experiment-binding-bind-'));
  try {
    const manifest = await seedLegacyExperimentManifest(projectRoot);
    const objectiveRecord = await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: []
      }
    });

    const result = await bindExperimentManifestToObjective(
      projectRoot,
      objectiveRecord.objectiveId,
      manifest.experimentId,
      {
        updatedAt: '2026-04-23T12:05:00Z'
      }
    );
    const persistedObjective = await readObjectiveRecord(projectRoot, objectiveRecord.objectiveId);

    assert.equal(result.createdBinding, true);
    assert.equal(result.experimentManifest.experimentId, manifest.experimentId);
    assert.deepEqual(persistedObjective.artifactsIndex.experiments, [manifest.experimentId]);
    assert.equal(persistedObjective.lastUpdatedAt, '2026-04-23T12:05:00Z');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('bindExperimentManifestToObjective rejects an invalid EXP id before mutating the objective store', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-experiment-binding-invalid-'));
  try {
    const objectiveRecord = await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: []
      }
    });

    await assert.rejects(
      bindExperimentManifestToObjective(projectRoot, objectiveRecord.objectiveId, 'EXP-01A'),
      /matching EXP-XXX/
    );

    const persistedObjective = await readObjectiveRecord(projectRoot, objectiveRecord.objectiveId);
    assert.deepEqual(persistedObjective.artifactsIndex.experiments, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('bindExperimentManifestToObjective preserves both bindings when two concurrent bind calls race on the same objective', async () => {
  // Without the per-objective record lock in writeObjectiveArtifactsIndex,
  // this test is expected to fail because the two concurrent bind calls
  // would both read the same baseline (experiments: []) and the last
  // writer would silently overwrite the first. With the Round 56 lock in
  // place, both bindings must land and Promise.all(...) must succeed.
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-experiment-binding-concurrent-'));
  try {
    const objectiveRecord = await activateFixtureObjective(projectRoot, {
      artifactsIndex: {
        experiments: []
      }
    });
    const legacyManifest = await seedLegacyExperimentManifest(projectRoot);

    const secondManifest = {
      ...legacyManifest,
      experimentId: 'EXP-002',
      title: 'Second legacy experiment for concurrency test'
    };
    await writeProjectJson(
      projectRoot,
      path.join(
        '.vibe-science-environment',
        'experiments',
        'manifests',
        `${secondManifest.experimentId}.json`
      ),
      secondManifest
    );

    const [firstResult, secondResult] = await Promise.all([
      bindExperimentManifestToObjective(
        projectRoot,
        objectiveRecord.objectiveId,
        legacyManifest.experimentId,
        { updatedAt: '2026-04-23T16:30:00Z' }
      ),
      bindExperimentManifestToObjective(
        projectRoot,
        objectiveRecord.objectiveId,
        secondManifest.experimentId,
        { updatedAt: '2026-04-23T16:30:05Z' }
      )
    ]);

    assert.equal(firstResult.createdBinding, true);
    assert.equal(secondResult.createdBinding, true);

    const persistedObjective = await readObjectiveRecord(projectRoot, objectiveRecord.objectiveId);
    const persistedIds = [...persistedObjective.artifactsIndex.experiments].sort();
    assert.deepEqual(persistedIds, [legacyManifest.experimentId, secondManifest.experimentId].sort());
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
