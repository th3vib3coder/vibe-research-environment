import assert from 'node:assert/strict';
import test from 'node:test';

import { runWithMiddleware } from '../../control/middleware.js';
import { listEvents } from '../../control/events.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('F-05: budget below advisory threshold remains ok', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-budget-ok-');

  try {
    const result = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      budget: { maxUsd: 10 },
      metricsAccumulator: metrics(5),
      commandFn: async () => ({ summary: 'ok' }),
    });

    assert.equal(result.snapshot.budget.state, 'ok');
    assert.equal((await listEvents(projectRoot, { kind: 'budget_advisory_entered' })).length, 0);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('F-05: budget at advisory threshold records warning and continues', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-budget-advisory-');

  try {
    const result = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      budget: { maxUsd: 10 },
      metricsAccumulator: metrics(8.5),
      commandFn: async () => ({ summary: 'advisory but allowed' }),
    });

    assert.equal(result.attempt.status, 'succeeded');
    assert.equal(result.snapshot.budget.state, 'advisory');
    const advisoryEvents = await listEvents(projectRoot, { kind: 'budget_advisory_entered' });
    assert.equal(advisoryEvents.length, 1);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('F-05: budget at hard stop still blocks execution', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-budget-hard-stop-');
  let executed = false;

  try {
    const result = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      budget: { maxUsd: 10 },
      metricsAccumulator: metrics(10),
      commandFn: async () => {
        executed = true;
        return { summary: 'should not run' };
      },
    });

    assert.equal(executed, false);
    assert.equal(result.attempt.status, 'blocked');
    assert.equal(result.snapshot.budget.state, 'hard_stop');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

function metrics(estimatedCostUsd) {
  return {
    snapshot() {
      return {
        toolCalls: 1,
        estimatedCostUsd,
        countingMode: 'provider_native',
        budgetState: 'unknown',
      };
    },
  };
}
