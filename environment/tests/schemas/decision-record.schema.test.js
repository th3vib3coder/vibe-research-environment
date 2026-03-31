import {
  ATTEMPT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'decision-record.schema.json',
  suiteName: 'decision-record.schema',
  validFixture: {
    decisionId: 'DEC-2026-03-31-001',
    flow: 'experiment',
    targetId: 'EXP-001',
    attemptId: ATTEMPT_ID,
    kind: 'budget_override',
    reason: 'reviewer approved continuation',
    details: {
      reviewer: 'R2'
    },
    recordedAt: ISO_DATE
  },
  invalidFixture: {
    decisionId: 'DEC-2026-03-31-002',
    flow: 'analysis',
    targetId: null,
    attemptId: null,
    kind: 'test',
    reason: 'invalid flow',
    recordedAt: ISO_DATE
  },
  degradedFixture: {
    decisionId: 'DEC-2026-03-31-003',
    flow: 'control',
    kind: 'operator_note',
    reason: 'manual handoff',
    targetId: null,
    attemptId: null,
    details: null,
    recordedAt: ISO_DATE
  }
});
