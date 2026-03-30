/**
 * Shared middleware chain — every /flow-* command runs through this.
 * Owns: attempt lifecycle, telemetry, capability refresh, snapshot publish.
 * Flow helpers own domain logic only; they do not open or close attempts.
 */

import { refreshCapabilitiesSnapshot, getCapabilitiesSnapshot } from './capabilities.js';
import { openAttempt, updateAttempt } from './attempts.js';
import { appendEvent } from './events.js';
import { rebuildSessionSnapshot } from './session-snapshot.js';
import { readFlowIndex } from '../lib/flow-state.js';

/**
 * Execute a command through the 7-step middleware chain.
 *
 * @param {Object} opts
 * @param {string} opts.projectPath  — project root
 * @param {string} opts.commandName  — e.g. '/flow-status'
 * @param {Object} opts.reader       — core-reader instance (or null/undefined)
 * @param {Function} opts.commandFn  — async (ctx) => result
 * @returns {Object} { result, attempt, snapshot }
 */
export async function runWithMiddleware({ projectPath, commandName, reader, commandFn }) {
  // Step 1: Refresh capability snapshot
  let capabilities;
  try {
    capabilities = await refreshCapabilitiesSnapshot(projectPath, reader);
  } catch {
    capabilities = await getCapabilitiesSnapshot(projectPath);
  }

  const degraded = !capabilities.kernel.dbAvailable;

  // Step 2: Open attempt
  const attempt = await openAttempt(projectPath, {
    scope: commandName,
    targetId: null
  });

  await appendEvent(projectPath, {
    kind: 'attempt_opened',
    attemptId: attempt.attemptId,
    scope: commandName,
    severity: 'info',
    message: `Opened attempt for ${commandName}`
  });

  // Step 3: Enforce degraded-mode policy (advisory, not blocking in V1)
  if (degraded) {
    await appendEvent(projectPath, {
      kind: 'degraded_mode_entered',
      attemptId: attempt.attemptId,
      scope: commandName,
      severity: 'warning',
      message: `Kernel DB unavailable — running in degraded mode`
    });
  }

  // Step 4: Execute command-specific logic
  let result;
  let finalStatus = 'succeeded';
  let errorCode = null;
  let summary = null;

  const ctx = {
    projectPath,
    commandName,
    reader,
    capabilities,
    attempt,
    degraded
  };

  try {
    result = await commandFn(ctx);
    summary = result?.summary ?? null;
  } catch (err) {
    finalStatus = 'failed';
    errorCode = err.code ?? err.name ?? 'COMMAND_ERROR';
    summary = err.message;
    result = { error: err.message };
  }

  // Step 5: Append telemetry events from command result
  const commandEvents = result?.events ?? [];
  for (const evt of commandEvents) {
    await appendEvent(projectPath, {
      ...evt,
      attemptId: attempt.attemptId
    });
  }

  const commandDecisions = result?.decisions ?? [];
  // Decisions are handled by the command itself via decisions.js

  // Step 6: Publish session snapshot
  let flowState = {};
  try {
    flowState = await readFlowIndex(projectPath);
  } catch { /* bootstrap may not have run yet */ }

  const snapshot = await rebuildSessionSnapshot(projectPath, {
    flowState,
    capabilities: capabilities.kernel?.projections ?? {},
    budget: { state: 'ok', toolCalls: 0, estimatedCostUsd: 0, countingMode: 'unknown' },
    signals: { staleMemory: false, unresolvedClaims: 0, blockedExperiments: 0, exportAlerts: 0 },
    kernel: {
      dbAvailable: capabilities.kernel?.dbAvailable ?? false,
      degradedReason: capabilities.kernel?.dbAvailable ? null : 'kernel DB unavailable'
    },
    lastCommand: commandName,
    lastAttemptId: attempt.attemptId
  });

  await appendEvent(projectPath, {
    kind: 'session_snapshot_published',
    attemptId: attempt.attemptId,
    scope: commandName,
    severity: 'info'
  });

  // Step 7: Close attempt
  const closedAttempt = await updateAttempt(projectPath, attempt.attemptId, {
    status: finalStatus,
    errorCode,
    summary
  });

  await appendEvent(projectPath, {
    kind: 'attempt_updated',
    attemptId: attempt.attemptId,
    scope: commandName,
    severity: finalStatus === 'failed' ? 'error' : 'info',
    message: `Attempt closed: ${finalStatus}`
  });

  return { result, attempt: closedAttempt, snapshot };
}
