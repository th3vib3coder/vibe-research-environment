import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectFixtureValidity,
  loadValidator,
  readFixture
} from './phase9-schema-fixture-helper.js';

const SCHEMA_FILE = 'phase9-r2-projection.schema.json';
const FIXTURE_ROOT = 'environment/tests/fixtures/phase9/r2-projection';
const STATUS_ENUM = ['open', 'redirect', 'veto', 'resolved', 'disputed'];

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

test('phase9-r2-projection.schema accepts valid-full.json', async () => {
  await expectFixtureValidity({
    schemaFile: SCHEMA_FILE,
    fixturePath: `${FIXTURE_ROOT}/valid-full.json`,
    expectedValid: true
  });
});

test('phase9-r2-projection.schema accepts empty.json as a true zero-row projection', async () => {
  await expectFixtureValidity({
    schemaFile: SCHEMA_FILE,
    fixturePath: `${FIXTURE_ROOT}/empty.json`,
    expectedValid: true
  });
});

test('phase9-r2-projection.schema rejects missing r2VerdictEventId', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/invalid-missing-r2-verdict-event-id.json`);

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /required/u);
});

test('phase9-r2-projection.schema pins schemaVersion const', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/valid-full.json`);
  fixture.schemaVersion = 'wrong-version';

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /must be equal to constant|const/u);
});

test('phase9-r2-projection.schema requires status enum values', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/valid-full.json`);
  fixture.records[0].status = 'maybe';

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /allowed values|enum/u);
});

test('phase9-r2-projection.schema requires resolved to be boolean', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/valid-full.json`);
  fixture.records[0].resolved = 'false';

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /boolean/u);
});

test('phase9-r2-projection.schema rejects additional record fields', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const fixture = await readFixture(`${FIXTURE_ROOT}/valid-full.json`);
  fixture.records[0].unreviewedField = true;

  assert.equal(validator(fixture), false);
  assert.match(validationDetails(validator), /additional properties/u);
});

test('phase9-r2-projection.schema pins status enum order', async () => {
  const validator = await loadValidator(SCHEMA_FILE);
  const statusSchema = validator.schema.properties.records.items.properties.status;

  assert.deepEqual(statusSchema.enum, STATUS_ENUM);
});
