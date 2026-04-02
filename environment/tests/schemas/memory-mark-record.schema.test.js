import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'memory-mark-record.schema.json',
  suiteName: 'memory-mark-record.schema',
  validFixture: {
    targetType: 'claim',
    targetId: 'C-014',
    mark: 'writing_ready',
    createdAt: ISO_DATE
  },
  invalidFixture: {
    targetType: 'claim',
    targetId: 'C-014',
    mark: 'Writing Ready'
  },
  degradedFixture: {
    targetType: 'experiment',
    targetId: 'EXP-003',
    mark: 'follow_up',
    createdAt: null
  }
});
