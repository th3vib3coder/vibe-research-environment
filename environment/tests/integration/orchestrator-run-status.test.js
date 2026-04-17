import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapCoreInstall,
  writeInstallStateFixture,
} from '../install/_fixture.js';
import { cleanupFixtureProject, createFixtureProject } from './_fixture.js';
import { runOrchestratorObjective, runOrchestratorStatus } from '../../orchestrator/runtime.js';
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

test('orchestrator run and status surfaces work through middleware', async () => {
  const projectRoot = await createFixtureProject('vre-int-orchestrator-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-results',
      'flow-writing',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const run = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Export a session digest for the current workspace.',
    });
    const status = await runOrchestratorStatus({
      projectPath: projectRoot,
    });

    assert.equal(run.attempt.status, 'succeeded');
    assert.equal(run.result.payload.coordinator.execution.laneRun.status, 'completed');
    assert.equal(run.result.payload.shell.activeObjective, 'Export a session digest for the current workspace.');
    assert.equal(status.attempt.status, 'succeeded');
    assert.equal(status.result.payload.queue.total, 1);
    assert.equal(status.result.payload.queue.byDerivedStatus.completed, 1);
    assert.equal(status.result.payload.currentContinuityMode, 'execute');
    assert.equal(status.result.payload.operator.hasSession, true);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('orchestrator status reports an empty queue before any task is routed', async () => {
  const projectRoot = await createFixtureProject('vre-int-orchestrator-empty-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-results',
      'flow-writing',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const status = await runOrchestratorStatus({
      projectPath: projectRoot,
    });

    assert.equal(status.attempt.status, 'succeeded');
    assert.equal(status.result.payload.queue.total, 0);
    assert.deepEqual(status.result.payload.activeLaneRuns, []);
    assert.equal(status.result.payload.activeObjective, null);
    assert.equal(status.result.payload.nextRecommendedOperatorAction.kind, 'none');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('orchestrator status shows completed and blocked tasks across multiple public runtime calls', async () => {
  const projectRoot = await createFixtureProject('vre-int-orchestrator-multi-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-results',
      'flow-writing',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const executionRun = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Export a session digest for the current workspace.',
    });
    const blockedReviewRun = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Run a contrarian review of the current digest.',
      requestedMode: 'review',
    });
    const status = await runOrchestratorStatus({
      projectPath: projectRoot,
    });

    assert.equal(executionRun.attempt.status, 'succeeded');
    assert.equal(blockedReviewRun.attempt.status, 'succeeded');
    assert.ok(blockedReviewRun.result.payload.coordinator.route.immediateEscalation);
    assert.equal(status.result.payload.queue.total, 2);
    assert.equal(status.result.payload.queue.byDerivedStatus.completed, 1);
    assert.equal(status.result.payload.queue.byDerivedStatus.blocked, 1);
    assert.ok(status.result.payload.latestEscalationOrBlocker);
    assert.equal(status.result.payload.nextRecommendedOperatorAction.kind, 'resolve-escalation');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('orchestrator run and status surfaces expose escalated execution failures end-to-end', async () => {
  const projectRoot = await createFixtureProject('vre-int-orchestrator-failure-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-results',
      'flow-writing',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    const run = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Run an unsupported Phase 5 task class.',
      requestedMode: 'execute',
      taskKind: 'unsupported-task',
    });
    const status = await runOrchestratorStatus({
      projectPath: projectRoot,
    });

    assert.equal(run.attempt.status, 'succeeded');
    assert.equal(run.result.payload.coordinator.execution.laneRun.status, 'escalated');
    assert.equal(run.result.payload.coordinator.execution.recovery.failureClass, 'tool-failure');
    assert.equal(run.result.payload.coordinator.execution.recovery.recoveryAction, 'escalate-to-user');
    assert.equal(run.result.payload.coordinator.execution.escalation.status, 'pending');
    assert.equal(status.attempt.status, 'succeeded');
    assert.equal(status.result.payload.queue.total, 1);
    assert.equal(status.result.payload.queue.byDerivedStatus.escalated, 1);
    assert.equal(status.result.payload.nextRecommendedOperatorAction.kind, 'resolve-escalation');
    assert.ok(status.result.payload.latestEscalationOrBlocker);
    assert.equal(status.result.payload.latestRecoveryAction.failureClass, 'tool-failure');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('P2-A: sourceSessionId persists into taskInput for null-inputSchema tasks but stays transient for strict-inputSchema tasks', async () => {
  const projectRoot = await createFixtureProject('vre-int-orch-sourcesid-');

  try {
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-results',
      'flow-writing',
      'orchestrator-core',
    ]);
    await bootstrapCoreInstall(projectRoot);
    await bootstrapOrchestratorState(projectRoot, {
      lanePolicies: buildWave3LanePolicies(),
    });

    // session-digest-export has inputSchema: null → sourceSessionId MUST merge
    // into durable taskInput so replay without re-passing still works.
    const digestRun = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Export a session digest for the current workspace.',
      sourceSessionId: 'ORCH-SESSION-PROBE-A',
    });
    const digestTask = digestRun.result.payload.coordinator.route.task;
    assert.equal(digestTask.taskInput?.sourceSessionId, 'ORCH-SESSION-PROBE-A',
      'session-digest-export (null inputSchema) must persist sourceSessionId');

    // literature-flow-register has additionalProperties: false in its input
    // schema → sourceSessionId MUST NOT pollute the durable taskInput, or
    // the register helper would reject the extra key. sourceSessionId still
    // flows transiently via executeRoutedTask → runExecutionLane options.
    const literatureRun = await runOrchestratorObjective({
      projectPath: projectRoot,
      objective: 'Register paper for Phase 5.7 hygiene test.',
      taskKind: 'literature-flow-register',
      taskInput: {
        title: 'P2-A regression paper',
        doi: '10.5555/p2a',
      },
      sourceSessionId: 'ORCH-SESSION-PROBE-B',
    });
    const litTask = literatureRun.result.payload.coordinator.route.task;
    assert.equal(litTask.taskInput?.sourceSessionId, undefined,
      'literature-flow-register (strict inputSchema) must NOT leak sourceSessionId');
    assert.equal(litTask.taskInput?.title, 'P2-A regression paper');
    assert.equal(literatureRun.result.payload.coordinator.execution.laneRun.status, 'completed');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
