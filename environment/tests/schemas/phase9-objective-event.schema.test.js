import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/objective-event/valid-loop-iteration.json',
  'environment/tests/fixtures/phase9/objective-event/valid-state-repair.json',
  'environment/tests/fixtures/phase9/objective-event/valid-semantic-drift-detected.json'
]) {
  test(`phase9-objective-event.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-objective-event.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/objective-event/invalid-missing-record-seq.json',
  'environment/tests/fixtures/phase9/objective-event/invalid-state-repair-missing-repaired-layer.json',
  'environment/tests/fixtures/phase9/objective-event/invalid-semantic-drift-missing-phase.json'
]) {
  test(`phase9-objective-event.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-objective-event.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}
