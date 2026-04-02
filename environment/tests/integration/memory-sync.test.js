import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { appendDecision } from '../../control/decisions.js';
import { rebuildSessionSnapshot } from '../../control/session-snapshot.js';
import { createManifest, updateManifest } from '../../lib/manifest.js';
import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';

async function syncMemory(projectRoot, options = {}) {
  const module = await import(`../../memory/sync.js?${Date.now()}`);
  return module.syncMemory(projectRoot, options);
}

async function snapshotFiles(rootDir) {
  const files = new Map();

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const filePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
        continue;
      }

      const relativePath = path
        .relative(rootDir, filePath)
        .split(path.sep)
        .join('/');
      files.set(relativePath, await readFile(filePath, 'utf8'));
    }
  }

  await walk(rootDir);
  return files;
}

function diffPaths(before, after) {
  const changed = [];

  for (const [filePath, contents] of after.entries()) {
    if (!before.has(filePath) || before.get(filePath) !== contents) {
      changed.push(filePath);
    }
  }

  return changed.sort();
}

async function seedControlSurface(projectRoot) {
  await rebuildSessionSnapshot(projectRoot, {
    flowState: {
      activeFlow: 'experiment',
      currentStage: 'result-packaging',
      nextActions: ['review EXP-001 outputs'],
      blockers: ['EXP-002 blocked on missing control dataset']
    },
    capabilities: {
      kernel: {
        dbAvailable: true,
        projections: {
          overview: true,
          claimHeads: true,
          unresolvedClaims: true,
          citationChecks: true
        },
        advanced: {
          governanceProfileAtCreation: false,
          claimSearch: false
        }
      }
    },
    kernel: {
      dbAvailable: true,
      degradedReason: null
    },
    budget: {
      state: 'ok',
      toolCalls: 12,
      estimatedCostUsd: 1.42,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 1,
      blockedExperiments: 1,
      exportAlerts: 0
    },
    lastCommand: '/flow-experiment',
    lastAttemptId: 'ATT-2026-04-01-001'
  });

  await appendDecision(projectRoot, {
    flow: 'experiment',
    targetId: 'EXP-001',
    kind: 'blocker_escalation',
    reason: 'Missing negative control dataset'
  });

  await appendDecision(projectRoot, {
    flow: 'writing',
    targetId: 'C-001',
    kind: 'export_deferred',
    reason: 'Claim needs one more citation check'
  });

  const manifest = await createManifest(projectRoot, {
    experimentId: 'EXP-001',
    title: 'Reference experiment',
    objective: 'Package results for memory sync',
    status: 'planned',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2
    },
    parameters: {
      batchSize: 32
    },
    codeRef: {
      entrypoint: 'scripts/run_experiment.py',
      gitCommit: 'abc1234'
    },
    inputArtifacts: [],
    outputArtifacts: [],
    relatedClaims: ['C-001'],
    blockers: [],
    notes: ''
  });

  await updateManifest(projectRoot, manifest.experimentId, {
    status: 'active',
    latestAttemptId: 'ATT-2026-04-01-001'
  });

  await createManifest(projectRoot, {
    experimentId: 'EXP-002',
    title: 'Blocked experiment',
    objective: 'Exercise blocked state visibility',
    status: 'planned',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2
    },
    parameters: {},
    codeRef: {
      entrypoint: 'scripts/run_experiment.py',
      gitCommit: 'def5678'
    },
    inputArtifacts: [],
    outputArtifacts: [],
    relatedClaims: ['C-002'],
    blockers: [],
    notes: ''
  });

  await updateManifest(projectRoot, 'EXP-002', {
    status: 'active'
  });
  await updateManifest(projectRoot, 'EXP-002', {
    status: 'blocked',
    blockers: ['Missing control dataset']
  });
}

test('memory sync writes only the memory mirror surface from real control inputs', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-');

  try {
    await seedControlSurface(projectRoot);
    const before = await snapshotFiles(path.join(projectRoot, '.vibe-science-environment'));

    await syncMemory(projectRoot, {
      reader: {
        dbAvailable: true,
        error: null,
        async getProjectOverview() {
          return {
            projectPath: projectRoot,
            lastSession: {
              id: 'S-001',
              startedAt: '2026-04-01T09:00:00Z',
              endedAt: '2026-04-01T09:30:00Z',
              integrityStatus: 'ok',
              narrativeSummary: 'Session closed cleanly.',
              totalActions: 12,
              claimsCreated: 2,
              claimsKilled: 0,
              gatesPassed: 3,
              gatesFailed: 0
            },
            activeClaimCount: 1,
            unresolvedAlertCount: 0,
            pendingSeedCount: 0,
            activePatternCount: 0,
            recentGateFailures: []
          };
        },
        async listClaimHeads() {
          return [
            {
              claimId: 'C-001',
              sessionId: 'S-001',
              currentStatus: 'PROMOTED',
              statusSourceEventType: 'PROMOTED',
              confidence: 0.91,
              r2Verdict: 'accepted',
              killReason: null,
              gateId: 'G-001',
              narrative: 'Candidate for writing handoff',
              timestamp: '2026-04-01T09:25:00Z',
              isActive: true
            }
          ];
        },
        async listUnresolvedClaims() {
          return [
            {
              claimId: 'C-002',
              latestEventType: 'CREATED',
              latestEventTimestamp: '2026-04-01T09:18:00Z'
            }
          ];
        },
        async listCitationChecks() {
          return [
            {
              claimId: 'C-001',
              citationId: 'CID-001',
              verificationStatus: 'VERIFIED',
              checkedAt: '2026-04-01T09:20:00Z'
            }
          ];
        },
        async listGateChecks() {
          return [];
        },
        async listLiteratureSearches() {
          return [];
        }
      }
    });

    const after = await snapshotFiles(path.join(projectRoot, '.vibe-science-environment'));
    const changedPaths = diffPaths(before, after);

    assert.deepStrictEqual(changedPaths, [
      'memory/mirrors/decision-log.md',
      'memory/mirrors/project-overview.md',
      'memory/sync-state.json'
    ]);

    const projectOverview = await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'memory', 'mirrors', 'project-overview.md'),
      'utf8'
    );
    const decisionLog = await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'memory', 'mirrors', 'decision-log.md'),
      'utf8'
    );
    const syncState = JSON.parse(
      await readFile(path.join(projectRoot, '.vibe-science-environment', 'memory', 'sync-state.json'), 'utf8')
    );

    assert.match(projectOverview, /<!-- synced:/u);
    assert.match(projectOverview, /C-001/u);
    assert.match(projectOverview, /EXP-001/u);
    assert.match(decisionLog, /<!-- synced:/u);
    assert.match(decisionLog, /blocker_escalation/u);
    assert.equal(syncState.schemaVersion, 'vibe-env.memory-sync-state.v1');
    assert.equal(syncState.kernelDbAvailable, true);
    assert.equal(syncState.status, 'ok');
    assert.ok(Array.isArray(syncState.mirrors));
    assert.ok(syncState.mirrors.some((mirror) => mirror.mirrorId === 'project-overview'));
    assert.ok(syncState.mirrors.some((mirror) => mirror.mirrorId === 'decision-log'));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('memory sync degrades honestly when the kernel reader is unavailable', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-degraded-');

  try {
    await seedControlSurface(projectRoot);
    const before = await snapshotFiles(path.join(projectRoot, '.vibe-science-environment'));

    await syncMemory(projectRoot, {
      reader: {
        dbAvailable: false,
        error: 'core-reader CLI unavailable'
      }
    });

    const after = await snapshotFiles(path.join(projectRoot, '.vibe-science-environment'));
    const changedPaths = diffPaths(before, after);

    assert.deepStrictEqual(changedPaths, [
      'memory/mirrors/decision-log.md',
      'memory/mirrors/project-overview.md',
      'memory/sync-state.json'
    ]);

    const syncState = JSON.parse(
      await readFile(path.join(projectRoot, '.vibe-science-environment', 'memory', 'sync-state.json'), 'utf8')
    );
    const projectOverview = await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'memory', 'mirrors', 'project-overview.md'),
      'utf8'
    );

    assert.equal(syncState.kernelDbAvailable, false);
    assert.equal(syncState.degradedReason, 'core-reader CLI unavailable');
    assert.notEqual(syncState.status, 'ok');
    assert.match(projectOverview, /<!-- synced:/u);
    assert.match(projectOverview, /core-reader CLI unavailable/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
