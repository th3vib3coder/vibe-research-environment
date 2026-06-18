import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validReview } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-review.schema.json';

test('phase12-relay-review.schema accepts review metadata', async () => {
  await expectValid(SCHEMA_FILE, validReview());
});

test('phase12-relay-review.schema rejects unknown verdict', async () => {
  const fixture = clone(validReview());
  fixture.verdict = 'MAYBE';
  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase12-relay-review.schema requires residual risk array', async () => {
  const fixture = clone(validReview());
  delete fixture.residualRisk;
  await expectInvalid(SCHEMA_FILE, fixture, /required.*residualRisk|residualRisk/u);
});
