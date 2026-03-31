import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'capabilities-snapshot.schema.json',
  suiteName: 'capabilities-snapshot.schema',
  validFixture: {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: true,
      projections: {
        overview: true,
        claimHeads: true,
        unresolvedClaims: true,
        citationChecks: false
      },
      advanced: {
        governanceProfileAtCreation: true,
        claimSearch: false,
        extraCompatibilityFlag: true
      }
    },
    install: {
      bundles: ['control-plane', 'flow-experiment']
    },
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: true,
      projections: {
        overview: true,
        claimHeads: true,
        unresolvedClaims: true
      },
      advanced: {
        governanceProfileAtCreation: true,
        claimSearch: false
      }
    },
    install: {
      bundles: ['control-plane']
    },
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: false,
      projections: {
        overview: false,
        claimHeads: false,
        unresolvedClaims: false,
        citationChecks: false
      },
      advanced: {
        governanceProfileAtCreation: false,
        claimSearch: false
      }
    },
    install: {
      bundles: []
    },
    updatedAt: ISO_DATE
  }
});
