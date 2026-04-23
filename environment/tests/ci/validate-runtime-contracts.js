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
  'literature-register-input.schema.json',
  'experiment-flow-state.schema.json',
  'schema-validation-record.schema.json',
  'experiment-manifest.schema.json',
  'experiment-bundle-manifest.schema.json',
  'session-digest.schema.json',
  'export-snapshot.schema.json',
  'export-record.schema.json',
  'export-alert-record.schema.json',
  'connector-manifest.schema.json',
  'connector-run-record.schema.json',
  'connector-status.schema.json',
  'automation-definition.schema.json',
  'automation-run-record.schema.json',
  'domain-config.schema.json',
  'domain-pack.schema.json',
  'costs-record.schema.json',
  'install-state.schema.json',
  'router-session.schema.json',
  'run-queue-record.schema.json',
  'lane-policy.schema.json',
  'lane-run-record.schema.json',
  'phase9-runtime-budget.schema.json',
  'phase9-capability-handshake.schema.json',
  'phase9-analysis-manifest.schema.json',
  'phase9-objective.schema.json',
  'phase9-active-objective-pointer.schema.json',
  'phase9-objective-event.schema.json',
  'phase9-handoff.schema.json',
  'phase9-resume-snapshot.schema.json',
  'phase9-lane-run-record.schema.json',
  'phase9-role-envelope.schema.json',
  'recovery-record.schema.json',
  'escalation-record.schema.json',
  'external-review-record.schema.json',
  'continuity-profile.schema.json',
  'continuity-profile-history.schema.json',
  'assembled-continuity-payload.schema.json',
  'task-registry-entry.schema.json',
  'operator-validation-artifact.schema.json',
  'session-digest-review-input.schema.json'
];

const activeEvalTaskFiles = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json',
  'sync-memory-refresh.json',
  'flow-status-stale-memory.json',
  'flow-results-package.json',
  'flow-status-results-findability.json',
  'flow-writing-export-eligibility-positive.json',
  'flow-writing-default-mode-blocked.json',
  'flow-writing-snapshot-export.json',
  'flow-writing-advisor-pack.json',
  'flow-writing-rebuttal-pack.json',
  'flow-writing-warning-replay.json',
  'flow-results-export-policy.json',
  'flow-status-connector-failure-visibility.json',
  'weekly-digest-reviewable-artifact.json',
  'stale-memory-reminder-reviewable-artifact.json',
  'export-warning-digest-reviewable-artifact.json',
  'flow-status-domain-pack-omics.json',
  'flow-status-domain-pack-fallback.json',
  'orchestrator-status-queue-resume.json',
  'orchestrator-continuity-modes.json',
  'orchestrator-execution-review-lineage.json',
  'orchestrator-bounded-failure-recovery.json'
];

const activeEvalMetricFiles = [
  'resume-latency.js',
  'honesty-under-degradation.js',
  'state-write-scope.js',
  'attempt-lifecycle-completeness.js',
  'snapshot-publish-success.js'
];
const builtInConnectorManifestFiles = [
  'filesystem-export.connector.json',
  'obsidian-export.connector.json'
];
const builtInAutomationDefinitionFiles = [
  'weekly-research-digest.automation.json',
  'stale-memory-reminder.automation.json',
  'export-warning-digest.automation.json'
];
const builtInDomainPackFiles = [
  'omics/pack.domain-pack.json'
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
  },
  {
    file: 'phase3-writing-deliverables.benchmark.json',
    phase: 3,
    benchmarkId: 'phase3-writing-deliverables'
  },
  {
    file: 'phase4-external-surfaces.benchmark.json',
    phase: 4,
    benchmarkId: 'phase4-external-surfaces'
  },
  {
    file: 'phase5-orchestrator-mvp.benchmark.json',
    phase: 5,
    benchmarkId: 'phase5-orchestrator-mvp'
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
const activeCompatibilityTestFiles = [
  'state-machine.test.js',
  'profiles.test.js',
  'config-protection.test.js',
  'export-profile-safety.test.js'
];
const activeIntegrationTestFiles = [
  'automation-runtime.test.js',
  'flow-bootstrap.test.js',
  'control-plane-rebuild.test.js',
  'literature-register.test.js',
  'experiment-manifest-lifecycle.test.js',
  'memory-sync.test.js',
  'orchestrator-run-status.test.js',
  'results-packaging.test.js',
  'session-digest-export.test.js',
  'session-digest-review-task.test.js',
  'writing-packs.test.js',
  'writing-handoff.test.js'
];
const activeCliTestFiles = [
  'bin-vre-smoke.test.js',
  'bin-vre-errors.test.js',
  'bin-vre-crossplatform.test.js',
  'bin-vre-init.test.js',
  'bin-vre-kernel-reader.test.js',
  'bin-vre-phase9-stubs.test.js',
  'objective-cli.test.js',
  'run-analysis.test.js',
  'research-loop.test.js',
  'scheduler-cli.test.js'
];

const activePhase9TestFiles = [
  'environment/tests/ci/check-phase9-ledger.test.js',
  'environment/tests/ci/phase9-surface-index.test.js',
  'environment/tests/cli/bin-vre-phase9-stubs.test.js',
  'environment/tests/cli/objective-cli.test.js',
  'environment/tests/cli/run-analysis.test.js',
  'environment/tests/cli/research-loop.test.js',
  'environment/tests/cli/scheduler-cli.test.js',
  'environment/tests/control/time-provider.test.js',
  'environment/tests/control/approved-memory-apis.test.js',
  'environment/tests/control/capability-handshake.test.js',
  'environment/tests/control/capability-handshake-drift.test.js',
  'environment/tests/control/analysis-manifest.test.js',
  'environment/tests/control/experiment-binding.test.js',
  'environment/tests/control/objective-store.test.js',
  'environment/tests/control/objective-lock.test.js',
  'environment/tests/control/resume-snapshot.test.js',
  'environment/tests/control/windows-task-scheduler.test.js',
  'environment/tests/lib/kernel-bridge.test.js',
  'environment/tests/integration/kernel-bridge.test.js',
  'environment/tests/schemas/phase9-runtime-budget.schema.test.js',
  'environment/tests/schemas/phase9-objective.schema.test.js',
  'environment/tests/schemas/phase9-analysis-manifest.schema.test.js',
  'environment/tests/schemas/phase9-active-objective-pointer.schema.test.js',
  'environment/tests/schemas/phase9-objective-event.schema.test.js',
  'environment/tests/schemas/phase9-handoff.schema.test.js',
  'environment/tests/schemas/phase9-resume-snapshot.schema.test.js',
  'environment/tests/schemas/phase9-lane-run-record.schema.test.js',
  'environment/tests/schemas/phase9-role-envelope.schema.test.js',
  'environment/tests/schemas/phase9-capability-handshake.schema.test.js'
];

async function importRepoModule(repoRelativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, repoRelativePath)).href;
  return import(moduleUrl);
}

export default async function validateRuntimeContracts() {
  const packageJson = await readJson('package.json');
  assert(
    typeof packageJson.scripts?.['test:phase9'] === 'string' && packageJson.scripts['test:phase9'].trim() !== '',
    'Missing package.json script: test:phase9'
  );
  for (const testFile of activePhase9TestFiles) {
    assert(
      packageJson.scripts['test:phase9'].includes(testFile),
      `package.json test:phase9 is missing ${testFile}`
    );
  }

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

  for (const manifestFile of builtInConnectorManifestFiles) {
    const manifestPath = `environment/connectors/manifests/${manifestFile}`;
    assert(await pathExists(manifestPath), `Missing built-in connector manifest: ${manifestFile}`);
    const manifest = await readJson(manifestPath);
    const result = await validateWithSchema('environment/schemas/connector-manifest.schema.json', manifest);
    assert(result.ok, `Built-in connector manifest ${manifestFile} failed schema validation: ${formatErrors(result.errors)}`);
  }

  for (const definitionFile of builtInAutomationDefinitionFiles) {
    const definitionPath = `environment/automation/definitions/${definitionFile}`;
    assert(await pathExists(definitionPath), `Missing built-in automation definition: ${definitionFile}`);
    const definition = await readJson(definitionPath);
    const result = await validateWithSchema('environment/schemas/automation-definition.schema.json', definition);
    assert(result.ok, `Built-in automation definition ${definitionFile} failed schema validation: ${formatErrors(result.errors)}`);
  }

  for (const packFile of builtInDomainPackFiles) {
    const packPath = `environment/domain-packs/${packFile}`;
    assert(await pathExists(packPath), `Missing built-in domain pack: ${packFile}`);
    const pack = await readJson(packPath);
    const result = await validateWithSchema('environment/schemas/domain-pack.schema.json', pack);
    assert(result.ok, `Built-in domain pack ${packFile} failed schema validation: ${formatErrors(result.errors)}`);
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
    const expectedPhase =
      taskFile.startsWith('flow-status-resume') ||
      taskFile.startsWith('flow-literature-register') ||
      taskFile.startsWith('flow-experiment-register') ||
      taskFile.startsWith('degraded-kernel-mode')
        ? 1
        : taskFile.startsWith('sync-memory-refresh') ||
            taskFile.startsWith('flow-status-stale-memory') ||
            taskFile.startsWith('flow-results-package') ||
            taskFile.startsWith('flow-status-results-findability')
          ? 2
          : taskFile.startsWith('flow-status-connector-failure-visibility') ||
              taskFile.startsWith('weekly-digest-reviewable-artifact') ||
              taskFile.startsWith('stale-memory-reminder-reviewable-artifact') ||
              taskFile.startsWith('export-warning-digest-reviewable-artifact') ||
              taskFile.startsWith('flow-status-domain-pack-omics') ||
              taskFile.startsWith('flow-status-domain-pack-fallback')
            ? 4
            : taskFile.startsWith('orchestrator-status-queue-resume') ||
                taskFile.startsWith('orchestrator-continuity-modes') ||
                taskFile.startsWith('orchestrator-execution-review-lineage') ||
                taskFile.startsWith('orchestrator-bounded-failure-recovery')
              ? 5
              : 3;
    const expectedBenchmarkId =
      expectedPhase === 1
        ? 'phase1-core'
        : expectedPhase === 2
          ? 'phase2-memory-packaging'
          : expectedPhase === 3
            ? 'phase3-writing-deliverables'
            : expectedPhase === 4
              ? 'phase4-external-surfaces'
              : 'phase5-orchestrator-mvp';
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

  for (const testFile of activeCompatibilityTestFiles) {
    assert(
      await pathExists(`environment/tests/compatibility/${testFile}`),
      `Missing active compatibility test: ${testFile}`
    );
  }

  for (const testFile of activeIntegrationTestFiles) {
    assert(
      await pathExists(`environment/tests/integration/${testFile}`),
      `Missing active integration test: ${testFile}`
    );
  }

  for (const testFile of activeCliTestFiles) {
    assert(
      await pathExists(`environment/tests/cli/${testFile}`),
      `Missing active CLI test: ${testFile}`
    );
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-runtime-contracts', validateRuntimeContracts);
}
