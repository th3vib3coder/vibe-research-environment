import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAttemptHistory, getOperatorStatus } from '../control/query.js';
import { loadValidator, readJsonl } from '../control/_io.js';
import { runWithMiddleware } from '../control/middleware.js';
import { readFlowIndex, readFlowState } from '../lib/flow-state.js';
import { listManifests, readManifest } from '../lib/manifest.js';
import { registerExperiment } from '../flows/experiment.js';
import { registerPaper } from '../flows/literature.js';
import {
  cleanupEvalWorkspace,
  createEvalWorkspace,
  getRepoRoot,
  resolveWorkspacePath,
  seedWorkspaceFixtures
} from './_workspace.js';

const repoRoot = getRepoRoot();
const benchmarkRoot = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
  'benchmarks'
);
function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function importMetricModules(metricIds) {
  const modules = await Promise.all(
    metricIds.map(async (metricId) => {
      const module = await import(new URL(`./metrics/${metricId}.js`, import.meta.url));
      return [metricId, module];
    })
  );

  return Object.fromEntries(modules);
}

function deriveAllowedWritePrefixes(requiredWrites = []) {
  const prefixes = new Set();

  for (const filePath of requiredWrites) {
    if (!filePath.startsWith('.vibe-science-environment/')) {
      continue;
    }

    const segments = filePath.split('/');
    if (segments.length >= 2) {
      prefixes.add(`${segments.slice(0, 2).join('/')}/`);
    }
  }

  return [...prefixes].sort();
}

function createReaderStub(kernelReader = {}) {
  const projections = cloneValue(kernelReader.projections ?? {});
  const advanced = cloneValue(kernelReader.advancedCapabilities ?? kernelReader.capabilities ?? {});
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
    listLiteratureSearches: projectionReader('literatureSearches', [])
  };
}

async function captureRuntimeFiles(projectRoot) {
  const runtimeRoot = resolveWorkspacePath(projectRoot, '.vibe-science-environment');
  const snapshots = new Map();

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const targetPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(targetPath);
        continue;
      }

      const relative = path.relative(projectRoot, targetPath).replace(/\\/gu, '/');
      snapshots.set(relative, await readFile(targetPath, 'utf8'));
    }
  }

  await walk(runtimeRoot);
  return snapshots;
}

function diffWrites(beforeSnapshot, afterSnapshot) {
  const writes = [];
  for (const [filePath, contents] of afterSnapshot.entries()) {
    if (!beforeSnapshot.has(filePath) || beforeSnapshot.get(filePath) !== contents) {
      writes.push(filePath);
    }
  }
  return writes.sort();
}

function resolvePlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolvePlaceholders(entry, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolvePlaceholders(entry, context)])
    );
  }

  if (typeof value === 'string' && value.startsWith('$')) {
    return context[value.slice(1)] ?? value;
  }

  return value;
}

function matchSubset(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return false;
    }

    return expected.every((entry, index) => matchSubset(actual[index], entry));
  }

  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      return false;
    }

    return Object.entries(expected).every(([key, entry]) =>
      matchSubset(actual[key], entry)
    );
  }

  return Object.is(actual, expected);
}

async function evaluateAssertions(task, context) {
  const checks = [];
  const { expected } = task;

  checks.push({
    name: 'attempt-status',
    passed: context.attempt.status === expected.attemptStatus,
    expected: expected.attemptStatus,
    actual: context.attempt.status
  });

  if (expected.snapshotAssertions) {
    const resolved = resolvePlaceholders(expected.snapshotAssertions, context.placeholderValues);
    checks.push({
      name: 'session-snapshot',
      passed: matchSubset(context.snapshot, resolved),
      expected: resolved,
      actual: context.snapshot
    });
  }

  if (expected.flowStateAssertions) {
    const latestPaper =
      context.flowState?.papers?.[context.flowState.papers.length - 1] ?? null;
    const actual = {
      paperCount: context.flowState?.papers?.length ?? 0,
      latestPaper
    };
    const resolved = resolvePlaceholders(expected.flowStateAssertions, context.placeholderValues);
    checks.push({
      name: 'flow-state',
      passed: matchSubset(actual, resolved),
      expected: resolved,
      actual
    });
  }

  if (expected.manifestAssertions) {
    const resolved = resolvePlaceholders(expected.manifestAssertions, context.placeholderValues);
    checks.push({
      name: 'manifest',
      passed: matchSubset(context.manifest, resolved),
      expected: resolved,
      actual: context.manifest
    });
  }

  if (expected.indexAssertions) {
    const resolved = resolvePlaceholders(expected.indexAssertions, context.placeholderValues);
    checks.push({
      name: 'flow-index',
      passed: matchSubset(context.flowIndex, resolved),
      expected: resolved,
      actual: context.flowIndex
    });
  }

  checks.push({
    name: 'required-writes',
    passed: expected.requiredWrites.every((filePath) => context.actualWrites.includes(filePath)),
    expected: expected.requiredWrites,
    actual: context.actualWrites
  });

  checks.push({
    name: 'forbidden-writes',
    passed: context.actualWrites.every(
      (filePath) =>
        !expected.forbiddenPathPrefixes.some((prefix) => filePath.startsWith(prefix))
    ),
    expected: expected.forbiddenPathPrefixes,
    actual: context.actualWrites
  });

  if (expected.mustSurfaceDegradedReason) {
    const surfaceText = [
      context.result.summary ?? '',
      ...(context.result.warnings ?? []),
      context.snapshot?.kernel?.degradedReason ?? ''
    ]
      .join('\n')
      .toLowerCase();
    const degradedReason = String(context.snapshot?.kernel?.degradedReason ?? '').toLowerCase();
    checks.push({
      name: 'degraded-reason-visible',
      passed: degradedReason !== '' && surfaceText.includes(degradedReason),
      expected: context.snapshot?.kernel?.degradedReason ?? null,
      actual: {
        summary: context.result.summary ?? null,
        warnings: context.result.warnings ?? []
      }
    });
  }

  return checks;
}

async function evaluateMetrics(task, context, metricModules) {
  const snapshotValidator = await loadValidator(
    context.projectPath,
    'session-snapshot.schema.json'
  );
  const schemaValid = context.snapshot ? snapshotValidator(context.snapshot) : false;
  const results = {};

  for (const metricId of task.metrics) {
    const module = metricModules[metricId];
    if (!module) {
      throw new Error(`Unknown metric module: ${metricId}`);
    }

    const inputByMetric = {
      'resume-latency': {
        startedAt: context.startedAt,
        endedAt: context.endedAt,
        elapsedSeconds: context.elapsedSeconds,
        maxSeconds: task.expected.maxElapsedSeconds
      },
      'honesty-under-degradation': {
        degraded: context.snapshot?.kernel?.dbAvailable === false,
        snapshot: context.snapshot,
        output: context.result,
        fabricatedSignalKeys: ['unresolvedClaims', 'exportAlerts']
      },
      'state-write-scope': {
        actualWrites: context.actualWrites,
        allowedPrefixes: deriveAllowedWritePrefixes(task.expected.requiredWrites),
        forbiddenPrefixes: task.expected.forbiddenPathPrefixes
      },
      'attempt-lifecycle-completeness': {
        attemptRecords: context.attemptRecords
      },
      'snapshot-publish-success': {
        snapshot: context.snapshot,
        snapshotExists: context.snapshot != null,
        schemaValid,
        publishError:
          context.attempt.errorCode === 'SESSION_SNAPSHOT_FAILED'
            ? context.attempt.summary
            : null
      }
    };

    results[metricId] = module.evaluate(inputByMetric[metricId]);
  }

  return results;
}

function buildSummaryMetrics(metricResults) {
  return {
    resumeLatencySeconds: metricResults['resume-latency']?.value ?? null,
    degradedHonestyScore:
      metricResults['honesty-under-degradation']?.value ?? null,
    stateWriteScopeViolations:
      metricResults['state-write-scope']?.details?.violations?.length ?? null,
    attemptLifecycleCompleteness:
      metricResults['attempt-lifecycle-completeness']?.value ?? null,
    snapshotPublishSuccess:
      metricResults['snapshot-publish-success']?.value ?? null
  };
}

function buildTranscript(task, repeatId, context, assertions, metricResults) {
  const lines = [
    `# ${task.taskId} — ${repeatId}`,
    '',
    `- Benchmark: ${context.benchmarkId}`,
    `- Command: ${task.command.name}${task.command.args.length > 0 ? ` ${task.command.args.join(' ')}` : ''}`,
    `- Started: ${context.startedAt}`,
    `- Ended: ${context.endedAt}`,
    `- Elapsed seconds: ${context.elapsedSeconds}`,
    `- Attempt: ${context.attempt.attemptId} (${context.attempt.status})`,
    '',
    '## Goal',
    task.goal,
    '',
    '## Setup',
    `- Workspace fixtures: ${task.setup.workspaceFixtures.length}`,
    `- Kernel db available: ${Boolean(task.setup.kernelReader?.dbAvailable)}`,
    `- Command input: ${task.setup.commandInput ? 'provided' : 'none'}`,
    '',
    '## Actual Writes'
  ];

  for (const filePath of context.actualWrites) {
    lines.push(`- ${filePath}`);
  }

  lines.push('', '## Assertions');
  for (const assertion of assertions) {
    lines.push(`- ${assertion.name}: ${assertion.passed ? 'PASS' : 'FAIL'}`);
  }

  lines.push('', '## Metrics');
  for (const [metricId, result] of Object.entries(metricResults)) {
    lines.push(`- ${metricId}: ${result.passed ? 'PASS' : 'FAIL'} (value=${result.value})`);
  }

  lines.push('', '## Output Summary');
  lines.push(`- Summary: ${context.result.summary ?? 'n/a'}`);
  lines.push(`- Warnings: ${(context.result.warnings ?? []).join(' | ') || 'none'}`);
  lines.push(`- Snapshot lastCommand: ${context.snapshot?.lastCommand ?? 'n/a'}`);
  lines.push(`- Snapshot degradedReason: ${context.snapshot?.kernel?.degradedReason ?? 'none'}`);

  return `${lines.join('\n')}\n`;
}

function nextRepeatId(existingRepeats) {
  const today = new Date().toISOString().slice(0, 10);
  const prefix = `${today}-`;
  let index = 1;

  while (existingRepeats.includes(`${prefix}${String(index).padStart(2, '0')}`)) {
    index += 1;
  }

  return `${prefix}${String(index).padStart(2, '0')}`;
}

async function getExistingRepeats(taskId) {
  const taskRoot = path.join(benchmarkRoot, taskId);
  try {
    const entries = await readdir(taskRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function executeTask(task, benchmarkId, metricModules) {
  const projectPath = await createEvalWorkspace(`vre-eval-${task.taskId}-`);

  try {
    await seedWorkspaceFixtures(projectPath, task.setup.workspaceFixtures);
    const beforeSnapshot = await captureRuntimeFiles(projectPath);
    const reader = createReaderStub(task.setup.kernelReader);
    const startedAt = new Date().toISOString();

    let execution;
    if (task.taskId === 'flow-literature-register') {
      execution = await runWithMiddleware({
        projectPath,
        commandName: task.command.name,
        scope: task.command.scope,
        reader,
        commandFn: async () => {
          const flowResult = await registerPaper(projectPath, task.setup.commandInput);
          return {
            summary: `Registered paper ${flowResult.paper.id}.`,
            warnings: flowResult.warnings,
            paper: flowResult.paper,
            flowState: flowResult.state,
            flowIndex: flowResult.index
          };
        }
      });
    } else if (task.taskId === 'flow-experiment-register') {
      execution = await runWithMiddleware({
        projectPath,
        commandName: task.command.name,
        scope: task.command.scope,
        targetId: task.setup.commandInput.experimentId,
        reader,
        commandFn: async ({ attempt }) => {
          const flowResult = await registerExperiment(projectPath, {
            ...task.setup.commandInput,
            latestAttemptId: attempt.attemptId
          });
          return {
            summary: `Registered manifest ${flowResult.manifest.experimentId}.`,
            warnings: [],
            manifest: flowResult.manifest,
            flowState: flowResult.summary,
            flowIndex: flowResult.index
          };
        }
      });
    } else {
      execution = await runWithMiddleware({
        projectPath,
        commandName: task.command.name,
        scope: task.command.scope,
        reader,
        commandFn: async ({ degraded }) => {
          const index = await readFlowIndex(projectPath);
          return {
            summary: degraded
              ? 'Kernel unavailable; resumed from flow-local state only.'
              : `Resumed ${index.activeFlow ?? 'idle'} at ${index.currentStage ?? 'unknown stage'}.`,
            warnings: degraded ? [reader.error ?? 'kernel unavailable'] : [],
            flowIndex: index
          };
        }
      });
    }

    const endedAt = new Date().toISOString();
    const afterSnapshot = await captureRuntimeFiles(projectPath);
    const actualWrites = diffWrites(beforeSnapshot, afterSnapshot);
    const operatorStatus = await getOperatorStatus(projectPath);
    const attemptHistory = await getAttemptHistory(projectPath, {
      scope: task.command.scope,
      eventsPerAttempt: 100,
      decisionsPerAttempt: 100
    });
    const flowIndex = await readFlowIndex(projectPath);
    const flowState =
      task.taskId === 'flow-literature-register'
        ? await readFlowState(projectPath, 'literature')
        : task.taskId === 'flow-experiment-register'
          ? await readFlowState(projectPath, 'experiment')
          : null;
    const manifest =
      task.taskId === 'flow-experiment-register'
        ? await readManifest(projectPath, task.setup.commandInput.experimentId)
        : null;
    const attemptsPath = resolveWorkspacePath(
      projectPath,
      '.vibe-science-environment/control/attempts.jsonl'
    );
    const attemptRecords = (await readJsonl(attemptsPath)).filter(
      (record) => record.attemptId === execution.attempt.attemptId
    );
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
      flowIndex,
      flowState,
      manifest,
      attemptHistory,
      attemptRecords,
      placeholderValues: {
        attemptId: execution.attempt.attemptId
      }
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
      passed
    };
  } finally {
    await cleanupEvalWorkspace(projectPath);
  }
}

async function saveTaskArtifacts(task, benchmarkId, metricModules) {
  const existingRepeats = await getExistingRepeats(task.taskId);
  const repeatId = nextRepeatId(existingRepeats);
  const { context, assertions, metricResults, passed } = await executeTask(
    task,
    benchmarkId,
    metricModules
  );
  const artifactRoot = path.join(benchmarkRoot, task.taskId, repeatId);

  const input = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    taskVersion: task.version,
    command: task.command,
    goal: task.goal,
    setup: cloneValue(task.setup),
    expected: cloneValue(task.expected)
  };
  const output = {
    taskId: task.taskId,
    benchmarkId,
    command: task.command,
    result: context.result,
    attempt: context.attempt,
    snapshot: context.snapshot,
    capabilities: context.capabilities,
    flowIndex: context.flowIndex,
    flowState: context.flowState,
    manifest: context.manifest,
    attemptHistory: context.attemptHistory,
    actualWrites: context.actualWrites,
    assertions
  };
  const metrics = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    results: metricResults
  };
  const summary = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    startedAt: context.startedAt,
    endedAt: context.endedAt,
    passed,
    command: task.command,
    attemptId: context.attempt.attemptId,
    attemptStatus: context.attempt.status,
    transcriptPath: `.vibe-science-environment/operator-validation/benchmarks/${task.taskId}/${repeatId}/transcript.md`,
    expectedResult: cloneValue(task.expected),
    actualResult: {
      result: context.result,
      snapshot: context.snapshot,
      flowIndex: context.flowIndex,
      actualWrites: context.actualWrites
    },
    metrics: buildSummaryMetrics(metricResults),
    checksPassed: assertions.filter((assertion) => assertion.passed).length,
    checksTotal: assertions.length,
    actualWrites: context.actualWrites
  };
  const transcript = buildTranscript(task, repeatId, context, assertions, metricResults);

  await writeJson(path.join(artifactRoot, 'input.json'), input);
  await writeJson(path.join(artifactRoot, 'output.json'), output);
  await writeJson(path.join(artifactRoot, 'metrics.json'), metrics);
  await writeJson(path.join(artifactRoot, 'summary.json'), summary);
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, 'transcript.md'), transcript, 'utf8');

  return {
    taskId: task.taskId,
    repeatId,
    passed
  };
}

async function main() {
  const benchmark = await readJson(
    path.join(repoRoot, 'environment', 'evals', 'benchmarks', 'phase1-core.benchmark.json')
  );
  const tasks = await Promise.all(
    benchmark.taskIds.map((taskId) =>
      readJson(path.join(repoRoot, 'environment', 'evals', 'tasks', `${taskId}.json`))
    )
  );
  const metricModules = await importMetricModules(benchmark.metricIds);
  const saved = [];

  for (const task of tasks) {
    saved.push(await saveTaskArtifacts(task, benchmark.benchmarkId, metricModules));
  }

  const failed = saved.filter((entry) => !entry.passed);
  if (failed.length > 0) {
    throw new Error(
      `Saved benchmark artifacts failed for: ${failed
        .map((entry) => `${entry.taskId}/${entry.repeatId}`)
        .join(', ')}`
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

export { main as savePhase1Artifacts };
