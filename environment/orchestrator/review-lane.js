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
import { getTaskAdapter } from './task-adapters.js';
import { getTaskEntry, validateTaskInput } from './task-registry.js';

const EVIDENCE_MODE_BY_BINDING = Object.freeze({
  'provider-cli:openai/codex': 'real-cli-binding-codex',
  'provider-cli:anthropic/claude': 'real-cli-binding-claude',
  'local-subprocess:*': 'smoke-real-subprocess',
});

function deriveEvidenceMode(binding) {
  if (!binding) return null;
  const key = `${binding.integrationKind}:${binding.providerRef ?? '*'}`;
  if (EVIDENCE_MODE_BY_BINDING[key]) {
    return EVIDENCE_MODE_BY_BINDING[key];
  }
  if (binding.integrationKind === 'local-subprocess') {
    return 'smoke-real-subprocess';
  }
  return null;
}

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

function assertReviewableTask(task) {
  if (task.ownerLane === 'review') {
    if (!['ready', 'queued'].includes(task.status)) {
      throw new Error(`Review task ${task.taskId} is not reviewable from status ${task.status}.`);
    }
    return;
  }

  if (task.ownerLane === 'execution') {
    if (task.status !== 'completed') {
      throw new Error(`Execution task ${task.taskId} is not reviewable until it reaches completed status.`);
    }
    return;
  }

  throw new Error(`Task ${task.taskId} owned by ${task.ownerLane} cannot be reviewed in Phase 5.`);
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

function classifyReviewRuntimeFailure(error) {
  if (error?.code === 'ENOENT') {
    return 'dependency-unavailable';
  }

  // WP-164: typed executors (LocalSubprocessError, CodexCliExecutorError,
  // ClaudeCliExecutorError, SessionDigestReviewError) already classify
  // themselves. Honor the tagged failure class before falling back to
  // regex heuristics.
  if (error?.code === 'dependency-unavailable' || error?.code === 'contract-mismatch' || error?.code === 'tool-failure') {
    return error.code;
  }

  if (/schema|contract|validation/u.test(error?.message ?? '')) {
    return 'contract-mismatch';
  }

  return 'tool-failure';
}

async function nextAttemptNumber(projectPath, taskId) {
  const records = await listLaneRuns(projectPath, {
    laneId: 'review',
    taskId,
  });
  return records.length + 1;
}

async function resolveRegisteredReviewTask(projectPath, task) {
  // WP-164: if the queue task references a registered review task kind
  // via `targetRef.kind`, dispatch through the registry adapter to produce
  // `{comparedArtifactRefs, executionLaneRunId}` exactly like
  // `resolveReviewTask` does for the manual path.
  const candidateKind = task.targetRef?.kind ?? null;
  if (!candidateKind) {
    return null;
  }
  const entry = await getTaskEntry(candidateKind);
  if (!entry || entry.lane !== 'review') {
    return null;
  }
  await validateTaskInput(candidateKind, task.taskInput ?? null);
  const adapter = getTaskAdapter(candidateKind);
  if (typeof adapter !== 'function') {
    throw new Error(
      `No review adapter registered for task kind ${candidateKind}; expected a function in task-adapters.js.`,
    );
  }
  const resolved = await adapter(projectPath, task.taskInput ?? {});
  if (
    !resolved
    || !Array.isArray(resolved.comparedArtifactRefs)
    || typeof resolved.executionLaneRunId !== 'string'
  ) {
    throw new Error(
      `Review adapter for ${candidateKind} did not return {comparedArtifactRefs, executionLaneRunId}.`,
    );
  }
  return resolved;
}

export async function runReviewLane(projectPath, options = {}) {
  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) {
    throw new Error(`Queue task not found: ${options.taskId}`);
  }
  assertReviewableTask(task);

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
  const attemptLimit = lanePolicies?.lanes?.review?.retryPolicy?.maxAttempts ?? 1;
  const startedAt = now();

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: 'waiting-review',
    statusReason: 'Review lane started.',
  });

  try {
    // WP-164: registered review kind → registry adapter; unregistered →
    // existing manual-review path (preserved unchanged below).
    const reviewTask =
      (await resolveRegisteredReviewTask(projectPath, task))
      ?? (await resolveReviewTask(projectPath, task));
    if (reviewTask.comparedArtifactRefs.length === 0) {
      throw new Error(`Review task ${task.taskId} has no visible artifact refs to compare.`);
    }
    if (!reviewTask.executionLaneRunId) {
      throw new Error(
        `Review task ${task.taskId} is missing execution lineage required by the external review contract.`,
      );
    }

    const continuity = await assembleContinuityContext(projectPath, {
      mode: 'query',
      laneId: 'review',
      queryText: task.objective ?? 'review current task',
      limit: 3,
      maxTokens: 1500,
    });

    const result = await invokeLaneBinding(binding, options.providerExecutors ?? {}, {
      projectPath,
      task,
      comparedArtifactRefs: reviewTask.comparedArtifactRefs,
      continuity,
    });
    const outcome = normalizeReviewOutcome(result, reviewTask.comparedArtifactRefs);
    const evidenceMode = deriveEvidenceMode(binding);
    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'review',
      taskId: task.taskId,
      providerRef: binding.providerRef,
      integrationKind: binding.integrationKind,
      fallbackApplied: binding.fallbackApplied,
      supervisionCapability: binding.supervisionCapability,
      status: outcome.verdict === 'affirmed' ? 'completed' : 'escalated',
      attemptNumber,
      startedAt,
      endedAt: now(),
      artifactRefs: outcome.comparedArtifactRefs,
      summary: outcome.summary,
      ...(evidenceMode != null ? { evidenceMode } : {}),
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
      executionLaneRunId: reviewTask.executionLaneRunId,
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
  } catch (error) {
    const failureClass = classifyReviewRuntimeFailure(error);
    const recoveryPolicy = getDefaultRecoveryPolicy(failureClass);
    const shouldEscalate = recoveryPolicy.escalateImmediately || attemptNumber >= attemptLimit;

    const evidenceMode = deriveEvidenceMode(binding);
    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'review',
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
      ...(evidenceMode != null ? { evidenceMode } : {}),
    });

    const escalation = shouldEscalate
      ? await appendEscalationRecord(projectPath, {
        taskId: task.taskId,
        laneRunId: laneRun.laneRunId,
        status: 'pending',
        triggerKind:
          failureClass === 'dependency-unavailable'
            ? 'blocked-prerequisite'
            : failureClass === 'contract-mismatch'
              ? 'contract-mismatch'
              : 'review-disagreement',
        decisionNeeded: `Resolve review failure for ${task.taskId}: ${error.message}`,
        contextShown: [
          `queue/${task.taskId}`,
          `lane-run/${laneRun.laneRunId}`,
        ],
      })
      : null;

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
        ? 'Review failed and requires operator intervention.'
        : 'Review failed; bounded recovery recorded.',
      escalationNeeded: shouldEscalate,
    });

    return {
      laneRun,
      task: await getQueueTask(projectPath, task.taskId),
      externalReview: null,
      escalation,
      recovery,
      binding,
      error,
    };
  }
}
