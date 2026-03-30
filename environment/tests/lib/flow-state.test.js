import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  readFlowIndex,
  readFlowState,
  writeFlowIndex,
  writeFlowState
} from '../../lib/flow-state.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function createFixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-flow-state-'));
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

test('bootstrap and read behavior comes from templates', async () => {
  const projectRoot = await createFixtureProject();

  const index = await readFlowIndex(projectRoot);
  const literature = await readFlowState(projectRoot, 'literature');

  await assert.deepStrictEqual(
    index,
    await readJson(path.join(projectRoot, 'environment', 'templates', 'flow-index.v1.json'))
  );
  await assert.deepStrictEqual(
    literature,
    await readJson(path.join(projectRoot, 'environment', 'templates', 'literature-flow-state.v1.json'))
  );

  await assert.deepStrictEqual(
    await readJson(path.join(projectRoot, '.vibe-science-environment', 'flows', 'index.json')),
    index
  );
  await assert.deepStrictEqual(
    await readJson(path.join(projectRoot, '.vibe-science-environment', 'flows', 'literature.json')),
    literature
  );
});

test('successful write/read roundtrip stays in flows and validates', async () => {
  const projectRoot = await createFixtureProject();

  const index = {
    schemaVersion: 'vibe.flow.index.v1',
    activeFlow: 'experiment',
    currentStage: 'triage',
    nextActions: ['review experiment 3'],
    blockers: ['missing control dataset'],
    lastCommand: '/flow-experiment',
    updatedAt: '2026-03-30T10:00:00Z'
  };

  const literature = {
    papers: [
      {
        id: 'LIT-001',
        doi: '10.1234/example',
        title: 'Example paper',
        authors: ['Author A'],
        year: 2026,
        relevance: 'supports claim C-001',
        linkedClaims: ['C-001'],
        methodologyConflicts: [],
        registeredAt: '2026-03-30T10:00:00Z'
      }
    ],
    gaps: [],
    updatedAt: '2026-03-30T10:01:00Z'
  };

  const experiment = {
    experiments: [
      {
        id: 'EXP-001',
        title: 'Example experiment',
        status: 'planned',
        createdAt: '2026-03-30T10:00:00Z',
        latestAttemptId: null,
        relatedClaims: ['C-001'],
        outputArtifacts: [],
        blockers: [],
        updatedAt: '2026-03-30T10:00:00Z'
      }
    ],
    updatedAt: '2026-03-30T10:00:00Z'
  };

  await writeFlowIndex(projectRoot, index);
  await writeFlowState(projectRoot, 'literature', literature);
  await writeFlowState(projectRoot, 'experiment', experiment);

  await assert.deepStrictEqual(await readFlowIndex(projectRoot), index);
  await assert.deepStrictEqual(await readFlowState(projectRoot, 'literature'), literature);
  await assert.deepStrictEqual(await readFlowState(projectRoot, 'experiment'), experiment);
});

test('invalid write rejection fails closed', async () => {
  const projectRoot = await createFixtureProject();

  await assert.rejects(
    () =>
      writeFlowIndex(projectRoot, {
        schemaVersion: 'vibe.flow.index.v1',
        activeFlow: null,
        currentStage: null,
        nextActions: [],
        blockers: [],
        lastCommand: null
      }),
    /Invalid flow index/
  );

  await assert.rejects(
    () =>
      writeFlowState(projectRoot, 'experiment', {
        experiments: []
      }),
    /Invalid experiment flow state/
  );
});

test('unsupported flow names are rejected', async () => {
  const projectRoot = await createFixtureProject();

  await assert.rejects(() => readFlowState(projectRoot, 'results'), /Unsupported flow name/);
  await assert.rejects(() => writeFlowState(projectRoot, 'writing', {}), /Unsupported flow name/);
});

test('writes stay under .vibe-science-environment/flows only', async () => {
  const projectRoot = await createFixtureProject();

  await writeFlowIndex(projectRoot, {
    schemaVersion: 'vibe.flow.index.v1',
    activeFlow: null,
    currentStage: null,
    nextActions: [],
    blockers: [],
    lastCommand: null,
    updatedAt: '2026-03-30T10:00:00Z'
  });

  await writeFlowState(projectRoot, 'literature', {
    papers: [],
    gaps: [],
    updatedAt: '2026-03-30T10:00:00Z'
  });

  const rootStateDir = path.join(projectRoot, '.vibe-science-environment');
  const files = await listFiles(rootStateDir);

  assert.deepStrictEqual(files, ['flows/index.json', 'flows/literature.json']);
});
