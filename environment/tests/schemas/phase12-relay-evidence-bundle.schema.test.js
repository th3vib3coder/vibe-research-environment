import test from 'node:test';

import { expectInvalid, expectValid } from './phase10-schema-test-helper.js';
import { clone, validEvidenceBundle } from './phase12-schema-fixtures.js';

const SCHEMA_FILE = 'phase12-relay-evidence-bundle.schema.json';

test('phase12-relay-evidence-bundle.schema accepts hashed evidence bundle', async () => {
  await expectValid(SCHEMA_FILE, validEvidenceBundle());
});

test('phase12-relay-evidence-bundle.schema rejects missing artifact hash', async () => {
  const fixture = clone(validEvidenceBundle());
  delete fixture.artifacts[0].sha256;
  await expectInvalid(SCHEMA_FILE, fixture, /required.*sha256|sha256/u);
});

test('phase12-relay-evidence-bundle.schema rejects absolute final verdict ref', async () => {
  const fixture = clone(validEvidenceBundle());
  fixture.finalVerdictRef = '/tmp/final-verdict.json';
  await expectInvalid(SCHEMA_FILE, fixture, /must NOT be valid|not/u);
});
