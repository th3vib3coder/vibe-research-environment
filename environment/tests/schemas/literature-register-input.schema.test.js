import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'literature-register-input.schema.json',
  suiteName: 'literature-register-input.schema',
  validFixture: {
    id: 'LIT-042',
    title: 'Single-cell atlas of the developing hippocampus',
    authors: ['Rossi A.', 'Bianchi M.'],
    year: 2025,
    doi: '10.1234/hippocampus.2025',
    relevance: 'Primary reference for Chapter 3',
    linkedClaims: ['C-014'],
    methodologyConflicts: [],
    registeredAt: '2026-04-17T08:00:00Z'
  },
  invalidFixture: {
    title: '',
    authors: 'not-an-array'
  },
  degradedFixture: {
    title: 'Minimal registration input'
  }
});
