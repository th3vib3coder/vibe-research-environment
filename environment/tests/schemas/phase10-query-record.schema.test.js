import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-query-record.schema.json';

const validQueryRecord = {
  schemaVersion: 'phase10.query-record.v1',
  queryId: 'QUERY-001',
  domainId: 'KDOM-001',
  queryText: 'Which assertions support the therapy summary?',
  issuedAt: ISO_TIME,
  resultRefs: ['WIKI-001'],
  decisionUse: {
    classification: 'decision-support',
    computedBy: 'phase10-query-lint',
    computedAt: ISO_TIME
  }
};

test('phase10-query-record.schema accepts computed decision-use metadata', async () => {
  await expectValid(SCHEMA_FILE, validQueryRecord);
});

test('phase10-query-record.schema rejects author-declared decision use', async () => {
  const fixture = clone(validQueryRecord);
  fixture.decisionUse.declaredBy = 'author';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});

test('phase10-query-record.schema rejects decision-use as provenance', async () => {
  const fixture = clone(validQueryRecord);
  fixture.decisionUse = {
    classification: 'decision-support',
    provenance: 'author-declared'
  };

  await expectInvalid(SCHEMA_FILE, fixture, /required|additional/u);
});
