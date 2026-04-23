import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/analysis-manifest/valid-python.json',
  'environment/tests/fixtures/phase9/analysis-manifest/valid-notebook.json'
]) {
  test(`phase9-analysis-manifest.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-analysis-manifest.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-missing-objective-id.json',
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-destructive-without-approval.json'
]) {
  test(`phase9-analysis-manifest.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-analysis-manifest.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}
