import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_METRIC_FILES,
  EXPECTED_METRIC_IDS,
  EXPECTED_TASK_FILES,
  assertRepoPathExists,
  assertSetEqual,
  commandDocPath,
  importRepoModule,
  readRepoJson
} from './_helpers.js';

test('phase 1 eval benchmark references only the intended tasks and metrics', async () => {
  const benchmark = await readRepoJson(
    'environment/evals/benchmarks/phase1-core.benchmark.json'
  );
  const tasks = await Promise.all(
    EXPECTED_TASK_FILES.map((file) => readRepoJson(`environment/evals/tasks/${file}`))
  );
  const metrics = await Promise.all(
    EXPECTED_METRIC_FILES.map((file) =>
      importRepoModule(`environment/evals/metrics/${file}`)
    )
  );

  assert.equal(benchmark.phase, 1);
  assert.equal(benchmark.benchmarkId, 'phase1-core');

  assertSetEqual(
    new Set(benchmark.taskIds),
    new Set(tasks.map((task) => task.taskId)),
    'Benchmark task set drifted from the task definitions.'
  );
  assertSetEqual(
    new Set(benchmark.metricIds),
    new Set(metrics.map((metric) => metric.metricId)),
    'Benchmark metric set drifted from the metric modules.'
  );
});

test('phase 1 task definitions stay wired to real commands, source tests, and safe write scopes', async () => {
  for (const file of EXPECTED_TASK_FILES) {
    const task = await readRepoJson(`environment/evals/tasks/${file}`);

    assert.equal(task.phase, 1);
    assert.deepEqual(task.benchmarkIds, ['phase1-core']);
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
