import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/resume-snapshot/valid-mid-loop.json',
  'environment/tests/fixtures/phase9/resume-snapshot/valid-pre-stop.json'
]) {
  test(`phase9-resume-snapshot.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-resume-snapshot.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/resume-snapshot/invalid-missing-budget.json',
  'environment/tests/fixtures/phase9/resume-snapshot/invalid-missing-reasoning-mode.json',
  'environment/tests/fixtures/phase9/resume-snapshot/invalid-reasoning-mode-diverged.json',
  'environment/tests/fixtures/phase9/resume-snapshot/invalid-stale-fingerprint.json'
]) {
  test(`phase9-resume-snapshot.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-resume-snapshot.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}
