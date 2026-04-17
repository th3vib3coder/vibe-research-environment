import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  writeInstallStateFixture,
} from '../install/_fixture.js';
import { runExecutionLane } from '../../orchestrator/execution-lane.js';
import { listEscalationRecords, listExternalReviewRecords, listRecoveryRecords } from '../../orchestrator/ledgers.js';
import { createQueueTask, getQueueTask } from '../../orchestrator/queue.js';
import { runReviewLane } from '../../orchestrator/review-lane.js';
import { routeOrchestratorObjective } from '../../orchestrator/router.js';
import {
  bootstrapOrchestratorState,
  buildDefaultLanePolicies,
} from '../../orchestrator/state.js';

function buildWave3LanePolicies() {
  return buildDefaultLanePolicies({
    lanes: {
      execution: {
        enabled: true,
        providerRef: null,
        integrationKind: 'local-logic',
        authMode: 'local-only',
        billingMode: 'none',
        apiFallbackAllowed: false,
        supervisionCapability: 'programmatic',
        interactive: false,
        backgroundSafe: true,
        parallelAllowed: false,
        reviewOnly: false,
        model: null,
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: null,
          maxOutputTokens: null,
          maxUsd: null,
        },
        escalationThreshold: 'medium',
        notes: null,
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'output-only',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: true,
        model: 'gpt-5.4',
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: 4000,
          maxOutputTokens: 2000,
          maxUsd: 3,
        },
        escalationThreshold: 'immediate',
        notes: null,
      },
    },
  });
}

test('execution lane exports a session digest through the queue model', async () => {
  const projectRoot = await createInstallFixture('vre-orch-execution-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routed.task.taskId,
    });

    assert.equal(execution.laneRun.status, 'completed');
    assert.equal(execution.laneRun.fallbackApplied, false);
    assert.equal(execution.task.status, 'completed');
    assert.equal(execution.task.artifactRefs.length, 2);

    for (const ref of execution.task.artifactRefs) {
      await stat(path.join(projectRoot, ref));
    }
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('execution lane replays durable taskInput from the queue record', async () => {
  const projectRoot = await createInstallFixture('vre-orch-task-input-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Register paper from durable queue input.',
      taskKind: 'literature-flow-register',
      taskInput: {
        title: 'Durable queue input paper',
        doi: '10.5555/durable-input',
      },
    });

    assert.equal(routed.task.taskInput.title, 'Durable queue input paper');

    const execution = await runExecutionLane(projectRoot, {
      taskId: routed.task.taskId,
    });

    assert.equal(execution.laneRun.status, 'completed');
    assert.equal(execution.task.status, 'completed');
    assert.equal(execution.payload.paper.title, 'Durable queue input paper');
    assert.equal(execution.payload.paper.doi, '10.5555/durable-input');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('execution lane records recovery and escalation when the task kind is unsupported', async () => {
  const projectRoot = await createInstallFixture('vre-orch-execution-error-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run an unsupported Phase 5 task class.',
      requestedMode: 'execute',
      taskKind: 'unsupported-task',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routed.task.taskId,
    });

    const escalations = await listEscalationRecords(projectRoot, {
      taskId: routed.task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: routed.task.taskId,
    });

    assert.equal(execution.laneRun.status, 'escalated');
    assert.equal(execution.laneRun.fallbackApplied, false);
    assert.equal(execution.task.status, 'escalated');
    assert.equal(execution.escalation?.status, 'pending');
    assert.equal(execution.recovery?.failureClass, 'tool-failure');
    assert.equal(execution.recovery?.recoveryAction, 'escalate-to-user');
    assert.equal(escalations.length, 1);
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0].recoveryAction, 'escalate-to-user');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('review lane records contrarian challenge with escalation and recovery', async () => {
  const projectRoot = await createInstallFixture('vre-orch-review-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routedExecution = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routedExecution.task.taskId,
    });

    const routedReview = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run a contrarian review of the current digest.',
      requestedMode: 'review',
      targetRef: {
        kind: 'queue-task',
        id: execution.task.taskId,
      },
    });

    const review = await runReviewLane(projectRoot, {
      taskId: routedReview.task.taskId,
      providerExecutors: {
        'openai/codex:local-cli': async ({ comparedArtifactRefs }) => ({
          verdict: 'challenged',
          materialMismatch: true,
          summary: `Review challenged ${comparedArtifactRefs.length} artifact refs.`,
          followUpAction: 'escalate',
        }),
      },
    });

    const escalations = await listEscalationRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const externalReviews = await listExternalReviewRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });

    assert.equal(review.task.status, 'escalated');
    assert.equal(review.laneRun.fallbackApplied, false);
    assert.equal(review.externalReview.verdict, 'challenged');
    assert.equal(externalReviews.length, 1);
    assert.equal(escalations.length, 1);
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0].failureClass, 'contract-mismatch');
    assert.equal(recoveries[0].recoveryAction, 'stop-and-preserve-state');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('review lane can affirm a completed execution artifact without creating recovery state', async () => {
  const projectRoot = await createInstallFixture('vre-orch-review-affirmed-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routedExecution = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routedExecution.task.taskId,
    });

    const routedReview = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run a contrarian review of the current digest.',
      requestedMode: 'review',
      targetRef: {
        kind: 'queue-task',
        id: execution.task.taskId,
      },
    });

    const review = await runReviewLane(projectRoot, {
      taskId: routedReview.task.taskId,
      providerExecutors: {
        'openai/codex:local-cli': async ({ comparedArtifactRefs }) => ({
          verdict: 'affirmed',
          materialMismatch: false,
          summary: `Review affirmed ${comparedArtifactRefs.length} artifact refs.`,
          followUpAction: 'none',
        }),
      },
    });

    const escalations = await listEscalationRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const externalReviews = await listExternalReviewRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });

    assert.equal(review.laneRun.status, 'completed');
    assert.equal(review.laneRun.fallbackApplied, false);
    assert.equal(review.task.status, 'completed');
    assert.equal(review.externalReview?.verdict, 'affirmed');
    assert.equal(externalReviews.length, 1);
    assert.equal(escalations.length, 0);
    assert.equal(recoveries.length, 0);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('review lane records bounded failure state when the provider executor throws', async () => {
  const projectRoot = await createInstallFixture('vre-orch-review-error-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const routedExecution = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routedExecution.task.taskId,
    });

    const routedReview = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run a contrarian review of the current digest.',
      requestedMode: 'review',
      targetRef: {
        kind: 'queue-task',
        id: execution.task.taskId,
      },
    });

    const review = await runReviewLane(projectRoot, {
      taskId: routedReview.task.taskId,
      providerExecutors: {
        'openai/codex:local-cli': async () => {
          throw new Error('Review provider execution failed.');
        },
      },
    });

    const escalations = await listEscalationRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });
    const externalReviews = await listExternalReviewRecords(projectRoot, {
      taskId: routedReview.task.taskId,
    });

    assert.equal(review.laneRun.status, 'escalated');
    assert.equal(review.laneRun.fallbackApplied, false);
    assert.notEqual(review.task.status, 'waiting-review');
    assert.equal(review.task.status, 'escalated');
    assert.equal(review.externalReview, null);
    assert.equal(review.recovery?.failureClass, 'tool-failure');
    assert.equal(review.recovery?.recoveryAction, 'escalate-to-user');
    assert.equal(escalations.length, 1);
    assert.equal(recoveries.length, 1);
    assert.equal(externalReviews.length, 0);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('review lane rejects blocked review tasks without mutating queue state', async () => {
  const projectRoot = await createInstallFixture('vre-orch-review-guard-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const task = await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-10-REVIEW-GUARD',
      mode: 'review',
      ownerLane: 'review',
      status: 'blocked',
      title: 'Blocked review task',
      statusReason: 'Waiting for operator input before rerun.',
    });

    await assert.rejects(
      () => runReviewLane(projectRoot, { taskId: task.taskId }),
      /not reviewable/u,
    );

    const current = await getQueueTask(projectRoot, task.taskId);
    const escalations = await listEscalationRecords(projectRoot, {
      taskId: task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: task.taskId,
    });

    assert.equal(current.status, 'blocked');
    assert.equal(current.statusReason, 'Waiting for operator input before rerun.');
    assert.equal(escalations.length, 0);
    assert.equal(recoveries.length, 0);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('review lane fails closed when execution lineage is missing for a direct artifact review task', async () => {
  const projectRoot = await createInstallFixture('vre-orch-review-lineage-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const task = await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-10-REVIEW-LINEAGE',
      mode: 'review',
      ownerLane: 'review',
      status: 'ready',
      title: 'Review direct artifact without lineage',
      objective: 'Review the direct artifact safely.',
      targetRef: {
        kind: 'artifact-review',
        id: 'manual',
      },
      artifactRefs: ['artifacts/report.md'],
      statusReason: 'Ready for review lane execution.',
    });

    const review = await runReviewLane(projectRoot, {
      taskId: task.taskId,
      providerExecutors: {
        'openai/codex:local-cli': async () => ({
          verdict: 'affirmed',
          materialMismatch: false,
          summary: 'This should not be reachable without lineage.',
          followUpAction: 'none',
        }),
      },
    });

    const escalations = await listEscalationRecords(projectRoot, {
      taskId: task.taskId,
    });
    const recoveries = await listRecoveryRecords(projectRoot, {
      taskId: task.taskId,
    });
    const externalReviews = await listExternalReviewRecords(projectRoot, {
      taskId: task.taskId,
    });

    assert.equal(review.laneRun.status, 'escalated');
    assert.equal(review.task.status, 'escalated');
    assert.equal(review.externalReview, null);
    assert.equal(review.recovery?.failureClass, 'contract-mismatch');
    assert.equal(escalations.length, 1);
    assert.equal(recoveries.length, 1);
    assert.equal(externalReviews.length, 0);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
