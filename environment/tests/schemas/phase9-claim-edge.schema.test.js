import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectFixtureValidity,
  loadValidator,
  readFixture
} from './phase9-schema-fixture-helper.js';

const SCHEMA_FILE = 'phase9-claim-edge.schema.json';
const FIXTURE_ROOT = 'environment/tests/fixtures/phase9/claim-edge';
const RELATION_ENUM = [
  'supports',
  'contradicts',
  'supersedes',
  'depends_on',
  'evolved_into',
  'related_to'
];

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

test('phase9-claim-edge.schema accepts valid-supports.json', async () => {
  await expectFixtureValidity({
    schemaFile: SCHEMA_FILE,
    fixturePath: `${FIXTURE_ROOT}/valid-supports.json`,
    expectedValid: true
  });
});

test('phase9-claim-edge.schema accepts valid-contradicts.json', async () => {
  await expectFixtureValidity({
    schemaFile: SCHEMA_FILE,
    fixturePath: `${FIXTURE_ROOT}/valid-contradicts.json`,
    expectedValid: true
  });
});

test('phase9-claim-edge.schema accepts valid-self-loop.json', async () => {
  await expectFixtureValidity({
    schemaFile: SCHEMA_FILE,
    fixturePath: `${FIXTURE_ROOT}/valid-self-loop.json`,
    expectedValid: true
  });
});

test('phase9-claim-edge.schema rejects invalid-unknown-relation.json with enum error', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/invalid-unknown-relation.json`);

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /allowed values|enum/u);
});

test('phase9-claim-edge.schema rejects invalid-missing-from-id.json with required error', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/invalid-missing-from-id.json`);

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /required/u);
});

test('phase9-claim-edge.schema rejects invalid-missing-to-id.json with required error', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/invalid-missing-to-id.json`);

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /required/u);
});

test('phase9-claim-edge.schema pins schemaVersion const', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/valid-supports.json`);
  fixture.schemaVersion = 'wrong-version';

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /must be equal to constant|const/u);
});

test('phase9-claim-edge.schema pins relation enum order', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const relationSchema = validator.schema.properties.relation;

  assert.deepEqual(relationSchema.enum, RELATION_ENUM);
});
