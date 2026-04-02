import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  doctorWorkspaceState,
  writeInstallStateFixture
} from './_fixture.js';

test('doctor reports ok on healthy bootstrap and error on corrupted control state', async () => {
  const projectRoot = await createInstallFixture('vre-install-doctor-');

  try {
    await bootstrapCoreInstall(projectRoot);
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-experiment',
      'memory-sync',
      'flow-results'
    ]);
    const healthy = await doctorWorkspaceState(projectRoot);
    assert.equal(healthy.ok, true);

    await rm(path.join(projectRoot, '.vibe-science-environment', 'memory', 'mirrors'), {
      recursive: true,
      force: true
    });
    const broken = await doctorWorkspaceState(projectRoot);
    assert.equal(broken.ok, false);
    assert.equal(
      broken.checks.find((check) => check.check === 'bundle:memory-sync:.vibe-science-environment/memory/mirrors/')?.status,
      'error'
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
