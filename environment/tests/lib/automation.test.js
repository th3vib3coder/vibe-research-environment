import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { getAutomationOverview } from '../../automation/artifacts.js';
import { getAutomationRegistry } from '../../automation/definitions.js';
import {
  runAutomation,
  runExportWarningDigest,
  runStaleMemoryReminder,
  runWeeklyResearchDigest,
} from '../../automation/runtime.js';
import {
  appendAutomationRunRecord,
  listAutomationRunRecords,
} from '../../automation/run-log.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('automation registry discovers built-in definitions and rejects duplicate command surfaces', async () => {
  const projectRoot = await createFixtureProject('vre-automation-registry-');

  try {
    await writeInstallState(projectRoot);

    const registry = await getAutomationRegistry(projectRoot);
    assert.equal(registry.runtimeInstalled, true);
    assert.deepEqual(
      registry.automations.map((entry) => entry.automationId),
      ['export-warning-digest', 'stale-memory-reminder', 'weekly-research-digest'],
    );

    const duplicatePath = path.join(
      projectRoot,
      'environment',
      'automation',
      'definitions',
      'weekly-digest-copy.automation.json',
    );
    const { definitionPath: _ignoredDefinitionPath, ...baseDefinition } = registry.automations[2];
    await writeFile(
      duplicatePath,
      `${JSON.stringify({
        ...baseDefinition,
        automationId: 'weekly-digest-copy',
      }, null, 2)}\n`,
      'utf8',
    );

    await assert.rejects(
      () => getAutomationRegistry(projectRoot),
      /Duplicate automation command surface/u,
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('weekly digest writes a reviewable artifact, blocks duplicate reruns, and shares the same run contract for scheduled runs', async () => {
  const projectRoot = await createFixtureProject('vre-automation-weekly-');

  try {
    await writeInstallState(projectRoot);
    await publishMinimalSessionSnapshot(projectRoot, '2026-04-04T09:00:00Z');

    const firstRun = await runWeeklyResearchDigest(projectRoot, {
      now: '2026-04-04T09:00:00Z',
      triggerType: 'command',
    });
    const duplicateRun = await runWeeklyResearchDigest(projectRoot, {
      now: '2026-04-04T10:00:00Z',
      triggerType: 'command',
    });
    const scheduledRun = await runAutomation(projectRoot, 'weekly-research-digest', {
      now: '2026-04-11T09:00:00Z',
      triggerType: 'scheduled',
      schedulerContext: {
        scheduledByHost: true,
        scheduledFor: '2026-04-11T09:00:00Z',
      },
    });

    const digestW14 = await readFile(
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
    const digestW15 = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'automation',
        'artifacts',
        'weekly-research-digest',
        '2026-W15.md',
      ),
      'utf8',
    );
    const runs = await listAutomationRunRecords(projectRoot, 'weekly-research-digest');

    assert.equal(firstRun.status, 'completed');
    assert.equal(firstRun.artifactPath, '.vibe-science-environment/automation/artifacts/weekly-research-digest/2026-W14.md');
    assert.equal(duplicateRun.status, 'blocked');
    assert.equal(duplicateRun.artifactPath, firstRun.artifactPath);
    assert.match(duplicateRun.blockedReason, /already recorded source state 2026-W14/u);
    assert.equal(scheduledRun.status, 'completed');
    assert.equal(scheduledRun.artifactPath, '.vibe-science-environment/automation/artifacts/weekly-research-digest/2026-W15.md');
    assert.match(digestW14, /Weekly Research Digest/u);
    assert.match(digestW14, /Active flow: none/u);
    assert.match(digestW15, /Trigger type: scheduled/u);
    assert.equal(runs.total, 3);
    assert.equal(runs.items[0].triggerType, 'scheduled');
    assert.equal(runs.items[0].schedulerContext.scheduledByHost, true);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('automation run log appends through the shared control-plane lock discipline', async () => {
  const projectRoot = await createFixtureProject('vre-automation-run-log-');

  try {
    const records = Array.from({ length: 8 }, (_, index) =>
      buildAutomationRunRecordFixture({
        runId: `AUTO-RUN-20260404-14000${index}`,
        endedAt: `2026-04-04T14:00:0${index}Z`,
        idempotencyKey: `fixture-${index}`,
      }),
    );

    await Promise.all(
      records.map((record) =>
        appendAutomationRunRecord(projectRoot, 'weekly-research-digest', record),
      ),
    );

    const runs = await listAutomationRunRecords(projectRoot, 'weekly-research-digest');
    const lockEntries = await readdir(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'locks'),
    );

    assert.equal(runs.total, records.length);
    assert.equal(runs.warnings.length, 0);
    assert.equal(new Set(runs.items.map((record) => record.runId)).size, records.length);
    assert.deepEqual(lockEntries, []);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('weekly digest keeps kernel-owned .vibe-science state untouched while writing outer artifacts', async () => {
  const projectRoot = await createFixtureProject('vre-automation-kernel-guard-');
  const kernelRoot = path.join(projectRoot, '.vibe-science');

  try {
    await writeInstallState(projectRoot);
    await publishMinimalSessionSnapshot(projectRoot, '2026-04-04T16:00:00Z');
    await mkdir(path.join(kernelRoot, 'events'), { recursive: true });
    await writeFile(path.join(kernelRoot, 'STATE.md'), '# Kernel State\n', 'utf8');
    await writeFile(path.join(kernelRoot, 'CLAIM-LEDGER.md'), '# Claim Ledger\n', 'utf8');
    await writeFile(
      path.join(kernelRoot, 'events', 'governance_events.json'),
      '{"events":[]}\n',
      'utf8',
    );

    const beforeKernelTree = await snapshotTextTree(kernelRoot);
    const run = await runWeeklyResearchDigest(projectRoot, {
      now: '2026-04-04T16:00:00Z',
      triggerType: 'command',
    });
    const afterKernelTree = await snapshotTextTree(kernelRoot);

    assert.equal(run.status, 'completed');
    assert.equal(
      run.artifactPath,
      '.vibe-science-environment/automation/artifacts/weekly-research-digest/2026-W14.md',
    );
    assert.deepEqual(afterKernelTree, beforeKernelTree);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('stale-memory reminder respects freshness semantics and writes a visible artifact', async () => {
  const projectRoot = await createFixtureProject('vre-automation-memory-');

  try {
    await writeInstallState(projectRoot);
    await writeMemorySyncState(projectRoot, {
      lastSyncAt: '2026-04-01T08:00:00Z',
      lastSuccessfulSyncAt: '2026-04-01T08:00:00Z',
      status: 'ok',
    });

    const reminder = await runStaleMemoryReminder(projectRoot, {
      now: '2026-04-04T12:00:00Z',
      triggerType: 'command',
    });
    const artifact = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'automation',
        'artifacts',
        'stale-memory-reminder',
        'memory-stale-2026-04-01T08-00-00Z.md',
      ),
      'utf8',
    );
    const overview = await getAutomationOverview(projectRoot);
    const automation = overview.automations.find(
      (entry) => entry.automationId === 'stale-memory-reminder'
    );

    assert.equal(reminder.status, 'completed');
    assert.match(artifact, /STALE — run \/sync-memory to refresh/u);
    assert.equal(automation.status, 'completed');
    assert.equal(automation.latestArtifactPath, reminder.artifactPath);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('export-warning digest summarizes existing alerts without mutating the alert log', async () => {
  const projectRoot = await createFixtureProject('vre-automation-alerts-');

  try {
    await writeInstallState(projectRoot);
    const alertLogPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'writing',
      'exports',
      'export-alerts.jsonl',
    );
    await mkdir(path.dirname(alertLogPath), { recursive: true });
    const alertLine = JSON.stringify({
      schemaVersion: 'vibe-env.export-alert-record.v1',
      alertId: 'WALERT-2026-04-04-001',
      claimId: 'C-201',
      snapshotId: 'WEXP-2026-04-04-201',
      detectedAt: '2026-04-04T08:05:00Z',
      kind: 'claim_killed',
      severity: 'warning',
      message: 'C-201 was exported but is now KILLED.',
      citationId: null,
      snapshotStatus: 'PROMOTED',
      currentStatus: 'KILLED',
      snapshotConfidence: 0.92,
      currentConfidence: 0.12,
    });
    await writeFile(alertLogPath, `${alertLine}\n`, 'utf8');

    const digest = await runExportWarningDigest(projectRoot, {
      now: '2026-04-04T13:00:00Z',
      triggerType: 'command',
    });
    const artifact = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'automation',
        'artifacts',
        'export-warning-digest',
        'alerts-WALERT-2026-04-04-001-1.md',
      ),
      'utf8',
    );
    const alertLog = await readFile(alertLogPath, 'utf8');

    assert.equal(digest.status, 'completed');
    assert.match(artifact, /WALERT-2026-04-04-001/u);
    assert.equal(alertLog.trim(), alertLine);
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
      installedAt: '2026-04-04T08:00:00Z',
      bundles: ['governance-core', 'control-plane', 'automation-core'],
      bundleManifestVersion: '1.0.0',
      operations: [],
      source: {
        version: '0.1.0',
        commit: 'automation-test',
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

async function publishMinimalSessionSnapshot(projectRoot, updatedAt) {
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
      claimSearch: false,
    },
    budget: {
      state: 'ok',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'unknown',
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0,
    },
    lastCommand: '/weekly-digest',
    lastAttemptId: 'ATT-2026-04-04-010',
    updatedAt,
  });
}

async function writeMemorySyncState(projectRoot, overrides) {
  const syncStatePath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'memory',
    'sync-state.json',
  );
  await mkdir(path.dirname(syncStatePath), { recursive: true });
  await writeFile(
    syncStatePath,
    `${JSON.stringify({
      schemaVersion: 'vibe-env.memory-sync-state.v1',
      lastSyncAt: overrides.lastSyncAt,
      lastSuccessfulSyncAt: overrides.lastSuccessfulSyncAt,
      status: overrides.status,
      kernelDbAvailable: true,
      degradedReason: null,
      mirrors: [],
      warnings: [],
    }, null, 2)}\n`,
    'utf8',
  );
}

function buildAutomationRunRecordFixture({
  runId,
  endedAt,
  idempotencyKey,
}) {
  return {
    schemaVersion: 'vibe-env.automation-run-record.v1',
    runId,
    automationId: 'weekly-research-digest',
    triggerType: 'command',
    status: 'completed',
    startedAt: endedAt,
    endedAt,
    artifactPath: '.vibe-science-environment/automation/artifacts/weekly-research-digest/fixture.md',
    sourceSurfaces: ['control/session.json'],
    idempotencyKey,
    blockedReason: null,
    degradedReason: null,
    warnings: ['fixture record'],
  };
}

async function snapshotTextTree(rootDir, relativeDir = '') {
  const currentDir = path.join(rootDir, relativeDir);
  const entries = await readdir(currentDir, { withFileTypes: true });
  const snapshot = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(
      ...path.join(relativeDir, entry.name).split(path.sep).filter(Boolean),
    );

    if (entry.isDirectory()) {
      snapshot.push({
        type: 'directory',
        path: relativePath,
      });
      snapshot.push(...(await snapshotTextTree(rootDir, path.join(relativeDir, entry.name))));
      continue;
    }

    snapshot.push({
      type: 'file',
      path: relativePath,
      content: await readFile(path.join(rootDir, relativeDir, entry.name), 'utf8'),
    });
  }

  return snapshot;
}
