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
    assert.equal(execution.task.status, 'completed');
    assert.equal(execution.task.artifactRefs.length, 2);

    for (const ref of execution.task.artifactRefs) {
      await stat(path.join(projectRoot, ref));
    }
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
    assert.equal(review.externalReview.verdict, 'challenged');
    assert.equal(externalReviews.length, 1);
    assert.equal(escalations.length, 1);
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0].failureClass, 'contract-mismatch');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
