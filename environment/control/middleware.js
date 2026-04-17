import { refreshCapabilitiesSnapshot, getCapabilitiesSnapshot } from './capabilities.js';
import { openAttempt, updateAttempt } from './attempts.js';
import { appendDecision } from './decisions.js';
import { appendEvent } from './events.js';
import { rebuildSessionSnapshot } from './session-snapshot.js';
import { readFlowIndex } from '../lib/flow-state.js';
import { listManifests } from '../lib/manifest.js';
import { getMemoryFreshness } from '../memory/status.js';
import { getWritingSignalSummary } from '../flows/writing-overview.js';

const FINAL_ATTEMPT_STATUSES = new Set([
  'succeeded',
  'failed',
  'blocked',
  'timeout',
  'unresponsive',
  'abandoned'
]);
const BUDGET_ADVISORY_RATIO = 0.8;

function normalizeScope(commandName, explicitScope) {
  const source = explicitScope ?? commandName;
  if (typeof source !== 'string' || source.trim() === '') {
    return 'control';
  }

  return source.replace(/^\//u, '');
}

function normalizeFlowName(scope) {
  if (scope === 'flow-status') {
    return 'control';
  }

  if (scope.startsWith('flow-')) {
    return scope.slice(5);
  }

  return 'control';
}

function buildBudgetSnapshot(metricsAccumulator, explicitBudget = {}) {
  const metrics = metricsAccumulator?.snapshot?.() ?? {};
  const estimatedCostUsd = explicitBudget.estimatedCostUsd ?? metrics.estimatedCostUsd ?? 0;
  const maxUsd = explicitBudget.maxUsd ?? null;
  let state = explicitBudget.state ?? null;

  if (state == null && Number.isFinite(estimatedCostUsd) && Number.isFinite(maxUsd) && maxUsd > 0) {
    const ratio = estimatedCostUsd / maxUsd;
    if (ratio >= 1) {
      state = 'hard_stop';
    } else if (ratio >= BUDGET_ADVISORY_RATIO) {
      state = 'advisory';
    } else {
      state = 'ok';
    }
  }

  state ??= metrics.budgetState ?? metrics.state ?? 'unknown';

  return {
    state,
    toolCalls: explicitBudget.toolCalls ?? metrics.toolCalls ?? 0,
    estimatedCostUsd,
    countingMode: explicitBudget.countingMode ?? metrics.countingMode ?? 'unknown'
  };
}

function normalizeCommandResult(result) {
  return {
    events: Array.isArray(result?.events) ? result.events : [],
    decisions: Array.isArray(result?.decisions) ? result.decisions : [],
    signals: result?.signals ?? {},
    summary: result?.summary ?? null,
    errorCode: result?.errorCode ?? null,
    attemptStatus: result?.attemptStatus ?? 'succeeded',
    payload: result ?? {}
  };
}

function normalizeKernelState(capabilities, reader) {
  const dbAvailable = Boolean(capabilities.kernel?.dbAvailable);
  return {
    dbAvailable,
    degradedReason: dbAvailable ? null : reader?.error ?? 'kernel DB unavailable'
  };
}

async function safeReadFlowState(projectPath) {
  try {
    return await readFlowIndex(projectPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function appendResultEvents(projectPath, attempt, scope, targetId, events) {
  for (const event of events) {
    await appendEvent(projectPath, {
      ...event,
      attemptId: event.attemptId ?? attempt.attemptId,
      scope: event.scope ?? scope,
      targetId: event.targetId ?? targetId ?? null
    });
    await updateAttempt(projectPath, attempt.attemptId, {
      status: 'running'
    });
  }
}

async function appendResultDecisions(projectPath, attempt, flow, targetId, decisions) {
  for (const decision of decisions) {
    await appendDecision(projectPath, {
      ...decision,
      flow: decision.flow ?? flow,
      attemptId: decision.attemptId ?? attempt.attemptId,
      targetId: decision.targetId ?? targetId ?? null
    });
  }
}

async function deriveSignals(projectPath, reader, explicitSignals = {}) {
  const memoryFreshness =
    explicitSignals.staleMemory === undefined
      ? await getMemoryFreshness(projectPath)
      : null;
  const writingSignals =
    explicitSignals.exportAlerts === undefined
      ? await getWritingSignalSummary(projectPath)
      : null;
  let unresolvedClaims = explicitSignals.unresolvedClaims;
  let kernelSignalProvenance = unresolvedClaims === undefined ? 'fallback' : 'explicit';
  let provenanceReason = null;
  let lastKernelContactAt = null;

  if (unresolvedClaims === undefined) {
    if (reader?.dbAvailable && typeof reader.listUnresolvedClaims === 'function') {
      try {
        unresolvedClaims = (await reader.listUnresolvedClaims())?.length ?? 0;
        kernelSignalProvenance = 'kernel';
        lastKernelContactAt = new Date().toISOString();
      } catch (error) {
        unresolvedClaims = 0;
        kernelSignalProvenance = 'mixed';
        provenanceReason = error.message;
      }
    } else {
      unresolvedClaims = 0;
      kernelSignalProvenance = 'fallback';
      provenanceReason = reader?.error ?? 'kernel DB unavailable';
    }
  }

  const blockedExperiments =
    explicitSignals.blockedExperiments ??
    (await listManifests(projectPath, { status: 'blocked' })).length;

  const exportAlerts =
    explicitSignals.exportAlerts ?? writingSignals?.totalAlerts ?? 0;

  const sourceMode = explicitSignals.provenance?.sourceMode
    ?? resolveSignalSourceMode(kernelSignalProvenance);

  return {
    staleMemory: explicitSignals.staleMemory ?? memoryFreshness?.isStale ?? false,
    unresolvedClaims,
    blockedExperiments,
    exportAlerts,
    provenance: explicitSignals.provenance ?? {
      sourceMode,
      degradedReason: sourceMode === 'kernel-backed'
        ? null
        : provenanceReason ?? reader?.error ?? 'kernel DB unavailable',
      lastKernelContactAt,
    }
  };
}

function resolveSignalSourceMode(kernelSignalProvenance) {
  if (kernelSignalProvenance === 'kernel') {
    return 'kernel-backed';
  }

  if (kernelSignalProvenance === 'mixed' || kernelSignalProvenance === 'explicit') {
    return 'mixed';
  }

  return 'degraded';
}

export async function runWithMiddleware({
  projectPath,
  commandName,
  reader,
  commandFn,
  metricsAccumulator = null,
  budget = {},
  scope = null,
  targetId = null
}) {
  const normalizedScope = normalizeScope(commandName, scope);
  const flow = normalizeFlowName(normalizedScope);

  let capabilities;
  try {
    capabilities = await refreshCapabilitiesSnapshot(projectPath, reader);
  } catch {
    capabilities = await getCapabilitiesSnapshot(projectPath);
  }

  const attempt = await openAttempt(projectPath, {
    scope: normalizedScope,
    targetId
  });

  await appendEvent(projectPath, {
    kind: 'attempt_opened',
    attemptId: attempt.attemptId,
    scope: normalizedScope,
    targetId,
    severity: 'info',
    message: `Opened attempt for ${commandName}`
  });

  const runningAttempt = await updateAttempt(projectPath, attempt.attemptId, {
    status: 'running'
  });

  const kernel = normalizeKernelState(capabilities, reader);
  if (!kernel.dbAvailable) {
    await appendEvent(projectPath, {
      kind: 'degraded_mode_entered',
      attemptId: runningAttempt.attemptId,
      scope: normalizedScope,
      targetId,
      severity: 'warning',
      message: kernel.degradedReason
    });
  }

  const budgetBefore = buildBudgetSnapshot(metricsAccumulator, budget);
  if (budgetBefore.state === 'advisory') {
    await appendEvent(projectPath, {
      kind: 'budget_advisory_entered',
      attemptId: runningAttempt.attemptId,
      scope: normalizedScope,
      targetId,
      severity: 'warning',
      message: 'Budget advisory threshold reached.'
    });
  }

  if (budgetBefore.state === 'hard_stop') {
    const reason = 'Budget exceeded. R2 review required.';

    await appendEvent(projectPath, {
      kind: 'budget_stop_triggered',
      attemptId: runningAttempt.attemptId,
      scope: normalizedScope,
      targetId,
      severity: 'warning',
      message: reason
    });
    await appendDecision(projectPath, {
      flow,
      targetId,
      attemptId: runningAttempt.attemptId,
      kind: 'budget_hard_stop',
      reason
    });

    let snapshot = null;
    let closedAttempt;

    try {
      const flowState = await safeReadFlowState(projectPath);
      const signals = await deriveSignals(projectPath, reader, {});
      snapshot = await rebuildSessionSnapshot(projectPath, {
        flowState,
        capabilities,
        budget: budgetBefore,
        signals,
        kernel,
        lastCommand: commandName,
        lastAttemptId: runningAttempt.attemptId
      });

      await appendEvent(projectPath, {
        kind: 'session_snapshot_published',
        attemptId: runningAttempt.attemptId,
        scope: normalizedScope,
        targetId,
        severity: 'info'
      });

      closedAttempt = await updateAttempt(projectPath, runningAttempt.attemptId, {
        status: 'blocked',
        errorCode: 'BUDGET_HARD_STOP',
        summary: reason
      });
    } catch (error) {
      closedAttempt = await updateAttempt(projectPath, runningAttempt.attemptId, {
        status: 'failed',
        errorCode: 'SESSION_SNAPSHOT_FAILED',
        summary: error.message
      });
      return {
        result: {
          error: error.message
        },
        attempt: closedAttempt,
        snapshot: null
      };
    }

    await appendEvent(projectPath, {
      kind: 'attempt_updated',
      attemptId: runningAttempt.attemptId,
      scope: normalizedScope,
      targetId,
      severity: 'warning',
      message: 'Attempt closed: blocked'
    });

    return {
      result: {
        blocked: true,
        reason
      },
      attempt: closedAttempt,
      snapshot
    };
  }

  let normalizedResult;
  try {
    normalizedResult = normalizeCommandResult(
      await commandFn({
        projectPath,
        commandName,
        scope: normalizedScope,
        flow,
        reader,
        capabilities,
        attempt: runningAttempt,
        degraded: !kernel.dbAvailable,
        budget: budgetBefore
      })
    );
  } catch (error) {
    normalizedResult = {
      events: [],
      decisions: [],
      signals: {},
      summary: error.message,
      errorCode: error.code ?? error.name ?? 'COMMAND_ERROR',
      attemptStatus: 'failed',
      payload: {
        error: error.message
      }
    };
  }

  await appendResultEvents(
    projectPath,
    runningAttempt,
    normalizedScope,
    targetId,
    normalizedResult.events
  );
  await appendResultDecisions(
    projectPath,
    runningAttempt,
    flow,
    targetId,
    normalizedResult.decisions
  );

  const budgetAfter = buildBudgetSnapshot(metricsAccumulator, budget);
  let snapshot = null;
  let finalStatus = FINAL_ATTEMPT_STATUSES.has(normalizedResult.attemptStatus)
    ? normalizedResult.attemptStatus
    : 'succeeded';
  let errorCode = normalizedResult.errorCode;
  let summary = normalizedResult.summary;
  let resultPayload = normalizedResult.payload;

  try {
    const flowState = await safeReadFlowState(projectPath);
    const signals = await deriveSignals(
      projectPath,
      reader,
      normalizedResult.signals
    );
    snapshot = await rebuildSessionSnapshot(projectPath, {
      flowState,
      capabilities,
      budget: budgetAfter,
      signals,
      kernel,
      lastCommand: commandName,
      lastAttemptId: runningAttempt.attemptId
    });

    await appendEvent(projectPath, {
      kind: 'session_snapshot_published',
      attemptId: runningAttempt.attemptId,
      scope: normalizedScope,
      targetId,
      severity: 'info'
    });
  } catch (error) {
    finalStatus = 'failed';
    errorCode = 'SESSION_SNAPSHOT_FAILED';
    summary = error.message;
    resultPayload = {
      error: error.message
    };
  }

  const closedAttempt = await updateAttempt(projectPath, runningAttempt.attemptId, {
    status: finalStatus,
    errorCode,
    summary
  });

  await appendEvent(projectPath, {
    kind: 'attempt_updated',
    attemptId: runningAttempt.attemptId,
    scope: normalizedScope,
    targetId,
    severity: finalStatus === 'failed' ? 'error' : finalStatus === 'blocked' ? 'warning' : 'info',
    message: `Attempt closed: ${finalStatus}`
  });

  return {
    result: resultPayload,
    attempt: closedAttempt,
    snapshot
  };
}
