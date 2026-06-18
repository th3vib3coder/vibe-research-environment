import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validRun } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-run.schema.json';

test('phase12-relay-run.schema accepts a filesystem relay run', async () => {
  await expectValid(SCHEMA_FILE, validRun());
});

test('phase12-relay-run.schema rejects clipboard relay substrate', async () => {
  const fixture = clone(validRun());
  fixture.relaySubstrate = 'clipboard';
  await expectInvalid(SCHEMA_FILE, fixture, /const/u);
});

test('phase12-relay-run.schema requires iteration cap', async () => {
  const fixture = clone(validRun());
  delete fixture.maxIterations;
  await expectInvalid(SCHEMA_FILE, fixture, /required.*maxIterations|maxIterations/u);
});
