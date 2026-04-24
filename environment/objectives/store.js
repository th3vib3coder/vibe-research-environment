import { access, mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now,
  resolveInside,
  resolveProjectRoot,
  readJson,
  withLock
} from '../control/_io.js';

export const OBJECTIVES_ROOT_RELATIVE_PATH = '.vibe-science-environment/objectives';
export const OBJECTIVE_RECORD_FILE = 'objective.json';
export const OBJECTIVE_EVENTS_FILE = 'events.jsonl';
export const OBJECTIVE_HANDOFFS_FILE = 'handoffs.jsonl';
export const OBJECTIVE_DIGESTS_DIR = 'digests';
export const OBJECTIVE_SCHEMA_FILE = 'phase9-objective.schema.json';
export const ACTIVE_OBJECTIVE_POINTER_FILE = 'active-objective.json';
export const ACTIVE_OBJECTIVE_POINTER_SCHEMA_FILE = 'phase9-active-objective-pointer.schema.json';
export const ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH = `${OBJECTIVES_ROOT_RELATIVE_PATH}/${ACTIVE_OBJECTIVE_POINTER_FILE}`;
export const OBJECTIVE_POINTER_LOCK_NAME = 'phase9-active-objective-pointer';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PROJECT_ROOT = resolveProjectRoot(path.join(MODULE_DIR, '..', '..'));
const PAUSABLE_STATUSES = new Set(['active', 'blocked']);

export class ObjectiveLockHeldError extends Error {
  constructor({ objectiveId, pointerPath }) {
    const stopCommand = `node bin/vre objective stop --objective ${objectiveId} --reason "<short>"`;
    const pauseCommand = `node bin/vre objective pause --objective ${objectiveId} --reason "<short>"`;
    super(
      `OBJECTIVE_LOCK_HELD active objective ${objectiveId} already owns ${pointerPath}; ` +
      `stop with "${stopCommand}" or pause with "${pauseCommand}"`
    );
    this.name = 'ObjectiveLockHeldError';
    this.code = 'OBJECTIVE_LOCK_HELD';
    this.objectiveId = objectiveId;
    this.pointerPath = pointerPath;
    this.stopCommand = stopCommand;
    this.pauseCommand = pauseCommand;
  }
}

function assertSafeObjectiveId(objectiveId) {
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
    throw new TypeError('objectiveId must be a non-empty string');
  }

  if (
    objectiveId === '.' ||
    objectiveId === '..' ||
    objectiveId.includes('/') ||
    objectiveId.includes('\\')
  ) {
    throw new Error(`objectiveId must be a single safe path segment: ${objectiveId}`);
  }
}

function atomicTempPath(filePath) {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );
}

export async function atomicWriteUtf8(filePath, content) {
  const directoryPath = path.dirname(filePath);
  await mkdir(directoryPath, { recursive: true });

  const tempPath = atomicTempPath(filePath);
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
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

export async function resolveSchemaHostRoot(projectRoot, schemaFile = OBJECTIVE_SCHEMA_FILE) {
  const targetSchemaPath = path.join(
    projectRoot,
    'environment',
    'schemas',
    schemaFile
  );
  if (await pathExists(targetSchemaPath)) {
    return projectRoot;
  }
  return MODULE_PROJECT_ROOT;
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

export function createInitialWakeLease() {
  return {
    wakeId: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    acquiredBy: null,
    previousWakeId: null
  };
}

export async function validateObjectiveRecord(projectRoot, objectiveRecord) {
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, OBJECTIVE_SCHEMA_FILE);
  const validate = await loadValidator(schemaHostRoot, OBJECTIVE_SCHEMA_FILE);
  assertValid(validate, objectiveRecord, 'phase9 objective');
}

async function validateActiveObjectivePointer(projectRoot, pointer) {
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, ACTIVE_OBJECTIVE_POINTER_SCHEMA_FILE);
  const validate = await loadValidator(schemaHostRoot, ACTIVE_OBJECTIVE_POINTER_SCHEMA_FILE);
  assertValid(validate, pointer, 'phase9 active objective pointer');
}

export function objectivesRootDir(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'objectives'
  );
}

export function objectiveDir(projectPath, objectiveId) {
  assertSafeObjectiveId(objectiveId);
  return resolveInside(objectivesRootDir(projectPath), objectiveId);
}

export function objectiveRecordPath(projectPath, objectiveId) {
  return resolveInside(objectiveDir(projectPath, objectiveId), OBJECTIVE_RECORD_FILE);
}

export function objectiveEventsPath(projectPath, objectiveId) {
  return resolveInside(objectiveDir(projectPath, objectiveId), OBJECTIVE_EVENTS_FILE);
}

export function objectiveHandoffsPath(projectPath, objectiveId) {
  return resolveInside(objectiveDir(projectPath, objectiveId), OBJECTIVE_HANDOFFS_FILE);
}

export function objectiveDigestsDir(projectPath, objectiveId) {
  return resolveInside(objectiveDir(projectPath, objectiveId), OBJECTIVE_DIGESTS_DIR);
}

export function activeObjectivePointerPath(projectPath) {
  return resolveInside(objectivesRootDir(projectPath), ACTIVE_OBJECTIVE_POINTER_FILE);
}

export async function writeObjectiveRecord(projectPath, objectiveRecord) {
  const projectRoot = resolveProjectRoot(projectPath);
  await validateObjectiveRecord(projectRoot, objectiveRecord);
  const recordPath = objectiveRecordPath(projectRoot, objectiveRecord.objectiveId);
  await atomicWriteUtf8(
    recordPath,
    `${JSON.stringify(objectiveRecord, null, 2)}\n`
  );
  return recordPath;
}

export async function mutateObjectiveArtifactsIndex(projectPath, objectiveId, mutator, options = {}) {
  if (typeof mutator !== 'function') {
    throw new TypeError('mutateObjectiveArtifactsIndex requires a mutator(currentArtifactsIndex) function');
  }
  const projectRoot = resolveProjectRoot(projectPath);
  // Per-objective lock. Read-modify-write has to run atomically under the
  // same lock or two concurrent callers can both read the same baseline
  // and silently overwrite each other when they write back. atomicWriteUtf8
  // in writeObjectiveRecord only guarantees file-level atomicity, not
  // read-modify-write atomicity. withLock is NOT reentrant, so the lock
  // lives here and NOT at the caller (see experiment-binding.js). Same
  // lock-name shape used by appendObjectiveEvent in resume-snapshot.js.
  return withLock(projectRoot, `${objectiveId}-${OBJECTIVE_RECORD_FILE}`, async () => {
    const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
    const currentIndex = objectiveRecord.artifactsIndex ?? {};
    const nextIndex = mutator(currentIndex);
    if (nextIndex === currentIndex) {
      return {
        objectiveRecord,
        artifactsIndexChanged: false
      };
    }
    const updatedRecord = {
      ...objectiveRecord,
      artifactsIndex: nextIndex,
      lastUpdatedAt: options.updatedAt ?? now()
    };
    await writeObjectiveRecord(projectRoot, updatedRecord);
    return {
      objectiveRecord: updatedRecord,
      artifactsIndexChanged: true
    };
  });
}

export async function createObjectiveStore(projectPath, objectiveRecord) {
  const projectRoot = resolveProjectRoot(projectPath);
  await validateObjectiveRecord(projectRoot, objectiveRecord);

  const objectivesRoot = objectivesRootDir(projectRoot);
  const objectivePath = objectiveDir(projectRoot, objectiveRecord.objectiveId);
  const recordPath = objectiveRecordPath(projectRoot, objectiveRecord.objectiveId);
  const eventsPath = objectiveEventsPath(projectRoot, objectiveRecord.objectiveId);
  const handoffsPath = objectiveHandoffsPath(projectRoot, objectiveRecord.objectiveId);
  const digestsPath = objectiveDigestsDir(projectRoot, objectiveRecord.objectiveId);

  await mkdir(objectivesRoot, { recursive: true });

  try {
    await mkdir(objectivePath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(
        `Objective store already exists for ${objectiveRecord.objectiveId}: ${objectivePath}`
      );
    }
    throw error;
  }

  try {
    await mkdir(digestsPath);
    await atomicWriteUtf8(eventsPath, '');
    await atomicWriteUtf8(handoffsPath, '');
    await writeObjectiveRecord(projectRoot, objectiveRecord);
  } catch (error) {
    await rm(objectivePath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return {
    objectivesRoot,
    objectiveDir: objectivePath,
    objectiveRecordPath: recordPath,
    objectiveEventsPath: eventsPath,
    objectiveHandoffsPath: handoffsPath,
    objectiveDigestsDir: digestsPath
  };
}

export async function readObjectiveRecord(projectPath, objectiveId) {
  return readJson(objectiveRecordPath(projectPath, objectiveId));
}

export async function deleteObjectiveStore(projectPath, objectiveId) {
  await rm(objectiveDir(projectPath, objectiveId), { recursive: true, force: true });
}

export async function readActiveObjectivePointer(projectPath) {
  try {
    const projectRoot = resolveProjectRoot(projectPath);
    const pointer = await readJson(activeObjectivePointerPath(projectRoot));
    await validateActiveObjectivePointer(projectRoot, pointer);
    return pointer;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function deleteActiveObjectivePointer(projectPath, expectedObjectiveId = null) {
  const projectRoot = resolveProjectRoot(projectPath);
  const activePointer = await readActiveObjectivePointer(projectRoot);
  if (!activePointer) {
    return null;
  }

  if (expectedObjectiveId && activePointer.objectiveId !== expectedObjectiveId) {
    throw new Error(
      `Active objective pointer references ${activePointer.objectiveId}, not ${expectedObjectiveId}`
    );
  }

  await rm(activeObjectivePointerPath(projectRoot), { force: true });
  return activePointer;
}

export async function nextObjectiveId(projectPath) {
  const projectRoot = resolveProjectRoot(projectPath);
  const objectivesRoot = objectivesRootDir(projectRoot);
  await mkdir(objectivesRoot, { recursive: true });
  const entries = await readdir(objectivesRoot, { withFileTypes: true });
  const highestNumericSuffix = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^OBJ-(\d+)$/u.exec(entry.name))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .reduce((maxValue, value) => Math.max(maxValue, value), 0);
  return `OBJ-${String(highestNumericSuffix + 1).padStart(3, '0')}`;
}

export async function createActiveObjectivePointer(projectPath, payload, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const pointer = {
    schemaVersion: 'phase9.active-objective-pointer.v1',
    objectiveId: payload.objectiveId,
    objectiveRecordPath: payload.objectiveRecordPath,
    lockAcquiredAt: payload.lockAcquiredAt ?? now(),
    lockAcquiredBySession: payload.lockAcquiredBySession,
    currentWakeLease: payload.currentWakeLease ?? createInitialWakeLease()
  };

  await validateActiveObjectivePointer(projectRoot, pointer);
  const pointerPath = activeObjectivePointerPath(projectRoot);
  const atomicWritePointer = options.atomicWriteJsonImpl ?? atomicWriteJson;
  await atomicWritePointer(pointerPath, pointer);
  return {
    pointer,
    pointerPath
  };
}

export async function activateObjective(projectPath, objectiveRecord, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const lockAcquiredBySession = options.lockAcquiredBySession ?? options.sessionId;
  if (typeof lockAcquiredBySession !== 'string' || lockAcquiredBySession.trim() === '') {
    throw new TypeError('lockAcquiredBySession must be a non-empty string');
  }

  return withLock(projectRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
    const existingPointer = await readActiveObjectivePointer(projectRoot);
    if (existingPointer) {
      throw new ObjectiveLockHeldError({
        objectiveId: existingPointer.objectiveId,
        pointerPath: ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH
      });
    }

    const resolvedObjectiveRecord = objectiveRecord.objectiveId
      ? objectiveRecord
      : {
          ...objectiveRecord,
          objectiveId: await nextObjectiveId(projectRoot)
        };

    const objectiveStore = await createObjectiveStore(projectRoot, resolvedObjectiveRecord);
    try {
      const activePointer = await createActiveObjectivePointer(
        projectRoot,
        {
          objectiveId: resolvedObjectiveRecord.objectiveId,
          objectiveRecordPath: toRepoRelative(projectRoot, objectiveStore.objectiveRecordPath),
          lockAcquiredAt: options.lockAcquiredAt ?? now(),
          lockAcquiredBySession,
          currentWakeLease: createInitialWakeLease()
        },
        options
      );

      return {
        ...objectiveStore,
        activeObjectivePointerPath: activePointer.pointerPath,
        activeObjectivePointer: activePointer.pointer,
        objectiveRecord: resolvedObjectiveRecord
      };
    } catch (error) {
      await rm(activeObjectivePointerPath(projectRoot), { force: true }).catch(() => {});
      await rm(objectiveStore.objectiveDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  });
}

async function requireActiveObjective(projectRoot, expectedObjectiveId = null) {
  const activePointer = await readActiveObjectivePointer(projectRoot);
  if (!activePointer) {
    throw new Error('No active objective pointer exists');
  }

  if (expectedObjectiveId && activePointer.objectiveId !== expectedObjectiveId) {
    throw new Error(
      `Active objective pointer references ${activePointer.objectiveId}, not ${expectedObjectiveId}`
    );
  }

  const objectiveRecord = await readObjectiveRecord(projectRoot, activePointer.objectiveId);
  return {
    activePointer,
    objectiveRecord
  };
}

export async function pauseObjective(projectPath, objectiveId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);

  return withLock(projectRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
    const { activePointer, objectiveRecord } = await requireActiveObjective(projectRoot, objectiveId);
    if (!PAUSABLE_STATUSES.has(objectiveRecord.status)) {
      throw new Error(`Cannot pause objective in status ${objectiveRecord.status}`);
    }

    const updatedRecord = {
      ...objectiveRecord,
      status: 'paused',
      lastUpdatedAt: options.updatedAt ?? now()
    };
    await writeObjectiveRecord(projectRoot, updatedRecord);

    return {
      activeObjectivePointerPath: activeObjectivePointerPath(projectRoot),
      activeObjectivePointer: activePointer,
      objectiveRecord: updatedRecord
    };
  });
}

export async function stopObjective(projectPath, objectiveId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);

  return withLock(projectRoot, OBJECTIVE_POINTER_LOCK_NAME, async () => {
    const { activePointer, objectiveRecord } = await requireActiveObjective(projectRoot, objectiveId);
    const terminalStatus = objectiveRecord.status === 'completed' ? 'completed' : 'abandoned';
    const updatedRecord = {
      ...objectiveRecord,
      status: terminalStatus,
      lastUpdatedAt: options.updatedAt ?? now()
    };

    await writeObjectiveRecord(projectRoot, updatedRecord);
    await rm(activeObjectivePointerPath(projectRoot), { force: true });

    return {
      releasedPointerPath: ACTIVE_OBJECTIVE_POINTER_RELATIVE_PATH,
      releasedPointer: activePointer,
      objectiveRecord: updatedRecord
    };
  });
}

export async function listObjectiveStoreEntries(projectPath, objectiveId) {
  return (await readdir(objectiveDir(projectPath, objectiveId))).sort((left, right) =>
    left.localeCompare(right)
  );
}
