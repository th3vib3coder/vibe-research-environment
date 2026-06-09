import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-wiki-page.schema.json';

const validWikiPage = {
  schemaVersion: 'phase10.wiki-page.v1',
  pageId: 'WIKI-001',
  domainId: 'KDOM-001',
  title: 'Therapy Evidence Summary',
  path: 'WIKI_VRE/entities/therapy-evidence-summary.md',
  compilePolicyId: 'CP-001',
  assertionGraph: [
    {
      assertionId: 'ASSERT-001',
      text: 'Every assertion carries its own citations.',
      status: 'active',
      cites: ['PROV-001']
    }
  ],
  updatedAt: ISO_TIME
};

test('phase10-wiki-page.schema accepts assertion-level citations', async () => {
  await expectValid(SCHEMA_FILE, validWikiPage);
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
