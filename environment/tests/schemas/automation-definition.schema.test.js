import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'automation-definition.schema.json',
  suiteName: 'automation-definition.schema',
  validFixture: {
    schemaVersion: 'vibe-env.automation-definition.v1',
    automationId: 'weekly-research-digest',
    displayName: 'Weekly Research Digest',
    triggerType: 'scheduled',
    commandSurface: '/weekly-digest',
    purpose: 'digest',
    sourceSurfaces: [
      '.vibe-science-environment/control/session.json',
      '.vibe-science-environment/results/summaries/'
    ],
    artifactDirectory: '.vibe-science-environment/automation/artifacts/weekly-research-digest/',
    rerunPolicy: {
      mode: 'interval-guard',
      keyField: 'calendar-week'
    },
    schedule: {
      cadence: 'weekly',
      hostNative: true
    },
    visibleStatuses: [
      'ready',
      'blocked',
      'degraded',
      'failed'
    ],
    forbiddenMutations: [
      'claim truth',
      'citation truth'
    ]
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.automation-definition.v1',
    automationId: 'WeeklyDigest',
    displayName: 'Weekly Digest',
    triggerType: 'background',
    commandSurface: 'weekly-digest',
    purpose: 'analysis',
    sourceSurfaces: [],
    artifactDirectory: 'automation/artifacts/weekly-digest/',
    rerunPolicy: {
      mode: 'interval-guard',
      keyField: 'calendar-week'
    },
    visibleStatuses: [
      'ready'
    ],
    forbiddenMutations: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.automation-definition.v1',
    automationId: 'export-warning-digest',
    displayName: 'Export Warning Digest',
    triggerType: 'command',
    commandSurface: '/export-warning-digest',
    purpose: 'alert',
    sourceSurfaces: [
      '.vibe-science-environment/writing/exports/'
    ],
    artifactDirectory: '.vibe-science-environment/automation/artifacts/export-warning-digest/',
    rerunPolicy: {
      mode: 'source-state-guard',
      keyField: 'latest-alert-replay-key'
    },
    schedule: null,
    visibleStatuses: [
      'ready',
      'blocked',
      'degraded',
      'failed'
    ],
    forbiddenMutations: [
      'export alert deletion'
    ]
  }
});
