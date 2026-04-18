import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  writeInstallStateFixture,
} from '../install/_fixture.js';
import { runExecutionLane } from '../../orchestrator/execution-lane.js';
import {
  listExternalReviewRecords,
  listLaneRuns,
} from '../../orchestrator/ledgers.js';
import { createQueueTask } from '../../orchestrator/queue.js';
import { runReviewLane } from '../../orchestrator/review-lane.js';
import { routeOrchestratorObjective } from '../../orchestrator/router.js';
import {
  bootstrapOrchestratorState,
  buildDefaultLanePolicies,
} from '../../orchestrator/state.js';

function buildPolicies() {
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
        integrationKind: 'provider-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'output-only',
        interactive: false,
        backgroundSafe: true,
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

test('session-digest-review chains off a completed digest export through the review-lane registry adapter', async () => {
  const projectRoot = await createInstallFixture('vre-digest-review-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildPolicies(),
    });

    // (1) Execute session-digest-export to produce a real lane-run with
    // real artifactRefs.
    const routedExecution = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routedExecution.task.taskId,
    });

    assert.equal(execution.laneRun.status, 'completed');
    assert.ok(execution.laneRun.artifactRefs.length > 0);

    // (2) Register the review task directly, attaching its
    // `taskKind = session-digest-review` via `targetRef.kind` and passing
    // the executionLaneRunId through `taskInput`.
    const reviewTask = await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-17-REVIEW-01',
      mode: 'review',
      ownerLane: 'review',
      status: 'ready',
      title: 'Review exported digest',
      objective: 'Review exported digest.',
      targetRef: { kind: 'session-digest-review', id: 'latest' },
      taskInput: {
        executionLaneRunId: execution.laneRun.laneRunId,
      },
      statusReason: 'Ready for review lane execution.',
    });

    // (3) Run the review lane with a fake provider-cli executor. The
    // executor sees the input envelope via `payload`.
    const reviewOutcome = await runReviewLane(projectRoot, {
      taskId: reviewTask.taskId,
      providerExecutors: {
        'openai/codex:provider-cli': async (payload, binding) => {
          assert.equal(binding.integrationKind, 'provider-cli');
          assert.equal(binding.providerRef, 'openai/codex');
          assert.ok(Array.isArray(payload.comparedArtifactRefs));
          assert.equal(
            payload.comparedArtifactRefs.length,
            execution.laneRun.artifactRefs.length,
          );
          return {
            schemaVersion: 'vibe-orch.provider-cli.output.v1',
            verdict: 'affirmed',
            materialMismatch: false,
            summary: `Review affirmed ${payload.comparedArtifactRefs.length} artifacts via registry adapter.`,
            followUpAction: 'none',
            evidenceRefs: payload.comparedArtifactRefs,
          };
        },
      },
    });

    // (4) Assert externalReview record and lane-run-record carry the
    // expected evidenceMode + integrationKind.
    assert.equal(reviewOutcome.externalReview?.verdict, 'affirmed');
    assert.equal(reviewOutcome.externalReview?.executionLaneRunId, execution.laneRun.laneRunId);
    assert.equal(reviewOutcome.laneRun.integrationKind, 'provider-cli');
    assert.equal(reviewOutcome.laneRun.evidenceMode, 'real-cli-binding-codex');

    const externalReviews = await listExternalReviewRecords(projectRoot, {
      taskId: reviewTask.taskId,
    });
    assert.equal(externalReviews.length, 1);
    assert.equal(externalReviews[0].verdict, 'affirmed');

    const reviewRuns = await listLaneRuns(projectRoot, {
      laneId: 'review',
      taskId: reviewTask.taskId,
    });
    assert.equal(reviewRuns.length, 1);
    assert.equal(reviewRuns[0].evidenceMode, 'real-cli-binding-codex');
    assert.equal(reviewRuns[0].integrationKind, 'provider-cli');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('session-digest-review rejects cross-session execution lane-run refs', async () => {
  const projectRoot = await createInstallFixture('vre-digest-review-xsession-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildPolicies(),
    });

    const reviewTask = await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-17-REVIEW-FOREIGN',
      mode: 'review',
      ownerLane: 'review',
      status: 'ready',
      title: 'Review exported digest (foreign run)',
      objective: 'Review exported digest.',
      targetRef: { kind: 'session-digest-review', id: 'latest' },
      taskInput: {
        // Refers to a lane-run that does NOT exist in this project's
        // lane-runs.jsonl — helper must refuse per WP-165 §2.
        executionLaneRunId: 'ORCH-RUN-2026-01-01-FOREIGN-ID',
      },
      statusReason: 'Ready for review lane execution.',
    });

    const outcome = await runReviewLane(projectRoot, {
      taskId: reviewTask.taskId,
      providerExecutors: {
        'openai/codex:provider-cli': async () => ({
          schemaVersion: 'vibe-orch.provider-cli.output.v1',
          verdict: 'affirmed',
          materialMismatch: false,
          summary: 'should not reach',
          followUpAction: 'none',
          evidenceRefs: [],
        }),
      },
    });

    // Review must escalate with contract-mismatch because the helper rejects
    // the foreign reference before invokeLaneBinding fires.
    assert.equal(outcome.laneRun.status, 'escalated');
    assert.equal(outcome.externalReview, null);
    assert.equal(outcome.recovery?.failureClass, 'contract-mismatch');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('session-digest-review preserves manual-review path when taskKind is not registered', async () => {
  const projectRoot = await createInstallFixture('vre-manual-review-untouched-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildPolicies(),
    });

    const routedExecution = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routedExecution.task.taskId,
    });

    // Route a review task through the existing manual path (targetRef.kind
    // = 'queue-task', NOT a registry kind).
    const routedReview = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run a contrarian review of the current digest.',
      requestedMode: 'review',
      targetRef: { kind: 'queue-task', id: execution.task.taskId },
    });

    const review = await runReviewLane(projectRoot, {
      taskId: routedReview.task.taskId,
      providerExecutors: {
        'openai/codex:provider-cli': async ({ comparedArtifactRefs }) => ({
          schemaVersion: 'vibe-orch.provider-cli.output.v1',
          verdict: 'affirmed',
          materialMismatch: false,
          summary: `Manual review affirmed ${comparedArtifactRefs.length} refs.`,
          followUpAction: 'none',
          evidenceRefs: comparedArtifactRefs,
        }),
      },
    });

    assert.equal(review.laneRun.status, 'completed');
    assert.equal(review.externalReview?.verdict, 'affirmed');
    // Evidence mode still reflects the binding kind, since the manual path
    // also writes through the same lane-run hook.
    assert.equal(review.laneRun.evidenceMode, 'real-cli-binding-codex');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('WP-168 finding 4: session-digest-review rejects execution lane-runs from non-digest task kinds', async () => {
  const { reviewSessionDigest } = await import('../../flows/session-digest-review.js');
  const projectRoot = await createInstallFixture('vre-int-digest-review-taskkind-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, { lanePolicies: buildPolicies() });

    // Route + run a memory-sync-refresh execution task (NOT session-digest-export)
    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Sync memory mirrors for the project.',
      taskKind: 'memory-sync-refresh',
    });
    const execution = await runExecutionLane(projectRoot, {
      taskId: routed.task.taskId,
    });
    assert.equal(execution.laneRun.status, 'completed');

    await assert.rejects(
      () => reviewSessionDigest(projectRoot, {
        executionLaneRunId: execution.laneRun.laneRunId,
      }),
      (error) => {
        assert.match(error.message, /not "session-digest-export"/u);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('WP-168 finding 5: session-digest-review rejects self-referential (review-lane) laneRunId', async () => {
  const { reviewSessionDigest } = await import('../../flows/session-digest-review.js');
  const { appendLaneRun } = await import('../../orchestrator/ledgers.js');
  const projectRoot = await createInstallFixture('vre-int-digest-review-selfref-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, { lanePolicies: buildPolicies() });

    // Manually inject a review lane-run record (as if created by a prior review invocation).
    const reviewRun = await appendLaneRun(projectRoot, {
      laneId: 'review',
      taskId: 'ORCH-TASK-2026-04-18-selfref',
      providerRef: 'openai/codex',
      integrationKind: 'provider-cli',
      fallbackApplied: false,
      supervisionCapability: 'output-only',
      status: 'completed',
      attemptNumber: 1,
      startedAt: '2026-04-18T10:00:00Z',
      endedAt: '2026-04-18T10:00:01Z',
      artifactRefs: [],
      summary: 'Injected review lane-run for self-ref regression test.',
      warningCount: 0,
    });

    // Pass the review lane-run's OWN id as executionLaneRunId → should reject
    // with a precise cross-lane message, not generic not-found.
    await assert.rejects(
      () => reviewSessionDigest(projectRoot, {
        executionLaneRunId: reviewRun.laneRunId,
      }),
      (error) => {
        assert.match(error.message, /belongs to lane "review"/u);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
