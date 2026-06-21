import { createHmac } from 'node:crypto';
import { mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';

export const WAKE_PROOF_SCHEMA_VERSION = 'phase14.wake-proof.v1';
export const WAKE_PROOF_SIGNATURE_ALGORITHM = 'HMAC-SHA256';
export const WAKE_PROOF_ENV_KEY = 'VRE_WAKE_PROOF_KEY';

export const WAKE_PROOF_WAKE_REASONS = Object.freeze([
  'heartbeat',
  'scheduled-heartbeat',
  'manual'
]);

const LEASE_STATUS_VALUES = Object.freeze([
  'acquired',
  'duplicate-no-op',
  'stale-reclaimed',
  'blocked'
]);

const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/u;
const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export class WakeProofError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'WakeProofError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new WakeProofError(code, message, details);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    fail('E_WAKE_PROOF_FIELD_MISSING', `${label} must be an object.`);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('E_WAKE_PROOF_FIELD_MISSING', `${label} must be a non-empty string.`);
  }
  return value;
}

function assertSafeToken(value, label) {
  const token = requireNonEmptyString(value, label);
  if (
    token.includes('..')
    || token.includes('/')
    || token.includes('\\')
    || path.isAbsolute(token)
    || !SAFE_TOKEN_RE.test(token)
  ) {
    fail('E_WAKE_PROOF_PATH_UNSAFE', `${label} contains an unsafe path token.`, {
      label
    });
  }
  return token;
}

function parseIsoDate(value, label) {
  const timestamp = requireNonEmptyString(value, label);
  if (!ISO_DATE_TIME_RE.test(timestamp)) {
    fail('E_WAKE_PROOF_TIMESTAMP_INVALID', `${label} must be an ISO UTC datetime.`);
  }
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) {
    fail('E_WAKE_PROOF_TIMESTAMP_INVALID', `${label} must be parseable.`);
  }
  return { timestamp, ms };
}

function normalizeLeaseState(value) {
  const leaseState = requireObject(value, 'leaseState');
  const allowed = new Set(['status', 'ownerWakeId', 'expiresAt']);
  for (const key of Object.keys(leaseState)) {
    if (!allowed.has(key)) {
      fail('E_WAKE_PROOF_LEASE_STATE_INVALID', `leaseState.${key} is not reviewed.`);
    }
  }

  const status = requireNonEmptyString(leaseState.status, 'leaseState.status');
  if (!LEASE_STATUS_VALUES.includes(status)) {
    fail('E_WAKE_PROOF_LEASE_STATE_INVALID', 'leaseState.status is not reviewed.');
  }

  const normalized = { status };
  if (leaseState.ownerWakeId !== undefined) {
    normalized.ownerWakeId = assertSafeToken(leaseState.ownerWakeId, 'leaseState.ownerWakeId');
  }
  if (leaseState.expiresAt !== undefined) {
    normalized.expiresAt = parseIsoDate(leaseState.expiresAt, 'leaseState.expiresAt')
      .timestamp;
  }
  return normalized;
}

function requireKey(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    fail('E_WAKE_PROOF_KEY_MISSING', `${WAKE_PROOF_ENV_KEY} is required.`);
  }
  return key;
}

export function canonicalizeForWakeProof(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeForWakeProof(item)).join(',')}]`;
  }
  if (isObject(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeForWakeProof(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  fail('E_WAKE_PROOF_FIELD_MISSING', 'wake proof contains a non-JSON value.');
}

export function createWakeProofPayload(input) {
  const source = requireObject(input, 'wake proof input');
  const objectiveId = assertSafeToken(source.objectiveId, 'objectiveId');
  const wakeId = assertSafeToken(source.wakeId, 'wakeId');
  const scheduled = parseIsoDate(source.scheduled, 'scheduled');
  const actual = parseIsoDate(source.actual, 'actual');

  if (actual.ms < scheduled.ms) {
    fail(
      'E_WAKE_PROOF_TEMPORAL_INVALID',
      'actual wake time must be greater than or equal to scheduled wake time.'
    );
  }

  const wakeReason = requireNonEmptyString(source.wakeReason, 'wakeReason');
  if (!WAKE_PROOF_WAKE_REASONS.includes(wakeReason)) {
    fail('E_WAKE_PROOF_WAKE_REASON_INVALID', 'wakeReason is not reviewed.');
  }

  return {
    schemaVersion: WAKE_PROOF_SCHEMA_VERSION,
    objectiveId,
    wakeId,
    scheduled: scheduled.timestamp,
    actual: actual.timestamp,
    wakeReason,
    leaseState: normalizeLeaseState(source.leaseState),
    signatureAlgorithm: WAKE_PROOF_SIGNATURE_ALGORITHM
  };
}

export function signWakeProofPayload(payload, key) {
  const signingKey = requireKey(key);
  const { signature: _signature, ...unsigned } = requireObject(payload, 'wake proof payload');
  return createHmac('sha256', signingKey)
    .update(canonicalizeForWakeProof(unsigned), 'utf8')
    .digest('hex');
}

function timestampSegmentFromActual(actual) {
  return actual.replace(/[:.]/gu, '');
}

function assertInsideBundle(bundleRoot, filePath) {
  const relative = path.relative(bundleRoot, filePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('E_WAKE_PROOF_PATH_UNSAFE', 'wake proof path escapes the bundle.');
  }
}

export async function writeWakeProof(bundleDir, input, options = {}) {
  const signingKey = requireKey(options.key ?? process.env[WAKE_PROOF_ENV_KEY]);
  const payload = createWakeProofPayload(input);
  const timestampSegment = options.timestampSegment === undefined
    ? timestampSegmentFromActual(payload.actual)
    : assertSafeToken(options.timestampSegment, 'timestampSegment');
  const proof = {
    ...payload,
    signature: signWakeProofPayload(payload, signingKey)
  };

  const bundlePath = requireNonEmptyString(bundleDir, 'bundleDir');
  await mkdir(bundlePath, { recursive: true });
  const bundleRoot = await realpath(bundlePath);
  const fileName = `wake-proof-${timestampSegment}.json`;
  const filePath = path.resolve(bundleRoot, fileName);
  assertInsideBundle(bundleRoot, filePath);

  let handle;
  try {
    handle = await open(filePath, 'wx');
    await handle.writeFile(`${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail('E_WAKE_PROOF_EXISTS', 'wake proof already exists.', { filePath });
    }
    throw error;
  } finally {
    await handle?.close();
  }

  return { proof, filePath };
}
