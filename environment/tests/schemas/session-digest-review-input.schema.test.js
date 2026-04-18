import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'session-digest-review-input.schema.json',
  suiteName: 'session-digest-review-input.schema',
  validFixture: {
    executionLaneRunId: 'ORCH-RUN-2026-04-17-abcdef01',
    comparedArtifactRefs: [
      '.vibe-science-environment/export/session-digest/session-digest.json',
      '.vibe-science-environment/export/session-digest/session-digest.md'
    ]
  },
  // No executionLaneRunId → required field missing.
  invalidFixture: {
    comparedArtifactRefs: ['some-ref']
  },
  // Minimal: only executionLaneRunId present.
  degradedFixture: {
    executionLaneRunId: 'ORCH-RUN-2026-04-17-cafed00d'
  }
});
