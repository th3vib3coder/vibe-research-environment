import assert from 'node:assert/strict';
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { openAttempt, updateAttempt } from '../../control/attempts.js';
import { appendDecision } from '../../control/decisions.js';
import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { createMetricsAccumulator } from '../../lib/session-metrics.js';
import { exportSessionDigest } from '../../flows/session-digest.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

async function listFiles(root) {
  const files = [];

  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else {
        files.push(relativePath.split(path.sep).join('/'));
      }
    }
  }

  await walk(root);
  return files.sort();
}

test('exportSessionDigest writes a per-session digest and overwrites that directory on rerun', async () => {
  const projectRoot = await createFixtureProject('vre-session-digest-');

  try {
    const opened = await openAttempt(projectRoot, {
      flow: 'results',
      targetId: 'EXP-001',
    });
    const closed = await updateAttempt(projectRoot, opened.attemptId, {
      status: 'succeeded',
    });
    await appendDecision(projectRoot, {
      flow: 'results',
      targetId: 'EXP-001',
      attemptId: closed.attemptId,
      kind: 'package-results',
      reason: 'Session digest test decision',
    });
    await publishSessionSnapshot(projectRoot, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: 'results',
      currentStage: 'result-packaging',
      nextActions: ['review packaged bundle for EXP-001'],
      blockers: [],
      kernel: {
        dbAvailable: false,
        degradedReason: 'bridge unavailable',
      },
      capabilities: {
        claimHeads: false,
        citationChecks: false,
        governanceProfileAtCreation: false,
        claimSearch: false,
      },
      budget: {
        state: 'unknown',
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
      lastCommand: '/flow-results',
      lastAttemptId: closed.attemptId,
      updatedAt: '2026-04-02T15:00:00Z',
    });

    const metrics = createMetricsAccumulator({
      sessionId: 'S-003',
      lastAttemptId: closed.attemptId,
    });
    await metrics.flush(projectRoot, { recordedAt: '2026-04-02T15:10:00Z' });

    const first = await exportSessionDigest(projectRoot, {
      now: '2026-04-02T15:12:00Z',
    });

    assert.equal(first.digest.digestId, 'DIGEST-S-003');
    assert.equal(first.digest.sourceSessionId, 'S-003');
    assert.deepEqual(first.digest.experimentIds, ['EXP-001']);
    assert.deepEqual(first.digest.attemptIds, [closed.attemptId]);
    assert.equal(first.digest.decisionIds.length, 1);

    await writeFile(path.join(first.digestDir, 'stale.txt'), 'old\n', 'utf8');

    await exportSessionDigest(projectRoot, {
      now: '2026-04-02T15:20:00Z',
    });

    const files = await listFiles(first.digestDir);
    assert.deepEqual(files, ['session-digest.json', 'session-digest.md']);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('exportSessionDigest degrades honestly when no session id or attempt lineage is available', async () => {
  const projectRoot = await createFixtureProject('vre-session-digest-degraded-');

  try {
    const exported = await exportSessionDigest(projectRoot, {
      now: '2026-04-02T15:30:00Z',
      digestId: 'DIGEST-manual',
    });

    assert.equal(exported.digest.sourceSessionId, null);
    assert.deepEqual(exported.digest.attemptIds, []);
    assert.ok(
      exported.digest.warnings.some((warning) => warning.includes('No canonical sourceSessionId')),
    );
    assert.ok(
      exported.digest.warnings.some((warning) => warning.includes('No attempt lineage')),
    );
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
