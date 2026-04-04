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
      'flow-results',
      'connectors-core',
      'automation-core',
      'domain-packs-core',
    ]);
    const healthy = await doctorWorkspaceState(projectRoot);
    assert.equal(healthy.ok, true);

    await rm(path.join(projectRoot, '.vibe-science-environment', 'automation', 'runs'), {
      recursive: true,
      force: true
    });
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
    assert.equal(
      broken.checks.find((check) => check.check === 'bundle:automation-core:.vibe-science-environment/automation/runs/')?.status,
      'error'
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
