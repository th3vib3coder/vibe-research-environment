import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'continuity-profile-history.schema.json',
  suiteName: 'continuity-profile-history.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.continuity-profile-history.v1',
    entryId: 'ORCH-CPH-2026-04-10-001',
    eventKind: 'update',
    path: '/runtime/defaultAllowApiFallback',
    previousValue: false,
    newValue: true,
    reason: 'Operator enabled API fallback for review defaults.',
    forgetReason: null,
    actor: 'operator',
    recordedAt: ISO_DATE,
    forgottenAt: null
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.continuity-profile-history.v1',
    entryId: 'CPH-2026-04-10-001',
    eventKind: 'forget',
    path: '',
    previousValue: true,
    actor: 'agent',
    recordedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.continuity-profile-history.v1',
    entryId: 'ORCH-CPH-2026-04-10-002',
    eventKind: 'forget',
    path: '/operator/quietHoursLocal',
    previousValue: [
      '22:00-07:00'
    ],
    forgetReason: 'Quiet-hours preference is no longer needed.',
    actor: 'orchestrator-proposal',
    recordedAt: ISO_DATE,
    forgottenAt: ISO_DATE_LATER
  }
});
