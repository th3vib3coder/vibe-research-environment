/**
 * Query helper layer — stable composition surface over control-plane state.
 * Commands call this instead of scraping scattered files.
 */

import { getSessionSnapshot } from './session-snapshot.js';
import { getCapabilitiesSnapshot } from './capabilities.js';
import { listAttempts } from './attempts.js';
import { listEvents } from './events.js';
import { listDecisions } from './decisions.js';

// Re-export individual list functions for direct access
export { listAttempts } from './attempts.js';
export { listEvents } from './events.js';
export { listDecisions } from './decisions.js';
export { getSessionSnapshot } from './session-snapshot.js';
export { getCapabilitiesSnapshot } from './capabilities.js';

/**
 * Merged operator status: session snapshot + capabilities in one call.
 */
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

/**
 * Attempt history with linked telemetry events.
 */
export async function getAttemptHistory(projectPath, filters = {}) {
  const attempts = await listAttempts(projectPath, filters);

  // For each attempt, attach its linked events
  const enriched = await Promise.all(
    attempts.map(async (attempt) => {
      const events = await listEvents(projectPath, {
        attemptId: attempt.attemptId,
        limit: filters.eventsPerAttempt ?? 50
      });
      return { ...attempt, events };
    })
  );

  return enriched;
}
