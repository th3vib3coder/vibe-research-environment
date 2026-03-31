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

export {
  appendDecision,
  appendEvent,
  getCapabilitiesSnapshot,
  getSessionSnapshot,
  listAttempts,
  listDecisions,
  listEvents,
  openAttempt,
  publishCapabilitiesSnapshot,
  publishSessionSnapshot,
  updateAttempt
};

export async function getOperatorStatus(projectPath) {
  const [session, capabilities] = await Promise.all([
    getSessionSnapshot(projectPath),
    getCapabilitiesSnapshot(projectPath)
  ]);

  return {
    session,
    capabilities,
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
