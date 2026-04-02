import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { appendDecision } from '../../control/decisions.js';
import { rebuildSessionSnapshot } from '../../control/session-snapshot.js';
import { createManifest, updateManifest } from '../../lib/manifest.js';
import { syncMemory } from '../../memory/sync.js';
import {
  cleanupFixtureProject,
  createFixtureProject
} from '../integration/_fixture.js';

const SYNCED_AT = '2026-04-02T09:00:00Z';

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

async function snapshotFiles(root) {
  const files = new Map();

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const targetPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(targetPath);
        continue;
      }

      const relativePath = path.relative(root, targetPath).split(path.sep).join('/');
      files.set(relativePath, await readText(targetPath));
    }
  }

  await walk(root);
  return files;
}

function diffWrites(beforeSnapshot, afterSnapshot) {
  const writes = [];
  for (const [relativePath, contents] of afterSnapshot.entries()) {
    if (!beforeSnapshot.has(relativePath) || beforeSnapshot.get(relativePath) !== contents) {
      writes.push(relativePath);
    }
  }
  return writes.sort();
}

async function seedWorkspace(projectRoot) {
  await rebuildSessionSnapshot(projectRoot, {
    flowState: {
      activeFlow: 'experiment',
      currentStage: 'result-packaging',
      nextActions: ['review EXP-001 outputs', 'triage unresolved claims'],
      blockers: ['Need negative control dataset']
    },
    kernel: {
      dbAvailable: true
    },
    lastCommand: '/flow-experiment',
    lastAttemptId: 'ATT-2026-04-02-001'
  });

  await appendDecision(projectRoot, {
    decisionId: 'DEC-2026-04-02-001',
    flow: 'experiment',
    attemptId: 'ATT-2026-04-02-001',
    targetId: 'EXP-002',
    kind: 'blocker_escalation',
    reason: 'Escalate missing reagent controls',
    recordedAt: '2026-04-02T08:15:00Z'
  });

  await createManifest(projectRoot, {
    experimentId: 'EXP-001',
    title: 'Batch correction ablation',
    objective: 'Measure sign reversals',
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
    relatedClaims: ['C-014'],
    blockers: [],
    notes: ''
  });
  await updateManifest(projectRoot, 'EXP-001', {
    status: 'active'
  });

  await createManifest(projectRoot, {
    experimentId: 'EXP-002',
    title: 'Negative control',
    objective: 'Validate control cohort',
    status: 'planned',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2
    },
    parameters: {},
    codeRef: {
      entrypoint: 'scripts/control.py',
      gitCommit: 'def5678'
    },
    inputArtifacts: [],
    outputArtifacts: [],
    relatedClaims: ['C-003'],
    blockers: [],
    notes: ''
  });
  await updateManifest(projectRoot, 'EXP-002', {
    status: 'active'
  });
  await updateManifest(projectRoot, 'EXP-002', {
    status: 'blocked',
    blockers: ['Missing reagent data']
  });
}

async function seedMarks(projectRoot, lines) {
  const marksPath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'memory',
    'index',
    'marks.jsonl'
  );
  await mkdir(path.dirname(marksPath), { recursive: true });
  await writeFile(marksPath, `${lines.join('\n')}\n`, 'utf8');
  return marksPath;
}

function makeHealthyReader() {
  return {
    dbAvailable: true,
    error: null,
    async getProjectOverview() {
      return {
        projectPath: '/fixture/project',
        lastSession: {
          id: 'S-003',
          startedAt: '2026-04-01T09:00:00Z',
          endedAt: '2026-04-01T10:00:00Z',
          integrityStatus: 'clean',
          narrativeSummary: 'Checked compositional confounders.',
          totalActions: 12,
          claimsCreated: 2,
          claimsKilled: 1,
          gatesPassed: 3,
          gatesFailed: 1
        },
        activeClaimCount: 2,
        unresolvedAlertCount: 1,
        pendingSeedCount: 0,
        activePatternCount: 2,
        recentGateFailures: [
          {
            sessionId: 'S-003',
            gateId: 'G-014',
            claimId: 'C-003',
            status: 'FAIL',
            timestamp: '2026-04-01T09:55:00Z'
          }
        ]
      };
    },
    async listClaimHeads() {
      return [
        {
          claimId: 'C-014',
          sessionId: 'S-003',
          currentStatus: 'PROMOTED',
          statusSourceEventType: 'PROMOTED',
          confidence: 0.91,
          r2Verdict: null,
          killReason: null,
          gateId: 'G-014',
          narrative: 'Cell-type composition confounds bulk analysis.',
          timestamp: '2026-04-01T09:58:00Z',
          isActive: true
        },
        {
          claimId: 'C-003',
          sessionId: 'S-003',
          currentStatus: 'R2_REVIEWED',
          statusSourceEventType: 'R2_REVIEWED',
          confidence: 0.72,
          r2Verdict: 'needs_more_controls',
          killReason: null,
          gateId: null,
          narrative: 'R2 requested additional matching on cell-type proportions.',
          timestamp: '2026-04-01T09:52:00Z',
          isActive: true
        }
      ];
    },
    async listUnresolvedClaims() {
      return [
        {
          claimId: 'C-003',
          latestEventType: 'CREATED',
          latestEventTimestamp: '2026-04-01T09:52:00Z'
        }
      ];
    }
  };
}

test('syncMemory writes both mirrors and a valid sync-state from allowed sources', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-');

  try {
    await seedWorkspace(projectRoot);

    const result = await syncMemory(projectRoot, {
      reader: makeHealthyReader(),
      syncedAt: SYNCED_AT
    });

    assert.equal(result.status, 'ok');

    const projectOverviewPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'memory',
      'mirrors',
      'project-overview.md'
    );
    const decisionLogPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'memory',
      'mirrors',
      'decision-log.md'
    );
    const syncStatePath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'memory',
      'sync-state.json'
    );

    const projectOverview = await readText(projectOverviewPath);
    const decisionLog = await readText(decisionLogPath);
    const syncState = await readJson(syncStatePath);

    assert.match(projectOverview, /<!-- synced: 2026-04-02T09:00:00Z -->/);
    assert.match(projectOverview, /C-014 — PROMOTED/);
    assert.match(projectOverview, /EXP-002 — Negative control — blocked/);
    assert.match(projectOverview, /Where You Left Off/);
    assert.match(projectOverview, /\[claim:C-003\]/);

    assert.match(decisionLog, /DEC-2026-04-02-001/);
    assert.match(decisionLog, /blocker_escalation/);

    assert.equal(syncState.schemaVersion, 'vibe-env.memory-sync-state.v1');
    assert.equal(syncState.status, 'ok');
    assert.equal(syncState.lastSuccessfulSyncAt, SYNCED_AT);
    assert.deepEqual(
      syncState.mirrors.map((entry) => entry.path).sort(),
      [
        '.vibe-science-environment/memory/mirrors/decision-log.md',
        '.vibe-science-environment/memory/mirrors/project-overview.md'
      ]
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('syncMemory degrades honestly when kernel projections are unavailable', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-degraded-');

  try {
    await seedWorkspace(projectRoot);

    const result = await syncMemory(projectRoot, {
      reader: {
        dbAvailable: false,
        error: 'bridge unavailable'
      },
      syncedAt: SYNCED_AT
    });

    assert.equal(result.status, 'partial');
    assert.match(result.warnings.join('\n'), /bridge unavailable/);

    const projectOverview = await readText(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'memory',
        'mirrors',
        'project-overview.md'
      )
    );
    const syncState = await readJson(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'memory',
        'sync-state.json'
      )
    );

    assert.match(projectOverview, /Sync Warnings/);
    assert.match(projectOverview, /bridge unavailable/);
    assert.match(projectOverview, /Where You Left Off/);
    assert.equal(syncState.status, 'partial');
    assert.equal(syncState.kernelDbAvailable, false);
    assert.equal(syncState.degradedReason, 'bridge unavailable');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('syncMemory writes only inside the memory-owned surface', async () => {
  const projectRoot = await createFixtureProject('vre-memory-scope-');

  try {
    await seedWorkspace(projectRoot);
    const runtimeRoot = path.join(projectRoot, '.vibe-science-environment');
    const beforeSnapshot = await snapshotFiles(runtimeRoot);

    await syncMemory(projectRoot, {
      reader: makeHealthyReader(),
      syncedAt: SYNCED_AT
    });

    const afterSnapshot = await snapshotFiles(runtimeRoot);
    const writes = diffWrites(beforeSnapshot, afterSnapshot);

    assert.deepEqual(writes, [
      'memory/mirrors/decision-log.md',
      'memory/mirrors/project-overview.md',
      'memory/sync-state.json'
    ]);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('syncMemory treats marks as prioritization hints only and tolerates partial marks files', async () => {
  const projectRoot = await createFixtureProject('vre-memory-marks-');

  try {
    await seedWorkspace(projectRoot);
    await seedMarks(projectRoot, [
      JSON.stringify({
        targetType: 'claim',
        targetId: 'C-003',
        mark: 'writing_ready'
      }),
      JSON.stringify({
        targetType: 'experiment',
        targetId: 'EXP-002',
        mark: 'follow_up'
      }),
      '{"targetType":"paper","targetId":"LIT-008","mark":"Method Conflict"}'
    ]);

    const result = await syncMemory(projectRoot, {
      reader: makeHealthyReader(),
      syncedAt: SYNCED_AT
    });

    const projectOverview = await readText(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'memory',
        'mirrors',
        'project-overview.md'
      )
    );

    const activeClaimsSection = projectOverview
      .split('## Active Claims\n')[1]
      .split('\n## Pending Experiments')[0];
    const pendingExperimentsSection = projectOverview
      .split('## Pending Experiments\n')[1]
      .split('\n## Recent Claim Feedback')[0];

    const c003Position = activeClaimsSection.indexOf('C-003');
    const c014Position = activeClaimsSection.indexOf('C-014');
    const exp002Position = pendingExperimentsSection.indexOf('EXP-002');
    const exp001Position = pendingExperimentsSection.indexOf('EXP-001');

    assert.equal(result.status, 'partial');
    assert.match(result.warnings.join('\n'), /Ignoring invalid memory mark record/);
    assert.ok(c003Position >= 0 && c014Position >= 0 && c003Position < c014Position);
    assert.ok(exp002Position >= 0 && exp001Position >= 0 && exp002Position < exp001Position);
    assert.match(projectOverview, /\[mark:writing_ready\]/);
    assert.match(projectOverview, /\[mark:follow_up\]/);
    assert.ok(!/Method Conflict/.test(projectOverview));
    assert.ok(result.mirrors.some((entry) => entry.sourceKinds.includes('marks')));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
