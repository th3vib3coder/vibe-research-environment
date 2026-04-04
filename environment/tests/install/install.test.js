import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapCoreInstall,
  cleanupInstallFixture,
  createInstallFixture,
  writeInstallStateFixture
} from './_fixture.js';

test('fresh install on empty workspace bootstraps runtime state and install-state fixture', async () => {
  const projectRoot = await createInstallFixture('vre-install-fresh-');

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

    const entries = await readdir(path.join(projectRoot, '.vibe-science-environment'));
    assert.ok(entries.includes('control'));
    assert.ok(entries.includes('flows'));
    assert.ok(entries.includes('memory'));
    assert.ok(entries.includes('results'));
    assert.ok(entries.includes('connectors'));
    assert.ok(entries.includes('automation'));
    assert.ok(entries.includes('.install-state.json'));

    const automationEntries = await readdir(
      path.join(projectRoot, '.vibe-science-environment', 'automation'),
    );
    assert.deepEqual(
      new Set(automationEntries),
      new Set(['artifacts', 'definitions', 'runs']),
    );
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
