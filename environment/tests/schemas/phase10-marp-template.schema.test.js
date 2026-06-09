import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-marp-template.schema.json';

const validMarpTemplate = {
  schemaVersion: 'phase10.marp-template.v1',
  templateId: 'MARP-001',
  domainId: 'KDOM-001',
  name: 'Evidence Review',
  theme: 'default',
  allowedDirectives: ['paginate', 'footer'],
  placeholders: ['title', 'body'],
  createdAt: ISO_TIME
};

test('phase10-marp-template.schema accepts template metadata without rendering behavior', async () => {
  await expectValid(SCHEMA_FILE, validMarpTemplate);
});

test('phase10-marp-template.schema requires allowed directives', async () => {
  const fixture = clone(validMarpTemplate);
  fixture.allowedDirectives = [];

  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});

test('phase10-marp-template.schema rejects embedded render commands', async () => {
  const fixture = clone(validMarpTemplate);
  fixture.renderCommand = 'marp deck.md';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
