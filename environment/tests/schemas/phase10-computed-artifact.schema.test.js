import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-computed-artifact.schema.json';

const validComputedArtifact = {
  schemaVersion: 'phase10.computed-artifact.v1',
  artifactId: 'ART-001',
  domainId: 'KDOM-001',
  artifactType: 'table',
  recipe: {
    name: 'extract-evidence-table',
    version: '1.0.0',
    parameters: {}
  },
  provenanceLinks: ['PROV-001'],
  sensitivity: 'internal',
  createdAt: ISO_TIME
};

test('phase10-computed-artifact.schema accepts recipe-backed computed artifacts', async () => {
  await expectValid(SCHEMA_FILE, validComputedArtifact);
});

test('phase10-computed-artifact.schema requires recipe metadata', async () => {
  const fixture = clone(validComputedArtifact);
  delete fixture.recipe;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});

test('phase10-computed-artifact.schema rejects unknown sensitivity classifications', async () => {
  const fixture = clone(validComputedArtifact);
  fixture.sensitivity = 'unknown';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});
