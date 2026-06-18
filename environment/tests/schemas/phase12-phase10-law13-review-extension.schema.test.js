import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validLaw13Extension } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-phase10-law13-review-extension.schema.json';

test('phase12-phase10-law13-review-extension.schema accepts LAW 13 checks', async () => {
  await expectValid(SCHEMA_FILE, validLaw13Extension());
});

test('phase12-phase10-law13-review-extension.schema pins relay verdict type', async () => {
  const fixture = clone(validLaw13Extension());
  fixture.relayVerdictType = 'review-verdict';
  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase12-phase10-law13-review-extension.schema requires query check', async () => {
  const fixture = clone(validLaw13Extension());
  delete fixture.queryNotProvenanceCheck;
  await expectInvalid(SCHEMA_FILE, fixture, /queryNotProvenanceCheck/u);
});
