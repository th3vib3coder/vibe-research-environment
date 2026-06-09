import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-raw-document.schema.json';

const validRawDocument = {
  schemaVersion: 'phase10.raw-document.v1',
  rawDocumentId: 'RAW-001',
  bundleId: 'SB-001',
  domainId: 'KDOM-001',
  sourceType: 'pdf',
  trustTier: 'primary',
  sourceLocator: {
    kind: 'file',
    uri: 'raw/source.pdf'
  },
  contentHash: 'sha256:abc123',
  capturedAt: ISO_TIME,
  ingestion: {
    method: 'manual',
    operator: 'codex'
  }
};

test('phase10-raw-document.schema accepts a raw document with trust and locator metadata', async () => {
  await expectValid(SCHEMA_FILE, validRawDocument);
});

test('phase10-raw-document.schema requires trust-tier', async () => {
  const fixture = clone(validRawDocument);
  delete fixture.trustTier;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});

test('phase10-raw-document.schema requires source locator metadata', async () => {
  const fixture = clone(validRawDocument);
  delete fixture.sourceLocator;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});
