import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'domain-pack.schema.json',
  suiteName: 'domain-pack.schema',
  validFixture: {
    schemaVersion: 'vibe-env.domain-pack.v1',
    packId: 'omics',
    displayName: 'Omics Research Pack',
    authorityBoundary: 'presets-only',
    domainAssumptions: [
      'Studies may depend on batch-sensitive assays.',
      'Reproducible experiment metadata matters for sequencing runs.'
    ],
    supportedWorkflows: [
      'literature',
      'experiment',
      'results',
      'writing'
    ],
    literatureSources: [
      'PubMed',
      'bioRxiv',
      'GEO'
    ],
    experimentPresets: {
      defaultFields: [
        'organism',
        'tissue',
        'cell_count',
        'sequencing_platform'
      ],
      commonConfounders: [
        'batch_effect',
        'dropout_rate',
        'cell_cycle_phase'
      ]
    },
    deliverableTemplates: [
      'omics-standard',
      'omics-advisor-pack'
    ],
    expectedConnectors: [
      'filesystem-export'
    ],
    advisoryHints: [
      'Call out batch handling explicitly.',
      'Keep cell-type annotation assumptions visible.'
    ],
    doesNotModify: [
      'claim truth',
      'citation truth',
      'gate semantics',
      'kernel stop behavior'
    ]
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.domain-pack.v1',
    packId: 'Omics',
    displayName: 'Omics Research Pack',
    authorityBoundary: 'runtime-authority',
    domainAssumptions: [],
    supportedWorkflows: [],
    literatureSources: [],
    experimentPresets: {
      defaultFields: [
        'organism'
      ]
    },
    deliverableTemplates: [],
    advisoryHints: [],
    doesNotModify: []
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.domain-pack.v1',
    packId: 'omics',
    displayName: 'Omics Research Pack',
    authorityBoundary: 'presets-only',
    domainAssumptions: [
      'Pack remains optional and safe to ignore.'
    ],
    supportedWorkflows: [
      'experiment',
      'writing'
    ],
    literatureSources: [
      'PubMed'
    ],
    experimentPresets: {
      defaultFields: [],
      commonConfounders: []
    },
    deliverableTemplates: [
      'default-results'
    ],
    expectedConnectors: [],
    advisoryHints: [],
    doesNotModify: [
      'claim truth',
      'citation truth'
    ]
  }
});
