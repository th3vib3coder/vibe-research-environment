import assert from 'node:assert/strict';
import test from 'node:test';

import { runWithMiddleware } from '../../control/middleware.js';
import { getSessionSnapshot } from '../../control/session-snapshot.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('F-07: degraded reader records degraded signal provenance', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-provenance-degraded-');

  try {
    await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => ({ summary: 'status' }),
    });

    const snapshot = await getSessionSnapshot(projectRoot);
    assert.equal(snapshot.signals.provenance.sourceMode, 'degraded');
    assert.equal(snapshot.signals.provenance.degradedReason, 'bridge unavailable');
    assert.equal(snapshot.signals.unresolvedClaims, 0);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('F-07: live kernel signal records kernel-backed provenance', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-provenance-kernel-');

  try {
    await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      reader: {
        dbAvailable: true,
        async listUnresolvedClaims() {
          return [{ claimId: 'C-551' }];
        },
      },
      commandFn: async () => ({ summary: 'status' }),
    });

    const snapshot = await getSessionSnapshot(projectRoot);
    assert.equal(snapshot.signals.unresolvedClaims, 1);
    assert.equal(snapshot.signals.provenance.sourceMode, 'kernel-backed');
    assert.match(snapshot.signals.provenance.lastKernelContactAt, /T/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('F-07: throwing kernel signal records mixed provenance without fake nonzero claims', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-provenance-mixed-');

  try {
    await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-status',
      reader: {
        dbAvailable: true,
        async listUnresolvedClaims() {
          throw new Error('projection failed');
        },
      },
      commandFn: async () => ({ summary: 'status' }),
    });

    const snapshot = await getSessionSnapshot(projectRoot);
    assert.equal(snapshot.signals.unresolvedClaims, 0);
    assert.equal(snapshot.signals.provenance.sourceMode, 'mixed');
    assert.equal(snapshot.signals.provenance.degradedReason, 'projection failed');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
