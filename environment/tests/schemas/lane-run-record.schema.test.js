import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'lane-run-record.schema.json',
  suiteName: 'lane-run-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'ORCH-RUN-2026-04-10-001',
    laneId: 'execution',
    taskId: 'ORCH-TASK-2026-04-10-001',
    providerRef: 'openai/codex',
    integrationKind: 'local-cli',
    fallbackApplied: false,
    supervisionCapability: 'streaming',
    status: 'completed',
    attemptNumber: 1,
    threadId: 'thread-orch-001',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactRefs: [
      '.vibe-science-environment/results/experiments/EXP-001/'
    ],
    summary: 'Execution lane completed the bounded task successfully.',
    errorCode: null,
    warningCount: 0
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'RUN-2026-04-10-001',
    laneId: 'executor',
    taskId: 'ORCH-TASK-2026-04-10-001',
    providerRef: 'openai/codex',
    integrationKind: 'local-cli',
    fallbackApplied: 'sometimes',
    supervisionCapability: 'realtime',
    status: 'stuck',
    attemptNumber: 0,
    threadId: 'thread-orch-002',
    startedAt: 'now',
    endedAt: ISO_DATE_LATER,
    artifactRefs: [],
    summary: 'This fixture should fail.',
    errorCode: null,
    warningCount: 0
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'ORCH-RUN-2026-04-10-002',
    laneId: 'review',
    taskId: null,
    providerRef: 'anthropic/claude-code',
    integrationKind: 'local-cli',
    fallbackApplied: false,
    supervisionCapability: 'output-only',
    status: 'degraded',
    attemptNumber: 1,
    threadId: null,
    startedAt: ISO_DATE,
    endedAt: null,
    artifactRefs: [],
    summary: null,
    errorCode: 'REVIEW-CONFLICT',
    warningCount: 2
  }
});
