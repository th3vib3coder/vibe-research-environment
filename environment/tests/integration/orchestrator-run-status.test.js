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
