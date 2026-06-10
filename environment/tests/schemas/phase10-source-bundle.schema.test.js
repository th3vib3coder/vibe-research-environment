import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-source-bundle.schema.json';

const validSourceBundle = {
  schemaVersion: 'phase10.source-bundle.v1',
  bundleId: 'SB-001',
  bundleVersion: 'v1',
  domainId: 'KDOM-001',
  title: 'Curated source bundle',
  sourceType: 'pdf',
  trustTier: 'primary',
  license: 'open',
  allowTrackPayload: false,
  scopeOfUse: ['evidence'],
  rawDocumentRefs: [
    {
      rawDocumentId: 'RAW-001',
      contentHash: 'sha256:raw-001'
    }
  ],
  sourceLocators: [
    {
      kind: 'file',
      uri: 'raw/source.pdf'
    }
  ],
  collectedAt: ISO_TIME,
  status: 'curated'
};

test('phase10-source-bundle.schema accepts a self-describing curated source bundle', async () => {
  await expectValid(SCHEMA_FILE, validSourceBundle);
});

test('phase10-source-bundle.schema requires at least one source locator', async () => {
  const fixture = clone(validSourceBundle);
  fixture.sourceLocators = [];

  await expectInvalid(SCHEMA_FILE, fixture, /must NOT have fewer than|minItems/u);
});

test('phase10-source-bundle.schema rejects unknown source type', async () => {
  const fixture = clone(validSourceBundle);
  fixture.sourceType = 'telepathy';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-source-bundle.schema requires bundle version', async () => {
  const fixture = clone(validSourceBundle);
  delete fixture.bundleVersion;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*bundleVersion|bundleVersion/u);
});

test('phase10-source-bundle.schema rejects invalid license', async () => {
  const fixture = clone(validSourceBundle);
  fixture.license = 'maybe-open';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-source-bundle.schema rejects curated bundles with unknown license', async () => {
  const fixture = clone(validSourceBundle);
  fixture.license = 'unknown';

  await expectInvalid(SCHEMA_FILE, fixture, /must NOT be valid|not/u);
});

test('phase10-source-bundle.schema rejects curated bundles without scope of use', async () => {
  const fixture = clone(validSourceBundle);
  fixture.scopeOfUse = [];

  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});

test('phase10-source-bundle.schema rejects invalid scope of use', async () => {
  const fixture = clone(validSourceBundle);
  fixture.scopeOfUse = ['marketing'];

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-source-bundle.schema rejects invalid payload tracking flag', async () => {
  const fixture = clone(validSourceBundle);
  fixture.allowTrackPayload = 'yes';

  await expectInvalid(SCHEMA_FILE, fixture, /must be boolean|boolean/u);
});

test('phase10-source-bundle.schema requires raw document references', async () => {
  const fixture = clone(validSourceBundle);
  fixture.rawDocumentRefs = [];

  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});
