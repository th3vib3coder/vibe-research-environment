import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

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
  'environment/tests/fixtures/phase9/objective/invalid-missing-reasoning-mode.json'
]) {
  test(`phase9-objective.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-objective.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}
