import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  uninstallWorkspaceState,
  writeInstallStateFixture
} from './_fixture.js';

test('uninstall removes managed workspace state and preserves kernel files', async () => {
  const projectRoot = await createInstallFixture('vre-install-uninstall-');

  try {
    await bootstrapCoreInstall(projectRoot);
    await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-experiment',
      'memory-sync',
      'flow-results'
    ]);
    await mkdir(path.join(projectRoot, '.vibe-science'), { recursive: true });
    await writeFile(path.join(projectRoot, '.vibe-science', 'STATE.md'), 'kernel state\n', 'utf8');

    await uninstallWorkspaceState(projectRoot);

    const kernelState = await readFile(path.join(projectRoot, '.vibe-science', 'STATE.md'), 'utf8');
    assert.equal(kernelState.trim(), 'kernel state');
    await assert.rejects(
      () => stat(path.join(projectRoot, '.vibe-science-environment', 'memory')),
      /ENOENT/u
    );
    await assert.rejects(
      () => stat(path.join(projectRoot, '.vibe-science-environment', 'results', 'experiments')),
      /ENOENT/u
    );
    await assert.rejects(
      () => stat(path.join(projectRoot, '.vibe-science-environment', 'results', 'summaries')),
      /ENOENT/u
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
