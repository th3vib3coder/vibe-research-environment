import {
  assert,
  pathExists,
  validateWithSchema,
  formatErrors,
  isDirectRun,
  readJson,
  repoRoot
} from './_helpers.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const templateSchemaPairs = [
  ['environment/templates/session-snapshot.v1.json', 'environment/schemas/session-snapshot.schema.json'],
  ['environment/templates/attempt-record.v1.json', 'environment/schemas/attempt-record.schema.json'],
  ['environment/templates/flow-index.v1.json', 'environment/schemas/flow-index.schema.json'],
  ['environment/templates/literature-flow-state.v1.json', 'environment/schemas/literature-flow-state.schema.json'],
  ['environment/templates/experiment-flow-state.v1.json', 'environment/schemas/experiment-flow-state.schema.json'],
  ['environment/templates/experiment-manifest.v1.json', 'environment/schemas/experiment-manifest.schema.json'],
  ['environment/templates/experiment-bundle-manifest.v1.json', 'environment/schemas/experiment-bundle-manifest.schema.json']
];

const activeSchemaFiles = [
  'session-snapshot.schema.json',
  'capabilities-snapshot.schema.json',
  'memory-sync-state.schema.json',
  'memory-mark-record.schema.json',
  'attempt-record.schema.json',
  'event-record.schema.json',
  'decision-record.schema.json',
  'flow-index.schema.json',
  'literature-flow-state.schema.json',
  'experiment-flow-state.schema.json',
  'schema-validation-record.schema.json',
  'experiment-manifest.schema.json',
  'experiment-bundle-manifest.schema.json',
  'session-digest.schema.json',
  'export-snapshot.schema.json',
  'export-record.schema.json',
  'export-alert-record.schema.json',
  'costs-record.schema.json',
  'install-state.schema.json'
];

const activeEvalTaskFiles = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json',
  'sync-memory-refresh.json',
  'flow-status-stale-memory.json',
  'flow-results-package.json',
  'flow-status-results-findability.json'
];

const activeEvalMetricFiles = [
  'resume-latency.js',
  'honesty-under-degradation.js',
  'state-write-scope.js',
  'attempt-lifecycle-completeness.js',
  'snapshot-publish-success.js'
];

const evalBenchmarkSpecs = [
  {
    file: 'phase1-core.benchmark.json',
    phase: 1,
    benchmarkId: 'phase1-core'
  },
  {
    file: 'phase2-memory-packaging.benchmark.json',
    phase: 2,
    benchmarkId: 'phase2-memory-packaging'
  }
];
const activeFlowTestFiles = [
  'experiment.test.js',
  'literature.test.js',
  'results.test.js',
  'results-discovery.test.js',
  'session-digest.test.js',
  'writing.test.js',
  'writing-packs.test.js'
];
const activeInstallTestFiles = [
  'install.test.js',
  'doctor.test.js',
  'repair.test.js',
  'uninstall.test.js',
  'upgrade.test.js'
];

async function importRepoModule(repoRelativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, repoRelativePath)).href;
  return import(moduleUrl);
}

export default async function validateRuntimeContracts() {
  for (const schemaFile of activeSchemaFiles) {
    assert(await pathExists(`environment/schemas/${schemaFile}`), `Missing active schema: ${schemaFile}`);
    assert(
      await pathExists(`environment/tests/schemas/${schemaFile.replace('.json', '.test.js')}`),
      `Missing schema test for ${schemaFile}`
    );
  }

  for (const [templatePath, schemaPath] of templateSchemaPairs) {
    const template = await readJson(templatePath);
    const result = await validateWithSchema(schemaPath, template);
    assert(result.ok, `Template ${templatePath} failed ${schemaPath}: ${formatErrors(result.errors)}`);
  }

  for (const taskFile of activeEvalTaskFiles) {
    assert(await pathExists(`environment/evals/tasks/${taskFile}`), `Missing eval task: ${taskFile}`);
  }

  const metricIdSet = new Set();
  for (const metricFile of activeEvalMetricFiles) {
    const metricPath = `environment/evals/metrics/${metricFile}`;
    assert(await pathExists(metricPath), `Missing eval metric: ${metricFile}`);
    const metricModule = await importRepoModule(metricPath);
    assert(typeof metricModule.metricId === 'string', `Metric ${metricFile} missing metricId export`);
    assert(typeof metricModule.evaluate === 'function', `Metric ${metricFile} missing evaluate() export`);
    metricIdSet.add(metricModule.metricId);
  }

  const taskIdSet = new Set();
  for (const taskFile of activeEvalTaskFiles) {
    const task = await readJson(`environment/evals/tasks/${taskFile}`);
    const expectedPhase = taskFile.startsWith('flow-status-resume') ||
      taskFile.startsWith('flow-literature-register') ||
      taskFile.startsWith('flow-experiment-register') ||
      taskFile.startsWith('degraded-kernel-mode')
      ? 1
      : 2;
    const expectedBenchmarkId = expectedPhase === 1 ? 'phase1-core' : 'phase2-memory-packaging';
    assert(task.phase === expectedPhase, `Eval task ${taskFile} drifted from Phase ${expectedPhase}`);
    assert(
      Array.isArray(task.benchmarkIds) && task.benchmarkIds.includes(expectedBenchmarkId),
      `Eval task ${taskFile} must belong to ${expectedBenchmarkId}`
    );
    assert(Array.isArray(task.metrics) && task.metrics.length > 0, `Eval task ${taskFile} missing metric references`);
    for (const metricId of task.metrics) {
      assert(metricIdSet.has(metricId), `Eval task ${taskFile} references unknown metric ${metricId}`);
    }
    taskIdSet.add(task.taskId);
  }

  for (const benchmarkSpec of evalBenchmarkSpecs) {
    assert(await pathExists(`environment/evals/benchmarks/${benchmarkSpec.file}`), `Missing eval benchmark: ${benchmarkSpec.file}`);
    const benchmark = await readJson(`environment/evals/benchmarks/${benchmarkSpec.file}`);
    assert(benchmark.phase === benchmarkSpec.phase, `Eval benchmark ${benchmarkSpec.file} drifted from Phase ${benchmarkSpec.phase}`);
    assert(benchmark.benchmarkId === benchmarkSpec.benchmarkId, `Eval benchmark ${benchmarkSpec.file} drifted from ${benchmarkSpec.benchmarkId}`);
    for (const taskId of benchmark.taskIds ?? []) {
      assert(taskIdSet.has(taskId), `Eval benchmark ${benchmarkSpec.file} references unknown task ${taskId}`);
    }
    for (const metricId of benchmark.metricIds ?? []) {
      assert(metricIdSet.has(metricId), `Eval benchmark ${benchmarkSpec.file} references unknown metric ${metricId}`);
    }
  }

  assert(
    await pathExists('environment/tests/evals/definitions.test.js'),
    'Missing eval harness test: environment/tests/evals/definitions.test.js'
  );

  for (const testFile of activeFlowTestFiles) {
    assert(
      await pathExists(`environment/tests/flows/${testFile}`),
      `Missing active flow test: ${testFile}`
    );
  }

  for (const testFile of activeInstallTestFiles) {
    assert(
      await pathExists(`environment/tests/install/${testFile}`),
      `Missing active install test: ${testFile}`
    );
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-runtime-contracts', validateRuntimeContracts);
}
