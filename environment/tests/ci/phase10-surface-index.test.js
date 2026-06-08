import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generatePhase10SurfaceIndex,
  PHASE10_SURFACE_INDEX_PATH,
  validatePhase10SurfaceIndexShape,
  writePhase10SurfaceIndex
} from './phase10-surface-index.js';

async function writeFixtureFile(root, relPath, content = '') {
  const fullPath = path.join(root, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content || `fixture for ${relPath}\n`, 'utf8');
}

async function withFixtureWorkspace(fn) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase10-surface-index-'));
  const vreRoot = path.join(workspaceRoot, 'vibe-research-environment');
  const vibeRoot = path.join(workspaceRoot, 'vibe-science');

  try {
    await writeFixtureFile(vreRoot, 'package.json', JSON.stringify({
      name: 'vibe-research-environment',
      private: true,
      type: 'module',
      scripts: {
        'build:phase10-surface-index': 'node environment/tests/ci/phase10-surface-index.js',
        'check:phase10-ledger': 'node environment/tests/ci/check-phase10-ledger.js',
        'phase10:dependency-check': 'node environment/tests/ci/check-phase10-ledger.js --dependency-check'
      }
    }, null, 2));

    for (const relPath of [
      'phase10-vre-feature-ledger.md',
      'environment/tests/ci/phase10-surface-index.js',
      'environment/tests/ci/phase10-surface-index.test.js',
      'environment/tests/ci/check-phase10-ledger.js',
      'environment/tests/ci/check-phase10-ledger.test.js',
      'environment/schemas/phase9-claim-edge.schema.json',
      'environment/claims/edges.js'
    ]) {
      await writeFixtureFile(vreRoot, relPath);
    }

    for (const relPath of [
      'blueprints/private/phase10-implementation-plan/phase10-implementation-log.md',
      'blueprints/private/phase10-implementation-plan/phase10-schema-registry.md',
      'blueprints/private/phase10-implementation-plan/phase10-lint-check-ledger.md',
      'blueprints/private/phase10-implementation-plan/phase10-role-budget-ledger.md',
      'blueprints/private/phase10-implementation-plan/phase10-export-guard-ledger.md',
      'blueprints/private/phase10-implementation-plan/phase10-file-change-ledger.md',
      'blueprints/private/phase10-implementation-plan/phase10-change-trace-ledger.md',
      'blueprints/private/phase10-implementation-plan/phase10-maintenance-notes.md'
    ]) {
      await writeFixtureFile(vibeRoot, relPath);
    }

    await fn({ workspaceRoot, vreRoot, vibeRoot });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('phase10 surface-index generator records scaffold, ledgers, scripts, and dependencies', async () => {
  await withFixtureWorkspace(async ({ vreRoot, workspaceRoot }) => {
    const surfaces = await generatePhase10SurfaceIndex({ repoRoot: vreRoot, workspaceRoot });
    assert.doesNotThrow(() => validatePhase10SurfaceIndexShape(surfaces));

    for (const expected of [
      'phase10-vre-feature-ledger',
      'phase10-vre-surface-index',
      'phase10-implementation-log',
      'phase10-export-guard-ledger',
      'phase10-file-change-ledger',
      'phase10-change-trace-ledger',
      'phase10-surface-index-generator',
      'check-phase10-ledger',
      'phase9.claim-edge.v1 dependency',
      'claims-edges dependency',
      'phase10:dependency-check'
    ]) {
      assert.equal(surfaces.some((surface) => surface.name === expected), true, expected);
    }

    assert.equal(surfaces.some((surface) => surface.paths.includes('phase10-feature-ledger.md')), false);
  });
});

test('phase10 surface-index writer persists schema-valid JSON', async () => {
  await withFixtureWorkspace(async ({ vreRoot, workspaceRoot }) => {
    await writePhase10SurfaceIndex({ repoRoot: vreRoot, workspaceRoot });
    const persisted = JSON.parse(await readFile(path.join(vreRoot, PHASE10_SURFACE_INDEX_PATH), 'utf8'));
    assert.doesNotThrow(() => validatePhase10SurfaceIndexShape(persisted));
    assert.equal(persisted.some((surface) => surface.name === 'phase10-export-guard-ledger'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10:dependency-check'), true);
  });
});
