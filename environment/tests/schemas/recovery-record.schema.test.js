import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'recovery-record.schema.json',
  suiteName: 'recovery-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.recovery-record.v1',
    recoveryId: 'ORCH-REC-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-001',
    laneRunId: 'ORCH-RUN-2026-04-10-001',
    failureClass: 'tool-failure',
    recoveryAction: 'retry-with-backoff',
    attemptNumber: 2,
    nextLaneId: null,
    result: 'completed',
    cooldownUntil: null,
    escalationId: null,
    summary: 'Retry succeeded after a transient tool failure.',
    recordedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.recovery-record.v1',
    recoveryId: 'REC-2026-04-10-001',
    taskId: 'ORCH-TASK-2026-04-10-001',
    laneRunId: null,
    failureClass: 'timeout',
    recoveryAction: 'retry-forever',
    attemptNumber: 0,
    nextLaneId: null,
    result: 'done',
    cooldownUntil: null,
    escalationId: null,
    summary: 'Invalid recovery values.',
    recordedAt: 'later'
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.recovery-record.v1',
    recoveryId: 'ORCH-REC-2026-04-10-002',
    taskId: 'ORCH-TASK-2026-04-10-002',
    laneRunId: null,
    failureClass: 'state-conflict-or-corruption',
    recoveryAction: 'stop-and-preserve-state',
    attemptNumber: null,
    nextLaneId: null,
    result: 'escalated',
    cooldownUntil: null,
    escalationId: 'ORCH-ESC-2026-04-10-001',
    summary: 'Preserved state and escalated for repair.',
    recordedAt: ISO_DATE_LATER
  }
});
