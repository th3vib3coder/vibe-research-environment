import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-inbox-entry.schema.json';

const validInboxEntry = {
  schemaVersion: 'phase10.inbox-entry.v1',
  inboxEntryId: 'INBOX-001',
  domainId: 'KDOM-001',
  entryType: 'raw-document',
  sourceRef: {
    type: 'raw-document',
    id: 'RAW-001'
  },
  reviewStatus: 'pending',
  priority: 'normal',
  createdAt: ISO_TIME
};

test('phase10-inbox-entry.schema accepts a pending source inbox entry', async () => {
  await expectValid(SCHEMA_FILE, validInboxEntry);
});

test('phase10-inbox-entry.schema rejects unknown review status', async () => {
  const fixture = clone(validInboxEntry);
  fixture.reviewStatus = 'auto-approved';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-inbox-entry.schema requires a source reference', async () => {
  const fixture = clone(validInboxEntry);
  delete fixture.sourceRef;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});
