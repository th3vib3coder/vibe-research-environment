/**
 * WP-166 regression: bin/vre:resolveDefaultReader now delegates to
 * resolveKernelReader. Verify:
 *   1. Without VRE_KERNEL_PATH → degraded sentinel (dbAvailable: false),
 *      session snapshot signals.provenance.sourceMode === 'degraded'.
 *   2. With VRE_KERNEL_PATH pointing at the fake-kernel-sibling fixture →
 *      reader is kernel-backed, session snapshot signals.provenance.sourceMode
 *      !== 'degraded' (kernel-backed OR mixed).
 *
 * @see phase6-04-wave-3-tests-and-validators.md WP-166
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCliFixtureProject,
  cleanupCliFixtureProject,
  runVre,
} from './_fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeKernelRoot = path.resolve(here, '..', 'fixtures', 'fake-kernel-sibling');

async function readSessionSnapshot(projectRoot) {
  const snapshotPath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'control',
    'session.json',
  );
  const raw = await readFile(snapshotPath, 'utf8');
  return JSON.parse(raw);
}

test('bin/vre flow-status without VRE_KERNEL_PATH → degraded sentinel + signals.provenance.sourceMode=degraded', async () => {
  const projectRoot = await createCliFixtureProject('vre-cli-kernel-reader-degraded-');
  try {
    const result = await runVre(projectRoot, ['flow-status'], {
      env: { VRE_KERNEL_PATH: '' }, // explicitly clear
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const snapshot = await readSessionSnapshot(projectRoot);
    assert.equal(
      snapshot.signals.provenance.sourceMode,
      'degraded',
      'kernel reader must be degraded sentinel when VRE_KERNEL_PATH is unset',
    );
    assert.equal(snapshot.kernel.dbAvailable, false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre flow-status with VRE_KERNEL_PATH=<fake sibling> → signals.provenance.sourceMode !== degraded', async () => {
  const projectRoot = await createCliFixtureProject('vre-cli-kernel-reader-wired-');
  try {
    // Point at the fake kernel sibling. The fake CLI is at
    // <fakeKernelRoot>/plugin/scripts/core-reader-cli.js and returns canned
    // envelopes for every projection.
    const result = await runVre(projectRoot, ['flow-status'], {
      env: { VRE_KERNEL_PATH: fakeKernelRoot },
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const snapshot = await readSessionSnapshot(projectRoot);
    assert.notEqual(
      snapshot.signals.provenance.sourceMode,
      'degraded',
      'kernel reader must NOT be degraded when VRE_KERNEL_PATH points at a real CLI',
    );
    assert.equal(snapshot.kernel.dbAvailable, true);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
