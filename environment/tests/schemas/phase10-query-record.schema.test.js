import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-query-record.schema.json';

const validQueryRecord = {
  schemaVersion: 'phase10.query-record.v1',
  queryId: 'QUERY-001',
  domainId: 'KDOM-001',
  queryText: 'Which assertions support the therapy summary?',
  issuedAt: ISO_TIME,
  queryClass: 'evidence-summary',
  status: 'complete',
  outputPath: 'wiki/queries/QUERY-001.md',
  outputBanner: {
    decisionUseClassification: 'evidence-support',
    provenanceWarning: 'query-output-is-metadata-not-law13-provenance'
  },
  resultRefs: ['WIKI-001'],
  decisionUse: {
    classification: 'evidence-support',
    computedBy: 'phase10-query-decision-use',
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

test('phase10-query-record.schema requires formal query class and status', async () => {
  const missingQueryClass = clone(validQueryRecord);
  delete missingQueryClass.queryClass;
  await expectInvalid(SCHEMA_FILE, missingQueryClass, /required|queryClass/u);

  const missingStatus = clone(validQueryRecord);
  delete missingStatus.status;
  await expectInvalid(SCHEMA_FILE, missingStatus, /required|status/u);
});

test('phase10-query-record.schema rejects estimation profiles as query class', async () => {
  const fixture = clone(validQueryRecord);
  fixture.queryClass = 'targeted-read';

  await expectInvalid(SCHEMA_FILE, fixture, /enum|allowed/u);
});

test('phase10-query-record.schema requires report scope for report generation', async () => {
  const fixture = clone(validQueryRecord);
  fixture.queryClass = 'report-generation';

  await expectInvalid(SCHEMA_FILE, fixture, /required|reportScope/u);
});

test('phase10-query-record.schema accepts scoped report generation', async () => {
  const fixture = clone(validQueryRecord);
  fixture.queryClass = 'report-generation';
  fixture.reportScope = 'single-objective';

  await expectValid(SCHEMA_FILE, fixture);
});
