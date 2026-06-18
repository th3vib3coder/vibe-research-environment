import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validFinalVerdict } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-final-verdict.schema.json';

test('phase12-relay-final-verdict.schema accepts final verdict metadata', async () => {
  await expectValid(SCHEMA_FILE, validFinalVerdict());
});

test('phase12-relay-final-verdict.schema pins relay verdict type vocabulary', async () => {
  const fixture = clone(validFinalVerdict());
  fixture.relayVerdictType = 'phase12-review-verdict';
  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase12-relay-final-verdict.schema requires closure signal status', async () => {
  const fixture = clone(validFinalVerdict());
  delete fixture.closureSignalStatus.noRegression;
  await expectInvalid(SCHEMA_FILE, fixture, /noRegression/u);
});
