import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

test('phase9-runtime-budget.schema accepts the reviewed valid fixture', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-runtime-budget.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/runtime-budget/valid-basic.json',
    expectedValid: true
  });
});

test('phase9-runtime-budget.schema rejects a fixture missing maxIterations', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-runtime-budget.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/runtime-budget/invalid-missing-max-iterations.json',
    expectedValid: false
  });
});
