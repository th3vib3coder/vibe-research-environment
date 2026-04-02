import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  doctorWorkspaceState,
  repairWorkspaceState,
  writeInstallStateFixture
} from './_fixture.js';

test('repair recreates missing generated control state via bootstrap semantics', async () => {
  const projectRoot = await createInstallFixture('vre-install-repair-');

  try {
    await bootstrapCoreInstall(projectRoot);
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-experiment',
      'memory-sync',
      'flow-results'
    ]);
    await rm(path.join(projectRoot, '.vibe-science-environment', 'memory', 'mirrors'), {
      recursive: true,
      force: true
    });
    await rm(path.join(projectRoot, '.vibe-science-environment', 'results', 'summaries'), {
      recursive: true,
      force: true
    });

    let health = await doctorWorkspaceState(projectRoot);
    assert.equal(health.ok, false);

    await repairWorkspaceState(projectRoot);
    health = await doctorWorkspaceState(projectRoot);
    assert.equal(health.ok, true);
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
