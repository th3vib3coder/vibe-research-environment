import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validCandidate } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-candidate.schema.json';

test('phase12-relay-candidate.schema accepts candidate metadata', async () => {
  await expectValid(SCHEMA_FILE, validCandidate());
});

test('phase12-relay-candidate.schema rejects absolute artifact path', async () => {
  const fixture = clone(validCandidate());
  fixture.artifactPath = 'C:/tmp/candidate.md';
  await expectInvalid(SCHEMA_FILE, fixture, /must NOT be valid|not/u);
});

test('phase12-relay-candidate.schema requires source refs', async () => {
  const fixture = clone(validCandidate());
  delete fixture.sourceRefs;
  await expectInvalid(SCHEMA_FILE, fixture, /required.*sourceRefs|sourceRefs/u);
});
