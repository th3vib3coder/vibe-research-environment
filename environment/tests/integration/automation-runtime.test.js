import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { runWithMiddleware } from '../../control/middleware.js';
import { getOperatorStatus } from '../../control/query.js';
import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { runWeeklyResearchDigest } from '../../automation/runtime.js';
import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';

test('weekly digest can run through middleware and surface in operator status', async () => {
  const projectRoot = await createFixtureProject('vre-int-automation-');

  try {
    await writeInstallState(projectRoot);
    await publishSessionSnapshot(projectRoot, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: null,
      currentStage: null,
      nextActions: ['review digest'],
      blockers: [],
      kernel: { dbAvailable: false, degradedReason: 'offline' },
      capabilities: {
        claimHeads: false,
        citationChecks: false,
        governanceProfileAtCreation: false,
        claimSearch: false
      },
      budget: {
        state: 'ok',
        toolCalls: 0,
        estimatedCostUsd: 0,
        countingMode: 'unknown'
      },
      signals: {
        staleMemory: false,
        unresolvedClaims: 0,
        blockedExperiments: 0,
        exportAlerts: 0
      },
      lastCommand: null,
      lastAttemptId: null,
      updatedAt: '2026-04-04T15:00:00Z'
    });

    const run = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/weekly-digest',
      scope: 'weekly-digest',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => ({
        summary: 'weekly digest assembled',
        payload: await runWeeklyResearchDigest(projectRoot, {
          now: '2026-04-04T15:00:00Z',
          triggerType: 'command',
        }),
      }),
    });

    const artifact = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'automation',
        'artifacts',
        'weekly-research-digest',
        '2026-W14.md',
      ),
      'utf8',
    );
    const status = await getOperatorStatus(projectRoot);
    const weekly = status.automations.automations.find(
      (entry) => entry.automationId === 'weekly-research-digest'
    );

    assert.equal(run.attempt.status, 'succeeded');
    assert.equal(run.snapshot.lastCommand, '/weekly-digest');
    assert.equal(run.result.payload.status, 'completed');
    assert.match(artifact, /Weekly Research Digest/u);
    assert.equal(status.automations.runtimeInstalled, true);
    assert.equal(weekly.status, 'completed');
    assert.equal(weekly.latestArtifactPath, '.vibe-science-environment/automation/artifacts/weekly-research-digest/2026-W14.md');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

async function writeInstallState(projectRoot) {
  const installStatePath = path.join(
    projectRoot,
    '.vibe-science-environment',
    '.install-state.json',
  );
  await mkdir(path.dirname(installStatePath), { recursive: true });
  await writeFile(
    installStatePath,
    `${JSON.stringify({
      schemaVersion: 'vibe-env.install.v1',
      installedAt: '2026-04-04T14:00:00Z',
      bundles: ['governance-core', 'control-plane', 'automation-core'],
      bundleManifestVersion: '1.0.0',
      operations: [],
      source: {
        version: '0.1.0',
        commit: 'automation-integration-test',
      },
    }, null, 2)}\n`,
    'utf8',
  );
}
