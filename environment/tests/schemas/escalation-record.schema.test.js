import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'escalation-record.schema.json',
  suiteName: 'escalation-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.escalation-record.v1',
    escalationId: 'ORCH-ESC-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-001',
    laneRunId: 'ORCH-RUN-2026-04-10-001',
    status: 'pending',
    triggerKind: 'ambiguous-evidence',
    decisionNeeded: 'Confirm whether the advisor pack should include the low-confidence result.',
    contextShown: [
      '.vibe-science-environment/orchestrator/run-queue.jsonl#ORCH-TASK-2026-04-10-001',
      '.vibe-science-environment/orchestrator/lane-runs.jsonl#ORCH-RUN-2026-04-10-001'
    ],
    resolutionSummary: null,
    recordedAt: ISO_DATE,
    resolvedAt: null
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.escalation-record.v1',
    escalationId: 'ESC-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-001',
    laneRunId: null,
    status: 'open',
    triggerKind: 'unclear',
    decisionNeeded: '',
    contextShown: [],
    resolutionSummary: null,
    recordedAt: 'soon',
    resolvedAt: null
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.escalation-record.v1',
    escalationId: 'ORCH-ESC-2026-04-10-002',
    taskId: null,
    laneRunId: null,
    status: 'resolved',
    triggerKind: 'operator-request',
    decisionNeeded: 'Operator requested a manual pause before execution.',
    contextShown: [
      '.vibe-science-environment/orchestrator/router-session.json'
    ],
    resolutionSummary: 'Operator clarified the next task and allowed resume.',
    recordedAt: ISO_DATE,
    resolvedAt: ISO_DATE_LATER
  }
});
