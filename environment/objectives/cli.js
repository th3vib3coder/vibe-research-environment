import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  now,
  readJsonl,
  resolveProjectRoot,
  withLock
} from '../control/_io.js';
import {
  activateObjective,
  ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH,
  activeObjectivePointerPath,
  objectiveDigestsDir,
  objectiveEventsPath,
  objectiveHandoffsPath,
  objectiveRecordPath,
  OBJECTIVES_ROOT_RELATIVE_PATH,
  OBJECTIVE_POINTER_LOCK_NAME,
  ObjectiveLockHeldError,
  pauseObjective,
  readActiveObjectivePointer,
  readObjectiveRecord,
  stopObjective,
  validateObjectiveRecord,
  writeObjectiveRecord
} from './store.js';
import {
  appendObjectiveEvent,
  countIterations,
  detectSnapshotDivergence,
  latestEvent,
  normalizeSlashes,
  readBlockerFlag,
  readResumeSnapshot,
  resumeSnapshotPath,
  writeResumeSnapshot
} from './resume-snapshot.js';
import { assertReviewer2Gate } from '../orchestrator/agent-orchestration.js';
import { logGovernanceEventViaPlugin } from '../orchestrator/governance-logger.js';

const OBJECTIVE_CLI_GOVERNANCE_SOURCE_COMPONENT = 'vre/objectives/cli';

async function recordObjectiveLifecycleGovernanceEvent(eventType, objectiveId, details) {
  try {
    await logGovernanceEventViaPlugin({
      event_type: eventType,
      source_component: OBJECTIVE_CLI_GOVERNANCE_SOURCE_COMPONENT,
      objective_id: objectiveId,
      severity: 'info',
      details
    });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'E_GOVERNANCE_BRIDGE_FAILED';
    process.stderr.write(`[phase9-governance] ${eventType} telemetry failed: ${code}\n`);
  }
}

function toRepoRelative(projectRoot, targetPath) {
  return normalizeSlashes(path.relative(projectRoot, targetPath));
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function digestLatestPath(projectRoot, objectiveId) {
  return path.join(
    resolveProjectRoot(projectRoot),
    OBJECTIVES_ROOT_RELATIVE_PATH,
    objectiveId,
    'digest-latest.md'
  );
}

function phase9SuccessPayload(command, extra = {}) {
  return {
    ok: true,
    command,
    phase9: true,
    ...extra
  };
}

export class ObjectiveCliError extends Error {
  constructor({ command, code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'ObjectiveCliError';
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

export function coerceObjectiveCliError(command, error) {
  if (error instanceof ObjectiveCliError) {
    return error;
  }

  if (error?.name === 'AgentOrchestrationError' && typeof error.code === 'string') {
    return new ObjectiveCliError({
      command,
      code: error.code,
      message: error.message,
      extra: error.extra ?? {},
    });
  }

  if (error instanceof ObjectiveLockHeldError) {
    return new ObjectiveCliError({
      command,
      code: 'OBJECTIVE_LOCK_HELD',
      message: error.message,
      extra: {
        activeObjectiveId: error.objectiveId,
        activePointer: error.pointerPath,
        stopCommand: error.stopCommand,
        pauseCommand: error.pauseCommand
      }
    });
  }

  const message = error?.message ?? String(error);
  if (message === 'No active objective pointer exists') {
    return new ObjectiveCliError({
      command,
      code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
      message
    });
  }

  const mismatchMatch = /^Active objective pointer references (.+), not (.+)$/u.exec(message);
  if (mismatchMatch) {
    return new ObjectiveCliError({
      command,
      code: 'E_OBJECTIVE_ID_MISMATCH',
      message,
      extra: {
        activeObjectiveId: mismatchMatch[1],
        requestedObjectiveId: mismatchMatch[2]
      }
    });
  }

  const invalidStateMatch = /^Cannot (pause|resume) objective in status (.+)$/u.exec(message);
  if (invalidStateMatch) {
    return new ObjectiveCliError({
      command,
      code: 'E_OBJECTIVE_STATE_INVALID',
      message,
      extra: {
        transition: invalidStateMatch[1],
        status: invalidStateMatch[2]
      }
    });
  }

  if (message === 'objective start requires --wake-policy for non-interactive modes') {
    return new ObjectiveCliError({
      command,
      code: 'E_WAKE_POLICY_REQUIRED',
      message,
      exitCode: 3
    });
  }

  if (message.startsWith('objective start requires --')) {
    return new ObjectiveCliError({
      command,
      code: 'E_OBJECTIVE_CLI_USAGE',
      message,
      exitCode: 3
    });
  }

  if (message.startsWith('objective ') && message.includes(' requires --')) {
    return new ObjectiveCliError({
      command,
      code: 'E_OBJECTIVE_CLI_USAGE',
      message,
      exitCode: 3
    });
  }

  if (message.startsWith('wakePolicy.') || message.startsWith('budget.')) {
    return new ObjectiveCliError({
      command,
      code: 'E_OBJECTIVE_INPUT_INVALID',
      message,
      exitCode: 3
    });
  }

  return new ObjectiveCliError({
    command,
    code: 'E_OBJECTIVE_COMMAND_FAILED',
    message
  });
}

async function listLatestDigest(projectRoot, objectiveId) {
  const digestsPath = objectiveDigestsDir(projectRoot, objectiveId);
  const digestAliasPath = digestLatestPath(projectRoot, objectiveId);
  try {
    const entries = (await readdir(digestsPath)).sort((left, right) => right.localeCompare(left));
    return {
      path: entries.length > 0 ? normalizeSlashes(path.join(OBJECTIVES_ROOT_RELATIVE_PATH, objectiveId, 'digests', entries[0])) : toRepoRelative(projectRoot, digestAliasPath),
      exists: entries.length > 0 || await pathExists(digestAliasPath)
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        path: toRepoRelative(projectRoot, digestAliasPath),
        exists: false
      };
    }
    throw error;
  }
}

function deriveLeaseStatus(currentWakeLease, timestamp) {
  if (!currentWakeLease || currentWakeLease.wakeId == null) {
    return 'idle';
  }

  if (
    currentWakeLease.leaseExpiresAt &&
    Date.parse(currentWakeLease.leaseExpiresAt) < Date.parse(timestamp)
  ) {
    return 'expired';
  }

  return 'held';
}

function extractStopReason(events) {
  return latestEvent(events, 'stop')?.payload?.reason ?? null;
}

function extractLastHeartbeatAt(events) {
  return latestEvent(events, 'heartbeat')?.ts ?? null;
}

function extractLatestBlocker(blocker, snapshot, events) {
  if (blocker.exists && blocker.code && blocker.message) {
    return {
      code: blocker.code,
      message: blocker.message
    };
  }

  const snapshotBlocker = snapshot?.openBlockers?.at(0);
  if (snapshotBlocker) {
    return {
      code: snapshotBlocker.code,
      message: snapshotBlocker.message
    };
  }

  const blockerEvent = latestEvent(events, 'blocker-open');
  if (blockerEvent) {
    return {
      code: blockerEvent.payload?.code ?? null,
      message: blockerEvent.payload?.message ?? null
    };
  }

  return {
    code: null,
    message: null
  };
}

async function persistHandshake(repoRoot, deps) {
  if (typeof deps.persistCapabilityHandshake !== 'function') {
    return null;
  }
  return deps.persistCapabilityHandshake(repoRoot);
}

async function generateHandshake(repoRoot, deps) {
  if (typeof deps.generateCapabilityHandshake !== 'function') {
    return null;
  }
  return deps.generateCapabilityHandshake(repoRoot);
}

export async function startObjectiveCommand(repoRoot, { objectiveRecord, sessionId }, deps = {}) {
  try {
    const activation = await activateObjective(repoRoot, objectiveRecord, {
      lockAcquiredBySession: sessionId
    });
    let persistedHandshake;
    try {
      persistedHandshake = await persistHandshake(repoRoot, deps);
    } catch (error) {
      await rm(activeObjectivePointerPath(repoRoot), { force: true }).catch(() => {});
      await rm(path.dirname(objectiveRecordPath(repoRoot, activation.objectiveRecord.objectiveId)), { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    await recordObjectiveLifecycleGovernanceEvent(
      'objective_started',
      activation.objectiveRecord.objectiveId,
      {
        runtimeMode: activation.objectiveRecord.runtimeMode,
        reasoningMode: activation.objectiveRecord.reasoningMode
      }
    );

    return phase9SuccessPayload('objective start', {
      objectiveId: activation.objectiveRecord.objectiveId,
      objectiveRecordPath: toRepoRelative(repoRoot, activation.objectiveRecordPath),
      activePointer: ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH,
      currentWakeLease: activation.activeObjectivePointer.currentWakeLease,
      handshakeArtifactPath: persistedHandshake
        ? toRepoRelative(repoRoot, persistedHandshake.artifactPath)
        : null,
      handshakeObjective: persistedHandshake?.handshake?.objective ?? null
    });
  } catch (error) {
    throw coerceObjectiveCliError('objective start', error);
  }
}

export async function pauseObjectiveCommand(repoRoot, { objectiveId, reason }, deps = {}) {
  try {
    const result = await pauseObjective(repoRoot, objectiveId);
    const snapshot = await writeResumeSnapshot(
      repoRoot,
      result.objectiveRecord,
      result.activeObjectivePointer,
      {
        writtenReason: 'operator-pause',
        notes: reason
      }
    );
    const persistedHandshake = await persistHandshake(repoRoot, deps);
    await recordObjectiveLifecycleGovernanceEvent('objective_paused', objectiveId, {
      pauseReason: 'operator-pause'
    });
    return phase9SuccessPayload('objective pause', {
      objectiveId,
      reason,
      status: result.objectiveRecord.status,
      activePointer: ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH,
      activePointerReleased: false,
      resumeSnapshotPath: toRepoRelative(repoRoot, snapshot.snapshotPath),
      handshakeArtifactPath: persistedHandshake
        ? toRepoRelative(repoRoot, persistedHandshake.artifactPath)
        : null,
      handshakeObjective: persistedHandshake?.handshake?.objective ?? null
    });
  } catch (error) {
    throw coerceObjectiveCliError('objective pause', error);
  }
}

export async function stopObjectiveCommand(repoRoot, { objectiveId, reason }, deps = {}) {
  try {
    const result = await stopObjective(repoRoot, objectiveId);
    const stopTimestamp = now();
    await appendObjectiveEvent(repoRoot, objectiveId, 'stop', {
      reason,
      status: result.objectiveRecord.status
    }, stopTimestamp);
    const snapshot = await writeResumeSnapshot(
      repoRoot,
      result.objectiveRecord,
      result.releasedPointer,
      {
        writtenReason: 'pre-stop',
        writtenAt: stopTimestamp,
        notes: reason
      }
    );
    const persistedHandshake = await persistHandshake(repoRoot, deps);
    await recordObjectiveLifecycleGovernanceEvent('objective_completed', objectiveId, {
      terminalStatus: result.objectiveRecord.status
    });
    return phase9SuccessPayload('objective stop', {
      objectiveId,
      reason,
      status: result.objectiveRecord.status,
      releasedPointer: result.releasedPointerPath,
      resumeSnapshotPath: toRepoRelative(repoRoot, snapshot.snapshotPath),
      handshakeArtifactPath: persistedHandshake
        ? toRepoRelative(repoRoot, persistedHandshake.artifactPath)
        : null,
      handshakeObjective: persistedHandshake?.handshake?.objective ?? null
    });
  } catch (error) {
    throw coerceObjectiveCliError('objective stop', error);
  }
}

export async function resumeObjectiveCommand(repoRoot, { objectiveId, repairSnapshot }, deps = {}) {
  try {
    // Must be `return await withLock(...)` and not `return withLock(...)`,
    // otherwise the outer try/catch exits before the inner withLock promise
    // rejects, and errors thrown inside the lock body (for example
    // "Cannot resume objective in status <status>" at line ~672 and
    // "No active objective pointer exists" at line ~662) bypass
    // coerceObjectiveCliError() and reach bin/vre as raw Error instead of
    // ObjectiveCliError, which in turn falls through the dispatcher
    // ObjectiveCliError branch (bin/vre:1117) and emits plain-text stderr
    // instead of structured JSON. Closes Round 48 D4.
    return await withLock(repoRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
      const activePointer = await readActiveObjectivePointer(repoRoot);
      if (!activePointer) {
        throw new Error('No active objective pointer exists');
      }
      if (activePointer.objectiveId !== objectiveId) {
        throw new Error(
          `Active objective pointer references ${activePointer.objectiveId}, not ${objectiveId}`
        );
      }

      const objectiveRecord = await readObjectiveRecord(repoRoot, objectiveId);
      if (!['paused', 'blocked'].includes(objectiveRecord.status)) {
        throw new Error(`Cannot resume objective in status ${objectiveRecord.status}`);
      }

      let snapshotState;
      snapshotState = await readResumeSnapshot(repoRoot, objectiveId);

      const divergence = detectSnapshotDivergence(snapshotState.snapshot, objectiveRecord);
      let repairEvent = null;
      let repairedSnapshotPath = null;
      if (divergence || snapshotState.validationError) {
        if (!repairSnapshot) {
          throw new ObjectiveCliError({
            command: 'objective resume',
            code: divergence?.code ?? 'E_RESUME_SNAPSHOT_INVALID',
            message: divergence?.message ?? snapshotState.validationError.message,
            extra: {
              objectiveId,
              resumeSnapshotPath: toRepoRelative(repoRoot, snapshotState.path)
            }
          });
        }

        const repaired = await writeResumeSnapshot(
          repoRoot,
          objectiveRecord,
          activePointer,
          {
            writtenReason: 'manual',
            notes: 'Rebuilt by objective resume --repair-snapshot'
          }
        );
        repairedSnapshotPath = repaired.snapshotPath;
        repairEvent = await appendObjectiveEvent(repoRoot, objectiveId, 'state-repair', {
          repairedLayer: 'snapshot',
          observedDivergence:
            divergence?.observedDivergence ??
            snapshotState.validationError?.message ??
            'resume-snapshot validation failed',
          repairedTo: 'resume-snapshot regenerated from pointer/objective/queue/events/handoffs',
          reason: 'objective resume --repair-snapshot'
        });
      }

      const eventsBeforeResume = await readJsonl(objectiveEventsPath(repoRoot, objectiveId));
      const blocker = await readBlockerFlag(repoRoot, objectiveId);
      let blockerResolved = false;
      if (blocker.exists) {
        if (blocker.code === 'SEMANTIC_DRIFT_DETECTED') {
          const latestR2Verdict = latestEvent(eventsBeforeResume, 'r2-verdict');
          assertReviewer2Gate('semantic-drift-resolution', {
            latestR2VerdictEventId: latestR2Verdict?.eventId ?? null,
            r2Verdict: latestR2Verdict?.payload ?? null,
          });
        }
        await appendObjectiveEvent(repoRoot, objectiveId, 'blocker-resolve', {
          code: blocker.code,
          message: blocker.message,
          snapshotPath: blocker.snapshotPath,
          resolvedBy: 'objective resume'
        });
        await rm(blocker.path, { force: true });
        blockerResolved = true;
      }

      const resumedRecord = {
        ...objectiveRecord,
        status: 'active',
        lastUpdatedAt: now()
      };
      await writeObjectiveRecord(repoRoot, resumedRecord);
      const resumeEvent = await appendObjectiveEvent(repoRoot, objectiveId, 'resume', {
        resumedFromStatus: objectiveRecord.status,
        repairSnapshot: Boolean(repairSnapshot),
        blockerResolved
      });
      const persistedHandshake = await persistHandshake(repoRoot, deps);
      await recordObjectiveLifecycleGovernanceEvent('objective_resumed', objectiveId, {
        repairSnapshot: Boolean(repairSnapshot),
        blockerResolved
      });

      return phase9SuccessPayload('objective resume', {
        objectiveId,
        status: resumedRecord.status,
        activePointer: ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH,
        repairSnapshotApplied: Boolean(repairEvent),
        blockerResolved,
        resumeSnapshotPath: toRepoRelative(
          repoRoot,
          repairedSnapshotPath ?? snapshotState.path
        ),
        latestEventId: resumeEvent.event.eventId,
        handshakeArtifactPath: persistedHandshake
          ? toRepoRelative(repoRoot, persistedHandshake.artifactPath)
          : null,
        handshakeObjective: persistedHandshake?.handshake?.objective ?? null
      });
    });
  } catch (error) {
    throw coerceObjectiveCliError('objective resume', error);
  }
}

export async function statusObjectiveCommand(repoRoot, { objectiveId }, deps = {}) {
  try {
    const objectiveRecord = await readObjectiveRecord(repoRoot, objectiveId).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new ObjectiveCliError({
          command: 'objective status',
          code: 'E_OBJECTIVE_NOT_FOUND',
          message: `Objective record not found for ${objectiveId}`
        });
      }
      throw error;
    });
    await validateObjectiveRecord(repoRoot, objectiveRecord);

    const activePointer = await readActiveObjectivePointer(repoRoot);
    const pointerForObjective = activePointer?.objectiveId === objectiveId ? activePointer : null;
    const snapshotState = await readResumeSnapshot(repoRoot, objectiveId).catch(() => ({
      exists: false,
      path: resumeSnapshotPath(repoRoot, objectiveId),
      snapshot: null
    }));
    const blocker = await readBlockerFlag(repoRoot, objectiveId);
    const events = await readJsonl(objectiveEventsPath(repoRoot, objectiveId));
    const handoffs = await readJsonl(objectiveHandoffsPath(repoRoot, objectiveId));
    const handshake = await generateHandshake(repoRoot, deps);
    const digestInfo = await listLatestDigest(repoRoot, objectiveId);
    const iterationsCompleted = countIterations(events);
    const wallClockConsumedSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(objectiveRecord.createdAt)) / 1000)
    );
    const latestBlocker = extractLatestBlocker(blocker, snapshotState.snapshot, events);

    return phase9SuccessPayload('objective status', {
      objectiveId: objectiveRecord.objectiveId,
      title: objectiveRecord.title,
      status: objectiveRecord.status,
      runtimeMode: objectiveRecord.runtimeMode,
      reasoningMode: objectiveRecord.reasoningMode,
      activePointer: pointerForObjective ? ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH : null,
      objectiveRecordPath: toRepoRelative(repoRoot, objectiveRecordPath(repoRoot, objectiveId)),
      wakePolicy: {
        wakeOwner: objectiveRecord.wakePolicy.wakeOwner,
        wakeSourceId: objectiveRecord.wakePolicy.wakeSourceId,
        heartbeatIntervalSeconds: objectiveRecord.budget.heartbeatIntervalSeconds,
        leaseTtlSeconds: objectiveRecord.wakePolicy.leaseTtlSeconds,
        duplicateWakePolicy: objectiveRecord.wakePolicy.duplicateWakePolicy,
        lastWakeId: pointerForObjective?.currentWakeLease?.wakeId ?? null,
        leaseStatus: deriveLeaseStatus(pointerForObjective?.currentWakeLease, now()),
        nextUnattendedSliceArmed:
          objectiveRecord.runtimeMode === 'unattended-batch' &&
          objectiveRecord.status === 'active' &&
          !blocker.exists &&
          (handshake?.vre?.missingSurfaces?.length ?? 0) === 0,
        currentWakeLease: pointerForObjective?.currentWakeLease ?? null
      },
      capabilitySummary: handshake == null
        ? null
        : {
            vrePresent: handshake.vrePresent,
            kernelMode: handshake.kernel.mode,
            memoryFresh: handshake.memory.fresh,
            degradedReasons: handshake.degradedReasons,
            missingSurfaces: handshake.vre.missingSurfaces
          },
      lastHeartbeatAt: extractLastHeartbeatAt(events),
      iterations: {
        completed: iterationsCompleted,
        max: objectiveRecord.budget.maxIterations
      },
      wallClock: {
        consumedSeconds: wallClockConsumedSeconds,
        maxSeconds: objectiveRecord.budget.maxWallSeconds
      },
      latestBlocker,
      latestStopReason: extractStopReason(events),
      resumeSnapshotPath: toRepoRelative(repoRoot, snapshotState.path),
      resumeSnapshotExists: snapshotState.exists,
      latestDigestPath: digestInfo.path,
      latestDigestExists: digestInfo.exists,
      eventLogPath: toRepoRelative(repoRoot, objectiveEventsPath(repoRoot, objectiveId)),
      handoffLedgerPath: toRepoRelative(repoRoot, objectiveHandoffsPath(repoRoot, objectiveId))
    });
  } catch (error) {
    throw coerceObjectiveCliError('objective status', error);
  }
}
