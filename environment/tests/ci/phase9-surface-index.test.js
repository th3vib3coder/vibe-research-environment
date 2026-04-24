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
    await mkdir(path.join(repoRoot, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'tests', 'ci'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'control'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'objectives'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'orchestrator'), { recursive: true });
    await mkdir(path.join(repoRoot, 'environment', 'schemas'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({
        name: 'vibe-research-environment',
        private: true,
        type: 'module',
        scripts: {
          'check:phase9-ledger': 'node environment/tests/ci/check-phase9-ledger.js',
          'build:surface-index': 'node environment/tests/ci/phase9-surface-index.js',
          'test:phase9': 'node --test environment/tests/ci/check-phase9-ledger.test.js environment/tests/ci/phase9-surface-index.test.js environment/tests/ci/validate-no-personal-paths.test.js environment/tests/cli/bin-vre-phase9-stubs.test.js environment/tests/cli/objective-cli.test.js environment/tests/cli/research-loop.test.js environment/tests/cli/scheduler-cli.test.js environment/tests/control/time-provider.test.js environment/tests/control/approved-memory-apis.test.js environment/tests/control/capability-handshake.test.js environment/tests/control/analysis-manifest.test.js environment/tests/control/experiment-binding.test.js environment/tests/control/objective-store.test.js environment/tests/control/queue-adapter.test.js environment/tests/control/windows-task-scheduler.test.js environment/tests/lib/kernel-bridge.test.js environment/tests/integration/kernel-bridge.test.js environment/tests/schemas/phase9-runtime-budget.schema.test.js environment/tests/schemas/phase9-objective.schema.test.js environment/tests/schemas/phase9-analysis-manifest.schema.test.js environment/tests/schemas/phase9-active-objective-pointer.schema.test.js environment/tests/schemas/phase9-objective-event.schema.test.js environment/tests/schemas/phase9-handoff.schema.test.js environment/tests/schemas/phase9-resume-snapshot.schema.test.js environment/tests/schemas/phase9-lane-run-record.schema.test.js environment/tests/schemas/phase9-role-envelope.schema.test.js environment/tests/schemas/phase9-capability-handshake.schema.test.js'
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
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'validate-runtime-contracts.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'tests', 'ci', 'phase9-surface-index.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'objectives', 'store.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'objectives', 'cli.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'objectives', 'resume-snapshot.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'objectives', 'blocker-flag.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'objectives', 'digest-writer.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'experiment-binding.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'analysis-manifest.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'execution-lane.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'ledgers.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'autonomy-runtime.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'queue-adapter.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'orchestrator', 'windows-task-scheduler.js'), '// fixture\n', 'utf8');
    await writeFile(
      path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
      [
        'name: ci',
        'on:',
        '  pull_request:',
        'jobs:',
        '  validate:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm ci',
        '      - run: npm run check',
        '      - run: npm run test:phase9',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(path.join(repoRoot, 'environment', 'control', 'capability-handshake.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'control', 'time-provider.js'), '// fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'environment', 'control', 'approved-memory-apis.json'), '[]\n', 'utf8');
    for (const schemaFile of [
      'phase9-capability-handshake.schema.json',
      'phase9-analysis-manifest.schema.json',
      'phase9-runtime-budget.schema.json',
      'phase9-objective.schema.json',
      'phase9-active-objective-pointer.schema.json',
      'phase9-objective-event.schema.json',
      'phase9-handoff.schema.json',
      'phase9-resume-snapshot.schema.json',
      'phase9-lane-run-record.schema.json',
      'phase9-role-envelope.schema.json'
    ]) {
      await writeFile(path.join(repoRoot, 'environment', 'schemas', schemaFile), '{}\n', 'utf8');
    }

    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('phase9 surface-index generator runs and returns the pinned shape', async () => {
  await withFixtureRepo(async (repoRoot) => {
    const surfaces = await generatePhase9SurfaceIndex({ repoRoot });
    assert.equal(surfaces.length, 30);
    assert.doesNotThrow(() => validateSurfaceIndexShape(surfaces));
    assert.equal(surfaces.some((surface) => surface.name === 'capabilities --json'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'test:phase9'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'capability-handshake'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'time-provider'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'approved-memory-apis'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'objective-cli'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'objective-store'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'resume-snapshot'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'blocker-flag'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'objective-digest'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'experiment-binding'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'analysis-manifest'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'execution-lane'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'orchestrator-ledgers'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'autonomy-runtime'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'queue-adapter'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'windows-task-scheduler'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'phase9.capability-handshake.v1'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'phase9.analysis-manifest.v1'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'phase9.objective.v1'), true);
    assert.equal(surfaces.some((surface) => surface.name === 'phase9.role-envelope.v1'), true);
  });
});

test('phase9 surface-index writer persists schema-valid JSON', async () => {
  await withFixtureRepo(async (repoRoot) => {
    await writePhase9SurfaceIndex({ repoRoot });
    const persisted = JSON.parse(await readFile(path.join(repoRoot, SURFACE_INDEX_PATH), 'utf8'));
    assert.doesNotThrow(() => validateSurfaceIndexShape(persisted));
    assert.equal(persisted.some((surface) => surface.name === 'build:surface-index'), true);
    assert.equal(persisted.some((surface) => surface.name === 'test:phase9'), true);
    assert.equal(persisted.some((surface) => surface.name === 'capability-handshake'), true);
    assert.equal(persisted.some((surface) => surface.name === 'objective-cli'), true);
    assert.equal(persisted.some((surface) => surface.name === 'objective-store'), true);
    assert.equal(persisted.some((surface) => surface.name === 'resume-snapshot'), true);
    assert.equal(persisted.some((surface) => surface.name === 'blocker-flag'), true);
    assert.equal(persisted.some((surface) => surface.name === 'objective-digest'), true);
    assert.equal(persisted.some((surface) => surface.name === 'experiment-binding'), true);
    assert.equal(persisted.some((surface) => surface.name === 'execution-lane'), true);
    assert.equal(persisted.some((surface) => surface.name === 'orchestrator-ledgers'), true);
    assert.equal(persisted.some((surface) => surface.name === 'autonomy-runtime'), true);
    assert.equal(persisted.some((surface) => surface.name === 'queue-adapter'), true);
    assert.equal(persisted.some((surface) => surface.name === 'windows-task-scheduler'), true);
    assert.equal(persisted.some((surface) => surface.name === 'scheduler doctor'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase9.capability-handshake.v1'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase9.analysis-manifest.v1'), true);
    assert.equal(persisted.some((surface) => surface.name === 'phase9.resume-snapshot.v1'), true);
  });
});
