import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanupInstallFixture, createInstallFixture } from '../install/_fixture.js';
import { listEscalationRecords } from '../../orchestrator/ledgers.js';
import { routeOrchestratorObjective } from '../../orchestrator/router.js';

test('router maps a digest objective into a visible execution task', async () => {
  const projectRoot = await createInstallFixture('vre-orch-routing-');

  try {
    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Export a session digest for the current workspace.',
    });

    assert.equal(routed.mode, 'execute');
    assert.equal(routed.primaryLane, 'execution');
    assert.equal(routed.selectedLane, 'execution');
    assert.equal(routed.task.status, 'ready');
    assert.equal(routed.task.targetRef.kind, 'session-digest-export');
    assert.equal(routed.routerSession.queueFocusTaskId, routed.task.taskId);
    assert.equal(routed.immediateEscalation, null);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('router blocks ambiguous intake requests with a visible escalation', async () => {
  const projectRoot = await createInstallFixture('vre-orch-routing-blocked-');

  try {
    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Can you take care of it somehow?',
    });
    const escalations = await listEscalationRecords(projectRoot);

    assert.equal(routed.mode, 'intake');
    assert.equal(routed.task.status, 'blocked');
    assert.equal(routed.task.escalationNeeded, true);
    assert.equal(routed.immediateEscalation?.status, 'pending');
    assert.equal(escalations.length, 1);
    assert.match(routed.task.statusReason, /ambiguous/u);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});

test('router blocks direct artifact reviews until they point at an execution-backed queue task', async () => {
  const projectRoot = await createInstallFixture('vre-orch-routing-review-guard-');

  try {
    const routed = await routeOrchestratorObjective(projectRoot, {
      objective: 'Run a contrarian review of this artifact set.',
      requestedMode: 'review',
      artifactRefs: ['artifacts/draft.md'],
    });
    const escalations = await listEscalationRecords(projectRoot);

    assert.equal(routed.mode, 'review');
    assert.equal(routed.task.status, 'blocked');
    assert.equal(routed.task.escalationNeeded, true);
    assert.equal(routed.immediateEscalation?.status, 'pending');
    assert.equal(escalations.length, 1);
    assert.match(routed.immediateEscalation?.decisionNeeded ?? '', /queue-task/u);
    assert.match(routed.task.statusReason, /execution-backed queue target/u);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
