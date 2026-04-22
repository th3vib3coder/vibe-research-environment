import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/handoff/valid-basic.json',
  'environment/tests/fixtures/phase9/handoff/valid.jsonl'
]) {
  test(`phase9-handoff.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-handoff.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/handoff/invalid-missing-record-seq.json',
  'environment/tests/fixtures/phase9/handoff/invalid-no-artifacts.jsonl'
]) {
  test(`phase9-handoff.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-handoff.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}
