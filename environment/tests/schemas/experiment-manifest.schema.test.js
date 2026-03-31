import {
  ATTEMPT_ID,
  CLAIM_ID,
  EXPERIMENT_ID,
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'experiment-manifest.schema.json',
  suiteName: 'experiment-manifest.schema',
  validFixture: {
    schemaVersion: 'vibe.experiment.manifest.v1',
    experimentId: EXPERIMENT_ID,
    title: 'Normalization ablation',
    objective: 'Measure sensitivity to preprocessing',
    status: 'completed',
    createdAt: ISO_DATE,
    completedAt: ISO_DATE_LATER,
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 3
    },
    latestAttemptId: ATTEMPT_ID,
    parameters: {
      seed: 42
    },
    codeRef: {
      entrypoint: 'scripts/run_exp.py',
      gitCommit: 'abc1234'
    },
    inputArtifacts: ['data/raw.h5ad'],
    outputArtifacts: ['results/exp-001/metrics.json'],
    relatedClaims: [CLAIM_ID],
    blockers: [],
    notes: 'completed successfully'
  },
  invalidFixture: {
    schemaVersion: 'vibe.experiment.manifest.v1',
    experimentId: EXPERIMENT_ID,
    title: 'Normalization ablation',
    objective: 'Measure sensitivity to preprocessing',
    status: 'completed',
    createdAt: ISO_DATE,
    completedAt: ISO_DATE_LATER,
    executionPolicy: {
      timeoutSeconds: 0,
      unresponsiveSeconds: 300,
      maxAttempts: 3
    },
    latestAttemptId: ATTEMPT_ID,
    parameters: {},
    codeRef: {
      entrypoint: 'scripts/run_exp.py',
      gitCommit: 'abc1234'
    },
    inputArtifacts: [],
    outputArtifacts: [],
    relatedClaims: [],
    blockers: [],
    notes: 'invalid timeout'
  },
  degradedFixture: {
    schemaVersion: 'vibe.experiment.manifest.v1',
    experimentId: null,
    title: null,
    objective: null,
    status: 'planned',
    createdAt: null,
    completedAt: null,
    executionPolicy: {
      timeoutSeconds: 1,
      unresponsiveSeconds: 1,
      maxAttempts: 1
    },
    latestAttemptId: null,
    parameters: {},
    codeRef: {
      entrypoint: null,
      gitCommit: null
    },
    inputArtifacts: [],
    outputArtifacts: [],
    relatedClaims: [],
    blockers: [],
    notes: ''
  }
});
