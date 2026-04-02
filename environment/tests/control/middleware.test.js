import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vre-mw-'));
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

describe('middleware', () => {
  let dir;
  let middleware;
  let query;
  let attempts;
  let decisions;
  let events;
  let manifest;
  let snapshot;

  beforeEach(async () => {
    dir = await setup();
    middleware = await import(`../../control/middleware.js?${Date.now()}`);
    query = await import(`../../control/query.js?${Date.now()}`);
    attempts = await import(`../../control/attempts.js?${Date.now()}`);
    decisions = await import(`../../control/decisions.js?${Date.now()}`);
    events = await import(`../../control/events.js?${Date.now()}`);
    manifest = await import(`../../lib/manifest.js?${Date.now()}`);
    snapshot = await import(`../../control/session-snapshot.js?${Date.now()}`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('runs the full chain and appends returned decisions', async () => {
    const metricsAccumulator = {
      snapshot() {
        return {
          toolCalls: 4,
          estimatedCostUsd: 1.2,
          countingMode: 'provider_native',
          budgetState: 'ok'
        };
      }
    };

    const { attempt, snapshot: publishedSnapshot } = await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-experiment',
      reader: null,
      metricsAccumulator,
      targetId: 'EXP-001',
      commandFn: async (ctx) => {
        assert.equal(ctx.scope, 'flow-experiment');
        assert.equal(ctx.flow, 'experiment');
        assert.equal(ctx.degraded, true);
        return {
          summary: 'Experiment listed',
          decisions: [
            {
              kind: 'blocker_escalation',
              reason: 'Need manual review'
            }
          ]
        };
      }
    });

    assert.equal(attempt.status, 'succeeded');
    assert.equal(publishedSnapshot.budget.toolCalls, 4);

    const decisionList = await decisions.listDecisions(dir, {
      attemptId: attempt.attemptId
    });
    assert.equal(decisionList.length, 1);
    assert.equal(decisionList[0].flow, 'experiment');
  });

  it('blocks command execution on budget hard stop', async () => {
    let executed = false;
    const metricsAccumulator = {
      snapshot() {
        return {
          toolCalls: 100,
          estimatedCostUsd: 10,
          countingMode: 'provider_native',
          budgetState: 'hard_stop'
        };
      }
    };

    const { result, attempt } = await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: null,
      metricsAccumulator,
      commandFn: async () => {
        executed = true;
        return {};
      }
    });

    assert.equal(executed, false);
    assert.equal(result.blocked, true);
    assert.equal(attempt.status, 'blocked');

    const eventList = await events.listEvents(dir, {
      kind: 'budget_stop_triggered'
    });
    assert.equal(eventList.length, 1);
  });

  it('handles command failure honestly', async () => {
    const { attempt } = await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-experiment',
      reader: null,
      commandFn: async () => {
        throw new Error('Experiment registration failed');
      }
    });

    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.summary, 'Experiment registration failed');
  });

  it('creates one logical attempt per invocation with lifecycle updates', async () => {
    await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-literature',
      reader: null,
      commandFn: async () => ({})
    });

    const list = await attempts.listAttempts(dir);
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'succeeded');
  });

  it('publishes a session snapshot with degraded kernel info', async () => {
    await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: {
        dbAvailable: false,
        error: 'db unavailable'
      },
      commandFn: async () => ({})
    });

    const currentSnapshot = await snapshot.getSessionSnapshot(dir);
    assert.equal(currentSnapshot.kernel.dbAvailable, false);
    assert.equal(currentSnapshot.kernel.degradedReason, 'db unavailable');
  });

  it('publishes staleMemory from a stale memory sync-state file', async () => {
    const syncStatePath = path.join(
      dir,
      '.vibe-science-environment',
      'memory',
      'sync-state.json'
    );
    await mkdir(path.dirname(syncStatePath), { recursive: true });
    await writeFile(
      syncStatePath,
      `${JSON.stringify({
        schemaVersion: 'vibe-env.memory-sync-state.v1',
        lastSyncAt: '2026-04-01T08:00:00Z',
        lastSuccessfulSyncAt: '2026-04-01T08:00:00Z',
        status: 'ok',
        kernelDbAvailable: true,
        degradedReason: null,
        mirrors: [],
        warnings: []
      }, null, 2)}\n`,
      'utf8'
    );

    await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: {
        dbAvailable: true,
        listUnresolvedClaims: async () => []
      },
      commandFn: async () => ({
        summary: 'status rebuilt'
      })
    });

    const currentSnapshot = await snapshot.getSessionSnapshot(dir);
    const status = await query.getOperatorStatus(dir);

    assert.equal(currentSnapshot.signals.staleMemory, true);
    assert.equal(status.session.signals.staleMemory, true);
    assert.equal(status.memory.isStale, true);
    assert.equal(status.memory.warning, 'STALE — run /sync-memory to refresh');
  });

  it('derives unresolvedClaims and blockedExperiments from real sources', async () => {
    await manifest.createManifest(dir, {
      experimentId: 'EXP-004',
      title: 'Blocked experiment',
      objective: 'Test blocker surfacing',
      status: 'planned',
      executionPolicy: {
        timeoutSeconds: 3600,
        unresponsiveSeconds: 300,
        maxAttempts: 2
      },
      parameters: {},
      codeRef: {
        entrypoint: 'scripts/run.py',
        gitCommit: 'abc1234'
      },
      inputArtifacts: [],
      outputArtifacts: [],
      relatedClaims: ['C-001'],
      blockers: [],
      notes: ''
    });
    await manifest.updateManifest(dir, 'EXP-004', {
      status: 'active'
    });
    await manifest.updateManifest(dir, 'EXP-004', {
      status: 'blocked',
      blockers: ['Missing control dataset']
    });

    await middleware.runWithMiddleware({
      projectPath: dir,
      commandName: '/flow-status',
      reader: {
        dbAvailable: true,
        listUnresolvedClaims: async () => [{ claimId: 'C-001' }]
      },
      commandFn: async () => ({})
    });

    const currentSnapshot = await snapshot.getSessionSnapshot(dir);
    assert.equal(currentSnapshot.signals.unresolvedClaims, 1);
    assert.equal(currentSnapshot.signals.blockedExperiments, 1);
  });

  it('fails closed when flow index is corrupt instead of publishing a fake clean snapshot', async () => {
    await mkdir(path.join(dir, '.vibe-science-environment', 'flows'), {
      recursive: true
    });
    await writeFile(
      path.join(dir, '.vibe-science-environment', 'flows', 'index.json'),
      '{"schemaVersion":"vibe.flow.index.v1","activeFlow":"experiment"',
      'utf8'
    );

    const { attempt, result, snapshot: publishedSnapshot } =
      await middleware.runWithMiddleware({
        projectPath: dir,
        commandName: '/flow-status',
        reader: null,
        commandFn: async () => ({})
      });

    assert.equal(attempt.status, 'failed');
    assert.match(result.error, /JSON|flow index/i);
    assert.equal(publishedSnapshot, null);
  });
});
