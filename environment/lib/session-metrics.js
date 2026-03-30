import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COSTS_RECORD_SCHEMA_PATH = path.resolve(
  __dirname,
  '../schemas/costs-record.schema.json'
);
const COSTS_RECORD_SCHEMA = JSON.parse(
  readFileSync(COSTS_RECORD_SCHEMA_PATH, 'utf8')
);

const ajv = new Ajv({
  allErrors: true,
  strict: false
});
addFormats(ajv);
const validateCostsRecord = ajv.compile(COSTS_RECORD_SCHEMA);

const DEFAULT_STATE = Object.freeze({
  sessionId: null,
  lastAttemptId: null,
  toolCalls: 0,
  claimsProduced: 0,
  claimsKilled: 0,
  r2Reviews: 0,
  estimatedCostUsd: 0,
  countingMode: 'char_fallback',
  budgetState: 'unknown'
});

const INCREMENT_EVENT_MAP = Object.freeze({
  tool_call: 'toolCalls',
  claim_produced: 'claimsProduced',
  claim_killed: 'claimsKilled',
  r2_review: 'r2Reviews'
});

function cloneState(state) {
  return {
    sessionId: state.sessionId,
    lastAttemptId: state.lastAttemptId,
    toolCalls: state.toolCalls,
    claimsProduced: state.claimsProduced,
    claimsKilled: state.claimsKilled,
    r2Reviews: state.r2Reviews,
    estimatedCostUsd: state.estimatedCostUsd,
    countingMode: state.countingMode,
    budgetState: state.budgetState
  };
}

function normalizeNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function normalizeNonNegativeNumber(value, fieldName) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative number`);
  }

  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeCountingMode(value) {
  if (value == null) {
    return DEFAULT_STATE.countingMode;
  }

  if (value !== 'provider_native' && value !== 'char_fallback') {
    throw new TypeError(
      'countingMode must be provider_native or char_fallback'
    );
  }

  return value;
}

function normalizeBudgetState(value) {
  if (value == null) {
    return DEFAULT_STATE.budgetState;
  }

  if (!['ok', 'advisory', 'hard_stop', 'unknown'].includes(value)) {
    throw new TypeError(
      'budgetState must be ok, advisory, hard_stop, or unknown'
    );
  }

  return value;
}

function normalizeInitialState(initial = {}) {
  return {
    sessionId: initial.sessionId ?? DEFAULT_STATE.sessionId,
    lastAttemptId: initial.lastAttemptId ?? DEFAULT_STATE.lastAttemptId,
    toolCalls: normalizeNonNegativeInteger(
      initial.toolCalls ?? DEFAULT_STATE.toolCalls,
      'toolCalls'
    ),
    claimsProduced: normalizeNonNegativeInteger(
      initial.claimsProduced ?? DEFAULT_STATE.claimsProduced,
      'claimsProduced'
    ),
    claimsKilled: normalizeNonNegativeInteger(
      initial.claimsKilled ?? DEFAULT_STATE.claimsKilled,
      'claimsKilled'
    ),
    r2Reviews: normalizeNonNegativeInteger(
      initial.r2Reviews ?? DEFAULT_STATE.r2Reviews,
      'r2Reviews'
    ),
    estimatedCostUsd: normalizeNonNegativeNumber(
      initial.estimatedCostUsd ?? DEFAULT_STATE.estimatedCostUsd,
      'estimatedCostUsd'
    ),
    countingMode: normalizeCountingMode(initial.countingMode),
    budgetState: normalizeBudgetState(initial.budgetState)
  };
}

function applyIncrement(state, fieldName, count = 1) {
  state[fieldName] = normalizeNonNegativeInteger(
    state[fieldName] + normalizeNonNegativeInteger(count, `${fieldName} increment`),
    fieldName
  );
}

function applyEvent(state, event) {
  if (!event || typeof event !== 'object') {
    throw new TypeError('metrics event must be an object');
  }

  const nextState = cloneState(state);

  if (event.sessionId !== undefined) {
    nextState.sessionId = event.sessionId;
  }

  if (event.lastAttemptId !== undefined) {
    nextState.lastAttemptId = event.lastAttemptId;
  }

  const incrementField = INCREMENT_EVENT_MAP[event.type];
  if (incrementField) {
    applyIncrement(nextState, incrementField, event.count ?? 1);
  }

  if (event.type === 'tool_call' && event.estimatedCostUsd !== undefined) {
    nextState.estimatedCostUsd = normalizeNonNegativeNumber(
      nextState.estimatedCostUsd + event.estimatedCostUsd,
      'estimatedCostUsd'
    );
  }

  if (event.estimatedCostUsdDelta !== undefined) {
    nextState.estimatedCostUsd = normalizeNonNegativeNumber(
      nextState.estimatedCostUsd + event.estimatedCostUsdDelta,
      'estimatedCostUsd'
    );
  }

  if (event.estimatedCostUsd !== undefined && event.type !== 'tool_call') {
    nextState.estimatedCostUsd = normalizeNonNegativeNumber(
      event.estimatedCostUsd,
      'estimatedCostUsd'
    );
  }

  if (event.countingMode !== undefined) {
    nextState.countingMode = normalizeCountingMode(event.countingMode);
  }

  if (event.budgetState !== undefined) {
    nextState.budgetState = normalizeBudgetState(event.budgetState);
  }

  if (
    !incrementField &&
    event.sessionId === undefined &&
    event.lastAttemptId === undefined &&
    event.estimatedCostUsd === undefined &&
    event.estimatedCostUsdDelta === undefined &&
    event.countingMode === undefined &&
    event.budgetState === undefined
  ) {
    throw new TypeError(`unsupported metrics event: ${event.type ?? 'unknown'}`);
  }

  return nextState;
}

function buildRecord(state, recordedAt) {
  return {
    sessionId: state.sessionId,
    lastAttemptId: state.lastAttemptId,
    recordedAt,
    toolCalls: state.toolCalls,
    claimsProduced: state.claimsProduced,
    claimsKilled: state.claimsKilled,
    r2Reviews: state.r2Reviews,
    estimatedCostUsd: state.estimatedCostUsd,
    countingMode: state.countingMode,
    budgetState: state.budgetState
  };
}

function buildFlushSignature(record) {
  return JSON.stringify(record);
}

function ensureValidCostsRecord(record) {
  if (!validateCostsRecord(record)) {
    const details = ajv.errorsText(validateCostsRecord.errors, {
      separator: '; '
    });
    throw new Error(`Invalid costs record: ${details}`);
  }

  return record;
}

export function createMetricsAccumulator(initial = {}) {
  let state = normalizeInitialState(initial);
  let lastFlushSignature = null;

  return {
    record(event) {
      state = applyEvent(state, event);
      return this.snapshot();
    },

    snapshot() {
      return cloneState(state);
    },

    async flush(projectPath, options = {}) {
      if (typeof projectPath !== 'string' || projectPath.length === 0) {
        throw new TypeError('projectPath must be a non-empty string');
      }

      const resolvedProjectPath = path.resolve(projectPath);
      const recordedAt = options.recordedAt ?? new Date().toISOString();
      const record = ensureValidCostsRecord(buildRecord(state, recordedAt));
      const flushSignature = buildFlushSignature({
        ...record,
        recordedAt: null
      });
      const metricsDirectory = path.join(
        resolvedProjectPath,
        '.vibe-science-environment',
        'metrics'
      );
      const metricsPath = path.join(metricsDirectory, 'costs.jsonl');

      if (flushSignature === lastFlushSignature) {
        return {
          path: metricsPath,
          record,
          written: false
        };
      }

      await mkdir(metricsDirectory, { recursive: true });
      await appendFile(metricsPath, `${JSON.stringify(record)}\n`, 'utf8');
      lastFlushSignature = flushSignature;

      return {
        path: metricsPath,
        record,
        written: true
      };
    }
  };
}

export const INTERNALS = {
  COSTS_RECORD_SCHEMA_PATH,
  applyEvent,
  buildRecord,
  cloneState,
  normalizeBudgetState,
  normalizeCountingMode,
  normalizeInitialState
};
