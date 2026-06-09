import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-source-bundle.schema.json';

const validSourceBundle = {
  schemaVersion: 'phase10.source-bundle.v1',
  bundleId: 'SB-001',
  domainId: 'KDOM-001',
  title: 'Curated source bundle',
  sourceType: 'pdf',
  trustTier: 'primary',
  sourceLocators: [
    {
      kind: 'file',
      uri: 'raw/source.pdf'
    }
  ],
  collectedAt: ISO_TIME,
  status: 'raw'
};

test('phase10-source-bundle.schema accepts a located raw source bundle', async () => {
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
