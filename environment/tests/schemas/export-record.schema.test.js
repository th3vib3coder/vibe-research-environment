import {
  CLAIM_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'export-record.schema.json',
  suiteName: 'export-record.schema',
  validFixture: {
    schemaVersion: 'vibe-env.export-record.v1',
    claimId: CLAIM_ID,
    snapshotId: 'WEXP-2026-04-02-001',
    exportedAt: ISO_DATE,
    exportedToFlow: 'writing',
    governanceProfileAtExport: 'strict',
    profileSafetyMode: 'full',
    artifactPath: '.vibe-science-environment/writing/exports/seeds/WEXP-2026-04-02-001/C-001.md',
    notes: null
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.export-record.v1',
    claimId: 'claim-001',
    snapshotId: 'WEXP-2026-04-02-001',
    exportedAt: ISO_DATE,
    exportedToFlow: 'draft',
    governanceProfileAtExport: 'strict',
    profileSafetyMode: 'full',
    artifactPath: ''
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.export-record.v1',
    claimId: CLAIM_ID,
    snapshotId: 'WEXP-2026-04-02-compat',
    exportedAt: ISO_DATE,
    exportedToFlow: 'writing',
    governanceProfileAtExport: 'default',
    profileSafetyMode: 'degraded_compatibility',
    artifactPath: '.vibe-science-environment/writing/exports/seeds/WEXP-2026-04-02-compat/C-001.md',
    notes: 'governanceProfileAtCreation was unavailable; compatibility mode was recorded explicitly.'
  }
});
