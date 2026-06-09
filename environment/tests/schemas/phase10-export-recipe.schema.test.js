import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-export-recipe.schema.json';

const validExportRecipe = {
  schemaVersion: 'phase10.export-recipe.v1',
  exportRecipeId: 'EXPORT-001',
  domainId: 'KDOM-001',
  format: 'marp',
  sourcePageIds: ['WIKI-001'],
  compilePolicyId: 'CP-001',
  guardPolicy: {
    requireFreshSources: true,
    requireCitations: true
  },
  createdAt: ISO_TIME
};

test('phase10-export-recipe.schema accepts guarded export recipes', async () => {
  await expectValid(SCHEMA_FILE, validExportRecipe);
});

test('phase10-export-recipe.schema rejects unknown export formats', async () => {
  const fixture = clone(validExportRecipe);
  fixture.format = 'telepathic';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-export-recipe.schema rejects behavior/output paths', async () => {
  const fixture = clone(validExportRecipe);
  fixture.renderCommand = 'marp --pdf';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
