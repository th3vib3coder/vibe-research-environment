import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'writing-export-finalize-input.schema.json',
  suiteName: 'writing-export-finalize-input.schema',
  validFixture: {
    exportSnapshotId: 'WEXP-2026-04-18-abcdef01',
    deliverableType: 'advisor-pack',
  },
  // Invalid deliverableType → enum rejection.
  invalidFixture: {
    exportSnapshotId: 'WEXP-2026-04-18-abcdef01',
    deliverableType: 'poster',
  },
  // Minimal valid deliverableType: draft.
  degradedFixture: {
    exportSnapshotId: 'WEXP-2026-04-18-cafed00d',
    deliverableType: 'draft',
  },
});
