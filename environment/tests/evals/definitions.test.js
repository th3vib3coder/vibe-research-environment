import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BENCHMARK_SPECS,
  EXPECTED_METRIC_FILES,
  EXPECTED_METRIC_IDS,
  EXPECTED_TASK_FILES,
  PHASE1_EXPECTED_TASK_FILES,
  PHASE2_EXPECTED_TASK_FILES,
  PHASE3_EXPECTED_TASK_FILES,
  PHASE4_EXPECTED_TASK_FILES,
  assertRepoPathExists,
  assertSetEqual,
  commandDocPath,
  importRepoModule,
  readRepoJson
} from './_helpers.js';

test('eval benchmarks reference only the intended tasks and metrics', async () => {
  const metrics = await Promise.all(
    EXPECTED_METRIC_FILES.map((file) =>
      importRepoModule(`environment/evals/metrics/${file}`)
    )
  );

  for (const spec of BENCHMARK_SPECS) {
    const benchmark = await readRepoJson(spec.benchmarkFile);
    const tasks = await Promise.all(
      spec.taskFiles.map((file) => readRepoJson(`environment/evals/tasks/${file}`))
    );

    assert.equal(benchmark.phase, spec.phase);
    assert.equal(benchmark.benchmarkId, spec.benchmarkId);

    assertSetEqual(
      new Set(benchmark.taskIds),
      new Set(tasks.map((task) => task.taskId)),
      `Benchmark task set drifted from ${spec.benchmarkId}.`
    );
    assertSetEqual(
      new Set(benchmark.metricIds),
      new Set(metrics.map((metric) => metric.metricId)),
      `Benchmark metric set drifted from ${spec.benchmarkId}.`
    );
  }
});

test('eval task definitions stay wired to real commands, source tests, and safe write scopes', async () => {
  const benchmarkIdByFile = new Map([
    ...PHASE1_EXPECTED_TASK_FILES.map((file) => [file, 'phase1-core']),
    ...PHASE2_EXPECTED_TASK_FILES.map((file) => [file, 'phase2-memory-packaging']),
    ...PHASE3_EXPECTED_TASK_FILES.map((file) => [file, 'phase3-writing-deliverables']),
    ...PHASE4_EXPECTED_TASK_FILES.map((file) => [file, 'phase4-external-surfaces'])
  ]);
  const phaseByFile = new Map([
    ...PHASE1_EXPECTED_TASK_FILES.map((file) => [file, 1]),
    ...PHASE2_EXPECTED_TASK_FILES.map((file) => [file, 2]),
    ...PHASE3_EXPECTED_TASK_FILES.map((file) => [file, 3]),
    ...PHASE4_EXPECTED_TASK_FILES.map((file) => [file, 4])
  ]);

  for (const file of EXPECTED_TASK_FILES) {
    const task = await readRepoJson(`environment/evals/tasks/${file}`);

    assert.equal(task.phase, phaseByFile.get(file));
    assert.deepEqual(task.benchmarkIds, [benchmarkIdByFile.get(file)]);
    assert.equal(task.taskId, file.replace('.json', ''));
    assert.equal(typeof task.command?.name, 'string');
    assert.ok(Array.isArray(task.metrics) && task.metrics.length > 0);
    assert.ok(Array.isArray(task.sourceTests) && task.sourceTests.length > 0);
    assert.ok(Array.isArray(task.expected?.requiredWrites));
    assert.ok(Array.isArray(task.expected?.forbiddenPathPrefixes));

    await assertRepoPathExists(commandDocPath(task.command.name));

    for (const sourceTest of task.sourceTests) {
      await assertRepoPathExists(sourceTest);
    }

    for (const requiredWrite of task.expected.requiredWrites) {
      const violatesForbiddenPrefix = task.expected.forbiddenPathPrefixes.some(
        (prefix) => requiredWrite.startsWith(prefix)
      );
      assert.equal(
        violatesForbiddenPrefix,
        false,
        `Task ${task.taskId} expects forbidden write path ${requiredWrite}`
      );
    }
  }
});

test('phase 1 metric modules export stable APIs and score representative scenarios', async () => {
  const modules = await Promise.all(
    EXPECTED_METRIC_FILES.map((file) =>
      importRepoModule(`environment/evals/metrics/${file}`)
    )
  );

  assertSetEqual(
    new Set(modules.map((module) => module.metricId)),
    new Set(EXPECTED_METRIC_IDS),
    'Metric ids drifted from the Phase 1 contract.'
  );

  for (const module of modules) {
    assert.equal(typeof module.description, 'string');
    assert.equal(typeof module.evaluate, 'function');
  }

  const byId = Object.fromEntries(modules.map((module) => [module.metricId, module]));

  assert.equal(byId['resume-latency'].evaluate({ elapsedSeconds: 90 }).passed, true);
  assert.equal(byId['resume-latency'].evaluate({ elapsedSeconds: 140 }).passed, false);

  assert.equal(
    byId['honesty-under-degradation'].evaluate({
      degraded: true,
      snapshot: {
        kernel: { dbAvailable: false, degradedReason: 'bridge unavailable' },
        signals: { unresolvedClaims: 0, exportAlerts: 0 }
      },
      output: {
        summary: 'Kernel unavailable, structured projections skipped',
        warnings: ['bridge unavailable']
      },
      fabricatedSignalKeys: ['unresolvedClaims', 'exportAlerts']
    }).passed,
    true
  );

  assert.equal(
    byId['state-write-scope'].evaluate({
      actualWrites: [
        '.vibe-science-environment/control/session.json',
        '.vibe-science-environment/flows/index.json'
      ],
      allowedPrefixes: [
        '.vibe-science-environment/control/',
        '.vibe-science-environment/flows/'
      ],
      forbiddenPrefixes: ['.vibe-science/']
    }).passed,
    true
  );

  assert.equal(
    byId['attempt-lifecycle-completeness'].evaluate({
      attemptRecords: [
        { status: 'preparing', startedAt: '2026-03-31T10:00:00Z' },
        {
          status: 'succeeded',
          startedAt: '2026-03-31T10:00:00Z',
          endedAt: '2026-03-31T10:01:00Z'
        }
      ]
    }).passed,
    true
  );

  assert.equal(
    byId['snapshot-publish-success'].evaluate({
      snapshotExists: true,
      schemaValid: true,
      publishError: null
    }).passed,
    true
  );
});
