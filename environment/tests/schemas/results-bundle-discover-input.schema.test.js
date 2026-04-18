import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'results-bundle-discover-input.schema.json',
  suiteName: 'results-bundle-discover-input.schema',
  validFixture: {
    experimentId: 'EXP-042',
    claimId: 'C-017',
    sinceDate: '2026-04-10T00:00:00.000Z',
  },
  // Unknown field → additionalProperties:false rejection.
  invalidFixture: {
    experimentId: 'EXP-042',
    unknownField: 'noise',
  },
  // Empty input → all-optional schema accepts {}.
  degradedFixture: {},
});
