import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'automation-run-record.schema.json',
  suiteName: 'automation-run-record.schema',
  validFixture: {
    schemaVersion: 'vibe-env.automation-run-record.v1',
    runId: 'AUTO-RUN-2026-04-04-001',
    automationId: 'weekly-research-digest',
    triggerType: 'scheduled',
    status: 'completed',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactPath: '.vibe-science-environment/automation/artifacts/weekly-research-digest/2026-W14.md',
    sourceSurfaces: [
      '.vibe-science-environment/control/session.json',
      '.vibe-science-environment/results/summaries/'
    ],
    idempotencyKey: '2026-W14',
    blockedReason: null,
    degradedReason: null,
    schedulerContext: {
      scheduledByHost: true,
      scheduledFor: ISO_DATE
    },
    warnings: []
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.automation-run-record.v1',
    runId: 'run-2026-04-04-001',
    automationId: 'weekly-research-digest',
    triggerType: 'daemon',
    status: 'ready',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactPath: null,
    sourceSurfaces: [],
    idempotencyKey: null,
    blockedReason: null,
    degradedReason: null,
    warnings: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.automation-run-record.v1',
    runId: 'AUTO-RUN-2026-04-04-blocked',
    automationId: 'stale-memory-reminder',
    triggerType: 'command',
    status: 'blocked',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactPath: null,
    sourceSurfaces: [
      '.vibe-science-environment/memory/sync-state.json'
    ],
    idempotencyKey: 'memory-stale-2026-04-04',
    blockedReason: 'Memory sync state is missing.',
    degradedReason: null,
    schedulerContext: null,
    warnings: [
      'Reminder stayed visible instead of fabricating freshness.'
    ]
  }
});
