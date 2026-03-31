import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const TASK_FILES = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json'
];

const METRIC_FILES = [
  'resume-latency.js',
  'honesty-under-degradation.js',
  'state-write-scope.js',
  'attempt-lifecycle-completeness.js',
  'snapshot-publish-success.js'
];

async function readJson(repoRelativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, repoRelativePath), 'utf8'));
}

async function importMetric(metricFile) {
  const metricPath = path.join(repoRoot, 'environment', 'evals', 'metrics', metricFile);
  return import(pathToFileURL(metricPath).href);
}

test('phase 1 benchmark references the concrete task and metric definitions', async () => {
  const benchmark = await readJson('environment/evals/benchmarks/phase1-core.benchmark.json');
  const tasks = await Promise.all(
    TASK_FILES.map((file) => readJson(`environment/evals/tasks/${file}`))
  );
  const metrics = await Promise.all(METRIC_FILES.map((file) => importMetric(file)));

  const taskIds = new Set(tasks.map((task) => task.taskId));
  const metricIds = new Set(metrics.map((metric) => metric.metricId));

  assert.equal(benchmark.phase, 1);
  assert.deepEqual(new Set(benchmark.taskIds), taskIds);
  assert.deepEqual(new Set(benchmark.metricIds), metricIds);

  for (const task of tasks) {
    assert.equal(task.phase, 1);
    assert.deepEqual(task.benchmarkIds, ['phase1-core']);
    assert.equal(typeof task.command?.name, 'string');
    assert.ok(Array.isArray(task.metrics) && task.metrics.length > 0);

    for (const metricId of task.metrics) {
      assert.ok(metricIds.has(metricId), `unknown metric ${metricId} referenced by ${task.taskId}`);
    }
  }
});

test('metric modules export a stable API and compute sane scores', async () => {
  const [
    resumeLatency,
    honestyUnderDegradation,
    stateWriteScope,
    attemptLifecycleCompleteness,
    snapshotPublishSuccess
  ] = await Promise.all(METRIC_FILES.map((file) => importMetric(file)));

  for (const metric of [
    resumeLatency,
    honestyUnderDegradation,
    stateWriteScope,
    attemptLifecycleCompleteness,
    snapshotPublishSuccess
  ]) {
    assert.equal(typeof metric.metricId, 'string');
    assert.equal(typeof metric.description, 'string');
    assert.equal(typeof metric.evaluate, 'function');
  }

  assert.equal(
    resumeLatency.evaluate({ elapsedSeconds: 90 }).passed,
    true
  );
  assert.equal(
    resumeLatency.evaluate({ elapsedSeconds: 140 }).passed,
    false
  );

  assert.equal(
    honestyUnderDegradation.evaluate({
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
    honestyUnderDegradation.evaluate({
      degraded: true,
      snapshot: {
        kernel: { dbAvailable: false, degradedReason: '' },
        signals: { unresolvedClaims: 2 }
      },
      output: {
        summary: 'all good',
        warnings: []
      },
      fabricatedSignalKeys: ['unresolvedClaims']
    }).passed,
    false
  );

  assert.equal(
    stateWriteScope.evaluate({
      actualWrites: [
        '.vibe-science-environment/control/session.json',
        '.vibe-science-environment/flows/index.json'
      ],
      allowedPrefixes: ['.vibe-science-environment/control/', '.vibe-science-environment/flows/'],
      forbiddenPrefixes: ['.vibe-science/']
    }).passed,
    true
  );
  assert.equal(
    stateWriteScope.evaluate({
      actualWrites: ['CLAIM-LEDGER.md'],
      allowedPrefixes: ['.vibe-science-environment/control/'],
      forbiddenPrefixes: ['CLAIM-LEDGER.md']
    }).passed,
    false
  );

  assert.equal(
    attemptLifecycleCompleteness.evaluate({
      attemptRecords: [
        { status: 'preparing', startedAt: '2026-03-31T10:00:00Z' },
        { status: 'succeeded', startedAt: '2026-03-31T10:00:00Z', endedAt: '2026-03-31T10:01:00Z' }
      ]
    }).passed,
    true
  );
  assert.equal(
    attemptLifecycleCompleteness.evaluate({
      attemptRecords: [{ status: 'preparing', startedAt: '2026-03-31T10:00:00Z' }]
    }).passed,
    false
  );

  assert.equal(
    snapshotPublishSuccess.evaluate({
      snapshotExists: true,
      schemaValid: true,
      publishError: null
    }).passed,
    true
  );
  assert.equal(
    snapshotPublishSuccess.evaluate({
      snapshotExists: false,
      schemaValid: false,
      publishError: 'publish failed'
    }).passed,
    false
  );
});
