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

/**
 * Classify an error thrown by open(lockPath, 'wx') during lock acquisition.
 *
 * - 'contended': the lock file already exists (POSIX EEXIST). Honor the
 *   existing stale-reclamation + backoff path.
 * - 'transient': a Windows-only EPERM raised when another handle is briefly
 *   open, the file is in a delete-pending window, or an AV/indexer touches it.
 *   This is contention, not a real permission failure, so back off and retry,
 *   but NEVER stale-remove (the lock may be live; removing it would break
 *   mutual exclusion). A crashed holder surfaces as EEXIST, not EPERM, so
 *   reclamation still flows through the 'contended' path.
 * - 'fatal': anything else, including POSIX EPERM (a genuine permission error),
 *   which must surface immediately rather than spin.
 */
export function classifyLockOpenError(error, platform = process.platform) {
  const code = error?.code;
  if (code === 'EEXIST') {
    return 'contended';
  }
  if (platform === 'win32' && code === 'EPERM') {
    return 'transient';
  }
  return 'fatal';
}

async function acquireLock(projectPath, lockName, options = {}) {
  const lockOptions = {
    ...DEFAULT_LOCK_OPTIONS,
    ...options
  };
  const openImpl = options.openImpl ?? open;
  const platform = options.platform ?? process.platform;
  const locksPath = controlLocksDir(projectPath);
  await mkdir(locksPath, { recursive: true });

  const lockPath = resolveInside(locksPath, `${lockName}.lock`);

  let lastError;
  for (let attempt = 0; attempt <= lockOptions.maxRetries; attempt += 1) {
    try {
      const handle = await openImpl(lockPath, 'wx');
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
      const lockErrorKind = classifyLockOpenError(error, platform);
      if (lockErrorKind === 'fatal') {
        throw error;
      }
      lastError = error;

      // 'contended' (EEXIST) may be an orphaned lock from a crashed holder:
      // reclaim it once stale. A 'transient' Windows EPERM must NOT reclaim;
      // the lock may be live, and removing it would break mutual exclusion.
      if (lockErrorKind === 'contended') {
        const metadata = await stat(lockPath).catch(() => null);
        const ageMs = metadata
          ? Date.now() - metadata.mtimeMs
          : lockOptions.staleMs + 1;

        if (ageMs > lockOptions.staleMs) {
          await rm(lockPath, { force: true }).catch(() => {});
          continue;
        }
      }

      if (attempt === lockOptions.maxRetries) {
        throw new Error(`Failed to acquire control-plane lock: ${lockName}`, {
          cause: lastError
        });
      }

      await sleep(lockOptions.retryDelayMs);
    }
  }

  throw new Error(`Failed to acquire control-plane lock: ${lockName}`, {
    cause: lastError
  });
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
