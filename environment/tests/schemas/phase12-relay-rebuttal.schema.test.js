import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validRebuttal } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-rebuttal.schema.json';

test('phase12-relay-rebuttal.schema accepts rebuttal metadata', async () => {
  await expectValid(SCHEMA_FILE, validRebuttal());
});

test('phase12-relay-rebuttal.schema requires evidence for rejected findings', async () => {
  const fixture = clone(validRebuttal());
  fixture.rejectedFindings[0].evidenceRefs = [];
  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});

test('phase12-relay-rebuttal.schema requires response review id', async () => {
  const fixture = clone(validRebuttal());
  delete fixture.respondsToReviewId;
  await expectInvalid(SCHEMA_FILE, fixture, /respondsToReviewId/u);
});
