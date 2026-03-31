import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
    await writeInstallStateFixture(projectRoot);
    await mkdir(path.join(projectRoot, '.vibe-science'), { recursive: true });
    await writeFile(path.join(projectRoot, '.vibe-science', 'STATE.md'), 'kernel state\n', 'utf8');

    await uninstallWorkspaceState(projectRoot);

    const kernelState = await readFile(path.join(projectRoot, '.vibe-science', 'STATE.md'), 'utf8');
    assert.equal(kernelState.trim(), 'kernel state');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
