import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validGraphExtension } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-phase11-graph-review-extension.schema.json';

test('phase12-phase11-graph-review-extension.schema accepts Graphify checks', async () => {
  await expectValid(SCHEMA_FILE, validGraphExtension());
});

test('phase12-phase11-graph-review-extension.schema requires WIKI preservation', async () => {
  const fixture = clone(validGraphExtension());
  delete fixture.wikiVreAuthorityPreserved;
  await expectInvalid(SCHEMA_FILE, fixture, /wikiVreAuthorityPreserved/u);
});

test('phase12-phase11-graph-review-extension.schema rejects extra fields', async () => {
  const fixture = clone(validGraphExtension());
  fixture.graphifyAsEvidence = true;
  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
