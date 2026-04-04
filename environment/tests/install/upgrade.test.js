import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupInstallFixture,
  createInstallFixture,
  upgradeInstallState,
  writeInstallStateFixture
} from './_fixture.js';

test('upgrade updates install-state version metadata while preserving bundles', async () => {
  const projectRoot = await createInstallFixture('vre-install-upgrade-');

  try {
    const initial = await writeInstallStateFixture(projectRoot, [
      'governance-core',
      'control-plane',
      'flow-experiment',
      'memory-sync',
      'flow-results',
      'connectors-core',
      'automation-core',
      'domain-packs-core',
    ]);
    const upgraded = await upgradeInstallState(projectRoot, '1.0.1');

    assert.deepEqual(upgraded.bundles, initial.bundles);
    assert.ok(upgraded.bundles.includes('connectors-core'));
    assert.ok(upgraded.bundles.includes('automation-core'));
    assert.ok(upgraded.bundles.includes('domain-packs-core'));
    assert.equal(upgraded.bundleManifestVersion, '1.0.1');
    assert.equal(upgraded.source.version, '1.0.1');
  } finally {
    await cleanupInstallFixture(projectRoot);
  }
});
