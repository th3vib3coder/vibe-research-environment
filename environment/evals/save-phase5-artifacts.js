import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonl } from '../control/_io.js';
import { runWithMiddleware } from '../control/middleware.js';
import { getAttemptHistory, getOperatorStatus } from '../control/query.js';
import {
  clearContinuityAssemblyCache,
  assembleContinuityContext,
  formatContinuityForPrompt,
} from '../orchestrator/context-assembly.js';
import { listContinuityProfileHistory } from '../orchestrator/continuity-profile.js';
import { applyContinuityProfileUpdate } from '../orchestrator/continuity-profile.js';
import { routeOrchestratorObjective } from '../orchestrator/router.js';
import { runOrchestratorObjective, runOrchestratorStatus } from '../orchestrator/runtime.js';
import {
  captureRuntimeFiles,
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
  preparePhase5Workspace,
} from './_orchestrator-fixture.js';
import {
  cleanupEvalWorkspace,
  createEvalWorkspace,
  getRepoRoot,
  resolveWorkspacePath,
} from './_workspace.js';

const repoRoot = getRepoRoot();
const DEFAULT_READER = Object.freeze({
  dbAvailable: false,
  error: 'bridge unavailable',
});

function summarizeStatusResult(statusResult) {
  return {
    queueTotal: statusResult.result.payload.queue.total,
    readyCount: statusResult.result.payload.queue.byDerivedStatus.ready ?? 0,
    completedCount: statusResult.result.payload.queue.byDerivedStatus.completed ?? 0,
    escalatedCount: statusResult.result.payload.queue.byDerivedStatus.escalated ?? 0,
    nextActionKind: statusResult.result.payload.nextRecommendedOperatorAction.kind,
    activeObjective: statusResult.result.payload.activeObjective,
    latestRecoveryFailureClass:
      statusResult.result.payload.latestRecoveryAction?.failureClass ?? null,
    latestEscalationStatus:
      statusResult.result.payload.latestEscalationOrBlocker?.status ?? null,
  };
}

async function readAttemptRecords(projectPath, attemptId) {
  const attemptsPath = resolveWorkspacePath(
    projectPath,
    '.vibe-science-environment/control/attempts.jsonl',
  );
  const records = await readJsonl(attemptsPath);
  return records.filter((record) => record.attemptId === attemptId);
}

async function executeQueueResumeScenario(projectPath) {
  const routed = await routeOrchestratorObjective(projectPath, {
    objective: 'Export a session digest for the current workspace.',
  });
  const firstStatus = await runOrchestratorStatus({
    projectPath,
    reader: DEFAULT_READER,
  });
  const resumedRun = await runOrchestratorObjective({
    projectPath,
    taskId: routed.task.taskId,
    objective: routed.task.objective,
    sourceSessionId: 'ORCH-SESSION-RESUME',
    reader: DEFAULT_READER,
  });
  const finalStatus = await runOrchestratorStatus({
    projectPath,
    reader: DEFAULT_READER,
  });

  return {
    attempt: finalStatus.attempt,
    snapshot: finalStatus.snapshot,
    result: {
      summary: 'Status surfaced one queued task, then the public runtime resumed it safely.',
      warnings: finalStatus.result.warnings ?? [],
      payload: {
        firstStatus: summarizeStatusResult(firstStatus),
        resumedRun: {
          laneRunStatus: resumedRun.result.payload.coordinator.execution.laneRun.status,
          taskStatus: resumedRun.result.payload.coordinator.execution.task.status,
          artifactCount:
            resumedRun.result.payload.coordinator.execution.task.artifactRefs.length,
          digestId:
            resumedRun.result.payload.coordinator.execution.payload.digest.digestId,
          resumedTaskId: resumedRun.result.payload.coordinator.route.task.taskId,
        },
        finalStatus: summarizeStatusResult(finalStatus),
      },
    },
  };
}

async function executeContinuityModesScenario(projectPath) {
  await runOrchestratorObjective({
    projectPath,
    objective: 'Export a session digest for the current workspace.',
    sourceSessionId: 'ORCH-SESSION-CONTEXT',
    reader: DEFAULT_READER,
  });

  const explicitUpdates = [
    {
      path: '/operator/reportVerbosity',
      newValue: 'concise',
      reason: 'Phase 5 eval seeds one explicit report preference.',
      actor: 'operator',
      recordedAt: '2026-04-10T09:00:00Z',
    },
    {
      path: '/project/primaryAudience',
      newValue: 'advisor',
      reason: 'Phase 5 eval seeds one explicit audience preference.',
      actor: 'operator',
      recordedAt: '2026-04-10T09:01:00Z',
    },
  ];

  for (const update of explicitUpdates) {
    await applyContinuityProfileUpdate(projectPath, update);
  }

  clearContinuityAssemblyCache();
  const execution = await runWithMiddleware({
    projectPath,
    commandName: '/orchestrator-status',
    scope: 'orchestrator-status',
    reader: DEFAULT_READER,
    commandFn: async () => {
      const historyBefore = await listContinuityProfileHistory(projectPath, { limit: 20 });
      const profile = await assembleContinuityContext(projectPath, {
        mode: 'profile',
        laneId: 'execution',
        maxTokens: 4000,
        disableCache: true,
      });
      const query = await assembleContinuityContext(projectPath, {
        mode: 'query',
        laneId: 'review',
        queryText: 'lane run',
        limit: 3,
        maxTokens: 4000,
        disableCache: true,
      });
      const full = await assembleContinuityContext(projectPath, {
        mode: 'full',
        laneId: 'review',
        queryText: 'lane run',
        limit: 3,
        maxTokens: 6000,
        disableCache: true,
      });
      const historyAfter = await listContinuityProfileHistory(projectPath, { limit: 20 });

      return {
        summary: 'Assembled profile, query, and full continuity modes without mutating the profile during read.',
        warnings: [],
        payload: {
          profileMode: {
            hasStableProfile: Object.keys(profile.stableProfile).length > 0,
            hasDynamicContext: Object.keys(profile.dynamicContext).length > 0,
            recallCount: profile.retrievalHits.length,
            totalTokens: profile.totalTokens,
            formattedLength: formatContinuityForPrompt(profile).length,
          },
          queryMode: {
            hasStableProfile: Object.keys(query.stableProfile).length > 0,
            hasDynamicContext: Object.keys(query.dynamicContext).length > 0,
            recallCount: query.retrievalHits.length,
            firstSourceType: query.retrievalHits[0]?.sourceType ?? null,
            totalTokens: query.totalTokens,
            formattedLength: formatContinuityForPrompt(query).length,
          },
          fullMode: {
            hasStableProfile: Object.keys(full.stableProfile).length > 0,
            hasDynamicContext: Object.keys(full.dynamicContext).length > 0,
            recallCount: full.retrievalHits.length,
            firstSourceType: full.retrievalHits[0]?.sourceType ?? null,
            totalTokens: full.totalTokens,
            formattedLength: formatContinuityForPrompt(full).length,
          },
          historyBeforeAssemblyCount: historyBefore.length,
          historyAfterAssemblyCount: historyAfter.length,
          historyChangedDuringAssembly: historyBefore.length !== historyAfter.length,
        },
      };
    },
  });

  return {
    attempt: execution.attempt,
    snapshot: execution.snapshot,
    result: execution.result,
  };
}

function buildMockReviewExecutor() {
  // WP-131: explicitly mocked path. Evidence generated under this executor
  // MUST be labeled `evidenceMode: "mocked-review"` and downgrades the
  // phase5-closeout review gate to PARTIAL (see WP-146).
  return {
    'openai/codex:local-cli': async ({ comparedArtifactRefs }) => ({
      verdict: 'affirmed',
      materialMismatch: false,
      summary: `Review affirmed ${comparedArtifactRefs.length} exported artifact refs.`,
      followUpAction: 'none',
    }),
  };
}

function buildSmokeReviewExecutor() {
  // WP-131: smoke path. A real subprocess round-trips the envelope through
  // `node -e`, so every CI run exercises the provider gateway spawn pipeline
  // without requiring a Codex/Claude CLI on PATH. Evidence is labeled
  // `evidenceMode: "smoke-real-subprocess"`.
  const script = [
    "let data='';",
    "process.stdin.on('data',c=>{data+=c;});",
    "process.stdin.on('end',()=>{",
    "  let parsed={};",
    "  try{parsed=JSON.parse(data);}catch(e){}",
    "  const refs=Array.isArray(parsed.comparedArtifactRefs)?parsed.comparedArtifactRefs:[];",
    "  const out={schemaVersion:'vibe-orch.local-subprocess.output.v1',verdict:'affirmed',materialMismatch:false,summary:`smoke review affirmed ${refs.length} refs`,followUpAction:'none'};",
    "  process.stdout.write(JSON.stringify(out));",
    "});",
  ].join('');
  return {
    'openai/codex:local-subprocess': async (payload, binding) => {
      const { invokeLocalSubprocess } = await import('../orchestrator/executors/local-subprocess.js');
      return invokeLocalSubprocess({
        command: process.execPath,
        args: ['-e', script],
        stdinPayload: payload,
        timeoutMs: 15_000,
      });
    },
  };
}

function resolveReviewEvidenceMode() {
  const requested = (process.env.VRE_REVIEW_EVIDENCE_MODE ?? '').trim();
  if (requested === 'mocked-review' || requested === 'smoke-real-subprocess' || requested === 'real-cli-binding') {
    return requested;
  }
  if (process.env.VRE_CODEX_CLI || process.env.VRE_CLAUDE_CLI) {
    return 'real-cli-binding';
  }
  return 'smoke-real-subprocess';
}

async function buildReviewExecutorForMode(mode) {
  if (mode === 'mocked-review') {
    return buildMockReviewExecutor();
  }
  if (mode === 'real-cli-binding') {
    const command = process.env.VRE_CODEX_CLI ?? process.env.VRE_CLAUDE_CLI;
    if (!command) {
      throw new Error(
        'real-cli-binding evidence mode requires VRE_CODEX_CLI or VRE_CLAUDE_CLI; refusing to relabel mock review as real evidence.',
      );
    }
    const { invokeLocalSubprocess } = await import('../orchestrator/executors/local-subprocess.js');
    return {
      'openai/codex:local-subprocess': async (payload) =>
        invokeLocalSubprocess({
          command,
          args: [],
          envPassthrough: ['VRE_CODEX_CLI', 'VRE_CLAUDE_CLI'],
          stdinPayload: payload,
        }),
    };
  }
  return buildSmokeReviewExecutor();
}

async function executeExecutionReviewLineageScenario(projectPath) {
  const executionRun = await runOrchestratorObjective({
    projectPath,
    objective: 'Export a session digest for the current workspace.',
    sourceSessionId: 'ORCH-SESSION-REVIEW',
    reader: DEFAULT_READER,
  });
  const executionTaskId = executionRun.result.payload.coordinator.route.task.taskId;

  const evidenceMode = resolveReviewEvidenceMode();
  const providerExecutors = await buildReviewExecutorForMode(evidenceMode);
  const reviewRun = await runOrchestratorObjective({
    projectPath,
    objective: 'Run a contrarian review of the current digest.',
    requestedMode: 'review',
    targetRef: {
      kind: 'queue-task',
      id: executionTaskId,
    },
    providerExecutors,
    reader: DEFAULT_READER,
  });
  const status = await runOrchestratorStatus({
    projectPath,
    reader: DEFAULT_READER,
  });

  const reviewCoordinator = reviewRun.result.payload.coordinator.review;
  const executionCoordinator = executionRun.result.payload.coordinator.execution;

  return {
    attempt: reviewRun.attempt,
    snapshot: reviewRun.snapshot,
    result: {
      summary: 'Execution and review lanes completed one visible lineage with explicit external review evidence.',
      warnings: status.result.warnings ?? [],
      payload: {
        execution: {
          laneRunStatus: executionCoordinator.laneRun.status,
          taskStatus: executionCoordinator.task.status,
          artifactCount: executionCoordinator.task.artifactRefs.length,
          digestId: executionCoordinator.payload.digest.digestId,
          laneRunId: executionCoordinator.laneRun.laneRunId,
          taskId: executionCoordinator.task.taskId,
        },
        review: {
          laneRunStatus: reviewCoordinator.laneRun.status,
          taskStatus: reviewCoordinator.task.status,
          verdict: reviewCoordinator.externalReview.verdict,
          comparedArtifactCount:
            reviewCoordinator.externalReview.comparedArtifactRefs.length,
          executionLineageVisible:
            reviewCoordinator.externalReview.executionLaneRunId ===
            executionCoordinator.laneRun.laneRunId,
          reviewLaneRunId: reviewCoordinator.laneRun.laneRunId,
          evidenceMode,
        },
        status: summarizeStatusResult(status),
      },
    },
  };
}

async function executeBoundedFailureScenario(projectPath) {
  const run = await runOrchestratorObjective({
    projectPath,
    objective: 'Run an unsupported Phase 5 task class.',
    requestedMode: 'execute',
    taskKind: 'unsupported-task',
    reader: DEFAULT_READER,
  });
  const status = await runOrchestratorStatus({
    projectPath,
    reader: DEFAULT_READER,
  });

  return {
    attempt: status.attempt,
    snapshot: status.snapshot,
    result: {
      summary: 'A bounded execution failure became explicit recovery plus pending escalation through status.',
      warnings: status.result.warnings ?? [],
      payload: {
        run: {
          laneRunStatus: run.result.payload.coordinator.execution.laneRun.status,
          taskStatus: run.result.payload.coordinator.execution.task.status,
          failureClass: run.result.payload.coordinator.execution.recovery.failureClass,
          recoveryAction: run.result.payload.coordinator.execution.recovery.recoveryAction,
          escalationStatus: run.result.payload.coordinator.execution.escalation.status,
        },
        status: summarizeStatusResult(status),
      },
    },
  };
}

async function executeScenario(task, projectPath) {
  if (task.taskId === 'orchestrator-status-queue-resume') {
    return executeQueueResumeScenario(projectPath);
  }
  if (task.taskId === 'orchestrator-continuity-modes') {
    return executeContinuityModesScenario(projectPath);
  }
  if (task.taskId === 'orchestrator-execution-review-lineage') {
    return executeExecutionReviewLineageScenario(projectPath);
  }
  if (task.taskId === 'orchestrator-bounded-failure-recovery') {
    return executeBoundedFailureScenario(projectPath);
  }

  throw new Error(`Unsupported Phase 5 eval task: ${task.taskId}`);
}

async function executeTask(task, benchmarkId, metricModules) {
  const projectPath = await createEvalWorkspace(`vre-eval-${task.taskId}-`);

  try {
    await preparePhase5Workspace(projectPath);
    const beforeSnapshot = await captureRuntimeFiles(projectPath);
    const startedAt = new Date().toISOString();
    const scenario = await executeScenario(task, projectPath);
    const endedAt = new Date().toISOString();
    const afterSnapshot = await captureRuntimeFiles(projectPath);
    const actualWrites = diffWrites(beforeSnapshot, afterSnapshot);
    const operatorStatus = await getOperatorStatus(projectPath);
    const attemptHistory = await getAttemptHistory(projectPath, {
      scope: task.command.scope,
      eventsPerAttempt: 100,
      decisionsPerAttempt: 100,
    });
    const attemptRecords = await readAttemptRecords(projectPath, scenario.attempt.attemptId);
    const context = {
      benchmarkId,
      projectPath,
      startedAt,
      endedAt,
      elapsedSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
      result: scenario.result,
      attempt: scenario.attempt,
      snapshot: scenario.snapshot,
      capabilities: operatorStatus.capabilities,
      actualWrites,
      attemptHistory,
      attemptRecords,
      placeholderValues: {},
      outputExtras: {
        attemptHistory,
      },
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
      'phase5-orchestrator-mvp.benchmark.json',
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

export {
  buildReviewExecutorForMode,
  main as savePhase5Artifacts,
};
