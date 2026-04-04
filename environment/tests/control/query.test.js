import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-query-'));
  await cp(
    path.join(process.cwd(), 'environment', 'connectors'),
    path.join(tmp, 'environment', 'connectors'),
    { recursive: true }
  );
  await cp(
    path.join(process.cwd(), 'environment', 'schemas'),
    path.join(tmp, 'environment', 'schemas'),
    { recursive: true }
  );
  await cp(
    path.join(process.cwd(), 'environment', 'templates'),
    path.join(tmp, 'environment', 'templates'),
    { recursive: true }
  );
  await cp(
    path.join(process.cwd(), 'environment', 'install', 'bundles'),
    path.join(tmp, 'environment', 'install', 'bundles'),
    { recursive: true }
  );
  return tmp;
}

describe('query', () => {
  let dir;
  let query;
  let attempts;
  let events;
  let decisions;
  let session;
  let capabilities;

  beforeEach(async () => {
    dir = await setup();
    query = await import(`../../control/query.js?${Date.now()}`);
    attempts = await import(`../../control/attempts.js?${Date.now()}`);
    events = await import(`../../control/events.js?${Date.now()}`);
    decisions = await import(`../../control/decisions.js?${Date.now()}`);
    session = await import(`../../control/session-snapshot.js?${Date.now()}`);
    capabilities = await import(`../../control/capabilities.js?${Date.now()}`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('re-exports the minimum control-plane query functions', () => {
    assert.equal(typeof query.getSessionSnapshot, 'function');
    assert.equal(typeof query.publishSessionSnapshot, 'function');
    assert.equal(typeof query.getCapabilitiesSnapshot, 'function');
    assert.equal(typeof query.publishCapabilitiesSnapshot, 'function');
    assert.equal(typeof query.getMemoryFreshness, 'function');
    assert.equal(typeof query.openAttempt, 'function');
    assert.equal(typeof query.updateAttempt, 'function');
    assert.equal(typeof query.appendEvent, 'function');
    assert.equal(typeof query.appendDecision, 'function');
    assert.equal(typeof query.listEvents, 'function');
    assert.equal(typeof query.listDecisions, 'function');
    assert.equal(typeof query.listAttempts, 'function');
  });

  it('composes operator status from session and capabilities', async () => {
    await session.publishSessionSnapshot(dir, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: null,
      currentStage: null,
      nextActions: [],
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
      updatedAt: new Date().toISOString()
    });

    await capabilities.publishCapabilitiesSnapshot(dir, {
      schemaVersion: 'vibe-env.capabilities.v1',
      kernel: {
        dbAvailable: false,
        projections: {
          overview: false,
          claimHeads: false,
          unresolvedClaims: false,
          citationChecks: false
        },
        advanced: {
          governanceProfileAtCreation: false,
          claimSearch: false
        }
      },
      install: {
        bundles: ['control-plane']
      },
      updatedAt: new Date().toISOString()
    });

    const status = await query.getOperatorStatus(dir);
    assert.equal(status.hasSession, true);
    assert.equal(status.session.kernel.degradedReason, 'offline');
    assert.deepEqual(status.capabilities.install.bundles, ['control-plane']);
  });

  it('exposes memory freshness and stale warning through operator status', async () => {
    await session.publishSessionSnapshot(dir, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: 'experiment',
      currentStage: 'result-packaging',
      nextActions: ['refresh memory mirrors'],
      blockers: [],
      kernel: { dbAvailable: true, degradedReason: null },
      capabilities: {
        claimHeads: true,
        citationChecks: true,
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
        staleMemory: true,
        unresolvedClaims: 0,
        blockedExperiments: 0,
        exportAlerts: 0
      },
      lastCommand: '/sync-memory',
      lastAttemptId: 'ATT-2026-04-02-001',
      updatedAt: new Date().toISOString()
    });

    const syncStatePath = path.join(
      dir,
      '.vibe-science-environment',
      'memory',
      'sync-state.json'
    );
    await mkdir(path.dirname(syncStatePath), { recursive: true });
    await writeFile(
      syncStatePath,
      `${JSON.stringify(
        {
          schemaVersion: 'vibe-env.memory-sync-state.v1',
          lastSyncAt: '2026-04-01T08:00:00Z',
          lastSuccessfulSyncAt: '2026-04-01T08:00:00Z',
          status: 'ok',
          kernelDbAvailable: true,
          degradedReason: null,
          mirrors: [],
          warnings: []
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const marksPath = path.join(
      dir,
      '.vibe-science-environment',
      'memory',
      'index',
      'marks.jsonl'
    );
    await mkdir(path.dirname(marksPath), { recursive: true });
    await writeFile(
      marksPath,
      [
        JSON.stringify({
          targetType: 'claim',
          targetId: 'C-014',
          mark: 'writing_ready'
        }),
        '{"targetType":"claim","targetId":"C-014","mark":"Writing Ready"}',
        JSON.stringify({
          targetType: 'experiment',
          targetId: 'EXP-003',
          mark: 'follow_up'
        })
      ].join('\n'),
      'utf8'
    );

    const status = await query.getOperatorStatus(dir);
    assert.equal(status.session.signals.staleMemory, true);
    assert.equal(status.session.lastCommand, '/sync-memory');
    assert.equal(status.memory.hasSyncState, true);
    assert.equal(status.memory.isStale, true);
    assert.equal(status.memory.warning, 'STALE — run /sync-memory to refresh');
    assert.equal(status.memory.lastSyncAt, '2026-04-01T08:00:00Z');
    assert.equal(status.memory.marks.hasMarksFile, true);
    assert.equal(status.memory.marks.totalMarks, 2);
    assert.equal(status.memory.marks.byTargetType.claim, 1);
    assert.equal(status.memory.marks.byTargetType.experiment, 1);
    assert.equal(status.memory.marks.prioritizedTargets.length, 2);
    assert.match(status.memory.marks.warnings.join('\n'), /Ignoring invalid memory mark record/);
  });

  it('surfaces writing snapshots, export alerts, and pack directories in operator status', async () => {
    await session.publishSessionSnapshot(dir, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: 'writing',
      currentStage: 'advisor-pack',
      nextActions: ['review advisor pack'],
      blockers: ['C-014: claim_killed'],
      kernel: { dbAvailable: true, degradedReason: null },
      capabilities: {
        claimHeads: true,
        citationChecks: true,
        governanceProfileAtCreation: true,
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
        exportAlerts: 1
      },
      lastCommand: '/flow-writing',
      lastAttemptId: 'ATT-2026-04-02-002',
      updatedAt: new Date().toISOString()
    });

    const snapshotPath = path.join(
      dir,
      '.vibe-science-environment',
      'writing',
      'exports',
      'snapshots',
      'WEXP-2026-04-02-200.json'
    );
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(
      snapshotPath,
      `${JSON.stringify({
        schemaVersion: 'vibe-env.export-snapshot.v1',
        snapshotId: 'WEXP-2026-04-02-200',
        createdAt: '2026-04-02T16:00:00Z',
        claimIds: ['C-014'],
        claims: [{
          claimId: 'C-014',
          statusAtExport: 'PROMOTED',
          confidenceAtExport: 0.91,
          eligible: true,
          reasons: [],
          governanceProfileAtCreation: 'strict',
          hasFreshSchemaValidation: true
        }],
        citations: [],
        capabilities: {
          governanceProfileAtCreationAvailable: true,
          schemaValidationSurfaceAvailable: true
        },
        warnings: []
      }, null, 2)}\n`,
      'utf8'
    );

    const exportAlertPath = path.join(
      dir,
      '.vibe-science-environment',
      'writing',
      'exports',
      'export-alerts.jsonl'
    );
    await mkdir(path.dirname(exportAlertPath), { recursive: true });
    await writeFile(
      exportAlertPath,
      `${JSON.stringify({
        schemaVersion: 'vibe-env.export-alert-record.v1',
        alertId: 'WALERT-2026-04-02-200',
        claimId: 'C-014',
        snapshotId: 'WEXP-2026-04-02-200',
        detectedAt: '2026-04-02T16:05:00Z',
        kind: 'claim_killed',
        severity: 'warning',
        message: 'C-014 was exported but is now KILLED.',
        citationId: null,
        snapshotStatus: 'PROMOTED',
        currentStatus: 'KILLED',
        snapshotConfidence: 0.91,
        currentConfidence: 0.22
      })}\n`,
      'utf8'
    );

    const advisorDir = path.join(
      dir,
      '.vibe-science-environment',
      'writing',
      'advisor-packs',
      '2026-04-02'
    );
    await mkdir(path.join(advisorDir, 'figures'), { recursive: true });
    await writeFile(path.join(advisorDir, 'status-summary.md'), '# Status\n', 'utf8');

    const rebuttalDir = path.join(
      dir,
      '.vibe-science-environment',
      'writing',
      'rebuttal',
      'submission-001'
    );
    await mkdir(rebuttalDir, { recursive: true });
    await writeFile(path.join(rebuttalDir, 'response-draft.md'), '# Draft\n', 'utf8');

    const status = await query.getOperatorStatus(dir);
    assert.equal(status.writing.totalSnapshots, 1);
    assert.equal(status.writing.totalAlerts, 1);
    assert.equal(status.writing.snapshots[0].snapshotId, 'WEXP-2026-04-02-200');
    assert.equal(status.writing.alerts[0].kind, 'claim_killed');
    assert.equal(status.writing.advisorPacks[0].packId, '2026-04-02');
    assert.equal(status.writing.rebuttalPacks[0].packId, 'submission-001');
  });

  it('surfaces connector health through operator status when connectors-core is installed', async () => {
    const installStatePath = path.join(
      dir,
      '.vibe-science-environment',
      '.install-state.json'
    );
    await mkdir(path.dirname(installStatePath), { recursive: true });
    await writeFile(
      installStatePath,
      `${JSON.stringify(
        {
          schemaVersion: 'vibe-env.install.v1',
          installedAt: '2026-04-04T08:00:00Z',
          bundles: ['governance-core', 'control-plane', 'connectors-core'],
          bundleManifestVersion: '1.0.0',
          operations: [],
          source: {
            version: '0.1.0',
            commit: 'query-test'
          }
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const { recordConnectorRun } = await import(`../../connectors/health.js?${Date.now()}`);
    await recordConnectorRun(dir, 'filesystem-export', {
      schemaVersion: 'vibe-env.connector-run-record.v1',
      runId: 'CONN-RUN-2026-04-04-001',
      connectorId: 'filesystem-export',
      runKind: 'export',
      status: 'completed',
      startedAt: '2026-04-04T08:05:00Z',
      endedAt: '2026-04-04T08:05:00Z',
      sourceSurfaces: ['.vibe-science-environment/results/experiments/EXP-001'],
      target: {
        kind: 'external',
        path: path.join(dir, 'external-results', 'EXP-001')
      },
      healthCheck: null,
      visibleFailure: {
        surfacedInStatus: true,
        failureKind: 'none',
        message: null
      },
      warnings: []
    });

    const status = await query.getOperatorStatus(dir);
    assert.equal(status.connectors.runtimeInstalled, true);
    assert.equal(status.connectors.totalConnectors, 2);

    const filesystem = status.connectors.connectors.find(
      (entry) => entry.connectorId === 'filesystem-export'
    );
    assert.equal(filesystem.healthStatus, 'ok');
    assert.equal(filesystem.lastRunStatus, 'completed');
    assert.equal(filesystem.totalRuns, 1);

    const obsidian = status.connectors.connectors.find(
      (entry) => entry.connectorId === 'obsidian-export'
    );
    assert.equal(obsidian.healthStatus, 'unknown');
    assert.equal(obsidian.totalRuns, 0);
  });

  it('returns attempt history enriched with events and decisions', async () => {
    const attempt = await attempts.openAttempt(dir, { scope: '/flow-experiment' });
    await attempts.updateAttempt(dir, attempt.attemptId, { status: 'running' });
    await events.appendEvent(dir, {
      kind: 'attempt_opened',
      attemptId: attempt.attemptId
    });
    await decisions.appendDecision(dir, {
      flow: 'experiment',
      attemptId: attempt.attemptId,
      kind: 'operator_override',
      reason: 'manual continuation'
    });

    const history = await query.getAttemptHistory(dir, {
      flow: 'flow-experiment'
    });

    assert.equal(history.length, 1);
    assert.equal(history[0].events.length, 1);
    assert.equal(history[0].decisions.length, 1);
  });
});
