import { access, appendFile, readFile } from 'node:fs/promises';
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
  objectiveEventsPath,
  objectiveHandoffsPath,
  objectiveRecordPath,
  OBJECTIVES_ROOT_RELATIVE_PATH,
  OBJECTIVE_EVENTS_FILE,
  readActiveObjectivePointer,
  readObjectiveRecord,
  resolveSchemaHostRoot
} from './store.js';

export const RESUME_SNAPSHOT_FILE = 'resume-snapshot.json';
export const RESUME_SNAPSHOT_SCHEMA_FILE = 'phase9-resume-snapshot.schema.json';
export const OBJECTIVE_EVENT_SCHEMA_FILE = 'phase9-objective-event.schema.json';
export const BLOCKER_FLAG_FILE = 'BLOCKER.flag';

export function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
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

async function loadSchemaValidator(projectRoot, schemaFile) {
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, schemaFile);
  return loadValidator(schemaHostRoot, schemaFile);
}

export function resumeSnapshotPath(projectRoot, objectiveId) {
  return path.join(path.dirname(objectiveRecordPath(projectRoot, objectiveId)), RESUME_SNAPSHOT_FILE);
}

export function blockerFlagPath(projectRoot, objectiveId) {
  return path.join(path.dirname(objectiveRecordPath(projectRoot, objectiveId)), BLOCKER_FLAG_FILE);
}

export async function appendObjectiveEvent(projectRoot, objectiveId, kind, payload, timestamp = now(), options = {}) {
  const eventsPath = objectiveEventsPath(projectRoot, objectiveId);
  return withLock(projectRoot, `${objectiveId}-${OBJECTIVE_EVENTS_FILE}`, async () => {
    const existingEvents = await readJsonl(eventsPath);
    const recordSeq = (existingEvents.at(-1)?.recordSeq ?? 0) + 1;
    const reservedEventId = `EV-${String(recordSeq).padStart(4, '0')}`;
    const event = {
      schemaVersion: 'phase9.objective-event.v1',
      objectiveId,
      eventId: reservedEventId,
      ts: timestamp,
      recordSeq,
      kind,
      payload
    };
    const validate = await loadSchemaValidator(projectRoot, OBJECTIVE_EVENT_SCHEMA_FILE);
    assertValid(validate, event, 'phase9 objective event');
    if (typeof options.precommit === 'function') {
      await options.precommit({
        reservedEventId,
        reservedRecordSeq: recordSeq,
        event
      });
    }
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

export async function readBlockerFlag(projectRoot, objectiveId) {
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

export async function readResumeSnapshot(projectRoot, objectiveId) {
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
    const validate = await loadSchemaValidator(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
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

export function detectSnapshotDivergence(snapshot, objectiveRecord) {
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

export function countIterations(events) {
  return events.filter((entry) => entry.kind === 'loop-iteration').length;
}

export function latestEvent(events, kind) {
  return [...events].reverse().find((entry) => entry.kind === kind) ?? null;
}

export async function buildResumeSnapshot(projectRoot, objectiveRecord, activePointer, options = {}) {
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
  const latestR2Verdict = latestEvent(events, 'r2-verdict');

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
      lastR2VerdictId: latestR2Verdict?.eventId ?? null,
      lastObserverAlertId: null,
      lastGateCheckId: null,
      lastPatternId: null,
      takenAt: timestamp
    },
    notes: options.notes ?? null
  };
}

export async function writeResumeSnapshot(projectRoot, objectiveRecord, activePointer, options = {}) {
  const snapshot = await buildResumeSnapshot(projectRoot, objectiveRecord, activePointer, options);
  const validate = await loadSchemaValidator(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
  assertValid(validate, snapshot, 'phase9 resume snapshot');
  const snapshotPath = resumeSnapshotPath(projectRoot, objectiveRecord.objectiveId);
  await atomicWriteJson(snapshotPath, snapshot);
  return {
    snapshot,
    snapshotPath
  };
}

export async function writeObjectiveResumeSnapshot(projectPath, objectiveId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const objectiveRecord = options.objectiveRecord ?? await readObjectiveRecord(projectRoot, objectiveId);
  if (objectiveRecord.objectiveId !== objectiveId) {
    throw new Error(
      `Objective record ${objectiveRecord.objectiveId} does not match requested snapshot objective ${objectiveId}`
    );
  }

  const activePointer = Object.hasOwn(options, 'activePointer')
    ? options.activePointer
    : await readActiveObjectivePointer(projectRoot);
  const pointerForObjective = activePointer?.objectiveId === objectiveId ? activePointer : null;
  return writeResumeSnapshot(projectRoot, objectiveRecord, pointerForObjective, options);
}
