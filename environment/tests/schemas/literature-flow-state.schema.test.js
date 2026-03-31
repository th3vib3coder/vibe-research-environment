import {
  CLAIM_ID,
  ISO_DATE,
  LITERATURE_ID,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'literature-flow-state.schema.json',
  suiteName: 'literature-flow-state.schema',
  validFixture: {
    papers: [
      {
        id: LITERATURE_ID,
        doi: '10.1000/example',
        title: 'Single-cell atlas study',
        authors: ['A. Author', 'B. Author'],
        year: 2025,
        relevance: 'high',
        linkedClaims: [CLAIM_ID],
        methodologyConflicts: ['batch correction mismatch'],
        registeredAt: ISO_DATE
      }
    ],
    gaps: [
      'no direct human validation',
      {
        kind: 'missing-evidence',
        message: 'Needs stronger negative control',
        claimId: CLAIM_ID
      }
    ],
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    papers: [
      {
        id: 'PAPER-001',
        doi: null,
        title: 'Broken identifier',
        authors: [],
        year: 2025,
        relevance: null,
        linkedClaims: [],
        methodologyConflicts: [],
        registeredAt: ISO_DATE
      }
    ],
    gaps: [],
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    papers: [],
    gaps: [],
    updatedAt: null
  }
});
