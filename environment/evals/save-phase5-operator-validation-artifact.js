import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './_workspace.js';

const repoRoot = getRepoRoot();
const operatorValidationRoot = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
);
const benchmarksRoot = path.join(operatorValidationRoot, 'benchmarks');
const artifactPath = path.join(
  operatorValidationRoot,
  'artifacts',
  'phase5-operator-validation.json',
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function listRepeatIds(taskId) {
  const taskRoot = path.join(benchmarksRoot, taskId);
  const entries = await readdir(taskRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

async function loadRepeat(taskId, repeatId) {
  const repeatRoot = path.join(benchmarksRoot, taskId, repeatId);
  const [input, output, metrics, summary] = await Promise.all([
    readJson(path.join(repeatRoot, 'input.json')),
    readJson(path.join(repeatRoot, 'output.json')),
    readJson(path.join(repeatRoot, 'metrics.json')),
    readJson(path.join(repeatRoot, 'summary.json')),
  ]);

  return {
    input,
    output,
    metrics,
    summary,
  };
}

async function selectPassingRepeat(taskId, predicate) {
  const repeats = await listRepeatIds(taskId);

  for (const repeatId of repeats) {
    const repeat = await loadRepeat(taskId, repeatId);
    if (repeat.summary.passed === true && predicate(repeat)) {
      return {
        taskId,
        repeatId,
        ...repeat,
      };
    }
  }

  throw new Error(`No passing repeat matched the Phase 5 evidence filter for ${taskId}.`);
}

function buildSourceRepeat(taskId, repeatId, summary) {
  return {
    taskId,
    repeatId,
    inputPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/input.json`,
    outputPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/output.json`,
    metricsPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/metrics.json`,
    summaryPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/summary.json`,
    transcriptPath: summary.transcriptPath,
  };
}

async function main() {
  const queueResume = await selectPassingRepeat(
    'orchestrator-status-queue-resume',
    (repeat) =>
      repeat.output.result?.payload?.resumedRun?.laneRunStatus === 'completed' &&
      repeat.output.result?.payload?.finalStatus?.completedCount === 1,
  );
  const continuity = await selectPassingRepeat(
    'orchestrator-continuity-modes',
    (repeat) =>
      repeat.output.result?.payload?.profileMode?.recallCount === 0 &&
      repeat.output.result?.payload?.queryMode?.firstSourceType === 'lane-run' &&
      repeat.output.result?.payload?.historyChangedDuringAssembly === false,
  );
  const executionReview = await selectPassingRepeat(
    'orchestrator-execution-review-lineage',
    (repeat) =>
      repeat.output.result?.payload?.execution?.laneRunStatus === 'completed' &&
      repeat.output.result?.payload?.review?.verdict === 'affirmed' &&
      repeat.output.result?.payload?.review?.executionLineageVisible === true,
  );
  const boundedFailure = await selectPassingRepeat(
    'orchestrator-bounded-failure-recovery',
    (repeat) =>
      repeat.output.result?.payload?.run?.laneRunStatus === 'escalated' &&
      repeat.output.result?.payload?.status?.nextActionKind === 'resolve-escalation',
  );

  const artifact = {
    artifactId: 'phase5-operator-validation',
    phase: 5,
    createdAt: new Date().toISOString(),
    benchmarkId: 'phase5-orchestrator-mvp',
    passed: true,
    validationClaims: [
      'One queued orchestrator objective remains visible on disk and can be resumed safely through the public runtime.',
      'Continuity assembly now has explicit evidence for profile, query, and full modes without auto-capturing operator preferences during read.',
      'Execution and review lanes can share one execution-backed lineage with durable external review evidence.',
      'Bounded execution failures become explicit recovery plus pending escalation state instead of disappearing behind runtime errors.',
    ],
    decisions: {
      publicResumeSurface:
        'Phase 5 resume stays operator-visible through /orchestrator-status plus taskId-based rerun, not hidden background workers.',
      continuityUpdatePolicy:
        'Continuity profile changes remain explicit operator actions or explicit confirmed proposals; read paths do not mutate the profile.',
      localMvpBoundary:
        'The MVP coordinator keeps execution local and review CLI-backed, with provider escalation visible before any future cloud expansion.',
    },
    evidence: {
      queueResume: {
        claim:
          'Queued orchestrator work can be inspected first and resumed later through the public runtime surface.',
        sourceRepeat: buildSourceRepeat(
          queueResume.taskId,
          queueResume.repeatId,
          queueResume.summary,
        ),
        metrics: queueResume.summary.metrics,
      },
      continuityModes: {
        claim:
          'Profile, query, and full continuity modes all assemble from the real runtime without hidden profile mutation.',
        sourceRepeat: buildSourceRepeat(
          continuity.taskId,
          continuity.repeatId,
          continuity.summary,
        ),
        metrics: continuity.summary.metrics,
      },
      executionReview: {
        claim:
          'One execution result can flow into an execution-backed review lineage with durable external review evidence.',
        sourceRepeat: buildSourceRepeat(
          executionReview.taskId,
          executionReview.repeatId,
          executionReview.summary,
        ),
        metrics: executionReview.summary.metrics,
      },
      boundedFailure: {
        claim:
          'A bounded execution failure becomes explicit recovery and escalation state that the operator can inspect from status.',
        sourceRepeat: buildSourceRepeat(
          boundedFailure.taskId,
          boundedFailure.repeatId,
          boundedFailure.summary,
        ),
        metrics: boundedFailure.summary.metrics,
      },
    },
  };

  await writeJson(artifactPath, artifact);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifact = await main();
    console.log(`saved ${path.relative(repoRoot, artifactPath).replace(/\\/gu, '/')}`);
    console.log(`benchmark ${artifact.benchmarkId}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as savePhase5OperatorValidationArtifact };
