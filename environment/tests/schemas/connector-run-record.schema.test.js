import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'connector-run-record.schema.json',
  suiteName: 'connector-run-record.schema',
  validFixture: {
    schemaVersion: 'vibe-env.connector-run-record.v1',
    runId: 'CONN-RUN-2026-04-04-001',
    connectorId: 'filesystem-export',
    runKind: 'export',
    status: 'completed',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    sourceSurfaces: [
      '.vibe-science-environment/results/experiments/EXP-001/',
      '.vibe-science-environment/writing/advisor-packs/2026-04-04/'
    ],
    target: {
      kind: 'external',
      path: 'D:/exports/project-a/'
    },
    healthCheck: null,
    visibleFailure: {
      surfacedInStatus: true,
      failureKind: 'none',
      message: null
    },
    warnings: []
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.connector-run-record.v1',
    runId: 'run-2026-04-04-001',
    connectorId: 'filesystem-export',
    runKind: 'export',
    status: 'blocked',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    sourceSurfaces: [],
    target: {
      kind: 'remote',
      path: ''
    },
    healthCheck: {
      checkedAt: ISO_DATE,
      status: 'ok',
      details: null
    },
    visibleFailure: {
      surfacedInStatus: true,
      failureKind: 'none',
      message: null
    },
    warnings: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.connector-run-record.v1',
    runId: 'CONN-RUN-2026-04-04-compat',
    connectorId: 'obsidian-export',
    runKind: 'export',
    status: 'degraded',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    sourceSurfaces: [
      '.vibe-science-environment/memory/project-overview.md'
    ],
    target: {
      kind: 'external',
      path: 'C:/vault/Project A/'
    },
    healthCheck: {
      checkedAt: ISO_DATE_LATER,
      status: 'unavailable',
      details: 'Vault path is unavailable.'
    },
    visibleFailure: {
      surfacedInStatus: true,
      failureKind: 'external-unavailable',
      message: 'Connector target could not be reached.'
    },
    warnings: [
      'Export did not fabricate a success artifact.'
    ]
  }
});
