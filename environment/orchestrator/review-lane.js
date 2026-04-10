import { now } from '../control/_io.js';
import { assembleContinuityContext } from './context-assembly.js';
import {
  appendEscalationRecord,
  appendExternalReviewRecord,
  appendLaneRun,
  appendRecoveryRecord,
  getLatestLaneRun,
  listLaneRuns,
} from './ledgers.js';
import { invokeLaneBinding, selectLaneBinding } from './provider-gateway.js';
import { getQueueTask, appendQueueStatusTransition } from './queue.js';
import { getDefaultRecoveryPolicy } from './recovery.js';
import { readContinuityProfile, readLanePolicies } from './state.js';

function normalizeReviewOutcome(result = {}, comparedArtifactRefs = []) {
  const verdict = ['affirmed', 'challenged', 'inconclusive'].includes(result.verdict)
    ? result.verdict
    : 'inconclusive';
  const followUpAction = ['none', 'reroute', 'escalate', 'revise', 'accept-with-warning'].includes(
    result.followUpAction,
  )
    ? result.followUpAction
    : (verdict === 'affirmed' ? 'none' : 'escalate');

  return {
    verdict,
    materialMismatch: Boolean(result.materialMismatch),
    summary: result.summary ?? 'Review lane completed.',
    comparedArtifactRefs,
    followUpAction,
  };
}

async function resolveReviewTask(projectPath, task) {
  if (Array.isArray(task.artifactRefs) && task.artifactRefs.length > 0) {
    return {
      comparedArtifactRefs: task.artifactRefs,
      executionLaneRunId: task.laneRunId ?? null,
    };
  }

  if (task.targetRef?.kind === 'queue-task') {
    const referencedTask = await getQueueTask(projectPath, task.targetRef.id);
    if (!referencedTask) {
      throw new Error(`Referenced queue task not found: ${task.targetRef.id}`);
    }

    const executionRun = await getLatestLaneRun(projectPath, {
      laneId: 'execution',
      taskId: referencedTask.taskId,
    });

    return {
      comparedArtifactRefs: referencedTask.artifactRefs ?? [],
      executionLaneRunId: executionRun?.laneRunId ?? null,
    };
  }

  return {
    comparedArtifactRefs: [],
    executionLaneRunId: null,
  };
}

function classifyReviewFailure(outcome) {
  if (outcome.verdict === 'challenged' && outcome.materialMismatch) {
    return 'contract-mismatch';
  }

  if (outcome.verdict === 'challenged') {
    return 'lane-drift';
  }

  return 'ambiguous-user-request';
}

async function nextAttemptNumber(projectPath, taskId) {
  const records = await listLaneRuns(projectPath, {
    laneId: 'review',
    taskId,
  });
  return records.length + 1;
}

export async function runReviewLane(projectPath, options = {}) {
  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) {
    throw new Error(`Queue task not found: ${options.taskId}`);
  }

  const [lanePolicies, continuityProfile] = await Promise.all([
    readLanePolicies(projectPath),
    readContinuityProfile(projectPath),
  ]);
  const binding = selectLaneBinding({
    laneId: 'review',
    lanePolicies,
    continuityProfile,
    requiredCapability: 'output-only',
    providerExecutors: options.providerExecutors ?? {},
    systemDefaultAllowApiFallback: false,
  });
  const attemptNumber = await nextAttemptNumber(projectPath, task.taskId);
  const startedAt = now();
  const reviewTask = await resolveReviewTask(projectPath, task);
  if (reviewTask.comparedArtifactRefs.length === 0) {
    throw new Error(`Review task ${task.taskId} has no visible artifact refs to compare.`);
  }

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: 'waiting-review',
    statusReason: 'Review lane started.',
  });

  const continuity = await assembleContinuityContext(projectPath, {
    mode: 'query',
    laneId: 'review',
    queryText: task.objective ?? 'review current task',
    limit: 3,
    maxTokens: 1500,
  });

  const result = await invokeLaneBinding(binding, options.providerExecutors ?? {}, {
    task,
    comparedArtifactRefs: reviewTask.comparedArtifactRefs,
    continuity,
  });
  const outcome = normalizeReviewOutcome(result, reviewTask.comparedArtifactRefs);
  const laneRun = await appendLaneRun(projectPath, {
    laneId: 'review',
    taskId: task.taskId,
    providerRef: binding.providerRef,
    integrationKind: binding.integrationKind,
    supervisionCapability: binding.supervisionCapability,
    status: outcome.verdict === 'affirmed' ? 'completed' : 'escalated',
    attemptNumber,
    startedAt,
    endedAt: now(),
    artifactRefs: outcome.comparedArtifactRefs,
    summary: outcome.summary,
  });

  let escalation = null;
  let recovery = null;
  if (outcome.verdict !== 'affirmed') {
    const failureClass = classifyReviewFailure(outcome);
    const recoveryPolicy = getDefaultRecoveryPolicy(failureClass);

    escalation = await appendEscalationRecord(projectPath, {
      taskId: task.taskId,
      laneRunId: laneRun.laneRunId,
      status: 'pending',
      triggerKind: 'review-disagreement',
      decisionNeeded: outcome.summary,
      contextShown: [
        `queue/${task.taskId}`,
        `lane-run/${laneRun.laneRunId}`,
      ],
    });

    recovery = await appendRecoveryRecord(projectPath, {
      taskId: task.taskId,
      laneRunId: laneRun.laneRunId,
      failureClass,
      recoveryAction: recoveryPolicy.recoveryAction,
      attemptNumber,
      result: 'escalated',
      escalationId: escalation.escalationId,
      summary: outcome.summary,
    });
  }

  const externalReview = await appendExternalReviewRecord(projectPath, {
    taskId: task.taskId,
    executionLaneRunId: reviewTask.executionLaneRunId ?? laneRun.laneRunId,
    reviewLaneRunId: laneRun.laneRunId,
    verdict: outcome.verdict,
    materialMismatch: outcome.materialMismatch,
    summary: outcome.summary,
    comparedArtifactRefs: outcome.comparedArtifactRefs,
    followUpAction: outcome.followUpAction,
    escalationId: escalation?.escalationId ?? null,
  });

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: outcome.verdict === 'affirmed' ? 'completed' : 'escalated',
    eventKind: outcome.verdict === 'affirmed' ? 'closed' : 'escalation-link',
    laneRunId: laneRun.laneRunId,
    artifactRefs: outcome.comparedArtifactRefs,
    statusReason: outcome.summary,
    escalationNeeded: outcome.verdict !== 'affirmed',
  });

  return {
    laneRun,
    task: await getQueueTask(projectPath, task.taskId),
    externalReview,
    escalation,
    recovery,
    binding,
  };
}
