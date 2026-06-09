import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORBIDDEN_PHASE10_SCHEMA_FILES,
  ISO_TIME,
  PHASE10_CONTRACTS,
  assertSchemaAbsent,
  clone,
  expectInvalid,
  expectValid,
  readSchema
} from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';

const validKnowledgeDomain = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-001',
  name: 'Oncology Knowledge Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-001'],
  active: true,
  createdAt: ISO_TIME,
  updatedAt: ISO_TIME
};

test('phase10 contract catalog exposes the 13 required schema ids', async () => {
  for (const [schemaId, schemaFile] of PHASE10_CONTRACTS) {
    const schema = await readSchema(schemaFile);
    assert.equal(schema.$id, schemaId, `${schemaFile} must declare ${schemaId}`);
  }
});

test('phase10 contract catalog does not create forbidden duplicate schemas', async () => {
  for (const schemaFile of FORBIDDEN_PHASE10_SCHEMA_FILES) {
    await assertSchemaAbsent(schemaFile);
  }
});

test('phase10-knowledge-domain.schema accepts a single active knowledge domain', async () => {
  await expectValid(SCHEMA_FILE, validKnowledgeDomain);
});

test('phase10-knowledge-domain.schema rejects historical phase10.domain.v1', async () => {
  const fixture = clone(validKnowledgeDomain);
  fixture.schemaVersion = 'phase10.domain.v1';

  await expectInvalid(SCHEMA_FILE, fixture, /constant|const/u);
});

test('phase10-knowledge-domain.schema rejects cross-domain behavior fields', async () => {
  const fixture = clone(validKnowledgeDomain);
  fixture.crossDomainMergePolicy = 'auto-merge';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
