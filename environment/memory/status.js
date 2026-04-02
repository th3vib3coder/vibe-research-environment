import {
  loadValidator,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';

const SCHEMA_FILE = 'memory-sync-state.schema.json';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const STALE_MEMORY_WARNING = 'STALE — run /sync-memory to refresh';
export const MEMORY_STATUS_UNAVAILABLE_WARNING =
  'Memory freshness unavailable — run /sync-memory to refresh';

function syncStatePath(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'memory',
    'sync-state.json'
  );
}

function buildFreshnessStatus(overrides = {}) {
  return {
    hasSyncState: false,
    status: 'missing',
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    isStale: false,
    warning: null,
    ...overrides
  };
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isOlderThanThreshold(timestamp, nowValue) {
  return timestamp != null && nowValue - timestamp > STALE_AFTER_MS;
}

function formatValidationErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export async function getMemoryFreshness(projectPath, options = {}) {
  let state;
  try {
    state = await readJson(syncStatePath(projectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return buildFreshnessStatus();
    }

    return buildFreshnessStatus({
      status: 'unavailable',
      warning: `${MEMORY_STATUS_UNAVAILABLE_WARNING} (${error.message})`
    });
  }

  let validate;
  try {
    validate = await loadValidator(projectPath, SCHEMA_FILE);
  } catch (error) {
    return buildFreshnessStatus({
      hasSyncState: true,
      status: 'unavailable',
      warning: `${MEMORY_STATUS_UNAVAILABLE_WARNING} (${error.message})`
    });
  }

  if (!validate(state)) {
    return buildFreshnessStatus({
      hasSyncState: true,
      status: 'invalid',
      warning: `${MEMORY_STATUS_UNAVAILABLE_WARNING} (${formatValidationErrors(
        validate.errors
      )})`
    });
  }

  const nowValue =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
        ? options.now
        : Date.now();
  const lastSyncTimestamp = parseTimestamp(state.lastSyncAt);
  const isStale = isOlderThanThreshold(lastSyncTimestamp, nowValue);

  return buildFreshnessStatus({
    hasSyncState: true,
    status: state.status,
    lastSyncAt: state.lastSyncAt,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    isStale,
    warning: isStale ? STALE_MEMORY_WARNING : null
  });
}

export const INTERNALS = {
  formatValidationErrors,
  isOlderThanThreshold,
  parseTimestamp,
  syncStatePath
};
