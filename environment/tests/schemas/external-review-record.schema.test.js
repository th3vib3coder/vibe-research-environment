import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'external-review-record.schema.json',
  suiteName: 'external-review-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.external-review-record.v1',
    externalReviewId: 'ORCH-REVIEW-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-010',
    executionLaneRunId: 'ORCH-RUN-2026-04-10-010',
    reviewLaneRunId: 'ORCH-RUN-2026-04-10-011',
    verdict: 'challenged',
    materialMismatch: true,
    summary: 'The review lane found an unsupported recommendation in the draft summary.',
    comparedArtifactRefs: [
      '.vibe-science-environment/writing/advisor-packs/2026-04-10/draft.md',
      '.vibe-science-environment/orchestrator/external-review-log.jsonl#ORCH-REVIEW-2026-04-10-001'
    ],
    followUpAction: 'escalate',
    escalationId: 'ORCH-ESC-2026-04-10-010',
    recordedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.external-review-record.v1',
    externalReviewId: 'REVIEW-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-010',
    executionLaneRunId: 'ORCH-RUN-2026-04-10-010',
    reviewLaneRunId: 'ORCH-RUN-2026-04-10-011',
    verdict: 'approved',
    materialMismatch: false,
    summary: 'This should fail.',
    comparedArtifactRefs: [],
    followUpAction: 'ship',
    escalationId: null,
    recordedAt: 'today'
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.external-review-record.v1',
    externalReviewId: 'ORCH-REVIEW-2026-04-10-002',
    taskId: 'ORCH-TASK-2026-04-10-011',
    executionLaneRunId: 'ORCH-RUN-2026-04-10-012',
    reviewLaneRunId: 'ORCH-RUN-2026-04-10-013',
    verdict: 'inconclusive',
    materialMismatch: false,
    summary: null,
    comparedArtifactRefs: [
      '.vibe-science-environment/orchestrator/lane-runs.jsonl#ORCH-RUN-2026-04-10-013'
    ],
    followUpAction: 'accept-with-warning',
    escalationId: null,
    recordedAt: ISO_DATE_LATER
  }
});
