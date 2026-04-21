import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { resolveInside, resolveProjectRoot } from './_io.js';

export const TEST_CLOCK_OFFSET_SCHEMA_VERSION = 'phase9.test-clock-offset.v1';
export const TEST_CLOCK_OFFSET_PATH =
  '.vibe-science-environment/control/test-clock-offset.json';

function testClockOffsetPath(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'control',
    'test-clock-offset.json'
  );
}

function parseOffsetPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('test clock offset payload must be an object');
  }

  if (raw.schemaVersion !== TEST_CLOCK_OFFSET_SCHEMA_VERSION) {
    throw new Error(
      `test clock offset schemaVersion must be ${TEST_CLOCK_OFFSET_SCHEMA_VERSION}`
    );
  }

  if (!Number.isFinite(raw.offsetMs)) {
    throw new Error('test clock offset offsetMs must be a finite number');
  }

  return raw.offsetMs;
}

function resolveTargetPath(projectPath, targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new TypeError('targetPath must be a non-empty string');
  }

  if (path.isAbsolute(targetPath)) {
    return path.resolve(targetPath);
  }

  const relativeSegments = targetPath
    .split(/[\\/]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return resolveInside(resolveProjectRoot(projectPath), ...relativeSegments);
}

export async function readTestClockOffsetMs(projectPath) {
  try {
    const payload = JSON.parse(await readFile(testClockOffsetPath(projectPath), 'utf8'));
    return parseOffsetPayload(payload);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0;
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid test clock offset JSON: ${error.message}`);
    }

    throw error;
  }
}

export async function nowMs(projectPath) {
  return Date.now() + await readTestClockOffsetMs(projectPath);
}

export async function nowIso(projectPath) {
  return new Date(await nowMs(projectPath)).toISOString();
}

export async function statMtimeMs(projectPath, targetPath) {
  return (await stat(resolveTargetPath(projectPath, targetPath))).mtimeMs;
}

export const INTERNALS = {
  parseOffsetPayload,
  resolveTargetPath,
  testClockOffsetPath
};
