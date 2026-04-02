import {
  CLAIM_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'export-snapshot.schema.json',
  suiteName: 'export-snapshot.schema',
  validFixture: {
    schemaVersion: 'vibe-env.export-snapshot.v1',
    snapshotId: 'WEXP-2026-04-02-001',
    createdAt: ISO_DATE,
    claimIds: [CLAIM_ID],
    claims: [
      {
        claimId: CLAIM_ID,
        statusAtExport: 'PROMOTED',
        confidenceAtExport: 0.91,
        eligible: true,
        reasons: [],
        governanceProfileAtCreation: 'strict',
        hasFreshSchemaValidation: true
      }
    ],
    citations: [
      {
        claimId: CLAIM_ID,
        citationId: 'CIT-033',
        verificationStatusAtExport: 'VERIFIED'
      }
    ],
    capabilities: {
      governanceProfileAtCreationAvailable: true,
      schemaValidationSurfaceAvailable: true
    },
    warnings: []
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.export-snapshot.v1',
    snapshotId: 'snapshot-2026-04-02-001',
    createdAt: ISO_DATE,
    claimIds: ['claim-14'],
    claims: [],
    citations: [],
    capabilities: {
      governanceProfileAtCreationAvailable: true
    },
    warnings: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.export-snapshot.v1',
    snapshotId: 'WEXP-2026-04-02-compat',
    createdAt: ISO_DATE,
    claimIds: [CLAIM_ID],
    claims: [
      {
        claimId: CLAIM_ID,
        statusAtExport: 'PROMOTED',
        confidenceAtExport: null,
        eligible: false,
        reasons: ['needs_fresh_schema_validation'],
        governanceProfileAtCreation: 'unknown',
        hasFreshSchemaValidation: null
      }
    ],
    citations: [
      {
        claimId: CLAIM_ID,
        citationId: 'CIT-033',
        verificationStatusAtExport: 'VERIFIED'
      }
    ],
    capabilities: {
      governanceProfileAtCreationAvailable: false,
      schemaValidationSurfaceAvailable: false
    },
    warnings: ['governanceProfileAtCreation was unavailable during export snapshot creation.']
  }
});
