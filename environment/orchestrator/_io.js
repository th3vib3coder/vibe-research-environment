import {
  appendFile,
  mkdir,
  open,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  classifyLockOpenError,
  loadValidator,
  now,
  readJson,
  readJsonl,
  resolveInside,
} from '../control/_io.js';
import {
  orchestratorDir,
  orchestratorLocksDir,
  resolveOrchestratorPath,
} from './_paths.js';

const DEFAULT_LOCK_OPTIONS = Object.freeze({
  staleMs: 30_000,
  retryDelayMs: 25,
  maxRetries: 40,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureOrchestratorDir(projectPath) {
  const root = orchestratorDir(projectPath);
  const locks = orchestratorLocksDir(projectPath);
  await mkdir(root, { recursive: true });
  await mkdir(locks, { recursive: true });
  return root;
}

async function acquireOrchestratorLock(projectPath, lockName, options = {}) {
  const lockOptions = {
    ...DEFAULT_LOCK_OPTIONS,
    ...options,
  };
  const openImpl = options.openImpl ?? open;
  const platform = options.platform ?? process.platform;
  const locksPath = orchestratorLocksDir(projectPath);
  await mkdir(locksPath, { recursive: true });

  const lockPath = resolveInside(locksPath, `${lockName}.lock`);

  let lastError;
  for (let attempt = 0; attempt <= lockOptions.maxRetries; attempt += 1) {
    try {
      const handle = await openImpl(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: now(),
        }),
        'utf8',
      );
      return {
        async release() {
          await handle.close().catch(() => {});
          await rm(lockPath, { force: true }).catch(() => {});
        },
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
        const ageMs = metadata ? Date.now() - metadata.mtimeMs : lockOptions.staleMs + 1;

        if (ageMs > lockOptions.staleMs) {
          await rm(lockPath, { force: true }).catch(() => {});
          continue;
        }
      }

      if (attempt === lockOptions.maxRetries) {
        throw new Error(`Failed to acquire orchestrator lock: ${lockName}`, {
          cause: lastError,
        });
      }

      await sleep(lockOptions.retryDelayMs);
    }
  }

  throw new Error(`Failed to acquire orchestrator lock: ${lockName}`, {
    cause: lastError,
  });
}

export async function withOrchestratorLock(projectPath, lockName, fn, options = {}) {
  const lock = await acquireOrchestratorLock(projectPath, lockName, options);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

export async function readOrchestratorJson(
  projectPath,
  fileName,
  { schemaFile = null, label = fileName } = {},
) {
  const filePath = resolveOrchestratorPath(projectPath, fileName);

  try {
    const data = await readJson(filePath);
    if (schemaFile) {
      const validate = await loadValidator(projectPath, schemaFile);
      assertValid(validate, data, label);
    }
    return data;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeOrchestratorJson(
  projectPath,
  fileName,
  data,
  { schemaFile = null, label = fileName } = {},
) {
  if (schemaFile) {
    const validate = await loadValidator(projectPath, schemaFile);
    assertValid(validate, data, label);
  }

  await ensureOrchestratorDir(projectPath);
  const targetPath = resolveOrchestratorPath(projectPath, fileName);
  await atomicWriteJson(targetPath, data);
  return data;
}

export async function ensureOrchestratorJsonlFile(projectPath, fileName) {
  await ensureOrchestratorDir(projectPath);
  const targetPath = resolveOrchestratorPath(projectPath, fileName);

  await withOrchestratorLock(
    projectPath,
    path.basename(fileName),
    async () => {
      await writeFile(targetPath, '', {
        encoding: 'utf8',
        flag: 'a',
      });
    },
  );

  return targetPath;
}

export async function readOrchestratorJsonl(
  projectPath,
  fileName,
  { schemaFile = null, label = fileName } = {},
) {
  const filePath = resolveOrchestratorPath(projectPath, fileName);
  const records = await readJsonl(filePath);

  if (!schemaFile) {
    return records;
  }

  const validate = await loadValidator(projectPath, schemaFile);
  for (const [index, record] of records.entries()) {
    assertValid(validate, record, `${label} record ${index + 1}`);
  }
  return records;
}

export async function appendOrchestratorJsonl(
  projectPath,
  fileName,
  record,
  {
    schemaFile = null,
    label = fileName,
    lockName = path.basename(fileName),
    lockOptions = {},
  } = {},
) {
  if (schemaFile) {
    const validate = await loadValidator(projectPath, schemaFile);
    assertValid(validate, record, label);
  }

  await ensureOrchestratorDir(projectPath);
  const targetPath = resolveOrchestratorPath(projectPath, fileName);

  await withOrchestratorLock(
    projectPath,
    lockName,
    async () => {
      await appendFile(targetPath, `${JSON.stringify(record)}\n`, 'utf8');
    },
    lockOptions,
  );

  return record;
}
