import {
  ATTEMPT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'event-record.schema.json',
  suiteName: 'event-record.schema',
  validFixture: {
    eventId: 'EVT-2026-03-31-001',
    kind: 'attempt_opened',
    attemptId: ATTEMPT_ID,
    scope: 'flow-status',
    targetId: 'EXP-001',
    severity: 'info',
    message: 'attempt opened',
    details: {
      phase: 'start'
    },
    recordedAt: ISO_DATE
  },
  invalidFixture: {
    eventId: 'EVT-2026-03-31-002',
    kind: 'not_real',
    attemptId: ATTEMPT_ID,
    severity: 'info',
    recordedAt: ISO_DATE
  },
  degradedFixture: {
    kind: 'degraded_mode_entered',
    attemptId: null,
    scope: null,
    targetId: null,
    severity: 'warning',
    message: null,
    details: null,
    recordedAt: ISO_DATE
  }
});
