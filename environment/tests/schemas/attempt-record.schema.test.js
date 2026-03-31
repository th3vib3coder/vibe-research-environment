import {
  ATTEMPT_ID,
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'attempt-record.schema.json',
  suiteName: 'attempt-record.schema',
  validFixture: {
    attemptId: ATTEMPT_ID,
    scope: 'flow-experiment',
    targetId: 'EXP-001',
    status: 'running',
    startedAt: ISO_DATE,
    lastHeartbeatAt: ISO_DATE_LATER,
    endedAt: null,
    retryCount: 1,
    errorCode: null,
    summary: 'still running'
  },
  invalidFixture: {
    attemptId: 'BAD-001',
    scope: 'flow-experiment',
    targetId: 'EXP-001',
    status: 'running',
    startedAt: ISO_DATE,
    lastHeartbeatAt: ISO_DATE_LATER,
    endedAt: null,
    retryCount: 0,
    errorCode: null,
    summary: null
  },
  degradedFixture: {
    attemptId: null,
    scope: null,
    targetId: null,
    status: 'preparing',
    startedAt: null,
    lastHeartbeatAt: null,
    endedAt: null,
    retryCount: 0,
    errorCode: null,
    summary: null
  }
});
