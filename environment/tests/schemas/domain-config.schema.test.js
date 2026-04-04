import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'domain-config.schema.json',
  suiteName: 'domain-config.schema',
  validFixture: {
    schemaVersion: 'vibe-env.domain-config.v1',
    activePackId: 'omics',
    displayName: 'Single-Cell Omics',
    updatedAt: ISO_DATE,
    authorityBoundary: 'presets-only',
    literatureSources: [
      'PubMed',
      'bioRxiv',
      'GEO'
    ],
    workflowPresets: {
      defaultExperimentFields: [
        'organism',
        'tissue',
        'cell_count'
      ],
      commonConfounders: [
        'batch_effect',
        'dropout_rate'
      ]
    },
    deliverablePresets: {
      reportTemplate: 'omics-standard',
      writingPackTemplate: 'omics-advisor-pack'
    },
    expectedConnectors: [
      'filesystem-export'
    ]
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.domain-config.v1',
    activePackId: 'Omics',
    displayName: 'Single-Cell Omics',
    updatedAt: ISO_DATE,
    authorityBoundary: 'full-authority',
    literatureSources: [],
    workflowPresets: {
      defaultExperimentFields: [
        'organism'
      ]
    },
    deliverablePresets: {
      reportTemplate: 'omics-standard',
      writingPackTemplate: 'omics-advisor-pack'
    }
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.domain-config.v1',
    activePackId: 'omics',
    displayName: 'Single-Cell Omics',
    updatedAt: ISO_DATE,
    authorityBoundary: 'presets-only',
    literatureSources: [
      'PubMed'
    ],
    workflowPresets: {
      defaultExperimentFields: [],
      commonConfounders: []
    },
    deliverablePresets: {
      reportTemplate: null,
      writingPackTemplate: null
    },
    expectedConnectors: []
  }
});
