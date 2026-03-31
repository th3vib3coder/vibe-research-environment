import {
  ATTEMPT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'costs-record.schema.json',
  suiteName: 'costs-record.schema',
  validFixture: {
    sessionId: 'SES-001',
    lastAttemptId: ATTEMPT_ID,
    recordedAt: ISO_DATE,
    toolCalls: 14,
    claimsProduced: 3,
    claimsKilled: 1,
    r2Reviews: 2,
    estimatedCostUsd: 2.75,
    countingMode: 'provider_native',
    budgetState: 'advisory'
  },
  invalidFixture: {
    sessionId: 'SES-001',
    lastAttemptId: ATTEMPT_ID,
    recordedAt: ISO_DATE,
    toolCalls: -1,
    claimsProduced: 0,
    claimsKilled: 0,
    r2Reviews: 0,
    estimatedCostUsd: 0,
    countingMode: 'provider_native'
  },
  degradedFixture: {
    sessionId: null,
    lastAttemptId: null,
    recordedAt: ISO_DATE,
    toolCalls: 0,
    claimsProduced: 0,
    claimsKilled: 0,
    r2Reviews: 0,
    estimatedCostUsd: 0,
    countingMode: 'char_fallback',
    budgetState: 'unknown'
  }
});
