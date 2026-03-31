import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'flow-index.schema.json',
  suiteName: 'flow-index.schema',
  validFixture: {
    schemaVersion: 'vibe.flow.index.v1',
    activeFlow: 'literature',
    currentStage: 'screening',
    nextActions: ['review LIT-001'],
    blockers: ['missing PMID'],
    lastCommand: '/flow-literature',
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe.flow.index.v1',
    activeFlow: 'control',
    currentStage: 'screening',
    nextActions: [],
    blockers: [],
    lastCommand: '/flow-status',
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe.flow.index.v1',
    activeFlow: null,
    currentStage: null,
    nextActions: [],
    blockers: [],
    lastCommand: null,
    updatedAt: null
  }
});
