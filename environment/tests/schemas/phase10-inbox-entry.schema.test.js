import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-inbox-entry.schema.json';

const validInboxEntry = {
  schemaVersion: 'phase10.inbox-entry.v1',
  inboxEntryId: 'INBOX-001',
  domainId: 'KDOM-001',
  entryType: 'raw-document',
  sourceRef: {
    type: 'doi',
    id: '10.1000/example'
  },
  dedupeKeys: ['doi:10.1000/example', 'title:example-paper'],
  discoveredBySkill: 'operator-upload',
  discoveredByTask: {
    objectiveId: 'OBJ-001',
    taskId: 'TASK-001'
  },
  discoveredAt: ISO_TIME,
  selectionRationale: 'Primary source candidate for the active objective.',
  relevanceScore: 0.82,
  whyThisMatters: 'This source may answer the open evidence gap.',
  candidateStatus: 'pending',
  priority: 'normal',
  payloadStatus: 'metadata-only',
  createdAt: ISO_TIME
};

function approvedInboxEntry(overrides = {}) {
  return {
    ...validInboxEntry,
    candidateStatus: 'approved',
    approval: {
      approvedAt: ISO_TIME,
      approvedBy: 'operator',
      license: 'open',
      trustTier: 'primary',
      scopeOfUse: ['evidence'],
      promotedToBundle: {
        bundleId: 'SB-001',
        bundleVersion: 'v1'
      }
    },
    ...overrides
  };
}

function rejectedInboxEntry(overrides = {}) {
  return {
    ...validInboxEntry,
    candidateStatus: 'rejected',
    rejection: {
      rejectedAt: ISO_TIME,
      rejectedBy: 'operator',
      rejectReason: 'Out of scope for the active objective.',
      payloadStatus: 'preserved'
    },
    ...overrides
  };
}

test('phase10-inbox-entry.schema accepts a pending candidate inbox entry', async () => {
  await expectValid(SCHEMA_FILE, validInboxEntry);
});

test('phase10-inbox-entry.schema rejects the removed reviewStatus alias', async () => {
  const fixture = clone(validInboxEntry);
  fixture.reviewStatus = 'pending';

  await expectInvalid(SCHEMA_FILE, fixture, /additional properties|reviewStatus/u);
});

test('phase10-inbox-entry.schema rejects unknown candidate status', async () => {
  const fixture = clone(validInboxEntry);
  fixture.candidateStatus = 'in-review';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-inbox-entry.schema requires selection rationale', async () => {
  const fixture = clone(validInboxEntry);
  delete fixture.selectionRationale;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});

test('phase10-inbox-entry.schema requires whyThisMatters', async () => {
  const fixture = clone(validInboxEntry);
  delete fixture.whyThisMatters;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});

test('phase10-inbox-entry.schema bounds relevanceScore', async () => {
  const fixture = clone(validInboxEntry);
  fixture.relevanceScore = 1.2;

  await expectInvalid(SCHEMA_FILE, fixture, /must be <= 1|maximum/u);
});

test('phase10-inbox-entry.schema requires non-empty dedupe keys', async () => {
  const fixture = clone(validInboxEntry);
  fixture.dedupeKeys = [];

  await expectInvalid(SCHEMA_FILE, fixture, /must NOT have fewer than 1 items|minItems/u);
});

test('phase10-inbox-entry.schema requires approval fields when approved', async () => {
  await expectValid(SCHEMA_FILE, approvedInboxEntry());

  const missingLicense = approvedInboxEntry();
  delete missingLicense.approval.license;
  await expectInvalid(SCHEMA_FILE, missingLicense, /required/u);

  const missingTrustTier = approvedInboxEntry();
  delete missingTrustTier.approval.trustTier;
  await expectInvalid(SCHEMA_FILE, missingTrustTier, /required/u);

  const emptyScope = approvedInboxEntry();
  emptyScope.approval.scopeOfUse = [];
  await expectInvalid(SCHEMA_FILE, emptyScope, /must NOT have fewer than 1 items|minItems/u);
});

test('phase10-inbox-entry.schema requires tombstone fields when rejected', async () => {
  await expectValid(SCHEMA_FILE, rejectedInboxEntry());

  const missingRejectReason = rejectedInboxEntry();
  delete missingRejectReason.rejection.rejectReason;
  await expectInvalid(SCHEMA_FILE, missingRejectReason, /required/u);
});
