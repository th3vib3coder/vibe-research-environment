import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expectFixtureValidity,
  loadValidator,
  readFixture
} from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/objective/valid-active.json',
  'environment/tests/fixtures/phase9/objective/valid-blocked.json'
]) {
  test(`phase9-objective.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-objective.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/objective/invalid-missing-budget.json',
  'environment/tests/fixtures/phase9/objective/invalid-missing-reasoning-mode.json',
  'environment/tests/fixtures/phase9/objective/invalid-missing-stop-conditions.json',
  'environment/tests/fixtures/phase9/objective/invalid-runtime-mode.json'
]) {
  test(`phase9-objective.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-objective.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}

test('phase9-objective.schema accepts optional Phase 10 knowledge-domain link', async () => {
  const validator = await loadValidator('phase9-objective.schema.json');
  const fixture = await readFixture('environment/tests/fixtures/phase9/objective/valid-active.json');
  fixture.domainId = 'KDOM-001';

  assert.equal(validator(fixture), true, JSON.stringify(validator.errors ?? []));
});

test('phase9-objective.schema rejects invalid Phase 10 knowledge-domain link ids', async () => {
  const validator = await loadValidator('phase9-objective.schema.json');
  const fixture = await readFixture('environment/tests/fixtures/phase9/objective/valid-active.json');
  fixture.domainId = 'domain-001';

  assert.equal(validator(fixture), false);
  assert.match(JSON.stringify(validator.errors ?? []), /domainId/u);
});
