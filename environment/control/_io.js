import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const VALIDATOR_CACHE = new Map();
const DEFAULT_LOCK_OPTIONS = Object.freeze({
  staleMs: 30_000,
  retryDelayMs: 25,
  maxRetries: 40
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveProjectRoot(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new TypeError('projectPath must be a non-empty string');
  }

  return path.resolve(projectPath);
}

export function resolveInside(baseDir, ...segments) {
  const targetPath = path.resolve(baseDir, ...segments);
  const relativePath = path.relative(baseDir, targetPath);

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Resolved path escapes base directory: ${targetPath}`);
  }

  return targetPath;
}

export function controlDir(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'control'
  );
}

export function controlLocksDir(projectPath) {
  return resolveInside(controlDir(projectPath), 'locks');
}

export async function ensureControlDir(projectPath) {
  const controlPath = controlDir(projectPath);
  const locksPath = controlLocksDir(projectPath);
  await mkdir(controlPath, { recursive: true });
  await mkdir(locksPath, { recursive: true });
  return controlPath;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function atomicWriteJson(filePath, data) {
  const directoryPath = path.dirname(filePath);
  await mkdir(directoryPath, { recursive: true });

  const tempPath = path.join(
    directoryPath,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );
  const serialized = `${JSON.stringify(data, null, 2)}\n`;

  await writeFile(tempPath, serialized, 'utf8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function acquireLock(projectPath, lockName, options = {}) {
  const lockOptions = {
    ...DEFAULT_LOCK_OPTIONS,
    ...options
  };
  const locksPath = controlLocksDir(projectPath);
  await mkdir(locksPath, { recursive: true });

  const lockPath = resolveInside(locksPath, `${lockName}.lock`);

  for (let attempt = 0; attempt <= lockOptions.maxRetries; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: now()
        }),
        'utf8'
      );
      return {
        lockPath,
        async release() {
          await handle.close().catch(() => {});
          await rm(lockPath, { force: true }).catch(() => {});
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const metadata = await stat(lockPath).catch(() => null);
      const ageMs = metadata
        ? Date.now() - metadata.mtimeMs
        : lockOptions.staleMs + 1;

      if (ageMs > lockOptions.staleMs) {
        await rm(lockPath, { force: true }).catch(() => {});
        continue;
      }

      if (attempt === lockOptions.maxRetries) {
        throw new Error(`Failed to acquire control-plane lock: ${lockName}`);
      }

      await sleep(lockOptions.retryDelayMs);
    }
  }

  throw new Error(`Failed to acquire control-plane lock: ${lockName}`);
}

export async function withLock(projectPath, lockName, fn, options = {}) {
  const lock = await acquireLock(projectPath, lockName, options);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

export async function appendJsonl(projectPath, fileName, record, options = {}) {
  await ensureControlDir(projectPath);
  const targetPath = resolveInside(controlDir(projectPath), fileName);

  return withLock(
    projectPath,
    options.lockName ?? path.basename(fileName),
    async () => {
      await appendFile(targetPath, `${JSON.stringify(record)}\n`, 'utf8');
      return targetPath;
    },
    options
  );
}

export async function readJsonl(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function loadValidator(projectPath, schemaFile) {
  const schemaPath = resolveInside(
    resolveProjectRoot(projectPath),
    'environment',
    'schemas',
    schemaFile
  );

  if (VALIDATOR_CACHE.has(schemaPath)) {
    return VALIDATOR_CACHE.get(schemaPath);
  }

  const schema = await readJson(schemaPath);
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  VALIDATOR_CACHE.set(schemaPath, validate);
  return validate;
}

export function assertValid(validate, data, label) {
  if (validate(data)) {
    return;
  }

  const details = (validate.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
  throw new Error(`Invalid ${label}: ${details}`);
}

export function now() {
  return new Date().toISOString();
}
