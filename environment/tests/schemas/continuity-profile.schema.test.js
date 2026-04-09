import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'continuity-profile.schema.json',
  suiteName: 'continuity-profile.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.continuity-profile.v1',
    operator: {
      defaultAutonomyPreference: 'supervised',
      reportVerbosity: 'concise',
      reviewStrictness: 'high',
      quietHoursLocal: [
        '22:00-07:00'
      ]
    },
    project: {
      primaryAudience: 'advisor',
      defaultReportKinds: [
        'advisor-pack',
        'weekly-digest'
      ]
    },
    runtime: {
      preferredLaneRoles: [
        'primary-execution',
        'primary-review'
      ],
      defaultAllowApiFallback: false
    },
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.continuity-profile.v1',
    operator: {
      defaultAutonomyPreference: 'auto',
      reportVerbosity: 'full',
      reviewStrictness: 'strict',
      quietHoursLocal: [
        'night'
      ]
    },
    project: {
      primaryAudience: 'team',
      defaultReportKinds: [
        'email-digest'
      ]
    },
    runtime: {
      preferredLaneRoles: [
        'primary-execution'
      ],
      defaultAllowApiFallback: 'sometimes'
    },
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.continuity-profile.v1',
    operator: {
      defaultAutonomyPreference: 'advisory',
      reportVerbosity: 'standard',
      reviewStrictness: 'medium',
      quietHoursLocal: []
    },
    project: {
      primaryAudience: 'self',
      defaultReportKinds: []
    },
    runtime: {
      preferredLaneRoles: [],
      defaultAllowApiFallback: false
    },
    updatedAt: ISO_DATE
  }
});
