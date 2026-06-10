import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-wiki-page.schema.json';

const validWikiPage = {
  schemaVersion: 'phase10.wiki-page.v1',
  pageId: 'WIKI-001',
  domainId: 'KDOM-001',
  type: 'source',
  title: 'Therapy Evidence Summary',
  path: 'WIKI_VRE/entities/therapy-evidence-summary.md',
  compilePolicyId: 'CP-001',
  lifecycleStatus: 'draft',
  assertionGraph: [
    {
      assertionId: 'ASSERT-001',
      text: 'Every assertion carries its own citations.',
      status: 'sourced',
      cites: ['PROV-001']
    }
  ],
  updatedAt: ISO_TIME
};

test('phase10-wiki-page.schema accepts assertion-level citations', async () => {
  await expectValid(SCHEMA_FILE, validWikiPage);
});

test('phase10-wiki-page.schema requires persisted page type', async () => {
  const fixture = clone(validWikiPage);
  delete fixture.type;

  await expectInvalid(SCHEMA_FILE, fixture, /required|type/u);
});

test('phase10-wiki-page.schema accepts LAW 13 assertion status values only', async () => {
  for (const status of ['sourced', 'computed', 'claimed', 'supposition']) {
    const fixture = clone(validWikiPage);
    fixture.assertionGraph[0].status = status;
    await expectValid(SCHEMA_FILE, fixture);
  }

  const invalid = clone(validWikiPage);
  invalid.assertionGraph[0].status = 'draft';

  await expectInvalid(SCHEMA_FILE, invalid, /allowed|enum/u);
});

test('phase10-wiki-page.schema keeps lifecycle status distinct from LAW 13 status', async () => {
  const fixture = clone(validWikiPage);
  fixture.lifecycleStatus = 'active';
  fixture.assertionGraph[0].status = 'computed';

  await expectValid(SCHEMA_FILE, fixture);
});

test('phase10-wiki-page.schema requires hypothesis nexusStatus', async () => {
  const fixture = clone(validWikiPage);
  fixture.type = 'hypothesis';

  await expectInvalid(SCHEMA_FILE, fixture, /required|nexusStatus/u);

  fixture.nexusStatus = 'not-established';

  await expectValid(SCHEMA_FILE, fixture);
});

test('phase10-wiki-page.schema rejects page-level provenance without assertion cites', async () => {
  const fixture = clone(validWikiPage);
  fixture.pageProvenance = ['PROV-001'];
  fixture.assertionGraph[0].cites = [];

  await expectInvalid(SCHEMA_FILE, fixture, /additional|fewer than|minItems/u);
});

test('phase10-wiki-page.schema rejects top-level LAW 13 status', async () => {
  const fixture = clone(validWikiPage);
  fixture.status = 'reviewed';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
