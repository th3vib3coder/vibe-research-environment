import { access, mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertValid,
  loadValidator,
  resolveInside,
  resolveProjectRoot,
  readJson
} from '../control/_io.js';

export const OBJECTIVES_ROOT_RELATIVE_PATH = '.vibe-science-environment/objectives';
export const OBJECTIVE_RECORD_FILE = 'objective.json';
export const OBJECTIVE_EVENTS_FILE = 'events.jsonl';
export const OBJECTIVE_HANDOFFS_FILE = 'handoffs.jsonl';
export const OBJECTIVE_DIGESTS_DIR = 'digests';
export const OBJECTIVE_SCHEMA_FILE = 'phase9-objective.schema.json';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PROJECT_ROOT = resolveProjectRoot(path.join(MODULE_DIR, '..', '..'));

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

async function atomicWriteUtf8(filePath, content) {
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

async function resolveSchemaHostRoot(projectRoot) {
  const targetSchemaPath = path.join(
    projectRoot,
    'environment',
    'schemas',
    OBJECTIVE_SCHEMA_FILE
  );
  if (await pathExists(targetSchemaPath)) {
    return projectRoot;
  }
  return MODULE_PROJECT_ROOT;
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

export async function createObjectiveStore(projectPath, objectiveRecord) {
  const projectRoot = resolveProjectRoot(projectPath);
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot);
  const validate = await loadValidator(schemaHostRoot, OBJECTIVE_SCHEMA_FILE);
  assertValid(validate, objectiveRecord, 'phase9 objective');

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
    await atomicWriteUtf8(
      recordPath,
      `${JSON.stringify(objectiveRecord, null, 2)}\n`
    );
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

export async function listObjectiveStoreEntries(projectPath, objectiveId) {
  return (await readdir(objectiveDir(projectPath, objectiveId))).sort((left, right) =>
    left.localeCompare(right)
  );
}
