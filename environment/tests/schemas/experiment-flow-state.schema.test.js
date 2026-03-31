import {
  ATTEMPT_ID,
  CLAIM_ID,
  EXPERIMENT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'experiment-flow-state.schema.json',
  suiteName: 'experiment-flow-state.schema',
  validFixture: {
    experiments: [
      {
        id: EXPERIMENT_ID,
        title: 'Ablation on normalization strategy',
        status: 'active',
        createdAt: ISO_DATE,
        latestAttemptId: ATTEMPT_ID,
        relatedClaims: [CLAIM_ID],
        outputArtifacts: ['results/exp-001/metrics.json'],
        blockers: ['waiting for GPU slot'],
        updatedAt: ISO_DATE
      }
    ],
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    experiments: [
      {
        id: 'EXP-1',
        title: 'Bad id shape',
        status: 'active',
        createdAt: ISO_DATE
      }
    ],
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    experiments: [],
    updatedAt: null
  }
});
