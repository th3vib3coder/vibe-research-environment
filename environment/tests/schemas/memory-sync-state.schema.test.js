import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'memory-sync-state.schema.json',
  suiteName: 'memory-sync-state.schema',
  validFixture: {
    schemaVersion: 'vibe-env.memory-sync-state.v1',
    lastSyncAt: ISO_DATE_LATER,
    lastSuccessfulSyncAt: ISO_DATE,
    status: 'ok',
    kernelDbAvailable: true,
    degradedReason: null,
    mirrors: [
      {
        mirrorId: 'project-overview',
        path: '.vibe-science-environment/memory/mirrors/project-overview.md',
        syncedAt: ISO_DATE_LATER,
        sourceKinds: ['kernel', 'control', 'experiments']
      },
      {
        mirrorId: 'decision-log',
        path: '.vibe-science-environment/memory/mirrors/decision-log.md',
        syncedAt: ISO_DATE_LATER,
        sourceKinds: ['control']
      }
    ],
    warnings: []
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.memory-sync-state.v1',
    lastSyncAt: ISO_DATE_LATER,
    lastSuccessfulSyncAt: ISO_DATE,
    status: 'ok',
    kernelDbAvailable: true,
    degradedReason: null,
    mirrors: [
      {
        mirrorId: 'project-overview',
        path: '.vibe-science-environment/memory/mirrors/project-overview.md',
        syncedAt: ISO_DATE_LATER,
        sourceKinds: ['kernel', 'control', 'unknown-source']
      }
    ],
    warnings: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.memory-sync-state.v1',
    lastSyncAt: ISO_DATE_LATER,
    lastSuccessfulSyncAt: null,
    status: 'partial',
    kernelDbAvailable: false,
    degradedReason: 'kernel DB unavailable',
    mirrors: [
      {
        mirrorId: 'project-overview',
        path: '.vibe-science-environment/memory/mirrors/project-overview.md',
        syncedAt: null,
        sourceKinds: ['control']
      }
    ],
    warnings: ['kernel DB unavailable']
  }
});
