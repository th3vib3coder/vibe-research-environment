import test from 'node:test';

import { expectFixtureValidity, readFixture, loadValidator } from './phase9-schema-fixture-helper.js';

for (const fixturePath of [
  'environment/tests/fixtures/phase9/capability-handshake/valid-full.json',
  'environment/tests/fixtures/phase9/capability-handshake/valid-degraded-no-kernel.json',
  'environment/tests/fixtures/phase9/capability-handshake/valid-missing-vre-kernel.json',
  'environment/tests/fixtures/phase9/capability-handshake/valid-projection-probe-shape.json'
]) {
  test(`phase9-capability-handshake.schema accepts ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-capability-handshake.schema.json',
      fixturePath,
      expectedValid: true
    });
  });
}

for (const fixturePath of [
  'environment/tests/fixtures/phase9/capability-handshake/invalid-missing-operator-surface.json',
  'environment/tests/fixtures/phase9/capability-handshake/invalid-missing-missing-surfaces.json',
  'environment/tests/fixtures/phase9/capability-handshake/invalid-missing-objective.json',
  'environment/tests/fixtures/phase9/capability-handshake/invalid-missing-memory-apis.json'
]) {
  test(`phase9-capability-handshake.schema rejects ${fixturePath}`, async () => {
    await expectFixtureValidity({
      schemaFile: 'phase9-capability-handshake.schema.json',
      fixturePath,
      expectedValid: false
    });
  });
}

for (const missingArray of [
  'schemas',
  'connectors',
  'automations',
  'domainPacks',
  'memoryApis'
]) {
  test(`phase9-capability-handshake.schema rejects a fixture with missing ontology array ${missingArray}`, async () => {
    const validator = await loadValidator('phase9-capability-handshake.schema.json');
    const fixture = await readFixture(
      'environment/tests/fixtures/phase9/capability-handshake/valid-full.json'
    );
    delete fixture.vre[missingArray];
    validator(fixture);
    if (validator.errors == null || validator.errors.length === 0) {
      throw new Error(`Expected schema failure for missing ontology array ${missingArray}`);
    }
  });
}
