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
  ['environment/templates/experiment-manifest.v1.json', 'environment/schemas/experiment-manifest.schema.json']
];

const activeSchemaFiles = [
  'session-snapshot.schema.json',
  'capabilities-snapshot.schema.json',
  'memory-sync-state.schema.json',
  'attempt-record.schema.json',
  'event-record.schema.json',
  'decision-record.schema.json',
  'flow-index.schema.json',
  'literature-flow-state.schema.json',
  'experiment-flow-state.schema.json',
  'schema-validation-record.schema.json',
  'experiment-manifest.schema.json',
  'costs-record.schema.json',
  'install-state.schema.json'
];

const activeEvalTaskFiles = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json'
];

const activeEvalMetricFiles = [
  'resume-latency.js',
  'honesty-under-degradation.js',
  'state-write-scope.js',
  'attempt-lifecycle-completeness.js',
  'snapshot-publish-success.js'
];

const activeEvalBenchmarkFiles = ['phase1-core.benchmark.json'];

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
    assert(task.phase === 1, `Eval task ${taskFile} must stay in Phase 1`);
    assert(Array.isArray(task.benchmarkIds) && task.benchmarkIds.includes('phase1-core'), `Eval task ${taskFile} must belong to phase1-core`);
    assert(Array.isArray(task.metrics) && task.metrics.length > 0, `Eval task ${taskFile} missing metric references`);
    for (const metricId of task.metrics) {
      assert(metricIdSet.has(metricId), `Eval task ${taskFile} references unknown metric ${metricId}`);
    }
    taskIdSet.add(task.taskId);
  }

  for (const benchmarkFile of activeEvalBenchmarkFiles) {
    assert(await pathExists(`environment/evals/benchmarks/${benchmarkFile}`), `Missing eval benchmark: ${benchmarkFile}`);
    const benchmark = await readJson(`environment/evals/benchmarks/${benchmarkFile}`);
    assert(benchmark.phase === 1, `Eval benchmark ${benchmarkFile} must stay in Phase 1`);
    for (const taskId of benchmark.taskIds ?? []) {
      assert(taskIdSet.has(taskId), `Eval benchmark ${benchmarkFile} references unknown task ${taskId}`);
    }
    for (const metricId of benchmark.metricIds ?? []) {
      assert(metricIdSet.has(metricId), `Eval benchmark ${benchmarkFile} references unknown metric ${metricId}`);
    }
  }

  assert(
    await pathExists('environment/tests/evals/definitions.test.js'),
    'Missing eval harness test: environment/tests/evals/definitions.test.js'
  );
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-runtime-contracts', validateRuntimeContracts);
}
