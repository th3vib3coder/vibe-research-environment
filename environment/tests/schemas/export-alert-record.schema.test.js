import {
  CLAIM_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'export-alert-record.schema.json',
  suiteName: 'export-alert-record.schema',
  validFixture: {
    schemaVersion: 'vibe-env.export-alert-record.v1',
    alertId: 'WALERT-2026-04-02-001',
    claimId: CLAIM_ID,
    snapshotId: 'WEXP-2026-04-02-001',
    detectedAt: ISO_DATE,
    kind: 'claim_killed',
    severity: 'warning',
    message: 'C-001 was exported from WEXP-2026-04-02-001 and is now KILLED.',
    citationId: null,
    snapshotStatus: 'PROMOTED',
    currentStatus: 'KILLED',
    snapshotConfidence: 0.91,
    currentConfidence: 0.0
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.export-alert-record.v1',
    alertId: 'alert-2026-04-02-001',
    claimId: CLAIM_ID,
    snapshotId: 'WEXP-2026-04-02-001',
    detectedAt: ISO_DATE,
    kind: 'claim_archived',
    severity: 'critical',
    message: ''
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.export-alert-record.v1',
    alertId: 'WALERT-2026-04-02-confidence',
    claimId: CLAIM_ID,
    snapshotId: 'WEXP-2026-04-02-001',
    detectedAt: ISO_DATE,
    kind: 'confidence_changed',
    severity: 'info',
    message: 'C-001 confidence changed after export; review draft language.',
    citationId: null,
    snapshotStatus: 'PROMOTED',
    currentStatus: 'PROMOTED',
    snapshotConfidence: 0.91,
    currentConfidence: 0.65
  }
});
