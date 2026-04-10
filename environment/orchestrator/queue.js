import { randomUUID } from 'node:crypto';

import { now } from '../control/_io.js';
import { ORCHESTRATOR_FILES } from './_paths.js';
import {
  appendOrchestratorJsonl,
  readOrchestratorJsonl,
} from './_io.js';

const QUEUE_SCHEMA = 'run-queue-record.schema.json';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'escalated']);
const ACTIVE_STATUSES = new Set(['running', 'waiting-review']);

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function generateTaskId() {
  const stamp = now()
    .replace(/[:.]/gu, '-')
    .replace('T', '-')
    .replace('Z', '');
  return `ORCH-TASK-${stamp}-${randomUUID().slice(0, 8)}`;
}

function latestRecordsByTask(records) {
  const latestByTask = new Map();
  for (const record of records) {
    latestByTask.set(record.taskId, record);
  }
  return latestByTask;
}

function sortByRecordedAtDesc(records) {
  return [...records].sort((left, right) =>
    (right.recordedAt ?? '').localeCompare(left.recordedAt ?? ''),
  );
}

function buildDependencyState(task, latestByTask) {
  const dependencyStates = (task.dependencyTaskIds ?? []).map((dependencyTaskId) => {
    const dependency = latestByTask.get(dependencyTaskId) ?? null;
    return {
      taskId: dependencyTaskId,
      rawStatus: dependency?.status ?? null,
      recordedAt: dependency?.recordedAt ?? null,
      exists: dependency !== null,
      completed: dependency?.status === 'completed',
      terminal: dependency ? TERMINAL_STATUSES.has(dependency.status) : false,
    };
  });

  const blockingReasons = [];
  for (const dependency of dependencyStates) {
    if (!dependency.exists) {
      blockingReasons.push(`Missing dependency state for ${dependency.taskId}.`);
      continue;
    }

    if (dependency.rawStatus !== 'completed') {
      blockingReasons.push(
        `Dependency ${dependency.taskId} is ${dependency.rawStatus ?? 'unknown'}.`,
      );
    }
  }

  return {
    dependencyStates,
    blockingReasons,
  };
}

function deriveStatus(task, blockingReasons) {
  if (TERMINAL_STATUSES.has(task.status)) {
    return task.status;
  }

  if (task.status === 'blocked' || blockingReasons.length > 0) {
    return 'blocked';
  }

  if (ACTIVE_STATUSES.has(task.status)) {
    return 'active';
  }

  if (task.status === 'ready') {
    return 'ready';
  }

  return 'queued';
}

function deriveTaskView(task, latestByTask) {
  const { dependencyStates, blockingReasons } = buildDependencyState(task, latestByTask);
  return {
    ...cloneValue(task),
    dependencyStates,
    blockingReasons,
    derivedStatus: deriveStatus(task, blockingReasons),
    isTerminal: TERMINAL_STATUSES.has(task.status),
  };
}

async function appendQueueRecord(projectPath, record) {
  return appendOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.runQueue, record, {
    schemaFile: QUEUE_SCHEMA,
    label: 'queue record',
  });
}

export async function listQueueRecords(projectPath, filters = {}) {
  let records = await readOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.runQueue, {
    schemaFile: QUEUE_SCHEMA,
    label: 'queue record',
  });

  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.ownerLane) {
    records = records.filter((record) => record.ownerLane === filters.ownerLane);
  }
  if (filters.eventKind) {
    records = records.filter((record) => record.eventKind === filters.eventKind);
  }

  return sortByRecordedAtDesc(records);
}

export async function createQueueTask(projectPath, input = {}) {
  const timestamp = input.recordedAt ?? now();
  const record = {
    schemaVersion: 'vibe-orch.run-queue-record.v1',
    taskId: input.taskId ?? generateTaskId(),
    parentTaskId: input.parentTaskId ?? null,
    eventKind: 'created',
    mode: input.mode ?? 'intake',
    ownerLane: input.ownerLane ?? 'coordination',
    status: input.status ?? 'queued',
    title: input.title ?? null,
    objective: input.objective ?? null,
    targetRef: input.targetRef ?? null,
    dependencyTaskIds: cloneValue(input.dependencyTaskIds ?? []),
    laneRunId: input.laneRunId ?? null,
    artifactRefs: cloneValue(input.artifactRefs ?? []),
    statusReason: input.statusReason ?? null,
    escalationNeeded: input.escalationNeeded ?? false,
    createdAt: input.createdAt ?? timestamp,
    recordedAt: timestamp,
  };

  await appendQueueRecord(projectPath, record);
  return record;
}

async function latestTaskRecord(projectPath, taskId) {
  const latest = await getLatestQueueState(projectPath);
  return latest.find((task) => task.taskId === taskId) ?? null;
}

export async function appendQueueStatusTransition(projectPath, taskId, patch = {}) {
  const previous = await latestTaskRecord(projectPath, taskId);
  if (!previous) {
    throw new Error(`Queue task not found: ${taskId}`);
  }

  const record = {
    ...cloneValue(previous),
    ...cloneValue(patch),
    schemaVersion: 'vibe-orch.run-queue-record.v1',
    taskId,
    eventKind: patch.eventKind ?? 'status-change',
    recordedAt: patch.recordedAt ?? now(),
    createdAt: previous.createdAt ?? null,
  };

  delete record.dependencyStates;
  delete record.blockingReasons;
  delete record.derivedStatus;
  delete record.isTerminal;

  await appendQueueRecord(projectPath, record);
  return record;
}

export async function appendQueueDependencyUpdate(projectPath, taskId, dependencyTaskIds, options = {}) {
  return appendQueueStatusTransition(projectPath, taskId, {
    dependencyTaskIds: cloneValue(dependencyTaskIds ?? []),
    eventKind: 'dependency-change',
    statusReason: options.statusReason ?? 'Dependencies updated.',
    recordedAt: options.recordedAt ?? now(),
  });
}

export async function appendQueueLaneReassignment(projectPath, taskId, ownerLane, options = {}) {
  return appendQueueStatusTransition(projectPath, taskId, {
    ownerLane,
    eventKind: 'lane-reassignment',
    statusReason: options.statusReason ?? 'Lane reassigned.',
    recordedAt: options.recordedAt ?? now(),
  });
}

export async function getLatestQueueState(projectPath) {
  const records = await readOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.runQueue, {
    schemaFile: QUEUE_SCHEMA,
    label: 'queue record',
  });
  const latestByTask = latestRecordsByTask(records);
  const tasks = [...latestByTask.values()].map((task) => deriveTaskView(task, latestByTask));
  return sortByRecordedAtDesc(tasks);
}

export async function listReadyTasks(projectPath) {
  const tasks = await getLatestQueueState(projectPath);
  return tasks.filter((task) => task.derivedStatus === 'ready');
}

export async function listBlockedTasks(projectPath) {
  const tasks = await getLatestQueueState(projectPath);
  return tasks.filter((task) => task.derivedStatus === 'blocked');
}

export async function listActiveTasks(projectPath) {
  const tasks = await getLatestQueueState(projectPath);
  return tasks.filter((task) => task.derivedStatus === 'active');
}

export async function listTerminalTasks(projectPath) {
  const tasks = await getLatestQueueState(projectPath);
  return tasks.filter((task) => task.isTerminal);
}

export async function getQueueStatusCounts(projectPath) {
  const tasks = await getLatestQueueState(projectPath);
  const byRawStatus = {};
  const byDerivedStatus = {};

  for (const task of tasks) {
    byRawStatus[task.status] = (byRawStatus[task.status] ?? 0) + 1;
    byDerivedStatus[task.derivedStatus] = (byDerivedStatus[task.derivedStatus] ?? 0) + 1;
  }

  return {
    total: tasks.length,
    byRawStatus,
    byDerivedStatus,
  };
}
