import {
  CLAIM_ID,
  EXPERIMENT_ID,
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests,
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'experiment-bundle-manifest.schema.json',
  suiteName: 'experiment-bundle-manifest.schema',
  validFixture: {
    schemaVersion: 'vibe-env.experiment-bundle.v1',
    experimentId: EXPERIMENT_ID,
    bundledAt: ISO_DATE,
    sourceAttemptId: 'ATT-2026-03-31-004',
    artifacts: [
      {
        path: 'analysis-report.md',
        type: 'report',
        role: 'analysis-report',
        createdAt: ISO_DATE,
        size: 4200,
      },
      {
        path: 'figures/fig-01-volcano.png',
        type: 'figure',
        role: 'main-result',
        createdAt: ISO_DATE_LATER,
      },
    ],
    relatedClaims: [CLAIM_ID],
    datasetHash: 'sha256:a1b2c3d4',
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.experiment-bundle.v1',
    experimentId: EXPERIMENT_ID,
    bundledAt: ISO_DATE,
    sourceAttemptId: 'ATT-2026-03-31-004',
    artifacts: [
      {
        path: 'analysis-report.md',
        type: 'report',
        role: 'analysis-report',
        createdAt: ISO_DATE,
        size: -1,
      },
    ],
    relatedClaims: [CLAIM_ID],
    datasetHash: 'sha256:a1b2c3d4',
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.experiment-bundle.v1',
    experimentId: null,
    bundledAt: null,
    sourceAttemptId: null,
    artifacts: [],
    relatedClaims: [],
    datasetHash: null,
  },
});
