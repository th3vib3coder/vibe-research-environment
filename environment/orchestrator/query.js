import { stat } from 'node:fs/promises';

import { orchestratorDir } from './_paths.js';
import {
  getLatestQueueState,
  getQueueStatusCounts,
  listActiveTasks,
  listBlockedTasks,
  listReadyTasks,
  listTerminalTasks,
} from './queue.js';
import {
  getLatestEscalation,
  getLatestRecoveryRecord,
  listActiveLaneRuns,
} from './ledgers.js';
import {
  readContinuityProfile,
  readLanePolicies,
  readRouterSession,
} from './state.js';

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function buildNextRecommendedOperatorAction({
  latestEscalation,
  blockedTasks,
  readyTasks,
  activeLaneRuns,
}) {
  if (latestEscalation?.status === 'pending') {
    return {
      kind: 'resolve-escalation',
      taskId: latestEscalation.taskId ?? null,
      escalationId: latestEscalation.escalationId,
      summary: latestEscalation.decisionNeeded,
    };
  }

  if (blockedTasks.length > 0) {
    const [blockedTask] = blockedTasks;
    return {
      kind: 'inspect-blocked-task',
      taskId: blockedTask.taskId,
      escalationId: null,
      summary: blockedTask.blockingReasons[0] ?? blockedTask.statusReason ?? 'Task is blocked.',
    };
  }

  if (readyTasks.length > 0) {
    const [readyTask] = readyTasks;
    return {
      kind: 'run-ready-task',
      taskId: readyTask.taskId,
      escalationId: null,
      summary: readyTask.title ?? readyTask.objective ?? 'A queue task is ready for execution.',
    };
  }

  if (activeLaneRuns.length > 0) {
    const [laneRun] = activeLaneRuns;
    return {
      kind: 'monitor-active-run',
      taskId: laneRun.taskId ?? null,
      escalationId: null,
      summary: laneRun.summary ?? `Lane ${laneRun.laneId} is still running.`,
    };
  }

  return {
    kind: 'none',
    taskId: null,
    escalationId: null,
    summary: 'No immediate orchestrator action is required.',
  };
}

export async function getOrchestratorStatus(projectPath) {
  const warnings = [];
  const runtimeInstalled = await pathExists(orchestratorDir(projectPath));

  async function safeLoad(label, fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      warnings.push(`${label}: ${error.message}`);
      return fallback;
    }
  }

  const routerSession = await safeLoad('router session', () => readRouterSession(projectPath), null);
  const continuityProfile = await safeLoad(
    'continuity profile',
    () => readContinuityProfile(projectPath),
    null,
  );
  const lanePolicies = await safeLoad('lane policies', () => readLanePolicies(projectPath), null);
  const queueState = await safeLoad('queue state', () => getLatestQueueState(projectPath), []);
  const queueCounts = await safeLoad('queue counts', () => getQueueStatusCounts(projectPath), {
    total: 0,
    byRawStatus: {},
    byDerivedStatus: {},
  });
  const readyTasks = await safeLoad('ready tasks', () => listReadyTasks(projectPath), []);
  const blockedTasks = await safeLoad('blocked tasks', () => listBlockedTasks(projectPath), []);
  const activeTasks = await safeLoad('active tasks', () => listActiveTasks(projectPath), []);
  const terminalTasks = await safeLoad('terminal tasks', () => listTerminalTasks(projectPath), []);
  const activeLaneRuns = await safeLoad('active lane runs', () => listActiveLaneRuns(projectPath), []);
  const latestEscalation = await safeLoad(
    'latest escalation',
    () => getLatestEscalation(projectPath),
    null,
  );
  const latestRecovery = await safeLoad(
    'latest recovery',
    () => getLatestRecoveryRecord(projectPath),
    null,
  );

  if (!runtimeInstalled) {
    warnings.push('Orchestrator state has not been bootstrapped yet.');
  }

  return {
    runtimeInstalled,
    routerSession,
    continuityProfilePresent: continuityProfile !== null,
    lanePoliciesPresent: lanePolicies !== null,
    queue: {
      ...queueCounts,
      readyTasks,
      blockedTasks,
      activeTasks,
      terminalTasks,
      latestState: queueState,
    },
    activeLaneRuns,
    latestEscalation,
    latestRecovery,
    nextRecommendedOperatorAction: buildNextRecommendedOperatorAction({
      latestEscalation,
      blockedTasks,
      readyTasks,
      activeLaneRuns,
    }),
    warnings,
  };
}
