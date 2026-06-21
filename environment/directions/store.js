import { access, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertValid,
  loadValidator,
  readJsonl,
  resolveInside,
  resolveProjectRoot,
  withLock,
} from '../control/_io.js';

export const DIRECTIONS_ROOT_RELATIVE_PATH = '.vibe-science-environment/directions';
export const DIRECTION_EVENTS_FILE = 'directions.jsonl';
export const DIRECTION_SCHEMA_FILE = 'direction-record.schema.json';
export const DIRECTION_EVENTS_LOCK_NAME = 'direction-events';

export const DIRECTION_TRANSITIONS = Object.freeze({
  tried: Object.freeze(['killed', 'parked', 'contradicted']),
  killed: Object.freeze(['revived']),
  contradicted: Object.freeze(['revived']),
  parked: Object.freeze(['revived', 'killed']),
  revived: Object.freeze(['killed', 'parked', 'contradicted']),
});

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PROJECT_ROOT = resolveProjectRoot(path.join(MODULE_DIR, '..', '..'));

export class DirectionStoreError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'DirectionStoreError';
    this.code = code;
    this.extra = extra;
  }
}

function failDirectionStore(code, message, extra = {}) {
  throw new DirectionStoreError({ code, message, extra });
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function resolveDirectionSchemaHostRoot(projectPath) {
  const projectRoot = resolveProjectRoot(projectPath);
  const schemaPath = path.join(
    projectRoot,
    'environment',
    'schemas',
    DIRECTION_SCHEMA_FILE,
  );
  if (await pathExists(schemaPath)) {
    return projectRoot;
  }
  return MODULE_PROJECT_ROOT;
}

export function directionsRootDir(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'directions',
  );
}

export function directionsEventsPath(projectPath) {
  return resolveInside(directionsRootDir(projectPath), DIRECTION_EVENTS_FILE);
}

function assertSafeDirectionId(directionId) {
  if (typeof directionId !== 'string' || directionId.trim() === '') {
    failDirectionStore('E_DIRECTION_ID_UNSAFE', 'directionId must be a non-empty string');
  }
  if (
    directionId === '.' ||
    directionId === '..' ||
    directionId.includes('/') ||
    directionId.includes('\\') ||
    path.isAbsolute(directionId)
  ) {
    failDirectionStore(
      'E_DIRECTION_ID_UNSAFE',
      `directionId must be a single safe path segment: ${directionId}`,
      { directionId },
    );
  }
}

export async function validateDirectionRecord(projectPath, record) {
  assertSafeDirectionId(record?.directionId);
  const schemaHostRoot = await resolveDirectionSchemaHostRoot(projectPath);
  const validate = await loadValidator(schemaHostRoot, DIRECTION_SCHEMA_FILE);
  assertValid(validate, record, 'direction record');
}

function assertTransitionAllowed(previousRecord, nextRecord) {
  const nextState = nextRecord.state;
  if (!previousRecord) {
    if (nextState !== 'tried') {
      failDirectionStore(
        'E_DIRECTION_TRANSITION_INVALID',
        `Initial direction state must be tried, not ${nextState}`,
        { directionId: nextRecord.directionId, nextState },
      );
    }
    return;
  }

  const previousState = previousRecord.state;
  const allowedNextStates = DIRECTION_TRANSITIONS[previousState] ?? [];
  if (!allowedNextStates.includes(nextState)) {
    failDirectionStore(
      'E_DIRECTION_TRANSITION_INVALID',
      `Invalid direction transition ${previousState} -> ${nextState}`,
      {
        directionId: nextRecord.directionId,
        previousState,
        nextState,
        allowedNextStates,
      },
    );
  }

  if (
    nextState === 'revived' &&
    ['killed', 'contradicted'].includes(previousState)
  ) {
    const condition = previousRecord.doNotRepeatUnless;
    const reason = typeof nextRecord.reason === 'string'
      ? nextRecord.reason.toLowerCase()
      : '';
    const kind = typeof condition?.kind === 'string' ? condition.kind.toLowerCase() : '';
    const detail = typeof condition?.detail === 'string'
      ? condition.detail.toLowerCase()
      : '';

    if (!kind || !detail || !reason.includes(kind) || !reason.includes(detail)) {
      failDirectionStore(
        'E_DIRECTION_REVIVE_CONDITION_UNSATISFIED',
        'Revive must name the prior doNotRepeatUnless condition as satisfied',
        {
          directionId: nextRecord.directionId,
          previousState,
          nextState,
          requiredCondition: condition ?? null,
        },
      );
    }
  }
}

export function projectDirectionEvents(events) {
  const projection = {};
  for (const record of events) {
    assertSafeDirectionId(record?.directionId);
    const previousRecord = projection[record.directionId] ?? null;
    assertTransitionAllowed(previousRecord, record);
    projection[record.directionId] = record;
  }
  return projection;
}

export async function readDirectionEvents(projectPath) {
  const projectRoot = resolveProjectRoot(projectPath);
  const records = await readJsonl(directionsEventsPath(projectRoot));
  for (const record of records) {
    await validateDirectionRecord(projectRoot, record);
  }
  return records;
}

export async function readDirectionProjection(projectPath) {
  return projectDirectionEvents(await readDirectionEvents(projectPath));
}

export async function recordDirection(projectPath, record, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  await validateDirectionRecord(projectRoot, record);

  return withLock(
    projectRoot,
    options.lockName ?? DIRECTION_EVENTS_LOCK_NAME,
    async () => {
      const existingEvents = await readDirectionEvents(projectRoot);
      const projection = projectDirectionEvents(existingEvents);
      assertTransitionAllowed(projection[record.directionId] ?? null, record);

      const eventsPath = directionsEventsPath(projectRoot);
      await mkdir(path.dirname(eventsPath), { recursive: true });
      await appendFile(eventsPath, `${JSON.stringify(record)}\n`, 'utf8');

      return {
        record,
        eventsPath,
        projection: projectDirectionEvents([...existingEvents, record]),
      };
    },
    options.lockOptions,
  );
}
