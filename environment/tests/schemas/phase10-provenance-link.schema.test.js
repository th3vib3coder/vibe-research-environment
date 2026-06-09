import assert from 'node:assert/strict';
import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid, loadPhase10Validator } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-provenance-link.schema.json';
const KIND_ENUM = ['raw-source', 'computed-artifact', 'claim-ledger', 'edge'];

const validProvenanceLink = {
  schemaVersion: 'phase10.provenance-link.v1',
  linkId: 'PROV-001',
  domainId: 'KDOM-001',
  kind: 'raw-source',
  sourceRef: {
    type: 'raw-document',
    id: 'RAW-001'
  },
  targetRef: {
    type: 'wiki-page',
    id: 'WIKI-001'
  },
  createdAt: ISO_TIME
};

test('phase10-provenance-link.schema accepts a raw-source provenance link', async () => {
  await expectValid(SCHEMA_FILE, validProvenanceLink);
});

test('phase10-provenance-link.schema pins the four allowed provenance kinds', async () => {
  const validator = await loadPhase10Validator(SCHEMA_FILE);
  assert.deepEqual(validator.schema.properties.kind.enum, KIND_ENUM);
});

test('phase10-provenance-link.schema rejects unknown provenance kinds', async () => {
  const fixture = clone(validProvenanceLink);
  fixture.kind = 'web-page';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});
