import {
  DirectionStoreError,
  readDirectionProjection,
  recordDirection,
} from './store.js';
import {
  DirectionCheckError,
  checkDirection,
} from './check.js';

const DIRECTION_RECORD_SCHEMA_VERSION = 'vibe-env.direction-record.v1';
const DEFAULT_RECORD_REASON = 'Recorded by the direction CLI module.';

export class DirectionCliError extends Error {
  constructor({ command, code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'DirectionCliError';
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failDirectionCli(command, code, message, extra = {}, exitCode = 1) {
  throw new DirectionCliError({
    command,
    code,
    message,
    exitCode,
    extra,
  });
}

function currentTimestamp(deps) {
  const timestamp = typeof deps.now === 'function' ? deps.now() : new Date().toISOString();
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return String(timestamp);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) {
    return [];
  }

  return [...new Set(evidenceRefs.map(normalizeText).filter(Boolean))];
}

function normalizeDoNotRepeatUnless(condition) {
  if (!condition || typeof condition !== 'object') {
    return null;
  }

  return {
    kind: normalizeText(condition.kind),
    detail: normalizeText(condition.detail),
  };
}

function requireDirectionId(command, options) {
  const directionId = normalizeText(options?.directionId);
  if (!directionId) {
    failDirectionCli(
      command,
      'E_DIRECTION_ID_REQUIRED',
      `${command} requires a directionId`,
      {},
      3,
    );
  }
  return directionId;
}

function requireReason(command, options) {
  const reason = normalizeText(options?.reason);
  if (!reason) {
    failDirectionCli(
      command,
      'E_DIRECTION_REASON_REQUIRED',
      `${command} requires a non-empty reason`,
      {},
      3,
    );
  }
  return reason;
}

function requireDoNotRepeatUnless(command, options) {
  const condition = normalizeDoNotRepeatUnless(options?.doNotRepeatUnless);
  if (!condition?.kind || !condition?.detail) {
    failDirectionCli(
      command,
      'E_DIRECTION_DO_NOT_REPEAT_REQUIRED',
      `${command} requires a structured doNotRepeatUnless condition`,
      {},
      3,
    );
  }
  return condition;
}

function requireEvidenceRef(command, options) {
  const evidenceRef = normalizeText(options?.evidenceRef);
  if (!evidenceRef) {
    failDirectionCli(
      command,
      'E_DIRECTION_EVIDENCE_REQUIRED',
      `${command} requires a non-empty evidenceRef`,
      {},
      3,
    );
  }
  return evidenceRef;
}

function mergeEvidenceRefs(previousRecord, evidenceRefs = []) {
  return normalizeEvidenceRefs([
    ...(Array.isArray(previousRecord.evidenceRefs) ? previousRecord.evidenceRefs : []),
    ...evidenceRefs,
  ]);
}

async function readRequiredDirection(command, projectRoot, directionId) {
  const projection = await readDirectionProjection(projectRoot);
  const previousRecord = projection[directionId];
  if (!previousRecord) {
    failDirectionCli(
      command,
      'E_DIRECTION_NOT_FOUND',
      `${command} could not find direction ${directionId}`,
      { directionId },
      4,
    );
  }
  return previousRecord;
}

function buildLifecycleRecord(previousRecord, nextState, reason, timestamp, extra = {}) {
  return {
    schemaVersion: DIRECTION_RECORD_SCHEMA_VERSION,
    directionId: previousRecord.directionId,
    summary: previousRecord.summary,
    state: nextState,
    reason,
    evidenceRefs: mergeEvidenceRefs(previousRecord, extra.evidenceRefs),
    ...(extra.doNotRepeatUnless ? { doNotRepeatUnless: extra.doNotRepeatUnless } : {}),
    createdAt: previousRecord.createdAt,
    updatedAt: timestamp,
    history: [
      ...(Array.isArray(previousRecord.history) ? previousRecord.history : []),
      {
        state: nextState,
        reason,
        at: timestamp,
      },
    ],
  };
}

export function deriveDirectionIdFromSummary(summary) {
  const slug = normalizeText(summary)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-');

  return `DIR-${slug || 'UNSPECIFIED-DIRECTION'}`;
}

function coerceDirectionCliError(command, error) {
  if (error instanceof DirectionCliError) {
    return error;
  }

  if (error instanceof DirectionStoreError) {
    return new DirectionCliError({
      command,
      code: error.code,
      message: error.message,
      extra: {
        source: 'direction-store',
        storeErrorName: error.name,
        ...(error.extra ?? {}),
      },
    });
  }

  if (error instanceof DirectionCheckError) {
    return new DirectionCliError({
      command,
      code: error.code,
      message: error.message,
      extra: {
        source: 'direction-check',
        ...(error.extra ?? {}),
      },
    });
  }

  return new DirectionCliError({
    command,
    code: 'E_DIRECTION_CLI_FAILED',
    message: error?.message ?? String(error),
  });
}

function buildTriedDirectionRecord(options, deps) {
  const summary = normalizeText(options?.summary);
  if (!summary) {
    failDirectionCli(
      'direction record',
      'E_DIRECTION_SUMMARY_REQUIRED',
      'direction record requires a non-empty summary',
      {},
      3,
    );
  }

  const reason = normalizeText(options.reason) || DEFAULT_RECORD_REASON;
  const timestamp = currentTimestamp(deps);

  return {
    schemaVersion: DIRECTION_RECORD_SCHEMA_VERSION,
    directionId: normalizeText(options.directionId) || deriveDirectionIdFromSummary(summary),
    summary,
    state: 'tried',
    reason,
    evidenceRefs: normalizeEvidenceRefs(options.evidenceRefs),
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [
      {
        state: 'tried',
        reason,
        at: timestamp,
      },
    ],
  };
}

export async function recordDirectionCommand(projectRoot, options = {}, deps = {}) {
  const command = 'direction record';
  try {
    const record = buildTriedDirectionRecord(options, deps);
    const result = await recordDirection(projectRoot, record, deps.storeOptions ?? {});
    return {
      ok: true,
      command,
      directionId: result.record.directionId,
      record: result.record,
      projection: result.projection,
    };
  } catch (error) {
    throw coerceDirectionCliError(command, error);
  }
}

export async function listDirectionsCommand(projectRoot) {
  const command = 'direction list';
  try {
    const projection = await readDirectionProjection(projectRoot);
    return {
      ok: true,
      command,
      projection,
      directions: Object.values(projection).sort((left, right) =>
        left.directionId.localeCompare(right.directionId)
      ),
    };
  } catch (error) {
    throw coerceDirectionCliError(command, error);
  }
}

export async function checkDirectionCommand(projectRoot, options = {}) {
  const command = 'direction check';
  try {
    return {
      command,
      ...(await checkDirection(projectRoot, options)),
    };
  } catch (error) {
    throw coerceDirectionCliError(command, error);
  }
}

async function runLifecycleCommand(projectRoot, command, options, deps, buildNextRecord) {
  try {
    const directionId = requireDirectionId(command, options);
    const reason = requireReason(command, options);
    const previousRecord = await readRequiredDirection(command, projectRoot, directionId);
    const timestamp = currentTimestamp(deps);
    const record = buildNextRecord(previousRecord, reason, timestamp);
    const result = await recordDirection(projectRoot, record, deps.storeOptions ?? {});
    return {
      ok: true,
      command,
      directionId,
      record: result.record,
      projection: result.projection,
      extra: {
        previousState: previousRecord.state,
      },
    };
  } catch (error) {
    throw coerceDirectionCliError(command, error);
  }
}

export async function killDirectionCommand(projectRoot, options = {}, deps = {}) {
  const command = 'direction kill';
  return runLifecycleCommand(projectRoot, command, options, deps, (previousRecord, reason, timestamp) =>
    buildLifecycleRecord(previousRecord, 'killed', reason, timestamp, {
      doNotRepeatUnless: requireDoNotRepeatUnless(command, options),
    })
  );
}

export async function parkDirectionCommand(projectRoot, options = {}, deps = {}) {
  const command = 'direction park';
  return runLifecycleCommand(projectRoot, command, options, deps, (previousRecord, reason, timestamp) =>
    buildLifecycleRecord(previousRecord, 'parked', reason, timestamp)
  );
}

export async function reviveDirectionCommand(projectRoot, options = {}, deps = {}) {
  const command = 'direction revive';
  return runLifecycleCommand(projectRoot, command, options, deps, (previousRecord, reason, timestamp) =>
    buildLifecycleRecord(previousRecord, 'revived', reason, timestamp)
  );
}

export async function contradictDirectionCommand(projectRoot, options = {}, deps = {}) {
  const command = 'direction contradict';
  return runLifecycleCommand(projectRoot, command, options, deps, (previousRecord, reason, timestamp) =>
    buildLifecycleRecord(previousRecord, 'contradicted', reason, timestamp, {
      evidenceRefs: [requireEvidenceRef(command, options)],
      doNotRepeatUnless: requireDoNotRepeatUnless(command, options),
    })
  );
}
