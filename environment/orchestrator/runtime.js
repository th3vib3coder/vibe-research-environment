import { runWithMiddleware } from '../control/middleware.js';
import { getOperatorStatus } from '../control/query.js';
import { runExecutionLane } from './execution-lane.js';
import { getOrchestratorStatus } from './query.js';
import { runReviewLane } from './review-lane.js';
import { continueRoutedTask, routeOrchestratorObjective } from './router.js';

function defaultReader(reader) {
  return reader ?? {
    dbAvailable: false,
    error: 'bridge unavailable',
  };
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
