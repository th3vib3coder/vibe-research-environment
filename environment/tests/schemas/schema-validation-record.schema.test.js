import {
  CLAIM_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'schema-validation-record.schema.json',
  suiteName: 'schema-validation-record.schema',
  validFixture: {
    claimId: CLAIM_ID,
    validatedAt: ISO_DATE,
    validatorVersion: '1.2.0',
    ok: true,
    compatibilityMode: 'full',
    notes: 'all checks passed'
  },
  invalidFixture: {
    claimId: 'CLAIM-001',
    validatedAt: ISO_DATE,
    validatorVersion: '1.2.0',
    ok: true
  },
  degradedFixture: {
    claimId: CLAIM_ID,
    validatedAt: ISO_DATE,
    validatorVersion: '1.2.0',
    ok: false,
    compatibilityMode: 'degraded_compatibility',
    notes: null
  }
});
