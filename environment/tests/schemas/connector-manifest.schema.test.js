import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'connector-manifest.schema.json',
  suiteName: 'connector-manifest.schema',
  validFixture: {
    schemaVersion: 'vibe-env.connector-manifest.v1',
    connectorId: 'filesystem-export',
    displayName: 'Filesystem Export',
    direction: 'one-way-export',
    reads: [
      '.vibe-science-environment/results/experiments/',
      '.vibe-science-environment/writing/advisor-packs/'
    ],
    writes: [
      'external/filesystem/export-root/'
    ],
    workspaceStatePaths: [
      '.vibe-science-environment/connectors/filesystem-export/',
      '.vibe-science-environment/connectors/filesystem-export/run-log.jsonl'
    ],
    capabilitiesProvided: [
      'resultsExport',
      'writingPackExport'
    ],
    forbiddenMutations: [
      'claim truth',
      'citation truth',
      'gate truth'
    ],
    failureSurface: {
      summaryPath: '.vibe-science-environment/connectors/filesystem-export/status.json',
      runLogPath: '.vibe-science-environment/connectors/filesystem-export/run-log.jsonl',
      surfacedInStatus: true
    }
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.connector-manifest.v1',
    connectorId: 'FilesystemExport',
    displayName: 'Filesystem Export',
    direction: 'two-way',
    reads: [],
    writes: [],
    workspaceStatePaths: [
      'connectors/filesystem-export/'
    ],
    capabilitiesProvided: [],
    forbiddenMutations: [],
    failureSurface: {
      summaryPath: 'connectors/filesystem-export/status.json',
      runLogPath: '.vibe-science-environment/connectors/filesystem-export/run-log.jsonl',
      surfacedInStatus: true
    }
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.connector-manifest.v1',
    connectorId: 'zotero-import',
    displayName: 'Zotero Metadata Import',
    direction: 'read-only',
    reads: [
      'zotero://library/items'
    ],
    writes: [],
    workspaceStatePaths: [
      '.vibe-science-environment/connectors/zotero-import/'
    ],
    capabilitiesProvided: [
      'metadataIngress'
    ],
    forbiddenMutations: [
      'citation verification',
      'claim promotion'
    ],
    failureSurface: {
      summaryPath: '.vibe-science-environment/connectors/zotero-import/status.json',
      runLogPath: '.vibe-science-environment/connectors/zotero-import/run-log.jsonl',
      surfacedInStatus: true
    }
  }
});
