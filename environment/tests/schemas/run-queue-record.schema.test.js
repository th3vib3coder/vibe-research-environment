import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'run-queue-record.schema.json',
  suiteName: 'run-queue-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.run-queue-record.v1',
    taskId: 'ORCH-TASK-2026-04-10-001',
    parentTaskId: null,
    eventKind: 'created',
    mode: 'execute',
    ownerLane: 'execution',
    status: 'ready',
    title: 'Regenerate advisor pack inputs',
    objective: 'Collect the latest experiment bundle and writing context.',
    targetRef: {
      kind: 'experiment',
      id: 'EXP-001'
    },
    taskInput: {
      snapshotId: 'WEXP-2026-04-10-001'
    },
    dependencyTaskIds: [],
    laneRunId: null,
    artifactRefs: [],
    statusReason: 'Dependencies satisfied.',
    escalationNeeded: false,
    createdAt: ISO_DATE,
    recordedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.run-queue-record.v1',
    taskId: 'TASK-2026-04-10-001',
    parentTaskId: null,
    eventKind: 'assigned',
    mode: 'plan',
    ownerLane: 'execution',
    status: 'open',
    title: 'Broken queue entry',
    objective: 'This should fail validation.',
    targetRef: {
      kind: 'experiment',
      id: 'EXP-001'
    },
    taskInput: 'not-an-object',
    dependencyTaskIds: [
      'TASK-DEP-001'
    ],
    laneRunId: null,
    artifactRefs: [],
    statusReason: 'Invalid enum and id usage.',
    escalationNeeded: false,
    createdAt: ISO_DATE,
    recordedAt: 'later'
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.run-queue-record.v1',
    taskId: 'ORCH-TASK-2026-04-10-002',
    parentTaskId: 'ORCH-TASK-2026-04-10-001',
    eventKind: 'recovery-update',
    mode: 'recover',
    ownerLane: 'coordination',
    status: 'blocked',
    title: null,
    objective: null,
    targetRef: null,
    taskInput: null,
    dependencyTaskIds: [
      'ORCH-TASK-2026-04-10-001'
    ],
    laneRunId: null,
    artifactRefs: [
      '.vibe-science-environment/orchestrator/recovery-log.jsonl#ORCH-REC-2026-04-10-001'
    ],
    statusReason: 'Blocked on operator decision after recovery attempt.',
    escalationNeeded: true,
    createdAt: null,
    recordedAt: ISO_DATE_LATER
  }
});
