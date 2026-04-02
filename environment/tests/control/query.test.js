import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-query-'));
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

    const status = await query.getOperatorStatus(dir);
    assert.equal(status.session.signals.staleMemory, true);
    assert.equal(status.session.lastCommand, '/sync-memory');
    assert.equal(status.memory.hasSyncState, true);
    assert.equal(status.memory.isStale, true);
    assert.equal(status.memory.warning, 'STALE — run /sync-memory to refresh');
    assert.equal(status.memory.lastSyncAt, '2026-04-01T08:00:00Z');
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
