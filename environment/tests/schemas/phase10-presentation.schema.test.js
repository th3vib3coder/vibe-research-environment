import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-presentation.schema.json';

const validPresentation = {
  schemaVersion: 'phase10.presentation.v1',
  presentationId: 'PRES-001',
  domainId: 'KDOM-001',
  title: 'Evidence Review Deck',
  sourcePageIds: ['WIKI-001'],
  exportRecipeId: 'EXPORT-001',
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
