import { access, appendFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now,
  readJson,
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
  OBJECTIVE_EVENTS_FILE,
  OBJECTIVE_POINTER_LOCK_NAME,
  OBJECTIVE_SCHEMA_FILE,
  ObjectiveLockHeldError,
  pauseObjective,
  readActiveObjectivePointer,
  readObjectiveRecord,
  stopObjective
} from './store.js';

const RESUME_SNAPSHOT_FILE = 'resume-snapshot.json';
const RESUME_SNAPSHOT_SCHEMA_FILE = 'phase9-resume-snapshot.schema.json';
const OBJECTIVE_EVENT_SCHEMA_FILE = 'phase9-objective-event.schema.json';
const BLOCKER_FLAG_FILE = 'BLOCKER.flag';
const OBJECTIVES_ROOT_RELATIVE_PATH = '.vibe-science-environment/objectives';

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
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

function resumeSnapshotPath(projectRoot, objectiveId) {
  return path.join(path.dirname(objectiveRecordPath(projectRoot, objectiveId)), RESUME_SNAPSHOT_FILE);
}

function blockerFlagPath(projectRoot, objectiveId) {
  return path.join(path.dirname(objectiveRecordPath(projectRoot, objectiveId)), BLOCKER_FLAG_FILE);
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

async function validateObjectiveRecord(projectRoot, objectiveRecord) {
  const validate = await loadValidator(projectRoot, OBJECTIVE_SCHEMA_FILE);
  assertValid(validate, objectiveRecord, 'phase9 objective');
}

async function writeObjectiveRecord(projectRoot, objectiveRecord) {
  await validateObjectiveRecord(projectRoot, objectiveRecord);
  const recordPath = objectiveRecordPath(projectRoot, objectiveRecord.objectiveId);
  await atomicWriteJson(recordPath, objectiveRecord);
  return recordPath;
}

async function appendObjectiveEvent(projectRoot, objectiveId, kind, payload, timestamp = now()) {
  const eventsPath = objectiveEventsPath(projectRoot, objectiveId);
  return withLock(projectRoot, `${objectiveId}-${OBJECTIVE_EVENTS_FILE}`, async () => {
    const existingEvents = await readJsonl(eventsPath);
    const recordSeq = (existingEvents.at(-1)?.recordSeq ?? 0) + 1;
    const event = {
      schemaVersion: 'phase9.objective-event.v1',
      objectiveId,
      eventId: `EV-${String(recordSeq).padStart(4, '0')}`,
      ts: timestamp,
      recordSeq,
      kind,
      payload
    };
    const validate = await loadValidator(projectRoot, OBJECTIVE_EVENT_SCHEMA_FILE);
    assertValid(validate, event, 'phase9 objective event');
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    return {
      event,
      eventsPath
    };
  });
}

function deriveStageCursor(objectiveRecord) {
  const stages = Array.isArray(objectiveRecord.stages) ? objectiveRecord.stages : [];
  const currentStage = stages.find((stage) => stage.status !== 'completed') ?? stages.at(-1) ?? null;
  const lastCompleteStage = [...stages]
    .reverse()
    .find((stage) => stage.status === 'completed')?.stageId ?? null;

  return {
    current: currentStage?.stageId ?? 'orientation',
    stageStatus: currentStage?.status ?? objectiveRecord.status,
    lastCompleteStage
  };
}

function deriveOpenHandoffs(handoffs) {
  const closedIds = new Set(
    handoffs
      .map((entry) => entry.closesHandoffId)
      .filter((value) => typeof value === 'string' && value.trim() !== '')
  );

  return handoffs
    .filter((entry) => !closedIds.has(entry.handoffId))
    .map((entry) => entry.handoffId)
    .sort((left, right) => left.localeCompare(right));
}

function parseBlockerFlag(rawBlocker) {
  const entries = Object.fromEntries(
    rawBlocker
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return separator < 0
          ? [line, '']
          : [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

  return {
    code: entries.BLOCKER_CODE ?? null,
    message: entries.BLOCKER_MESSAGE ?? null,
    objectiveId: entries.OBJECTIVE_ID ?? null,
    snapshotPath: entries.SNAPSHOT_PATH ?? null,
    writtenAt: entries.WRITTEN_AT ?? null
  };
}

async function readBlockerFlag(projectRoot, objectiveId) {
  const flagPath = blockerFlagPath(projectRoot, objectiveId);
  try {
    const raw = await readFile(flagPath, 'utf8');
    return {
      exists: true,
      raw,
      path: flagPath,
      ...parseBlockerFlag(raw)
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        raw: null,
        path: flagPath,
        code: null,
        message: null,
        objectiveId: null,
        snapshotPath: null,
        writtenAt: null
      };
    }
    throw error;
  }
}

async function readResumeSnapshot(projectRoot, objectiveId) {
  const snapshotPath = resumeSnapshotPath(projectRoot, objectiveId);
  if (!(await pathExists(snapshotPath))) {
    return {
      exists: false,
      path: snapshotPath,
      snapshot: null,
      validationError: null
    };
  }

  const snapshot = await readJson(snapshotPath);
  let validationError = null;
  try {
    const validate = await loadValidator(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
    assertValid(validate, snapshot, 'phase9 resume snapshot');
  } catch (error) {
    validationError = error;
  }

  return {
    exists: true,
    path: snapshotPath,
    snapshot,
    validationError
  };
}

function detectSnapshotDivergence(snapshot, objectiveRecord) {
  if (!snapshot) {
    return {
      code: 'E_RESUME_SNAPSHOT_MISSING',
      message: 'Resume snapshot is missing for the active objective',
      observedDivergence: 'resume-snapshot.json is missing'
    };
  }

  if (snapshot.objectiveId !== objectiveRecord.objectiveId) {
    return {
      code: 'E_RESUME_SNAPSHOT_DIVERGED',
      message: 'Resume snapshot objectiveId diverged from the immutable objective record',
      observedDivergence: `resume-snapshot.objectiveId=${snapshot.objectiveId} while objective.objectiveId=${objectiveRecord.objectiveId}`
    };
  }

  if (snapshot.runtimeMode !== objectiveRecord.runtimeMode) {
    return {
      code: 'E_RESUME_SNAPSHOT_DIVERGED',
      message: 'Resume snapshot runtimeMode diverged from the immutable objective record',
      observedDivergence: `resume-snapshot.runtimeMode=${snapshot.runtimeMode} while objective.runtimeMode=${objectiveRecord.runtimeMode}`
    };
  }

  if (snapshot.reasoningMode !== objectiveRecord.reasoningMode) {
    return {
      code: 'E_REASONING_MODE_DIVERGED',
      message: 'Resume snapshot reasoningMode diverged from the immutable objective record',
      observedDivergence: `resume-snapshot.reasoningMode=${snapshot.reasoningMode} while objective.reasoningMode=${objectiveRecord.reasoningMode}`
    };
  }

  return null;
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

function countIterations(events) {
  return events.filter((entry) => entry.kind === 'loop-iteration').length;
}

function latestEvent(events, kind) {
  return [...events].reverse().find((entry) => entry.kind === kind) ?? null;
}

async function buildResumeSnapshot(projectRoot, objectiveRecord, activePointer, options = {}) {
  const timestamp = options.writtenAt ?? now();
  const blocker = options.blocker ?? await readBlockerFlag(projectRoot, objectiveRecord.objectiveId);
  const events = options.events ?? await readJsonl(objectiveEventsPath(projectRoot, objectiveRecord.objectiveId));
  const handoffs = options.handoffs ?? await readJsonl(objectiveHandoffsPath(projectRoot, objectiveRecord.objectiveId));
  const iterationsCompleted = countIterations(events);
  const createdAtMs = Date.parse(objectiveRecord.createdAt);
  const timestampMs = Date.parse(timestamp);
  const wallSecondsConsumed = Number.isFinite(createdAtMs) && Number.isFinite(timestampMs)
    ? Math.max(0, Math.floor((timestampMs - createdAtMs) / 1000))
    : 0;
  const stageCursor = deriveStageCursor(objectiveRecord);
  const openBlockers = blocker.exists && blocker.code && blocker.message
    ? [{
        code: blocker.code,
        message: blocker.message,
        openedAt: blocker.writtenAt ?? timestamp
      }]
    : [];

  return {
    schemaVersion: 'phase9.resume-snapshot.v1',
    writtenAt: timestamp,
    writtenReason: options.writtenReason,
    objectiveId: objectiveRecord.objectiveId,
    objectiveStatusAtSnapshot: objectiveRecord.status,
    runtimeMode: objectiveRecord.runtimeMode,
    reasoningMode: objectiveRecord.reasoningMode,
    wakePolicySnapshot: {
      ...objectiveRecord.wakePolicy,
      heartbeatIntervalSeconds: objectiveRecord.budget.heartbeatIntervalSeconds
    },
    budgetRemaining: {
      maxWallSecondsLeft: Math.max(0, objectiveRecord.budget.maxWallSeconds - wallSecondsConsumed),
      maxIterationsLeft: Math.max(0, objectiveRecord.budget.maxIterations - iterationsCompleted),
      costCeilingLeft: objectiveRecord.budget.costCeiling
    },
    queueVisibility: {
      queuePath: normalizeSlashes(path.join(OBJECTIVES_ROOT_RELATIVE_PATH, objectiveRecord.objectiveId, 'queue.json')),
      queueCursor: null,
      pendingCount: 0,
      runningCount: 0,
      lastTaskId: null
    },
    stageCursor,
    nextAction: objectiveRecord.status === 'active'
      ? {
          kind: 'enqueue-task',
          params: {
            stageId: stageCursor.current
          }
        }
      : objectiveRecord.status === 'completed' || objectiveRecord.status === 'abandoned'
        ? {
            kind: 'stop',
            params: {
              status: objectiveRecord.status
            }
          }
        : {
            kind: 'await-operator',
            params: {
              reason: blocker.code ?? objectiveRecord.status
            }
          },
    openBlockers,
    openHandoffs: deriveOpenHandoffs(handoffs),
    wakeLease: activePointer?.currentWakeLease ?? {
      wakeId: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      acquiredBy: null,
      previousWakeId: null
    },
    kernelFingerprint: {
      lastClaimId: null,
      lastCitationCheckId: null,
      lastR2VerdictId: null,
      lastObserverAlertId: null,
      lastGateCheckId: null,
      lastPatternId: null,
      takenAt: timestamp
    },
    notes: options.notes ?? null
  };
}

async function writeResumeSnapshot(projectRoot, objectiveRecord, activePointer, options = {}) {
  const snapshot = await buildResumeSnapshot(projectRoot, objectiveRecord, activePointer, options);
  const validate = await loadValidator(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
  assertValid(validate, snapshot, 'phase9 resume snapshot');
  const snapshotPath = resumeSnapshotPath(projectRoot, objectiveRecord.objectiveId);
  await atomicWriteJson(snapshotPath, snapshot);
  return {
    snapshot,
    snapshotPath
  };
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
    return withLock(repoRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
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

      const blocker = await readBlockerFlag(repoRoot, objectiveId);
      let blockerResolved = false;
      if (blocker.exists) {
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
