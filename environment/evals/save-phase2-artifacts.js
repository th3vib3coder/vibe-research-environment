import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendDecision } from '../control/decisions.js';
import { readJsonl, resolveInside } from '../control/_io.js';
import { runWithMiddleware } from '../control/middleware.js';
import { getAttemptHistory, getOperatorStatus } from '../control/query.js';
import { publishSessionSnapshot } from '../control/session-snapshot.js';
import { registerExperiment, updateExperiment } from '../flows/experiment.js';
import { packageExperimentResults } from '../flows/results.js';
import { exportSessionDigest } from '../flows/session-digest.js';
import { syncMemory } from '../memory/sync.js';
import {
  captureRuntimeFiles,
  cloneValue,
  diffWrites,
  evaluateAssertions,
  evaluateMetrics,
  getExistingRepeats,
  importMetricModules,
  nextRepeatId,
  readJson,
  saveTaskArtifacts,
} from './_saved-artifacts.js';
import {
  cleanupEvalWorkspace,
  createEvalWorkspace,
  getRepoRoot,
  resolveWorkspacePath,
  seedWorkspaceFixtures,
} from './_workspace.js';

const repoRoot = getRepoRoot();

async function seedSessionSnapshot(projectPath, snapshot) {
  if (snapshot) {
    await publishSessionSnapshot(projectPath, snapshot);
  }
}

async function seedDecisions(projectPath, seedDecisionsList = []) {
  for (const decision of seedDecisionsList) {
    await appendDecision(projectPath, decision);
  }
}

async function seedExperiments(projectPath, definitions = []) {
  for (const definition of definitions) {
    await registerExperiment(projectPath, definition.manifest);
    for (const update of definition.updates ?? []) {
      await updateExperiment(projectPath, definition.manifest.experimentId, update);
    }
  }
}

async function seedSingleExperiment(projectPath, definition = null) {
  if (!definition) {
    return;
  }

  await registerExperiment(projectPath, definition.manifest);
  for (const update of definition.updates ?? []) {
    await updateExperiment(projectPath, definition.manifest.experimentId, update);
  }
}

async function seedOutputArtifacts(projectPath, files = []) {
  for (const file of files) {
    const absolutePath = resolveWorkspacePath(projectPath, file.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.contents ?? '', 'utf8');
  }
}

async function seedMarks(projectPath, records = []) {
  if (records.length === 0) {
    return;
  }

  const marksPath = resolveWorkspacePath(
    projectPath,
    '.vibe-science-environment/memory/index/marks.jsonl',
  );
  await mkdir(path.dirname(marksPath), { recursive: true });
  await writeFile(
    marksPath,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
    'utf8',
  );
}

async function seedSyncState(projectPath, state) {
  if (!state) {
    return;
  }

  const statePath = resolveWorkspacePath(
    projectPath,
    '.vibe-science-environment/memory/sync-state.json',
  );
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function prepareResultsFixture(projectPath, task) {
  await seedSingleExperiment(projectPath, task.setup.seedExperiment);
  await seedOutputArtifacts(projectPath, task.setup.seedOutputArtifacts);

  if (task.setup.packageOptions) {
    await packageExperimentResults(
      projectPath,
      task.setup.seedExperiment.manifest.experimentId,
      task.setup.packageOptions,
    );
  }

  if (task.setup.seedDigest) {
    await exportSessionDigest(projectPath, task.setup.seedDigest);
  }
}

function createReaderStub(kernelReader = {}) {
  const projections = cloneValue(kernelReader.projections ?? {});
  const advanced = cloneValue(
    kernelReader.advancedCapabilities ?? kernelReader.capabilities ?? {},
  );
  const dbAvailable = Boolean(kernelReader.dbAvailable);
  const unavailableError = kernelReader.error ?? 'kernel unavailable';

  function projectionReader(key, fallback) {
    return async () => {
      if (!dbAvailable) {
        throw new Error(unavailableError);
      }

      return cloneValue(projections[key] ?? fallback);
    };
  }

  return {
    dbAvailable,
    error: dbAvailable ? null : unavailableError,
    capabilities: advanced,
    getProjectOverview: projectionReader('overview', null),
    listClaimHeads: projectionReader('claimHeads', []),
    listUnresolvedClaims: projectionReader('unresolvedClaims', []),
    listCitationChecks: projectionReader('citationChecks', []),
    listGateChecks: projectionReader('gateChecks', []),
    listLiteratureSearches: projectionReader('literatureSearches', []),
  };
}

async function readAttemptRecords(projectPath, attemptId) {
  const attemptsPath = resolveInside(
    projectPath,
    '.vibe-science-environment',
    'control',
    'attempts.jsonl',
  );
  const records = await readJsonl(attemptsPath);
  return records.filter((record) => record.attemptId === attemptId);
}

async function executeTask(task, benchmarkId, metricModules) {
  const projectPath = await createEvalWorkspace(`vre-eval-${task.taskId}-`);

  try {
    await seedWorkspaceFixtures(projectPath, task.setup.workspaceFixtures);
    await seedSessionSnapshot(projectPath, task.setup.seedSessionSnapshot);
    await seedDecisions(projectPath, task.setup.seedDecisions);
    await seedExperiments(projectPath, task.setup.seedExperiments);
    await seedMarks(projectPath, task.setup.seedMarks);
    await seedSyncState(projectPath, task.setup.seedSyncState);

    if (task.taskId === 'flow-status-results-findability') {
      await prepareResultsFixture(projectPath, task);
    } else if (task.taskId === 'flow-results-package') {
      await seedSingleExperiment(projectPath, task.setup.seedExperiment);
      await seedOutputArtifacts(projectPath, task.setup.seedOutputArtifacts);
    }

    const beforeSnapshot = await captureRuntimeFiles(projectPath);
    const reader = createReaderStub(task.setup.kernelReader);
    const startedAt = new Date().toISOString();

    const execution = await runScenario(task, projectPath, reader);

    const endedAt = new Date().toISOString();
    const afterSnapshot = await captureRuntimeFiles(projectPath);
    const actualWrites = diffWrites(beforeSnapshot, afterSnapshot);
    const operatorStatus = await getOperatorStatus(projectPath);
    const attemptHistory = await getAttemptHistory(projectPath, {
      scope: task.command.scope,
      eventsPerAttempt: 100,
      decisionsPerAttempt: 100,
    });
    const attemptRecords = await readAttemptRecords(projectPath, execution.attempt.attemptId);
    const context = {
      benchmarkId,
      projectPath,
      startedAt,
      endedAt,
      elapsedSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
      result: execution.result,
      attempt: execution.attempt,
      snapshot: execution.snapshot,
      capabilities: operatorStatus.capabilities,
      actualWrites,
      attemptHistory,
      attemptRecords,
      placeholderValues: {
        attemptId: execution.attempt.attemptId,
      },
      outputExtras: execution.outputExtras ?? {},
      summaryActualResultExtras: execution.summaryActualResultExtras ?? {},
      summaryExtras: execution.summaryExtras ?? {},
    };
    const assertions = await evaluateAssertions(task, context);
    const metricResults = await evaluateMetrics(task, context, metricModules);
    const passed =
      assertions.every((assertion) => assertion.passed) &&
      Object.values(metricResults).every((metric) => metric.passed);

    return {
      context,
      assertions,
      metricResults,
      passed,
    };
  } finally {
    await cleanupEvalWorkspace(projectPath);
  }
}

async function runScenario(task, projectPath, reader) {
  if (task.taskId === 'sync-memory-refresh') {
    return runWithMiddleware({
      projectPath,
      commandName: '/sync-memory',
      scope: 'sync-memory',
      reader,
      commandFn: async () => {
        const syncResult = await syncMemory(projectPath, { reader });
        const summary =
          syncResult.status === 'ok'
            ? `Synced memory mirrors at ${syncResult.syncedAt}.`
            : `Synced memory mirrors at ${syncResult.syncedAt} with workspace-first degradation.`;

        return {
          summary,
          warnings: syncResult.warnings,
          signals: {
            staleMemory: false,
          },
          payload: syncResult,
        };
      },
    });
  }

  if (task.taskId === 'flow-status-stale-memory') {
    return runWithMiddleware({
      projectPath,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader,
      commandFn: async () => {
        const status = await getOperatorStatus(projectPath);
        return {
          summary:
            status.memory.warning ?? 'Memory freshness is current and available.',
          warnings: status.memory.warning ? [status.memory.warning] : [],
          signals: {
            staleMemory: status.memory.isStale,
          },
          payload: {
            memory: status.memory,
          },
        };
      },
    });
  }

  if (task.taskId === 'flow-results-package') {
    return runWithMiddleware({
      projectPath,
      commandName: '/flow-results',
      scope: 'flow-results',
      reader,
      commandFn: async () => {
        const packaged = await packageExperimentResults(
          projectPath,
          task.setup.seedExperiment.manifest.experimentId,
          task.setup.packageOptions,
        );

        return {
          summary: `Packaged results for ${packaged.experimentId} using workspace artifacts only.`,
          warnings: packaged.warnings,
          payload: {
            experimentId: packaged.experimentId,
            bundleDir: path.relative(projectPath, packaged.bundleDir).replace(/\\/gu, '/'),
            bundleManifestPath: path
              .relative(projectPath, packaged.bundleManifestPath)
              .replace(/\\/gu, '/'),
            bundleManifest: packaged.bundleManifest,
            warnings: packaged.warnings,
            copiedArtifacts: packaged.copiedArtifacts,
          },
        };
      },
    });
  }

  if (task.taskId === 'flow-status-results-findability') {
    return runWithMiddleware({
      projectPath,
      commandName: '/flow-status',
      scope: 'flow-status',
      reader,
      commandFn: async () => {
        const status = await getOperatorStatus(projectPath);
        const foundBundle =
          status.results.bundles.find(
            (entry) => entry.experimentId === task.setup.seedExperiment.manifest.experimentId,
          ) ?? null;
        const foundDigest =
          status.results.sessionDigests.find(
            (entry) => entry.digestId === 'DIGEST-session-2026-04-02-findability',
          ) ?? null;

        return {
          summary:
            foundBundle == null
              ? 'No packaged experiment results were discoverable from status.'
              : `Found packaged results for ${foundBundle.experimentId} at ${foundBundle.bundleDir}.`,
          warnings: status.results.warnings,
          signals: {
            staleMemory: status.memory.isStale,
          },
          payload: {
            results: status.results,
            foundBundle,
            foundDigest,
          },
        };
      },
    });
  }

  throw new Error(`Unsupported Phase 2 eval task: ${task.taskId}`);
}

async function saveOneTask(task, benchmarkId, metricModules) {
  const existingRepeats = await getExistingRepeats(task.taskId);
  const repeatId = nextRepeatId(existingRepeats);
  const { context, assertions, metricResults, passed } = await executeTask(
    task,
    benchmarkId,
    metricModules,
  );

  return saveTaskArtifacts({
    task,
    benchmarkId,
    repeatId,
    context,
    assertions,
    metricResults,
    passed,
  });
}

async function main() {
  const benchmark = await readJson(
    path.join(
      repoRoot,
      'environment',
      'evals',
      'benchmarks',
      'phase2-memory-packaging.benchmark.json',
    ),
  );
  const tasks = await Promise.all(
    benchmark.taskIds.map((taskId) =>
      readJson(path.join(repoRoot, 'environment', 'evals', 'tasks', `${taskId}.json`)),
    ),
  );
  const metricModules = await importMetricModules(benchmark.metricIds);
  const saved = [];

  for (const task of tasks) {
    saved.push(await saveOneTask(task, benchmark.benchmarkId, metricModules));
  }

  const failed = saved.filter((entry) => !entry.passed);
  if (failed.length > 0) {
    throw new Error(
      `Saved benchmark artifacts failed for: ${failed
        .map((entry) => `${entry.taskId}/${entry.repeatId}`)
        .join(', ')}`,
    );
  }

  return saved;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const results = await main();
    for (const result of results) {
      console.log(`saved ${result.taskId}/${result.repeatId}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as savePhase2Artifacts };
