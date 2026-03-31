import {
  ATTEMPT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'session-snapshot.schema.json',
  suiteName: 'session-snapshot.schema',
  validFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: 'experiment',
    currentStage: 'registration',
    nextActions: ['review EXP-001'],
    blockers: ['missing control cohort'],
    kernel: {
      dbAvailable: true,
      degradedReason: null
    },
    capabilities: {
      claimHeads: true,
      citationChecks: true,
      governanceProfileAtCreation: false,
      claimSearch: true
    },
    budget: {
      state: 'ok',
      toolCalls: 12,
      estimatedCostUsd: 1.42,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 1,
      blockedExperiments: 2,
      exportAlerts: 0
    },
    lastCommand: '/flow-experiment',
    lastAttemptId: ATTEMPT_ID,
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: 'analysis',
    currentStage: 'registration',
    nextActions: [],
    blockers: [],
    kernel: {
      dbAvailable: true,
      degradedReason: null
    },
    capabilities: {
      claimHeads: true,
      citationChecks: true,
      governanceProfileAtCreation: false,
      claimSearch: false
    },
    budget: {
      state: 'ok',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0
    },
    lastCommand: '/flow-status',
    lastAttemptId: ATTEMPT_ID,
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: null,
    currentStage: null,
    nextActions: [],
    blockers: [],
    kernel: {
      dbAvailable: false,
      degradedReason: 'kernel DB unavailable'
    },
    capabilities: {
      claimHeads: false,
      citationChecks: false,
      governanceProfileAtCreation: false,
      claimSearch: false
    },
    budget: {
      state: 'unknown',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'unknown'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0
    },
    lastCommand: null,
    lastAttemptId: null,
    updatedAt: null
  }
});
