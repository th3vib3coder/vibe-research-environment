import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

test('phase9-active-objective-pointer.schema accepts a valid active pointer fixture', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-active-objective-pointer.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/active-objective-pointer/valid-active.json',
    expectedValid: true
  });
});

test('phase9-active-objective-pointer.schema rejects a fixture missing currentWakeLease', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-active-objective-pointer.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/active-objective-pointer/invalid-missing-wake-lease.json',
    expectedValid: false
  });
});
