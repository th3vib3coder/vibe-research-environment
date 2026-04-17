import { now } from '../control/_io.js';
import {
  appendEscalationRecord,
  appendLaneRun,
  appendRecoveryRecord,
  listLaneRuns,
} from './ledgers.js';
import { selectLaneBinding } from './provider-gateway.js';
import { getQueueTask, appendQueueStatusTransition } from './queue.js';
import { getDefaultRecoveryPolicy } from './recovery.js';
import { readContinuityProfile, readLanePolicies } from './state.js';
import { getTaskEntry } from './task-registry.js';
import { getTaskAdapter } from './task-adapters.js';

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function classifyExecutionFailure(error) {
  if (error?.code === 'ENOENT') {
    return 'dependency-unavailable';
  }

  if (/schema|contract|validation/u.test(error?.message ?? '')) {
    return 'contract-mismatch';
  }

  return 'tool-failure';
}

async function nextAttemptNumber(projectPath, taskId) {
  const records = await listLaneRuns(projectPath, {
    laneId: 'execution',
    taskId,
  });
  return records.length + 1;
}

async function executeTaskClass(projectPath, task, input = {}) {
  const taskKind = task.targetRef?.kind ?? null;
  if (!taskKind) {
    throw new Error('Execution task requires targetRef.kind.');
  }

  const entry = await getTaskEntry(taskKind);
  if (!entry) {
    throw new Error(`Unsupported execution task kind: ${taskKind}`);
  }
  if (entry.lane !== 'execution') {
    throw new Error(`Task kind ${taskKind} is registered for ${entry.lane} lane, not execution.`);
  }

  const adapter = getTaskAdapter(taskKind);
  if (typeof adapter !== 'function') {
    throw new Error(`No execution adapter registered for task kind ${taskKind}.`);
  }

  return adapter(projectPath, input);
}

function buildDurableExecutionInput(task, options = {}) {
  const { taskId: _taskId, providerExecutors: _providerExecutors, ...transientInput } = options;
  return {
    ...(task.taskInput == null ? {} : cloneValue(task.taskInput)),
    ...transientInput,
  };
}

export async function runExecutionLane(projectPath, options = {}) {
  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) {
    throw new Error(`Queue task not found: ${options.taskId}`);
  }
  if (task.ownerLane !== 'execution') {
    throw new Error(`Task ${task.taskId} is not assigned to execution lane.`);
  }
  if (!['ready', 'queued'].includes(task.status)) {
    throw new Error(`Task ${task.taskId} is not ready for execution.`);
  }

  const [lanePolicies, continuityProfile] = await Promise.all([
    readLanePolicies(projectPath),
    readContinuityProfile(projectPath),
  ]);
  const binding = selectLaneBinding({
    laneId: 'execution',
    lanePolicies,
    continuityProfile,
    requiredCapability: 'programmatic',
    systemDefaultAllowApiFallback: false,
  });
  const attemptNumber = await nextAttemptNumber(projectPath, task.taskId);
  const startedAt = now();

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: 'running',
    statusReason: 'Execution lane started.',
  });

  try {
    const outcome = await executeTaskClass(projectPath, task, buildDurableExecutionInput(task, options));
    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'execution',
      taskId: task.taskId,
      providerRef: binding.providerRef,
      integrationKind: binding.integrationKind,
      fallbackApplied: binding.fallbackApplied,
      supervisionCapability: binding.supervisionCapability,
      status: 'completed',
      attemptNumber,
      startedAt,
      endedAt: now(),
      artifactRefs: outcome.artifactRefs,
      summary: outcome.summary,
      warningCount: outcome.warningCount ?? 0,
    });

    await appendQueueStatusTransition(projectPath, task.taskId, {
      status: 'completed',
      eventKind: 'closed',
      laneRunId: laneRun.laneRunId,
      artifactRefs: outcome.artifactRefs,
      statusReason: outcome.summary,
      escalationNeeded: false,
    });

    return {
      laneRun,
      task: await getQueueTask(projectPath, task.taskId),
      recovery: null,
      escalation: null,
      binding,
      payload: outcome.payload ?? null,
    };
  } catch (error) {
    const failureClass = classifyExecutionFailure(error);
    const recoveryPolicy = getDefaultRecoveryPolicy(failureClass);
    const attemptLimit = lanePolicies?.lanes?.execution?.retryPolicy?.maxAttempts ?? 1;
    const shouldEscalate = recoveryPolicy.escalateImmediately || attemptNumber >= attemptLimit;

    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'execution',
      taskId: task.taskId,
      providerRef: binding.providerRef,
      integrationKind: binding.integrationKind,
      fallbackApplied: binding.fallbackApplied,
      supervisionCapability: binding.supervisionCapability,
      status: shouldEscalate ? 'escalated' : 'failed',
      attemptNumber,
      startedAt,
      endedAt: now(),
      artifactRefs: [],
      summary: error.message,
      errorCode: failureClass,
    });

    let escalation = null;
    if (shouldEscalate) {
      escalation = await appendEscalationRecord(projectPath, {
        taskId: task.taskId,
        laneRunId: laneRun.laneRunId,
        status: 'pending',
        triggerKind:
          failureClass === 'dependency-unavailable'
            ? 'blocked-prerequisite'
            : failureClass === 'contract-mismatch'
              ? 'contract-mismatch'
              : 'operator-request',
        decisionNeeded: `Resolve execution failure for ${task.taskId}: ${error.message}`,
        contextShown: [
          `queue/${task.taskId}`,
          `lane-run/${laneRun.laneRunId}`,
        ],
      });
    }

    const recovery = await appendRecoveryRecord(projectPath, {
      taskId: task.taskId,
      laneRunId: laneRun.laneRunId,
      failureClass,
      recoveryAction: shouldEscalate ? 'escalate-to-user' : recoveryPolicy.recoveryAction,
      attemptNumber,
      result: shouldEscalate ? 'escalated' : 'scheduled',
      escalationId: escalation?.escalationId ?? null,
      summary: error.message,
    });

    await appendQueueStatusTransition(projectPath, task.taskId, {
      status: shouldEscalate ? 'escalated' : 'blocked',
      eventKind: shouldEscalate ? 'escalation-link' : 'recovery-update',
      laneRunId: laneRun.laneRunId,
      statusReason: shouldEscalate
        ? 'Execution failed and requires operator intervention.'
        : 'Execution failed; bounded recovery recorded.',
      escalationNeeded: shouldEscalate,
    });

    return {
      laneRun,
      task: await getQueueTask(projectPath, task.taskId),
      recovery,
      escalation,
      binding,
      error,
    };
  }
}
