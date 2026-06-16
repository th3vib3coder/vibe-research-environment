import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expectFixtureValidity,
  loadValidator,
  readFixture
} from './phase9-schema-fixture-helper.js';

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

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
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-destructive-without-approval.json',
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-python-missing-environment.json',
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-rscript-missing-environment.json',
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-python-lock-hash-missing-reason.json',
  'environment/tests/fixtures/phase9/analysis-manifest/invalid-python-personal-executable-path.json'
]) {
  test(`phase9-analysis-manifest.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-analysis-manifest.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}

test('phase9-analysis-manifest.schema keeps script.language=other additive without environment', async () => {
  const validator = await loadValidator('phase9-analysis-manifest.schema.json');
  const fixture = await readFixture('environment/tests/fixtures/phase9/analysis-manifest/valid-python.json');
  fixture.script.path = 'analysis/scripts/safe-analysis.mjs';
  fixture.script.language = 'other';
  fixture.command.runner = 'other';
  fixture.command.argv = [
    'analysis/scripts/safe-analysis.mjs',
    '--input',
    'data/input.h5ad',
    '--output',
    'artifacts/results.csv'
  ];
  delete fixture.environment;

  const valid = validator(fixture);

  assert.equal(valid, true, validationDetails(validator));
});
