import { appendFile, mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now,
  readJsonl,
  resolveProjectRoot,
  withLock
} from '../control/_io.js';
import { generateCapabilityHandshake } from '../control/capability-handshake.js';
import { syncMemory } from '../memory/sync.js';
import {
  createActiveObjectivePointer,
  createInitialWakeLease,
  objectiveDir,
  objectiveHandoffsPath,
  objectiveRecordPath,
  OBJECTIVE_POINTER_LOCK_NAME,
  pauseObjective,
  readActiveObjectivePointer,
  readObjectiveRecord,
  resolveSchemaHostRoot,
  stopObjective,
  writeObjectiveRecord
} from '../objectives/store.js';
import {
  appendObjectiveEvent,
  BLOCKER_FLAG_FILE,
  countIterations,
  OBJECTIVE_EVENT_SCHEMA_FILE,
  readBlockerFlag,
  readResumeSnapshot,
  RESUME_SNAPSHOT_SCHEMA_FILE,
  resumeSnapshotPath
} from '../objectives/resume-snapshot.js';
import { readAndValidateAnalysisManifest, ANALYSIS_MANIFEST_TASK_KIND } from './analysis-manifest.js';
import { runAnalysisCommand } from './execution-lane.js';

const RESEARCH_LOOP_COMMAND = 'research-loop';
const OBJECTIVE_QUEUE_FILE = 'queue.jsonl';
const DEFAULT_SESSION_PREFIX = 'sess-loop';
const DEFAULT_WAKE_PREFIX = 'wake-loop';
const TERMINAL_QUEUE_STATUSES = new Set(['completed', 'failed', 'blocked', 'interrupted']);
const RUNTIME_MODES = new Set(['interactive', 'attended-batch', 'unattended-batch', 'resume-only']);

export class ResearchLoopCliError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'ResearchLoopCliError';
    this.command = RESEARCH_LOOP_COMMAND;
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function toRepoRelative(projectRoot, targetPath) {
  return normalizeSlashes(path.relative(projectRoot, targetPath));
}

function resolveSessionId(options = {}) {
  const explicit = options.sessionId ?? process.env.VRE_SESSION_ID;
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim();
  }
  return `${DEFAULT_SESSION_PREFIX}-${process.pid}`;
}

function generateWakeId() {
  return `${DEFAULT_WAKE_PREFIX}-${process.pid}-${Date.now()}`;
}

function coerceBoolean(value) {
  return value === true || value === 'true';
}

function coerceOptionalPositiveInteger(value, label) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ResearchLoopCliError({
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: `${RESEARCH_LOOP_COMMAND} requires --${label} to be a positive integer.`
    });
  }
  return parsed;
}

function atomicTempPath(filePath) {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
}

async function atomicWriteUtf8(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = atomicTempPath(filePath);
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function objectiveQueuePath(projectRoot, objectiveId) {
  return path.join(objectiveDir(projectRoot, objectiveId), OBJECTIVE_QUEUE_FILE);
}

function queueLockName(objectiveId) {
  return `${objectiveId}-${OBJECTIVE_QUEUE_FILE}`;
}

async function appendQueueRecord(projectRoot, objectiveId, record) {
  const queuePath = objectiveQueuePath(projectRoot, objectiveId);
  return withLock(projectRoot, queueLockName(objectiveId), async () => {
    await mkdir(path.dirname(queuePath), { recursive: true });
    const existing = await readJsonl(queuePath);
    const nextRecord = {
      recordSeq: (existing.at(-1)?.recordSeq ?? 0) + 1,
      ...record
    };
    await appendFile(queuePath, `${JSON.stringify(nextRecord)}\n`, 'utf8');
    return nextRecord;
  });
}

async function readQueueRecords(projectRoot, objectiveId) {
  return readJsonl(objectiveQueuePath(projectRoot, objectiveId));
}

function deriveQueueState(records) {
  const latestByAttempt = new Map();
  for (const record of records) {
    const current = latestByAttempt.get(record.taskAttemptId);
    if (!current || (record.recordSeq ?? 0) > (current.recordSeq ?? 0)) {
      latestByAttempt.set(record.taskAttemptId, record);
    }
  }

  const latestRecords = [...latestByAttempt.values()].sort((left, right) => (left.recordSeq ?? 0) - (right.recordSeq ?? 0));
  const pendingCount = latestRecords.filter((record) => record.status === 'queued').length;
  const runningCount = latestRecords.filter((record) => record.status === 'running').length;
  const lastTaskId = latestRecords.at(-1)?.taskId ?? null;

  return {
    records,
    latestRecords,
    pendingCount,
    runningCount,
    lastTaskId,
    queueCursor: records.at(-1)?.recordSeq ?? null
  };
}

async function listAnalysisManifestPaths(projectRoot) {
  const manifestsRoot = path.join(projectRoot, 'analysis', 'manifests');
  const discovered = [];

  async function walk(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        discovered.push(normalizeSlashes(path.relative(projectRoot, absolutePath)));
      }
    }
  }

  await walk(manifestsRoot);
  return discovered.sort((left, right) => left.localeCompare(right));
}

function deriveStageCursor(objectiveRecord) {
  const stages = Array.isArray(objectiveRecord.stages) ? objectiveRecord.stages : [];
  const currentStage = stages.find((stage) => stage.status !== 'completed') ?? stages.at(-1) ?? null;
  const lastCompleteStage = [...stages].reverse().find((stage) => stage.status === 'completed')?.stageId ?? null;
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

async function loadResumeSnapshotValidator(projectRoot) {
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
  return loadValidator(schemaHostRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
}

async function buildRuntimeResumeSnapshot(
  projectRoot,
  objectiveRecord,
  activePointer,
  queueState,
  options = {}
) {
  const timestamp = options.writtenAt ?? now();
  const blocker = options.blocker ?? await readBlockerFlag(projectRoot, objectiveRecord.objectiveId);
  const events = options.events ?? await readJsonl(path.join(objectiveDir(projectRoot, objectiveRecord.objectiveId), 'events.jsonl'));
  const handoffs = options.handoffs ?? await readJsonl(objectiveHandoffsPath(projectRoot, objectiveRecord.objectiveId));
  const iterationsCompleted = countIterations(events);
  const createdAtMs = Date.parse(objectiveRecord.createdAt);
  const timestampMs = Date.parse(timestamp);
  const wallSecondsConsumed = Number.isFinite(createdAtMs) && Number.isFinite(timestampMs)
    ? Math.max(0, Math.floor((timestampMs - createdAtMs) / 1000))
    : 0;
  const effectiveBudget = options.effectiveBudget ?? objectiveRecord.budget;
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
    writtenReason: options.writtenReason ?? 'heartbeat',
    objectiveId: objectiveRecord.objectiveId,
    objectiveStatusAtSnapshot: objectiveRecord.status,
    runtimeMode: objectiveRecord.runtimeMode,
    reasoningMode: objectiveRecord.reasoningMode,
    wakePolicySnapshot: {
      ...objectiveRecord.wakePolicy,
      heartbeatIntervalSeconds: objectiveRecord.budget.heartbeatIntervalSeconds
    },
    budgetRemaining: {
      maxWallSecondsLeft: Math.max(0, effectiveBudget.maxWallSeconds - wallSecondsConsumed),
      maxIterationsLeft: Math.max(0, effectiveBudget.maxIterations - iterationsCompleted),
      costCeilingLeft: objectiveRecord.budget.costCeiling
    },
    queueVisibility: {
      queuePath: normalizeSlashes(path.join('.vibe-science-environment', 'objectives', objectiveRecord.objectiveId, OBJECTIVE_QUEUE_FILE)),
      queueCursor: queueState.queueCursor == null ? null : String(queueState.queueCursor),
      pendingCount: queueState.pendingCount,
      runningCount: queueState.runningCount,
      lastTaskId: queueState.lastTaskId
    },
    stageCursor: deriveStageCursor(objectiveRecord),
    nextAction: options.nextAction ?? (
      objectiveRecord.status === 'active'
        ? {
            kind: 'enqueue-task',
            params: {
              stageId: deriveStageCursor(objectiveRecord).current
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
            }
    ),
    openBlockers,
    openHandoffs: deriveOpenHandoffs(handoffs),
    wakeLease: activePointer?.currentWakeLease ?? createInitialWakeLease(),
    kernelFingerprint: options.kernelFingerprint ?? {
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

async function writeRuntimeResumeSnapshot(projectRoot, objectiveRecord, activePointer, queueState, options = {}) {
  const snapshot = await buildRuntimeResumeSnapshot(projectRoot, objectiveRecord, activePointer, queueState, options);
  const validate = await loadResumeSnapshotValidator(projectRoot);
  assertValid(validate, snapshot, 'phase9 runtime resume snapshot');
  const snapshotPath = resumeSnapshotPath(projectRoot, objectiveRecord.objectiveId);
  await atomicWriteJson(snapshotPath, snapshot);
  return {
    snapshot,
    snapshotPath
  };
}

async function writeBlockerFlag(projectRoot, objectiveId, { code, message, snapshotPath, writtenAt }) {
  const targetPath = path.join(objectiveDir(projectRoot, objectiveId), BLOCKER_FLAG_FILE);
  const lines = [
    `BLOCKER_CODE=${code}`,
    `BLOCKER_MESSAGE=${message}`,
    `OBJECTIVE_ID=${objectiveId}`,
    `WRITTEN_AT=${writtenAt}`
  ];
  if (snapshotPath) {
    lines.push(`SNAPSHOT_PATH=${snapshotPath}`);
  }
  await atomicWriteUtf8(targetPath, `${lines.join('\n')}\n`);
  return targetPath;
}

function resolveEffectiveBudget(objectiveRecord, options = {}) {
  const maxIterationsOverride = coerceOptionalPositiveInteger(options.maxIterations, 'max-iterations');
  const maxWallSecondsOverride = coerceOptionalPositiveInteger(options.maxWallSeconds, 'max-wall-seconds');
  return {
    ...objectiveRecord.budget,
    maxIterations: maxIterationsOverride == null
      ? objectiveRecord.budget.maxIterations
      : Math.min(objectiveRecord.budget.maxIterations, maxIterationsOverride),
    maxWallSeconds: maxWallSecondsOverride == null
      ? objectiveRecord.budget.maxWallSeconds
      : Math.min(objectiveRecord.budget.maxWallSeconds, maxWallSecondsOverride)
  };
}

function resolveLoopRuntimeMode(objectiveRecord, options = {}) {
  const storedMode = objectiveRecord.runtimeMode;
  const requestedMode = typeof options.mode === 'string' && options.mode.trim() !== ''
    ? options.mode.trim()
    : null;
  const resume = coerceBoolean(options.resume);

  if (!RUNTIME_MODES.has(storedMode)) {
    throw new ResearchLoopCliError({
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: `research-loop encountered unsupported stored objective.runtimeMode ${storedMode}.`
    });
  }

  if (requestedMode != null && !RUNTIME_MODES.has(requestedMode)) {
    throw new ResearchLoopCliError({
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: `research-loop requires --mode to be one of ${[...RUNTIME_MODES].join(', ')}.`
    });
  }

  if (resume) {
    return storedMode;
  }

  if (requestedMode != null && requestedMode !== storedMode) {
    throw new ResearchLoopCliError({
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: `research-loop --mode ${requestedMode} does not match stored objective.runtimeMode ${storedMode}.`
    });
  }

  return storedMode;
}

function resolveWakeRequest(options = {}) {
  const heartbeat = coerceBoolean(options.heartbeat);
  if (heartbeat) {
    if (typeof options.wakeId !== 'string' || options.wakeId.trim() === '') {
      throw new ResearchLoopCliError({
        code: 'PHASE9_USAGE',
        exitCode: 3,
        message: 'research-loop --heartbeat requires --wake-id.'
      });
    }
    return {
      heartbeat: true,
      wakeId: options.wakeId.trim()
    };
  }

  return {
    heartbeat: false,
    wakeId: typeof options.wakeId === 'string' && options.wakeId.trim() !== ''
      ? options.wakeId.trim()
      : generateWakeId()
  };
}

function parseLeaseTimestamp(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

async function claimWakeLease(projectRoot, objectiveId, wakeRequest, sessionId, writtenAt) {
  return withLock(projectRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
    const activePointer = await readActiveObjectivePointer(projectRoot);
    if (!activePointer) {
      throw new ResearchLoopCliError({
        code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
        message: 'research-loop requires an active objective pointer.'
      });
    }
    if (activePointer.objectiveId !== objectiveId) {
      throw new ResearchLoopCliError({
        code: 'E_OBJECTIVE_ID_MISMATCH',
        message: `research-loop requested ${objectiveId} but active objective pointer owns ${activePointer.objectiveId}.`,
        extra: {
          objectiveId,
          activeObjectiveId: activePointer.objectiveId
        }
      });
    }

    const currentLease = activePointer.currentWakeLease ?? createInitialWakeLease();
    const leaseExpiresAtMs = parseLeaseTimestamp(currentLease.leaseExpiresAt);
    const writtenAtMs = Date.parse(writtenAt);
    const leaseUnexpired = leaseExpiresAtMs != null && writtenAtMs < leaseExpiresAtMs;

    if (wakeRequest.heartbeat && currentLease.wakeId === wakeRequest.wakeId) {
      return {
        activePointer,
        acquired: false,
        noOpReason: 'duplicate-wake-id',
        staleReclaimed: false
      };
    }

    if (leaseUnexpired) {
      return {
        activePointer,
        acquired: false,
        noOpReason: 'wake-lease-still-active',
        staleReclaimed: false
      };
    }

    const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
    const newLease = {
      wakeId: wakeRequest.wakeId,
      leaseAcquiredAt: writtenAt,
      leaseExpiresAt: new Date(
        writtenAtMs + (objectiveRecord.wakePolicy.leaseTtlSeconds * 1000)
      ).toISOString(),
      acquiredBy: sessionId,
      previousWakeId: currentLease.wakeId ?? null
    };

    const updated = await createActiveObjectivePointer(projectRoot, {
      objectiveId: activePointer.objectiveId,
      objectiveRecordPath: activePointer.objectiveRecordPath,
      lockAcquiredAt: activePointer.lockAcquiredAt,
      lockAcquiredBySession: activePointer.lockAcquiredBySession,
      currentWakeLease: newLease
    });

    return {
      activePointer: updated.pointer,
      acquired: true,
      noOpReason: null,
      staleReclaimed: currentLease.wakeId != null && !leaseUnexpired,
      previousLease: currentLease
    };
  });
}

async function updateObjectiveStatus(projectRoot, objectiveId, nextStatus, updatedAt) {
  return withLock(projectRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
    const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
    const updatedRecord = {
      ...objectiveRecord,
      status: nextStatus,
      lastUpdatedAt: updatedAt
    };
    await writeObjectiveRecord(projectRoot, updatedRecord);
    const activePointer = await readActiveObjectivePointer(projectRoot);
    return {
      objectiveRecord: updatedRecord,
      activePointer
    };
  });
}

async function applyBudgetStopCondition(projectRoot, objectiveRecord, activePointer, queueState, effectiveBudget, reasonCode, writtenAt) {
  const snapshotRelativePath = normalizeSlashes(path.join('.vibe-science-environment', 'objectives', objectiveRecord.objectiveId, 'resume-snapshot.json'));
  if (objectiveRecord.stopConditions.onBudgetExhausted === 'pause') {
    const paused = await pauseObjective(projectRoot, objectiveRecord.objectiveId, { updatedAt: writtenAt });
    await appendObjectiveEvent(projectRoot, objectiveRecord.objectiveId, 'stop', {
      reason: 'budget-exhausted',
      code: reasonCode,
      disposition: 'pause'
    }, writtenAt);
    const snapshot = await writeRuntimeResumeSnapshot(
      projectRoot,
      paused.objectiveRecord,
      paused.activeObjectivePointer,
      queueState,
      {
        writtenAt,
        writtenReason: 'heartbeat',
        effectiveBudget,
        nextAction: {
          kind: 'await-operator',
          params: {
            reason: reasonCode
          }
        },
        notes: 'Loop paused because the effective runtime budget is exhausted.'
      }
    );
    return {
      ok: true,
      command: RESEARCH_LOOP_COMMAND,
      phase9: true,
      objectiveId: objectiveRecord.objectiveId,
      status: 'paused',
      stopReason: 'budget-exhausted',
      snapshotPath: toRepoRelative(projectRoot, snapshot.snapshotPath)
    };
  }

  if (objectiveRecord.stopConditions.onBudgetExhausted === 'stop') {
    const stopped = await stopObjective(projectRoot, objectiveRecord.objectiveId, { updatedAt: writtenAt });
    await appendObjectiveEvent(projectRoot, objectiveRecord.objectiveId, 'stop', {
      reason: 'budget-exhausted',
      code: reasonCode,
      disposition: 'stop'
    }, writtenAt);
    const snapshot = await writeRuntimeResumeSnapshot(
      projectRoot,
      stopped.objectiveRecord,
      null,
      queueState,
      {
        writtenAt,
        writtenReason: 'pre-stop',
        effectiveBudget,
        nextAction: {
          kind: 'stop',
          params: {
            status: stopped.objectiveRecord.status
          }
        },
        notes: 'Loop stopped because the effective runtime budget is exhausted.'
      }
    );
    return {
      ok: true,
      command: RESEARCH_LOOP_COMMAND,
      phase9: true,
      objectiveId: objectiveRecord.objectiveId,
      status: 'stopped',
      stopReason: 'budget-exhausted',
      snapshotPath: toRepoRelative(projectRoot, snapshot.snapshotPath)
    };
  }

  const blocked = await updateObjectiveStatus(projectRoot, objectiveRecord.objectiveId, 'blocked', writtenAt);
  const snapshot = await writeRuntimeResumeSnapshot(
    projectRoot,
    blocked.objectiveRecord,
    blocked.activePointer,
    queueState,
    {
      writtenAt,
      writtenReason: 'heartbeat',
      effectiveBudget,
      nextAction: {
        kind: 'await-operator',
        params: {
          reason: reasonCode
        }
      },
      notes: 'Loop blocked because the effective runtime budget is exhausted.'
    }
  );
  await writeBlockerFlag(projectRoot, objectiveRecord.objectiveId, {
    code: reasonCode,
    message: 'The effective runtime budget is exhausted.',
    snapshotPath: snapshotRelativePath,
    writtenAt
  });
  await appendObjectiveEvent(projectRoot, objectiveRecord.objectiveId, 'blocker-open', {
    code: reasonCode,
    message: 'The effective runtime budget is exhausted.',
    snapshotPath: snapshotRelativePath
  }, writtenAt);
  return {
    ok: true,
    command: RESEARCH_LOOP_COMMAND,
    phase9: true,
    objectiveId: objectiveRecord.objectiveId,
    status: 'blocked',
    stopReason: 'budget-exhausted',
    snapshotPath: toRepoRelative(projectRoot, snapshot.snapshotPath)
  };
}

async function evaluateStrategicCheckpoint(context, deps = {}, phase = 'pre-slice') {
  const checkpoint = deps.strategicCheckpoint ?? (async () => ({ status: 'aligned' }));
  const result = await checkpoint({
    ...context,
    phase
  });
  if (typeof result === 'string') {
    return {
      status: result
    };
  }
  return result ?? { status: 'aligned' };
}

async function handleSemanticDrift(projectRoot, objectiveRecord, activePointer, queueState, effectiveBudget, checkpointResult, writtenAt) {
  const paused = await pauseObjective(projectRoot, objectiveRecord.objectiveId, { updatedAt: writtenAt });
  await appendObjectiveEvent(projectRoot, objectiveRecord.objectiveId, 'semantic-drift-detected', {
    code: 'SEMANTIC_DRIFT_DETECTED',
    message: checkpointResult.message ?? 'The deterministic strategic relevance checkpoint marked the objective as drifted.',
    phase: checkpointResult.phase ?? 'pre-slice'
  }, writtenAt);
  const snapshot = await writeRuntimeResumeSnapshot(
    projectRoot,
    paused.objectiveRecord,
    paused.activeObjectivePointer,
    queueState,
    {
      writtenAt,
      writtenReason: 'heartbeat',
      effectiveBudget,
      nextAction: {
        kind: 'await-operator',
        params: {
          reason: 'SEMANTIC_DRIFT_DETECTED'
        }
      },
      notes: checkpointResult.message ?? 'Paused by the deterministic strategic relevance checkpoint.'
    }
  );
  const snapshotRelativePath = toRepoRelative(projectRoot, snapshot.snapshotPath);
  await writeBlockerFlag(projectRoot, objectiveRecord.objectiveId, {
    code: 'SEMANTIC_DRIFT_DETECTED',
    message: checkpointResult.message ?? 'The deterministic strategic relevance checkpoint marked the objective as drifted.',
    snapshotPath: snapshotRelativePath,
    writtenAt
  });
  return {
    ok: true,
    command: RESEARCH_LOOP_COMMAND,
    phase9: true,
    objectiveId: objectiveRecord.objectiveId,
    status: 'paused',
    stopReason: 'semantic-drift',
    checkpoint: 'drifted',
    snapshotPath: snapshotRelativePath
  };
}

function candidateAlreadyHandled(queueState, analysisId) {
  return queueState.latestRecords.some((record) =>
    record.taskKind === ANALYSIS_MANIFEST_TASK_KIND &&
    record.analysisId === analysisId &&
    TERMINAL_QUEUE_STATUSES.has(record.status)
  );
}

async function deriveNextAnalysisCandidate(projectRoot, objectiveRecord, queueState, deps = {}) {
  if (!objectiveRecord.budget.allowedTaskKinds.includes(ANALYSIS_MANIFEST_TASK_KIND)) {
    return {
      kind: 'blocked',
      code: 'E_TASK_KIND_NOT_ALLOWED',
      message: `Objective ${objectiveRecord.objectiveId} does not allow ${ANALYSIS_MANIFEST_TASK_KIND} in budget.allowedTaskKinds.`
    };
  }

  const candidatePaths = await listAnalysisManifestPaths(projectRoot);
  let approvalRequired = false;

  for (const manifestPath of candidatePaths) {
    try {
      const validated = await (deps.readAndValidateAnalysisManifest ?? readAndValidateAnalysisManifest)(projectRoot, manifestPath);
      if (validated.manifest.taskKind !== ANALYSIS_MANIFEST_TASK_KIND) {
        continue;
      }
      if (candidateAlreadyHandled(queueState, validated.manifest.analysisId)) {
        continue;
      }
      return {
        kind: 'analysis',
        manifestPath,
        validated
      };
    } catch (error) {
      const message = error?.message ?? '';
      if (/human approval/u.test(message)) {
        approvalRequired = true;
        continue;
      }
    }
  }

  if (approvalRequired) {
    return {
      kind: 'blocked',
      code: 'E_MANIFEST_APPROVAL_REQUIRED',
      message: 'A sanctioned analysis manifest exists but still requires operator approval.'
    };
  }

  return {
    kind: 'blocked',
    code: 'E_LLM_REASONING_REQUIRED',
    message: 'No sanctioned next slice is mechanically derivable under rule-only unattended mode.'
  };
}

function latestTerminalQueueRecord(queueState) {
  const terminalRecords = queueState.latestRecords.filter((record) => TERMINAL_QUEUE_STATUSES.has(record.status));
  return terminalRecords.at(-1) ?? null;
}

async function maybeRepairSnapshotFromDurableState(projectRoot, objectiveRecord, activePointer, queueState, effectiveBudget, writtenAt) {
  const latestTerminal = latestTerminalQueueRecord(queueState);
  if (!latestTerminal) {
    return null;
  }

  const snapshotState = await readResumeSnapshot(projectRoot, objectiveRecord.objectiveId);
  const snapshotCursor = snapshotState.snapshot?.queueVisibility?.queueCursor ?? null;
  const snapshotMissingOrStale =
    !snapshotState.exists ||
    snapshotState.validationError ||
    snapshotCursor == null ||
    snapshotCursor < latestTerminal.recordSeq;

  if (!snapshotMissingOrStale) {
    return null;
  }

  const repairedEvent = await appendObjectiveEvent(projectRoot, objectiveRecord.objectiveId, 'state-repair', {
    repairedLayer: 'snapshot',
    observedDivergence: 'queue/event state advanced past resume-snapshot.json',
    repairedTo: 'resume-snapshot regenerated from durable queue/event state',
    reason: 'research-loop fresh-process recovery'
  }, writtenAt);

  const repaired = await writeRuntimeResumeSnapshot(
    projectRoot,
    objectiveRecord,
    activePointer,
    queueState,
    {
      writtenAt,
      writtenReason: 'heartbeat',
      effectiveBudget,
      nextAction: {
        kind: 'await-operator',
        params: {
          reason: 'state-repair'
        }
      },
      notes: 'Recovered resume snapshot from durable queue/event state after a prior crash before final snapshot.'
    }
  );

  return {
    ok: true,
    command: RESEARCH_LOOP_COMMAND,
    phase9: true,
    objectiveId: objectiveRecord.objectiveId,
    status: 'recovered',
    repairedEventId: repairedEvent.event.eventId,
    queueCursor: queueState.queueCursor,
    snapshotPath: toRepoRelative(projectRoot, repaired.snapshotPath)
  };
}

function coerceRunAnalysisFailure(error) {
  if (error instanceof ResearchLoopCliError) {
    throw error;
  }
  const code = error?.code ?? 'E_ANALYSIS_RUN_FAILED';
  const status = code === 'E_ANALYSIS_RUN_INTERRUPTED' ? 'interrupted' : 'failed';
  return {
    ok: false,
    code,
    status,
    message: error?.message ?? 'run-analysis failed',
    details: error?.extra ?? {}
  };
}

async function attemptMemorySync(projectRoot, deps = {}) {
  const memorySync = deps.syncMemory ?? syncMemory;
  try {
    const result = await memorySync(projectRoot);
    return {
      status: 'synced',
      warnings: result?.warnings ?? [],
      syncedAt: result?.syncedAt ?? now()
    };
  } catch (error) {
    return {
      status: 'skipped',
      reason: error?.message ?? 'memory sync unavailable'
    };
  }
}

export async function runResearchLoopCommand(projectPath, options = {}, deps = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const objectiveId = options.objectiveId;
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
    throw new ResearchLoopCliError({
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: 'research-loop requires --objective.'
    });
  }

  const sessionId = resolveSessionId(options);
  const writtenAt = options.now ?? now();
  const wakeRequest = resolveWakeRequest(options);
  const handshakeGenerator = deps.generateCapabilityHandshake ?? ((root) => generateCapabilityHandshake(root));
  const handshake = await handshakeGenerator(projectRoot);

  const activePointer = await readActiveObjectivePointer(projectRoot);
  if (!activePointer) {
    throw new ResearchLoopCliError({
      code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
      message: 'research-loop requires an active objective pointer.'
    });
  }
  if (activePointer.objectiveId !== objectiveId) {
    throw new ResearchLoopCliError({
      code: 'E_OBJECTIVE_ID_MISMATCH',
      message: `research-loop requested ${objectiveId} but active objective pointer owns ${activePointer.objectiveId}.`,
      extra: {
        objectiveId,
        activeObjectiveId: activePointer.objectiveId
      }
    });
  }

  let objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
  const queueRecords = await readQueueRecords(projectRoot, objectiveId);
  let queueState = deriveQueueState(queueRecords);
  const handoffs = await readJsonl(objectiveHandoffsPath(projectRoot, objectiveId));
  const snapshotState = await readResumeSnapshot(projectRoot, objectiveId);
  const effectiveBudget = resolveEffectiveBudget(objectiveRecord, options);
  const runtimeMode = resolveLoopRuntimeMode(objectiveRecord, options);

  const leaseClaim = await claimWakeLease(projectRoot, objectiveId, wakeRequest, sessionId, writtenAt);
  let claimedPointer = leaseClaim.activePointer;

  if (!leaseClaim.acquired) {
    const noopSnapshot = await writeRuntimeResumeSnapshot(
      projectRoot,
      objectiveRecord,
      claimedPointer,
      queueState,
      {
        writtenAt,
        writtenReason: 'heartbeat',
        effectiveBudget,
        nextAction: {
          kind: 'await-operator',
          params: {
            reason: leaseClaim.noOpReason
          }
        },
        notes: `Heartbeat produced no new slice because ${leaseClaim.noOpReason}.`
      }
    );
    return {
      ok: true,
      command: RESEARCH_LOOP_COMMAND,
      phase9: true,
      objectiveId,
      status: 'no-op',
      reason: leaseClaim.noOpReason,
      wakeId: wakeRequest.wakeId,
      snapshotPath: toRepoRelative(projectRoot, noopSnapshot.snapshotPath)
    };
  }

  if (leaseClaim.staleReclaimed) {
    await appendObjectiveEvent(projectRoot, objectiveId, 'stale-wake-lease-reclaimed', {
      code: 'STALE_WAKE_LEASE_RECLAIMED',
      previousWakeId: leaseClaim.previousLease?.wakeId ?? null,
      previousLeaseExpiresAt: leaseClaim.previousLease?.leaseExpiresAt ?? null,
      reclaimedByWakeId: wakeRequest.wakeId
    }, writtenAt);
  }

  const repaired = await maybeRepairSnapshotFromDurableState(
    projectRoot,
    objectiveRecord,
    claimedPointer,
    queueState,
    effectiveBudget,
    writtenAt
  );
  if (repaired) {
    return {
      ...repaired,
      wakeId: wakeRequest.wakeId,
      staleLeaseRecovered: leaseClaim.staleReclaimed
    };
  }

  const existingEvents = await readJsonl(path.join(objectiveDir(projectRoot, objectiveId), 'events.jsonl'));
  const iterationsCompleted = countIterations(existingEvents);
  const terminalTaskCount = queueState.latestRecords.filter((record) => TERMINAL_QUEUE_STATUSES.has(record.status)).length;
  const createdAtMs = Date.parse(objectiveRecord.createdAt);
  const writtenAtMs = Date.parse(writtenAt);
  const wallSecondsConsumed = Number.isFinite(createdAtMs) && Number.isFinite(writtenAtMs)
    ? Math.max(0, Math.floor((writtenAtMs - createdAtMs) / 1000))
    : 0;

  if (
    iterationsCompleted >= effectiveBudget.maxIterations ||
    terminalTaskCount >= effectiveBudget.maxTaskCount ||
    wallSecondsConsumed >= effectiveBudget.maxWallSeconds
  ) {
    return applyBudgetStopCondition(
      projectRoot,
      objectiveRecord,
      claimedPointer,
      queueState,
      effectiveBudget,
      'E_BUDGET_EXHAUSTED',
      writtenAt
    );
  }

  if (runtimeMode === 'resume-only') {
    throw new ResearchLoopCliError({
      code: 'E_RUNTIME_MODE_EXECUTION_FORBIDDEN',
      message: 'research-loop may not execute new work while objective.runtimeMode is resume-only.'
    });
  }

  if (objectiveRecord.reasoningMode !== 'rule-only') {
    throw new ResearchLoopCliError({
      code: 'E_REASONING_MODE_UNSUPPORTED',
      message: `research-loop v1 supports only reasoningMode=rule-only, not ${objectiveRecord.reasoningMode}.`
    });
  }

  if (runtimeMode === 'unattended-batch') {
    const firstCheckpoint = await evaluateStrategicCheckpoint({
      handshake,
      objectiveRecord,
      queueState,
      handoffs,
      snapshotState
    }, deps, 'pre-slice');
    if (firstCheckpoint.status === 'drifted') {
      return handleSemanticDrift(
        projectRoot,
        objectiveRecord,
        claimedPointer,
        queueState,
        effectiveBudget,
        firstCheckpoint,
        writtenAt
      );
    }

    const enteringFinalQuarter = (iterationsCompleted + 1) > Math.floor(effectiveBudget.maxIterations * 0.75);
    if (enteringFinalQuarter) {
      const finalQuarterCheckpoint = await evaluateStrategicCheckpoint({
        handshake,
        objectiveRecord,
        queueState,
        handoffs,
        snapshotState
      }, deps, 'final-quarter');
      if (finalQuarterCheckpoint.status === 'drifted') {
        return handleSemanticDrift(
          projectRoot,
          objectiveRecord,
          claimedPointer,
          queueState,
          effectiveBudget,
          finalQuarterCheckpoint,
          writtenAt
        );
      }
    }
  }

  const candidate = await deriveNextAnalysisCandidate(projectRoot, objectiveRecord, queueState, deps);
  if (candidate.kind !== 'analysis') {
    const blocked = await updateObjectiveStatus(projectRoot, objectiveId, 'blocked', writtenAt);
    const blockedQueueState = deriveQueueState(await readQueueRecords(projectRoot, objectiveId));
    const snapshot = await writeRuntimeResumeSnapshot(
      projectRoot,
      blocked.objectiveRecord,
      blocked.activePointer,
      blockedQueueState,
      {
        writtenAt,
        writtenReason: 'heartbeat',
        effectiveBudget,
        nextAction: {
          kind: 'await-operator',
          params: {
            reason: candidate.code
          }
        },
        notes: candidate.message
      }
    );
    const snapshotRelativePath = toRepoRelative(projectRoot, snapshot.snapshotPath);
    await writeBlockerFlag(projectRoot, objectiveId, {
      code: candidate.code,
      message: candidate.message,
      snapshotPath: snapshotRelativePath,
      writtenAt
    });
    await appendObjectiveEvent(projectRoot, objectiveId, 'blocker-open', {
      code: candidate.code,
      message: candidate.message,
      snapshotPath: snapshotRelativePath
    }, writtenAt);
    return {
      ok: true,
      command: RESEARCH_LOOP_COMMAND,
      phase9: true,
      objectiveId,
      status: 'blocked',
      stopReason: candidate.code,
      snapshotPath: snapshotRelativePath
    };
  }

  const taskAttemptId = `TASK-${candidate.validated.manifest.analysisId}-${Date.now()}`;
  const taskId = `${ANALYSIS_MANIFEST_TASK_KIND}:${candidate.validated.manifest.analysisId}`;
  const runningQueueRecord = await appendQueueRecord(projectRoot, objectiveId, {
    objectiveId,
    taskId,
    taskKind: ANALYSIS_MANIFEST_TASK_KIND,
    analysisId: candidate.validated.manifest.analysisId,
    status: 'running',
    taskAttemptId,
    createdAt: writtenAt,
    updatedAt: writtenAt,
    sessionId,
    wakeId: wakeRequest.wakeId,
    handoffId: null,
    sourceArtifactPaths: [
      candidate.manifestPath,
      ...candidate.validated.manifest.inputs.map((entry) => entry.path)
    ],
    resultArtifactPaths: [],
    resumeCursor: {
      manifestPath: candidate.manifestPath,
      queueRecordSeq: null
    }
  });
  queueState = deriveQueueState(await readQueueRecords(projectRoot, objectiveId));

  await appendObjectiveEvent(projectRoot, objectiveId, 'analysis-run', {
    phase: 'started',
    analysisId: candidate.validated.manifest.analysisId,
    experimentId: candidate.validated.manifest.experimentId,
    taskId,
    taskAttemptId,
    manifestPath: candidate.manifestPath,
    queueRecordSeq: runningQueueRecord.recordSeq,
    wakeId: wakeRequest.wakeId
  }, writtenAt);

  let executionPayload;
  try {
    executionPayload = await (deps.runAnalysisCommand ?? runAnalysisCommand)(projectRoot, {
      manifestPath: candidate.manifestPath,
      dryRun: false
    });
  } catch (error) {
    executionPayload = coerceRunAnalysisFailure(error);
  }

  const resultRecord = await appendQueueRecord(projectRoot, objectiveId, {
    objectiveId,
    taskId,
    taskKind: ANALYSIS_MANIFEST_TASK_KIND,
    analysisId: candidate.validated.manifest.analysisId,
    status: executionPayload.ok ? 'completed' : executionPayload.status,
    taskAttemptId,
    createdAt: writtenAt,
    updatedAt: now(),
    sessionId,
    wakeId: wakeRequest.wakeId,
    handoffId: null,
    sourceArtifactPaths: [
      candidate.manifestPath,
      ...candidate.validated.manifest.inputs.map((entry) => entry.path)
    ],
    resultArtifactPaths: executionPayload.outputPaths ?? candidate.validated.manifest.outputs.map((entry) => entry.path),
    resumeCursor: {
      manifestPath: candidate.manifestPath,
      queueRecordSeq: runningQueueRecord.recordSeq
    }
  });
  queueState = deriveQueueState(await readQueueRecords(projectRoot, objectiveId));

  if (typeof deps.afterQueueResultPersisted === 'function') {
    await deps.afterQueueResultPersisted({
      objectiveRecord,
      queueState,
      resultRecord
    });
  }

  const memorySyncState = await attemptMemorySync(projectRoot, deps);
  const notes = memorySyncState.status === 'skipped'
    ? `Memory sync skipped: ${memorySyncState.reason}`
    : null;

  const loopEvent = await appendObjectiveEvent(projectRoot, objectiveId, 'loop-iteration', {
    taskId,
    taskAttemptId,
    taskKind: ANALYSIS_MANIFEST_TASK_KIND,
    manifestPath: candidate.manifestPath,
    analysisId: candidate.validated.manifest.analysisId,
    experimentId: candidate.validated.manifest.experimentId,
    wakeId: wakeRequest.wakeId,
    queueRecordSeq: resultRecord.recordSeq,
    status: executionPayload.ok ? 'complete' : executionPayload.status,
    resultCode: executionPayload.ok ? null : executionPayload.code,
    memorySync: memorySyncState
  }, now());

  const finalSnapshot = await writeRuntimeResumeSnapshot(
    projectRoot,
    objectiveRecord,
    claimedPointer,
    queueState,
    {
      writtenAt: now(),
      writtenReason: 'loop-iteration',
      effectiveBudget,
      nextAction: {
        kind: 'await-operator',
        params: {
          reason: 'bounded-slice-complete'
        }
      },
      notes
    }
  );

  if (!executionPayload.ok) {
    throw new ResearchLoopCliError({
      code: executionPayload.code,
      message: executionPayload.message,
      extra: {
        objectiveId,
        wakeId: wakeRequest.wakeId,
        queueRecordSeq: resultRecord.recordSeq,
        eventId: loopEvent.event.eventId,
        snapshotPath: toRepoRelative(projectRoot, finalSnapshot.snapshotPath),
        status: executionPayload.status
      }
    });
  }

  return {
    ok: true,
    command: RESEARCH_LOOP_COMMAND,
    phase9: true,
    objectiveId,
    wakeId: wakeRequest.wakeId,
    status: 'slice-complete',
    taskKind: ANALYSIS_MANIFEST_TASK_KIND,
    taskId,
    taskAttemptId,
    manifestPath: candidate.manifestPath,
    queueRecordSeq: resultRecord.recordSeq,
    eventId: loopEvent.event.eventId,
    staleLeaseRecovered: leaseClaim.staleReclaimed,
    snapshotPath: toRepoRelative(projectRoot, finalSnapshot.snapshotPath),
    queuePath: normalizeSlashes(path.join('.vibe-science-environment', 'objectives', objectiveId, OBJECTIVE_QUEUE_FILE)),
    memorySync: memorySyncState
  };
}

export const INTERNALS = Object.freeze({
  objectiveQueuePath,
  appendQueueRecord,
  readQueueRecords,
  deriveQueueState,
  resolveEffectiveBudget,
  buildRuntimeResumeSnapshot,
  writeRuntimeResumeSnapshot,
  maybeRepairSnapshotFromDurableState,
  evaluateStrategicCheckpoint,
  deriveNextAnalysisCandidate,
  claimWakeLease
});
