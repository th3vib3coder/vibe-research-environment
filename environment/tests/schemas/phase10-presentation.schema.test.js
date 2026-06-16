import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-presentation.schema.json';

const validPresentation = {
  schemaVersion: 'phase10.presentation.v1',
  presentationId: 'PRES-001',
  domainId: 'KDOM-001',
  title: 'Evidence Review Deck',
  presentationUse: 'query-decision',
  sourcePageId: 'WIKI-001',
  sourcePageIds: ['WIKI-001'],
  exportRecipeId: 'EXPORT-001',
  templateId: 'MARP-001',
  templateVersion: 'a'.repeat(64),
  sourcePageSha: 'b'.repeat(64),
  provenanceManifestSha: 'c'.repeat(64),
  edgeManifestSha: 'd'.repeat(64),
  renderedContentSha: 'e'.repeat(64),
  decisionUseAtRender: 'decision-grade',
  epistemicBadge: 'DECISION-GRADE',
  epistemicBadgeRequired: true,
  renderedAt: ISO_TIME,
  renderedBy: 'phase10-marp-export',
  presentationStatus: 'active',
  stalenessPolicy: {
    maxSourceAgeDays: 30
  },
  createdAt: ISO_TIME
};

test('phase10-presentation.schema accepts source-backed presentation contracts', async () => {
  await expectValid(SCHEMA_FILE, validPresentation);
});

test('phase10-presentation.schema requires source wiki pages', async () => {
  const fixture = clone(validPresentation);
  fixture.sourcePageIds = [];

  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});

test('phase10-presentation.schema rejects render output fields', async () => {
  const fixture = clone(validPresentation);
  fixture.renderedPath = 'deck.pdf';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});

test('phase10-presentation.schema requires dependency graph SHAs', async () => {
  for (const field of ['sourcePageSha', 'provenanceManifestSha', 'edgeManifestSha', 'templateVersion']) {
    const fixture = clone(validPresentation);
    delete fixture[field];

    await expectInvalid(SCHEMA_FILE, fixture, /required/u);
  }
});

test('phase10-presentation.schema rejects invalid presentation status', async () => {
  const fixture = clone(validPresentation);
  fixture.presentationStatus = 'rewritten';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed|enum/u);
});
