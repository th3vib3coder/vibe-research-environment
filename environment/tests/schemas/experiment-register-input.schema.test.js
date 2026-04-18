import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'experiment-register-input.schema.json',
  suiteName: 'experiment-register-input.schema',
  validFixture: {
    title: 'Example scRNA-seq QC run',
    objective: 'Validate cell-level QC thresholds on test dataset.',
    status: 'planned',
    parameters: { minCellsPerGene: 3, minGenesPerCell: 200 },
    inputArtifacts: ['datasets/pbmc3k/raw.h5ad'],
    relatedClaims: ['C-001'],
  },
  // Missing required `objective` → rejection.
  invalidFixture: {
    title: 'Missing objective',
  },
  // Minimal: only required fields present.
  degradedFixture: {
    title: 'Minimal manifest title',
    objective: 'Minimal objective text.',
  },
});
