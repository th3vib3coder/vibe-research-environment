import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadValidator } from '../control/_io.js';
import { getRepoRoot, resolveWorkspacePath } from './_workspace.js';

const repoRoot = getRepoRoot();
const benchmarkRoot = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
  'benchmarks',
);

export function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function importMetricModules(metricIds) {
  const modules = await Promise.all(
    metricIds.map(async (metricId) => {
      const module = await import(new URL(`./metrics/${metricId}.js`, import.meta.url));
      return [metricId, module];
    }),
  );

  return Object.fromEntries(modules);
}

export function deriveAllowedWritePrefixes(requiredWrites = []) {
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

export async function captureRuntimeFiles(projectRoot) {
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

export function diffWrites(beforeSnapshot, afterSnapshot) {
  const writes = [];
  for (const [filePath, contents] of afterSnapshot.entries()) {
    if (!beforeSnapshot.has(filePath) || beforeSnapshot.get(filePath) !== contents) {
      writes.push(filePath);
    }
  }
  return writes.sort();
}

export function resolvePlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolvePlaceholders(entry, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolvePlaceholders(entry, context)]),
    );
  }

  if (typeof value === 'string' && value.startsWith('$')) {
    return context[value.slice(1)] ?? value;
  }

  return value;
}

export function matchSubset(actual, expected) {
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

    return Object.entries(expected).every(([key, entry]) => matchSubset(actual[key], entry));
  }

  return Object.is(actual, expected);
}

async function readWorkspaceFile(projectPath, repoRelativePath, kind) {
  const absolutePath = resolveWorkspacePath(projectPath, repoRelativePath);
  const contents = await readFile(absolutePath, 'utf8');
  return kind === 'json-subset' ? JSON.parse(contents) : contents;
}

async function evaluateFileAssertion(assertion, context) {
  const resolvedExpected = resolvePlaceholders(
    assertion.value,
    context.placeholderValues,
  );
  const actual = await readWorkspaceFile(context.projectPath, assertion.path, assertion.kind);

  if (assertion.kind === 'json-subset') {
    return {
      name: `file:${assertion.path}`,
      passed: matchSubset(actual, resolvedExpected),
      expected: resolvedExpected,
      actual,
    };
  }

  if (assertion.kind === 'text-includes') {
    const needles = Array.isArray(resolvedExpected) ? resolvedExpected : [resolvedExpected];
    return {
      name: `file:${assertion.path}`,
      passed: needles.every((needle) => actual.includes(String(needle))),
      expected: needles,
      actual,
    };
  }

  throw new Error(`Unsupported file assertion kind: ${assertion.kind}`);
}

export async function evaluateAssertions(task, context) {
  const checks = [];
  const { expected } = task;

  checks.push({
    name: 'attempt-status',
    passed: context.attempt.status === expected.attemptStatus,
    expected: expected.attemptStatus,
    actual: context.attempt.status,
  });

  if (expected.snapshotAssertions) {
    const resolved = resolvePlaceholders(expected.snapshotAssertions, context.placeholderValues);
    checks.push({
      name: 'session-snapshot',
      passed: matchSubset(context.snapshot, resolved),
      expected: resolved,
      actual: context.snapshot,
    });
  }

  if (expected.resultAssertions) {
    const resolved = resolvePlaceholders(expected.resultAssertions, context.placeholderValues);
    checks.push({
      name: 'command-result',
      passed: matchSubset(context.result, resolved),
      expected: resolved,
      actual: context.result,
    });
  }

  if (Array.isArray(expected.fileAssertions)) {
    for (const assertion of expected.fileAssertions) {
      checks.push(await evaluateFileAssertion(assertion, context));
    }
  }

  checks.push({
    name: 'required-writes',
    passed: expected.requiredWrites.every((filePath) => context.actualWrites.includes(filePath)),
    expected: expected.requiredWrites,
    actual: context.actualWrites,
  });

  checks.push({
    name: 'forbidden-writes',
    passed: context.actualWrites.every(
      (filePath) =>
        !expected.forbiddenPathPrefixes.some((prefix) => filePath.startsWith(prefix)),
    ),
    expected: expected.forbiddenPathPrefixes,
    actual: context.actualWrites,
  });

  if (expected.mustSurfaceDegradedReason) {
    const surfaceText = [
      context.result.summary ?? '',
      ...(context.result.warnings ?? []),
      context.snapshot?.kernel?.degradedReason ?? '',
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
        warnings: context.result.warnings ?? [],
      },
    });
  }

  return checks;
}

export async function evaluateMetrics(task, context, metricModules) {
  const snapshotValidator = await loadValidator(
    context.projectPath,
    'session-snapshot.schema.json',
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
        maxSeconds: task.expected.maxElapsedSeconds,
      },
      'honesty-under-degradation': {
        degraded: context.snapshot?.kernel?.dbAvailable === false,
        snapshot: context.snapshot,
        output: context.result,
        fabricatedSignalKeys: ['unresolvedClaims', 'exportAlerts'],
      },
      'state-write-scope': {
        actualWrites: context.actualWrites,
        allowedPrefixes: deriveAllowedWritePrefixes(task.expected.requiredWrites),
        forbiddenPrefixes: task.expected.forbiddenPathPrefixes,
      },
      'attempt-lifecycle-completeness': {
        attemptRecords: context.attemptRecords,
      },
      'snapshot-publish-success': {
        snapshot: context.snapshot,
        snapshotExists: context.snapshot != null,
        schemaValid,
        publishError:
          context.attempt.errorCode === 'SESSION_SNAPSHOT_FAILED'
            ? context.attempt.summary
            : null,
      },
    };

    results[metricId] = module.evaluate(inputByMetric[metricId]);
  }

  return results;
}

function notApplicableMetric(metricId, reason = null) {
  return {
    status: 'not-applicable',
    reason: reason ?? `Metric ${metricId} is not part of this eval task definition.`,
  };
}

function metricValue(metricResults, metricId) {
  if (!Object.hasOwn(metricResults, metricId)) {
    return notApplicableMetric(metricId);
  }

  const value = metricResults[metricId]?.value;
  return value ?? notApplicableMetric(metricId, `Metric ${metricId} did not produce a numeric value for this repeat.`);
}

function metricDetailValue(metricResults, metricId, readValue) {
  if (!Object.hasOwn(metricResults, metricId)) {
    return notApplicableMetric(metricId);
  }

  const value = readValue(metricResults[metricId]);
  return value ?? notApplicableMetric(metricId, `Metric ${metricId} did not produce the requested summary detail.`);
}

export function buildSummaryMetrics(metricResults) {
  return {
    resumeLatencySeconds: metricValue(metricResults, 'resume-latency'),
    degradedHonestyScore: metricValue(metricResults, 'honesty-under-degradation'),
    stateWriteScopeViolations: metricDetailValue(
      metricResults,
      'state-write-scope',
      (metric) => metric?.details?.violations?.length,
    ),
    attemptLifecycleCompleteness: metricValue(metricResults, 'attempt-lifecycle-completeness'),
    snapshotPublishSuccess: metricValue(metricResults, 'snapshot-publish-success'),
  };
}

export function buildTranscript(task, repeatId, context, assertions, metricResults) {
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
    '## Actual Writes',
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

export async function getExistingRepeats(taskId) {
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

export function nextRepeatId(existingRepeats, now = new Date()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const prefix = `${today}-`;
  let index = 1;

  while (existingRepeats.includes(`${prefix}${String(index).padStart(2, '0')}`)) {
    index += 1;
  }

  return `${prefix}${String(index).padStart(2, '0')}`;
}

export async function saveTaskArtifacts({
  task,
  benchmarkId,
  repeatId,
  context,
  assertions,
  metricResults,
  passed,
}) {
  const artifactRoot = path.join(benchmarkRoot, task.taskId, repeatId);

  const input = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    taskVersion: task.version,
    command: task.command,
    goal: task.goal,
    setup: cloneValue(task.setup),
    expected: cloneValue(task.expected),
  };
  const output = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    command: task.command,
    result: context.result,
    attempt: context.attempt,
    snapshot: context.snapshot,
    capabilities: context.capabilities,
    actualWrites: context.actualWrites,
    ...(context.outputExtras ?? {}),
    assertions,
  };
  const metrics = {
    taskId: task.taskId,
    repeatId,
    benchmarkId,
    results: metricResults,
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
      actualWrites: context.actualWrites,
      ...(context.summaryActualResultExtras ?? {}),
    },
    metrics: buildSummaryMetrics(metricResults),
    checksPassed: assertions.filter((assertion) => assertion.passed).length,
    checksTotal: assertions.length,
    actualWrites: context.actualWrites,
    ...(context.summaryExtras ?? {}),
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
    passed,
  };
}

export async function importRepoModule(repoRelativePath) {
  return import(pathToFileURL(path.join(repoRoot, repoRelativePath)).href);
}
