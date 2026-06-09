import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generatePhase10SurfaceIndex,
  PHASE10_SURFACE_INDEX_PATH,
  PHASE10_SCHEMA_CONTRACTS,
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
        'phase10:dependency-check': 'node environment/tests/ci/check-phase10-ledger.js --dependency-check',
        'phase10:claim-edge-projection': 'node environment/tests/ci/phase10-claim-edge-projection.js',
        'phase10:curator-role': 'node environment/tests/ci/phase10-curator-role.js',
        'phase10:domain-lifecycle': 'node --test environment/tests/cli/domain-cli.test.js',
        'phase10:law13-bridge': 'node environment/tests/ci/phase10-law13-bridge.js',
        'phase10:law13-lint': 'node environment/tests/ci/phase10-law13-lint.js'
      }
    }, null, 2));

    for (const relPath of [
      'phase10-vre-feature-ledger.md',
      'environment/tests/ci/phase10-surface-index.js',
      'environment/tests/ci/phase10-surface-index.test.js',
      'environment/tests/ci/check-phase10-ledger.js',
      'environment/tests/ci/check-phase10-ledger.test.js',
      'environment/phase10/law13-lint.js',
      'environment/tests/ci/phase10-law13-lint.js',
      'environment/tests/ci/phase10-law13-lint.test.js',
      'environment/phase10/claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.test.js',
      'environment/phase10/curator-role.js',
      'environment/orchestrator/agent-orchestration.js',
      'environment/orchestrator/task-registry/phase10-wiki-lint.json',
      'environment/orchestrator/task-registry/phase10-wiki-compile.json',
      'environment/tests/ci/phase10-curator-role.js',
      'environment/tests/ci/phase10-curator-role.test.js',
      'bin/vre',
      'environment/phase10/domain-lifecycle.js',
      'environment/tests/cli/domain-cli.test.js',
      'environment/phase10/law13-bridge.js',
      'environment/tests/ci/phase10-law13-bridge.js',
      'environment/tests/ci/phase10-law13-bridge.test.js',
      'environment/schemas/phase9-objective.schema.json',
      'environment/schemas/phase9-claim-edge.schema.json',
      'environment/claims/edges.js'
    ]) {
      await writeFixtureFile(vreRoot, relPath);
    }

    for (const [, schemaFile, testFile] of PHASE10_SCHEMA_CONTRACTS) {
      await writeFixtureFile(vreRoot, `environment/schemas/${schemaFile}`);
      await writeFixtureFile(vreRoot, `environment/tests/schemas/${testFile}`);
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
      'phase10:dependency-check',
      'phase10.knowledge-domain.v1',
      'phase10.role-envelope.v1',
      'phase10-law13-lint',
      'phase10:law13-lint',
      'phase10-claim-edge-projection',
      'phase10:claim-edge-projection',
      'phase10-curator-role',
      'phase10:curator-role',
      'phase10-domain-lifecycle-cli',
      'phase10:domain-lifecycle',
      'phase10-law13-bridge',
      'phase10:law13-bridge'
    ]) {
      assert.equal(surfaces.some((surface) => surface.name === expected), true, expected);
    }

    assert.equal(surfaces.some((surface) => surface.paths.includes('phase10-feature-ledger.md')), false);
    assert.equal(
      surfaces.filter((surface) => surface.kind === 'schema-contract' && surface.task === 'T10.0.2').length,
      13
    );
  });
});

test('phase10 surface-index writer persists schema-valid JSON', async () => {
  await withFixtureWorkspace(async ({ vreRoot, workspaceRoot }) => {
    await writePhase10SurfaceIndex({ repoRoot: vreRoot, workspaceRoot });
    const persisted = JSON.parse(await readFile(path.join(vreRoot, PHASE10_SURFACE_INDEX_PATH), 'utf8'));
    assert.doesNotThrow(() => validatePhase10SurfaceIndexShape(persisted));
    assert.equal(persisted.some((surface) => surface.name === 'phase10-export-guard-ledger'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10:dependency-check'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10.compile-policy.v1'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10-law13-lint'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10-claim-edge-projection'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10-curator-role'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10-domain-lifecycle-cli'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase10-law13-bridge'), true);
  });
});
