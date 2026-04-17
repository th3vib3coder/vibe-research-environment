import { runWithMiddleware } from '../control/middleware.js';
import { getOperatorStatus } from '../control/query.js';
import { runExecutionLane } from './execution-lane.js';
import { getOrchestratorStatus } from './query.js';
import { runReviewLane } from './review-lane.js';
import { continueRoutedTask, routeOrchestratorObjective } from './router.js';
import { findByRouterKeyword, getTaskEntry } from './task-registry.js';

function defaultReader(reader) {
  return reader ?? {
    dbAvailable: false,
    error: 'bridge unavailable',
  };
}

async function mergeTransientIntoTaskInput({ taskInput, taskKind, sourceSessionId, objective }) {
  const base = taskInput == null ? {} : { ...taskInput };
  if (sourceSessionId == null) {
    return base;
  }

  // Only persist sourceSessionId into durable taskInput when the registry entry
  // permits free-form input (null inputSchema). Strict inputSchemas with
  // additionalProperties: false would reject an unexpected sourceSessionId key,
  // so in that case sourceSessionId flows ONLY as a transient execution-lane
  // option and does not survive replay-from-JSONL (P2-A).
  let resolvedKind = taskKind ?? null;
  if (resolvedKind == null && typeof objective === 'string' && objective.trim() !== '') {
    const match = await findByRouterKeyword(objective);
    if (match && !match.ambiguous) {
      resolvedKind = match.taskKind;
    }
  }

  if (resolvedKind == null) {
    // Cannot determine kind → conservatively do not pollute taskInput; caller
    // still receives sourceSessionId via transient execution-lane options.
    return base;
  }

  const entry = await getTaskEntry(resolvedKind);
  if (entry == null || entry.inputSchema == null) {
    return { ...base, sourceSessionId };
  }

  return base;
}

export async function buildOrchestratorShellStatus(projectPath) {
  const [operatorStatus, orchestratorStatus] = await Promise.all([
    getOperatorStatus(projectPath),
    getOrchestratorStatus(projectPath),
  ]);

  return {
    activeObjective: orchestratorStatus.routerSession?.objective ?? null,
    queue: {
      total: orchestratorStatus.queue.total,
      byRawStatus: orchestratorStatus.queue.byRawStatus,
      byDerivedStatus: orchestratorStatus.queue.byDerivedStatus,
    },
    activeLaneRuns: orchestratorStatus.activeLaneRuns,
    latestEscalationOrBlocker:
      orchestratorStatus.latestEscalation
      ?? orchestratorStatus.queue.blockedTasks[0]
      ?? null,
    latestRecoveryAction: orchestratorStatus.latestRecovery,
    currentContinuityMode: orchestratorStatus.routerSession?.currentMode ?? null,
    nextRecommendedOperatorAction: orchestratorStatus.nextRecommendedOperatorAction,
    orchestrator: orchestratorStatus,
    operator: {
      hasSession: operatorStatus.hasSession,
      activeFlow: operatorStatus.session?.activeFlow ?? null,
      staleMemory: operatorStatus.memory?.isStale ?? false,
      blockedExperiments: operatorStatus.session?.signals?.blockedExperiments ?? 0,
      exportAlerts: operatorStatus.writing?.totalAlerts ?? 0,
    },
  };
}

async function executeRoutedTask(projectPath, routed, options = {}) {
  if (routed.immediateEscalation) {
    return {
      route: routed,
      execution: null,
      review: null,
    };
  }

  if (routed.selectedLane === 'execution') {
    const execution = await runExecutionLane(projectPath, {
      taskId: routed.task.taskId,
      sourceSessionId: options.sourceSessionId ?? null,
    });

    let review = null;
    if (options.requestReview === true) {
      review = await runReviewLane(projectPath, {
        taskId: routed.task.taskId,
        providerExecutors: options.providerExecutors ?? {},
      });
    }

    return {
      route: routed,
      execution,
      review,
    };
  }

  if (routed.selectedLane === 'review') {
    const review = await runReviewLane(projectPath, {
      taskId: routed.task.taskId,
      providerExecutors: options.providerExecutors ?? {},
    });

    return {
      route: routed,
      execution: null,
      review,
    };
  }

  return {
    route: routed,
    execution: null,
    review: null,
  };
}

export async function runOrchestratorObjective({
  projectPath,
  objective = null,
  taskId = null,
  requestedMode = null,
  targetRef = null,
  artifactRefs = [],
  taskKind = null,
  requestReview = false,
  providerExecutors = {},
  sourceSessionId = null,
  taskInput = null,
  reader = null,
}) {
  return runWithMiddleware({
    projectPath,
    commandName: '/orchestrator-run',
    scope: 'orchestrator-run',
    reader: defaultReader(reader),
    commandFn: async () => {
      const routed = taskId
        ? await continueRoutedTask(projectPath, { taskId, objective })
        : await routeOrchestratorObjective(projectPath, {
          objective,
          requestedMode,
          targetRef,
          artifactRefs,
          taskKind,
          taskInput: await mergeTransientIntoTaskInput({
            taskInput,
            taskKind,
            sourceSessionId,
            objective,
          }),
        });
      const coordinator = await executeRoutedTask(projectPath, routed, {
        requestReview,
        providerExecutors,
        sourceSessionId,
      });
      const shell = await buildOrchestratorShellStatus(projectPath);

      return {
        summary: routed.immediateEscalation
          ? routed.immediateEscalation.decisionNeeded
          : `Orchestrator handled task ${routed.task.taskId}.`,
        payload: {
          coordinator,
          shell,
        },
      };
    },
  });
}

export async function runOrchestratorStatus({
  projectPath,
  reader = null,
}) {
  return runWithMiddleware({
    projectPath,
    commandName: '/orchestrator-status',
    scope: 'orchestrator-status',
    reader: defaultReader(reader),
    commandFn: async () => {
      const shell = await buildOrchestratorShellStatus(projectPath);
      return {
        summary: shell.nextRecommendedOperatorAction.summary,
        payload: shell,
      };
    },
  });
}
