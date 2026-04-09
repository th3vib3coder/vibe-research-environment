import {
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'router-session.schema.json',
  suiteName: 'router-session.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.router-session.v1',
    sessionId: 'ORCH-SESSION-2026-04-10-001',
    currentMode: 'execute',
    objective: 'Prepare an updated advisor pack from the latest validated results.',
    activeThreadId: 'thread-orch-001',
    currentTarget: {
      kind: 'experiment',
      id: 'EXP-001',
      label: 'Differential expression rerun'
    },
    queueFocusTaskId: 'ORCH-TASK-2026-04-10-001',
    escalationState: {
      status: 'none',
      pendingEscalationId: null,
      summary: null
    },
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.router-session.v1',
    sessionId: 'SESSION-2026-04-10-001',
    currentMode: 'plan',
    objective: 'Invalid mode and identifiers.',
    activeThreadId: 'thread-orch-002',
    currentTarget: {
      kind: 'unknown',
      id: ''
    },
    queueFocusTaskId: 'TASK-2026-04-10-001',
    escalationState: {
      status: 'open',
      pendingEscalationId: 'ESC-001',
      summary: null
    },
    updatedAt: 'today'
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.router-session.v1',
    sessionId: null,
    currentMode: 'monitor',
    objective: null,
    activeThreadId: null,
    currentTarget: null,
    queueFocusTaskId: null,
    escalationState: {
      status: 'pending',
      pendingEscalationId: 'ORCH-ESC-2026-04-10-001',
      summary: 'Awaiting operator guidance before resuming.'
    },
    updatedAt: ISO_DATE
  }
});
