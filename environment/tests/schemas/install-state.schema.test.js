import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'install-state.schema.json',
  suiteName: 'install-state.schema',
  validFixture: {
    schemaVersion: 'vibe-env.install.v1',
    installedAt: ISO_DATE,
    bundles: ['governance-core', 'control-plane'],
    bundleManifestVersion: '1.0.0',
    operations: [
      {
        kind: 'copy-file',
        source: 'environment/templates/session-snapshot.v1.json',
        destination: '.vibe-science-environment/control/session.json',
        bundleId: 'control-plane',
        ownership: 'managed',
        mode: 'copied',
        sourceHash: 'sha256:source',
        installedHash: 'sha256:installed',
        backupRef: null
      }
    ],
    source: {
      version: '1.0.0',
      commit: 'abc123'
    }
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.install.v1',
    installedAt: ISO_DATE,
    bundles: ['governance-core'],
    bundleManifestVersion: '1.0.0',
    operations: [
      {
        kind: 'copy-file',
        source: 'environment/templates/session-snapshot.v1.json',
        destination: '.vibe-science-environment/control/session.json',
        bundleId: 'control-plane',
        ownership: 'external',
        mode: 'copied',
        sourceHash: 'sha256:source',
        installedHash: 'sha256:installed',
        backupRef: null
      }
    ],
    source: {
      version: '1.0.0',
      commit: 'abc123'
    }
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.install.v1',
    installedAt: ISO_DATE,
    bundles: [],
    bundleManifestVersion: '1.0.0',
    operations: [],
    source: {
      version: '1.0.0',
      commit: 'abc123'
    }
  }
});
