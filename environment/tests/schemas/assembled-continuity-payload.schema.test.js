import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'assembled-continuity-payload.schema.json',
  suiteName: 'assembled-continuity-payload.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.assembled-continuity-payload.v1',
    stableProfile: {
      operator: {
        reportVerbosity: 'concise'
      }
    },
    dynamicContext: {
      activeObjective: 'Prepare the advisor digest.',
      openBlockers: [
        'Awaiting final literature confirmation.'
      ]
    },
    retrievalHits: [
      {
        hitId: 'recall-001',
        sourceType: 'decision-log',
        title: 'Advisor reporting cadence',
        summary: 'Use weekly digests for advisor updates unless blocked.',
        sourceRef: '.vibe-science-environment/control/decisions.jsonl#DEC-2026-04-10-001',
        recordedAt: ISO_DATE,
        isStale: false
      }
    ],
    sourceRefs: [
      {
        sourceType: 'decision-log',
        label: 'Decision ledger',
        ref: '.vibe-science-environment/control/decisions.jsonl#DEC-2026-04-10-001',
        recordedAt: ISO_DATE
      }
    ],
    warnings: [],
    totalTokens: 824,
    truncated: false,
    assembledAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.assembled-continuity-payload.v1',
    stableProfile: {},
    dynamicContext: {},
    retrievalHits: [
      {
        hitId: 'recall-001',
        sourceType: 'chat-memory',
        summary: 'Invalid source type.',
        sourceRef: '',
        isStale: 'no'
      }
    ],
    sourceRefs: [],
    warnings: [],
    totalTokens: -5,
    truncated: 'no',
    assembledAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.assembled-continuity-payload.v1',
    stableProfile: {},
    dynamicContext: {},
    retrievalHits: [],
    sourceRefs: [],
    warnings: [
      'Recall hits were truncated to stay within the continuity sub-budget.'
    ],
    totalTokens: 1200,
    truncated: true,
    assembledAt: ISO_DATE_LATER
  }
});
