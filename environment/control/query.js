import {
  getSessionSnapshot,
  publishSessionSnapshot
} from './session-snapshot.js';
import {
  getCapabilitiesSnapshot,
  publishCapabilitiesSnapshot
} from './capabilities.js';
import { openAttempt, updateAttempt, listAttempts } from './attempts.js';
import { appendEvent, listEvents } from './events.js';
import { appendDecision, listDecisions } from './decisions.js';
import { getMemoryFreshness } from '../memory/status.js';
import { getMemoryMarks } from '../memory/marks.js';
import { getResultsOverview } from '../flows/results-discovery.js';
import { getWritingOverview } from '../flows/writing-overview.js';

export {
  appendDecision,
  appendEvent,
  getCapabilitiesSnapshot,
  getSessionSnapshot,
  listAttempts,
  listDecisions,
  listEvents,
  getMemoryFreshness,
  getMemoryMarks,
  openAttempt,
  publishCapabilitiesSnapshot,
  publishSessionSnapshot,
  updateAttempt
};

export async function getOperatorStatus(projectPath) {
  const [session, capabilities, memory, marks, results, writing] = await Promise.all([
    getSessionSnapshot(projectPath),
    getCapabilitiesSnapshot(projectPath),
    getMemoryFreshness(projectPath),
    getMemoryMarks(projectPath),
    getResultsOverview(projectPath, {
      bundleLimit: 5,
      digestLimit: 5
    }),
    getWritingOverview(projectPath, {
      snapshotLimit: 5,
      exportLimit: 5,
      alertLimit: 5,
      packLimit: 5
    }),
  ]);

  return {
    session,
    capabilities,
    memory: {
      ...memory,
      marks
    },
    results,
    writing,
    hasSession: session !== null
  };
}

export async function getAttemptHistory(projectPath, filters = {}) {
  const attempts = await listAttempts(projectPath, filters);

  return Promise.all(
    attempts.map(async (attempt) => ({
      ...attempt,
      events: await listEvents(projectPath, {
        attemptId: attempt.attemptId,
        limit: filters.eventsPerAttempt ?? 50
      }),
      decisions: await listDecisions(projectPath, {
        attemptId: attempt.attemptId,
        limit: filters.decisionsPerAttempt ?? 50
      })
    }))
  );
}
