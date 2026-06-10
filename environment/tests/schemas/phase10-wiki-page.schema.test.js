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
  pageRouting: 'publishable',
  assertionGraph: [
    {
      assertionId: 'ASSERT-001',
      text: 'Every assertion carries its own citations.',
      status: 'sourced',
      declaredKind: 'extractive-fact',
      riskFlags: [],
      finalRouting: 'allowed',
      cites: ['PROV-001']
    }
  ],
  updatedAt: ISO_TIME
};

function validR2Audit() {
  return {
    status: 'passed',
    verdict: 'ACCEPT',
    reviewer: 'claude-code',
    reviewedAt: ISO_TIME,
    law13ReviewExtension: {
      law13StatusChecked: true,
      provenanceRefsChecked: true,
      queryNotProvenanceCheck: true,
      r2PathRequired: true,
      r2PathPresent: true,
      suppositionIsolationChecked: true
    }
  };
}

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

test('phase10-wiki-page.schema requires assertion routing fields', async () => {
  const missingDeclaredKind = clone(validWikiPage);
  delete missingDeclaredKind.assertionGraph[0].declaredKind;
  await expectInvalid(SCHEMA_FILE, missingDeclaredKind, /required|declaredKind/u);

  const missingRiskFlags = clone(validWikiPage);
  delete missingRiskFlags.assertionGraph[0].riskFlags;
  await expectInvalid(SCHEMA_FILE, missingRiskFlags, /required|riskFlags/u);

  const missingFinalRouting = clone(validWikiPage);
  delete missingFinalRouting.assertionGraph[0].finalRouting;
  await expectInvalid(SCHEMA_FILE, missingFinalRouting, /required|finalRouting/u);

  const missingPageRouting = clone(validWikiPage);
  delete missingPageRouting.pageRouting;
  await expectInvalid(SCHEMA_FILE, missingPageRouting, /required|pageRouting/u);
});

test('phase10-wiki-page.schema rejects design-prose kebab field names', async () => {
  const fixture = clone(validWikiPage);
  fixture.assertionGraph[0]['declared-kind'] = fixture.assertionGraph[0].declaredKind;
  delete fixture.assertionGraph[0].declaredKind;
  fixture['page-routing'] = fixture.pageRouting;
  delete fixture.pageRouting;

  await expectInvalid(SCHEMA_FILE, fixture, /additional|required/u);
});

test('phase10-wiki-page.schema requires hypothesis nexusStatus', async () => {
  const fixture = clone(validWikiPage);
  fixture.type = 'hypothesis';

  await expectInvalid(SCHEMA_FILE, fixture, /required|nexusStatus/u);

  fixture.nexusStatus = 'not-established';

  await expectValid(SCHEMA_FILE, fixture);
});

test('phase10-wiki-page.schema requires R2 audit for synthesis pages', async () => {
  const missingAudit = clone(validWikiPage);
  missingAudit.type = 'synthesis';

  await expectInvalid(SCHEMA_FILE, missingAudit, /required|r2Audit/u);

  const validSynthesis = clone(missingAudit);
  validSynthesis.r2Audit = validR2Audit();

  await expectValid(SCHEMA_FILE, validSynthesis);
});

test('phase10-wiki-page.schema rejects non-accepted synthesis R2 audit', async () => {
  const fixture = clone(validWikiPage);
  fixture.type = 'synthesis';
  fixture.r2Audit = {
    ...validR2Audit(),
    verdict: 'REDIRECT'
  };

  await expectInvalid(SCHEMA_FILE, fixture, /const|ACCEPT/u);
});

test('phase10-wiki-page.schema requires complete LAW 13 bridge fields in R2 audit', async () => {
  const fixture = clone(validWikiPage);
  fixture.type = 'synthesis';
  fixture.r2Audit = validR2Audit();
  delete fixture.r2Audit.law13ReviewExtension.queryNotProvenanceCheck;

  await expectInvalid(SCHEMA_FILE, fixture, /required|queryNotProvenanceCheck/u);
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
