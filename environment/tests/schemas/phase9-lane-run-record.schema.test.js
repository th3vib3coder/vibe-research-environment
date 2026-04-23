import test from 'node:test';

import { expectFixtureValidity } from './phase9-schema-fixture-helper.js';

test('phase9-lane-run-record.schema accepts a valid complete fixture with recordSeq', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-lane-run-record.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/lane-run-record/valid-complete.json',
    expectedValid: true
  });
});

test('phase9-lane-run-record.schema accepts a valid interrupted fixture', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-lane-run-record.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/lane-run-record/valid-interrupted.json',
    expectedValid: true
  });
});

test('phase9-lane-run-record.schema accepts a valid running fixture created before execution completes', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-lane-run-record.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/lane-run-record/valid-running.json',
    expectedValid: true
  });
});

test('phase9-lane-run-record.schema rejects a fixture missing recordSeq', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-lane-run-record.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/lane-run-record/invalid-missing-record-seq.json',
    expectedValid: false
  });
});
