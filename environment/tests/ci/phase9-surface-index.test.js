import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generatePhase9SurfaceIndex,
  SURFACE_INDEX_PATH,
  validateSurfaceIndexShape,
  writePhase9SurfaceIndex
} from './phase9-surface-index.js';

async function withFixtureRepo(fn) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase9-surface-index-'));
  try {
    await mkdir(path.join(repoRoot, 'bin'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'tests', 'ci'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({
        name: 'vibe-research-environment',
        private: true,
        type: 'module',
        scripts: {
          'check:phase9-ledger': 'node environment/tests/ci/check-phase9-ledger.js',
          'build:surface-index': 'node environment/tests/ci/phase9-surface-index.js'
        }
      }, null, 2),
      'utf8'
    );
    await writeFile(
      path.join(repoRoot, 'bin', 'vre'),
      [
        'export const PHASE9_STUB_DEFINITIONS = Object.freeze([',
        '  {',
        "    root: 'capabilities',",
        '    action: null,',
        "    canonicalCommand: 'capabilities --json',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-CAPABILITIES-JSON',",
        "    introducedAt: '2026-04-22',",
        '    mutating: false',
        '  },',
        '  {',
        "    root: 'scheduler',",
        "    action: 'doctor',",
        "    canonicalCommand: 'scheduler doctor',",
        "    kind: 'doctor-surface',",
        "    featureId: 'W0-CLI-SCHEDULER-DOCTOR',",
        "    introducedAt: '2026-04-22',",
        '    mutating: false',
        '  }',
        ']);',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'check-phase9-ledger.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'run-all.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'validate-counts.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'phase9-surface-index.js'), '// fixture\n', 'utf8');

    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('phase9 surface-index generator runs and returns the pinned shape', async () => {
  await withFixtureRepo(async (repoRoot) => {
    const surfaces = await generatePhase9SurfaceIndex({ repoRoot });
    assert.equal(surfaces.length, 4);
    assert.doesNotThrow(() => validateSurfaceIndexShape(surfaces));
    assert.equal(surfaces.some((surface) => surface.name === 'capabilities --json'), true);
  });
});

test('phase9 surface-index writer persists schema-valid JSON', async () => {
  await withFixtureRepo(async (repoRoot) => {
    await writePhase9SurfaceIndex({ repoRoot });
    const persisted = JSON.parse(await readFile(path.join(repoRoot, SURFACE_INDEX_PATH), 'utf8'));
    assert.doesNotThrow(() => validateSurfaceIndexShape(persisted));
    assert.equal(persisted.some((surface) => surface.name === 'build:surface-index'), true);
    assert.equal(persisted.some((surface) => surface.name === 'scheduler doctor'), true);
  });
});
