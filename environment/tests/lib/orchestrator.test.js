import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { cleanupInstallFixture, createInstallFixture } from '../install/_fixture.js';
import {
  appendEscalationRecord,
  appendLaneRun,
  appendRecoveryRecord,
} from '../../orchestrator/ledgers.js';
import { getOrchestratorStatus } from '../../orchestrator/query.js';
import {
  appendQueueDependencyUpdate,
  appendQueueStatusTransition,
  createQueueTask,
  getLatestQueueState,
  listBlockedTasks,
  listReadyTasks,
} from '../../orchestrator/queue.js';
import {
  bootstrapContinuityProfile,
  bootstrapLanePolicies,
  bootstrapOrchestratorLedgers,
  bootstrapRouterSession,
  readContinuityProfile,
  readLanePolicies,
  readRouterSession,
} from '../../orchestrator/state.js';

async function exists(targetPath) {
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

test('orchestrator read helpers do not bootstrap state on read', async () => {
  const projectRoot = await createInstallFixture('vre-orchestrator-readonly-');

  try {
    assert.equal(await readRouterSession(projectRoot), null);
    assert.equal(await readContinuityProfile(projectRoot), null);
    assert.equal(await readLanePolicies(projectRoot), null);

    const orchestratorRoot = path.join(projectRoot, '.vibe-science-environment', 'orchestrator');
    assert.equal(await exists(orchestratorRoot), false);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('explicit orchestrator bootstrap creates conservative defaults and empty ledgers', async () => {
  const projectRoot = await createInstallFixture('vre-orchestrator-bootstrap-');

  try {
    const routerSession = await bootstrapRouterSession(projectRoot);
    const continuityProfile = await bootstrapContinuityProfile(projectRoot);
    const lanePolicies = await bootstrapLanePolicies(projectRoot);
    await bootstrapOrchestratorLedgers(projectRoot);

    assert.equal(routerSession.currentMode, 'intake');
    assert.equal(continuityProfile.operator.defaultAutonomyPreference, 'advisory');
    assert.equal(lanePolicies.lanes.execution.enabled, false);
    assert.equal(lanePolicies.lanes.review.reviewOnly, true);

    const orchestratorRoot = path.join(projectRoot, '.vibe-science-environment', 'orchestrator');
    const entries = await readdir(orchestratorRoot);
    assert.ok(entries.includes('router-session.json'));
    assert.ok(entries.includes('continuity-profile.json'));
    assert.ok(entries.includes('lane-policies.json'));
    assert.ok(entries.includes('run-queue.jsonl'));
    assert.ok(entries.includes('lane-runs.jsonl'));
    assert.ok(entries.includes('recovery-log.jsonl'));
    assert.ok(entries.includes('escalations.jsonl'));
    assert.ok(entries.includes('external-review-log.jsonl'));

    const queueContents = await readFile(
      path.join(orchestratorRoot, 'run-queue.jsonl'),
      'utf8',
    );
    assert.equal(queueContents, '');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('queue helper replays append-only task state and surfaces dependency blockage honestly', async () => {
  const projectRoot = await createInstallFixture('vre-orchestrator-queue-');

  try {
    await bootstrapOrchestratorLedgers(projectRoot);

    const dependencyTask = await createQueueTask(projectRoot, {
      mode: 'execute',
      ownerLane: 'execution',
      status: 'completed',
      title: 'Prepare experiment bundle',
    });
    const mainTask = await createQueueTask(projectRoot, {
      mode: 'report',
      ownerLane: 'reporting',
      status: 'ready',
      title: 'Prepare advisor summary',
      dependencyTaskIds: [dependencyTask.taskId],
    });

    const readyTasks = await listReadyTasks(projectRoot);
    assert.equal(readyTasks.length, 1);
    assert.equal(readyTasks[0].taskId, mainTask.taskId);

    await appendQueueDependencyUpdate(projectRoot, mainTask.taskId, [
      dependencyTask.taskId,
      'ORCH-TASK-MISSING-001',
    ]);

    const blockedTasks = await listBlockedTasks(projectRoot);
    assert.equal(blockedTasks.length, 1);
    assert.equal(blockedTasks[0].taskId, mainTask.taskId);
    assert.match(
      blockedTasks[0].blockingReasons.join('\n'),
      /Missing dependency state/u,
    );

    await appendQueueStatusTransition(projectRoot, mainTask.taskId, {
      status: 'running',
      statusReason: 'Manually resumed despite missing dependency state for test coverage.',
    });

    const latestState = await getLatestQueueState(projectRoot);
    const latestTask = latestState.find((task) => task.taskId === mainTask.taskId);
    assert.equal(latestTask.derivedStatus, 'blocked');
    assert.equal(latestTask.status, 'running');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('ledger helpers append schema-valid lane, recovery, and escalation records', async () => {
  const projectRoot = await createInstallFixture('vre-orchestrator-ledgers-');

  try {
    await bootstrapOrchestratorLedgers(projectRoot);

    const laneRun = await appendLaneRun(projectRoot, {
      laneId: 'execution',
      taskId: 'ORCH-TASK-2026-04-10-001',
      providerRef: 'openai/codex',
      integrationKind: 'local-cli',
      supervisionCapability: 'streaming',
      status: 'running',
      summary: 'Execution lane started.',
    });
    const escalation = await appendEscalationRecord(projectRoot, {
      taskId: laneRun.taskId,
      laneRunId: laneRun.laneRunId,
      status: 'pending',
      triggerKind: 'ambiguous-evidence',
      decisionNeeded: 'Confirm whether to proceed with low-confidence evidence.',
      contextShown: ['queue/ORCH-TASK-2026-04-10-001'],
    });
    const recovery = await appendRecoveryRecord(projectRoot, {
      taskId: laneRun.taskId,
      laneRunId: laneRun.laneRunId,
      failureClass: 'tool-failure',
      recoveryAction: 'retry-with-backoff',
      result: 'scheduled',
      escalationId: escalation.escalationId,
      summary: 'Retry scheduled after visible failure.',
    });

    assert.match(laneRun.laneRunId, /^ORCH-RUN-/u);
    assert.match(escalation.escalationId, /^ORCH-ESC-/u);
    assert.match(recovery.recoveryId, /^ORCH-REC-/u);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('orchestrator query surface returns shared summaries and next operator action', async () => {
  const projectRoot = await createInstallFixture('vre-orchestrator-query-');

  try {
    await bootstrapRouterSession(projectRoot, {
      currentMode: 'supervise',
      objective: 'Move the current writing task forward safely.',
      queueFocusTaskId: 'ORCH-TASK-2026-04-10-101',
    });
    await bootstrapContinuityProfile(projectRoot);
    await bootstrapLanePolicies(projectRoot);
    await bootstrapOrchestratorLedgers(projectRoot);

    const task = await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-10-101',
      mode: 'review',
      ownerLane: 'review',
      status: 'blocked',
      title: 'Contrarian review of advisor draft',
      statusReason: 'Waiting for operator arbitration.',
    });

    await appendEscalationRecord(projectRoot, {
      escalationId: 'ORCH-ESC-2026-04-10-101',
      taskId: task.taskId,
      status: 'pending',
      triggerKind: 'review-disagreement',
      decisionNeeded: 'Choose whether to accept the review objection or reroute.',
      contextShown: ['external-review/ORCH-REVIEW-2026-04-10-101'],
    });

    const status = await getOrchestratorStatus(projectRoot);

    assert.equal(status.runtimeInstalled, true);
    assert.equal(status.queue.total, 1);
    assert.equal(status.queue.byDerivedStatus.blocked, 1);
    assert.equal(status.nextRecommendedOperatorAction.kind, 'resolve-escalation');
    assert.equal(status.nextRecommendedOperatorAction.taskId, task.taskId);
    assert.match(
      status.nextRecommendedOperatorAction.summary,
      /Choose whether to accept the review objection/u,
    );
    assert.deepEqual(status.warnings, []);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
