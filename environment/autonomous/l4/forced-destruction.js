import {
  validateAdversarialVerdictMetadata
} from './adversarial-verdict.js';

export const PHASE14_ADVERSARIAL_VERDICT_SCHEMA_VERSION =
  'phase14.adversarial-verdict.v1';

const EVENT_RECORD_KEY = 'event-record';
const U1_DETAIL_FIELDS = Object.freeze([
  'counterEvidenceSearched',
  'sfiInjected',
  'confounderHarnessChecked',
  'salvagenteSeedProduced'
]);
const CLOSED_SURFACE_FLAGS = Object.freeze([
  'runtimeOpened',
  'providerAutomationInvoked',
  'obdkUsed',
  'realDataRead',
  'reviewedApiUsed',
  'claimExportOpened',
  'graphifyOpened',
  'unattendedRuntimeOpened'
]);
const SALVAGEABLE_KILL_REASONS = new Set([
  'INSUFFICIENT_EVIDENCE',
  'CONFOUNDED',
  'PREMATURE'
]);

export class Phase14ForcedDestructionError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Phase14ForcedDestructionError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new Phase14ForcedDestructionError(code, message, extra);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonBlankString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertNoMisplacedU1Fields(container, label) {
  if (!isObject(container)) return;
  for (const field of U1_DETAIL_FIELDS) {
    if (Object.hasOwn(container, field)) {
      fail(
        'E_PHASE14_U1_DESTROYER_FIELD_ENVELOPE',
        `TL4.2 U1 field ${field} must live under event-record.details, not ${label}.`,
        { field, label }
      );
    }
  }
}

function assertRecordShape(record) {
  if (!isObject(record)) {
    fail(
      'E_PHASE14_U1_VERDICT_REQUIRED',
      'TL4.2 forced-destruction verdict must be an object.'
    );
  }
  if (record.schemaVersion !== PHASE14_ADVERSARIAL_VERDICT_SCHEMA_VERSION) {
    fail(
      'E_PHASE14_U1_VERDICT_REQUIRED',
      'TL4.2 forced-destruction verdict has an unknown schema version.'
    );
  }
  assertNoMisplacedU1Fields(record, 'root');

  const eventRecord = record[EVENT_RECORD_KEY];
  if (!isObject(eventRecord)) {
    fail(
      'E_PHASE14_U1_EVENT_RECORD_REQUIRED',
      'TL4.2 forced-destruction verdict requires event-record.'
    );
  }
  assertNoMisplacedU1Fields(eventRecord, 'event-record');

  if (!isObject(eventRecord.details)) {
    fail(
      'E_PHASE14_U1_DETAILS_REQUIRED',
      'TL4.2 forced-destruction verdict requires event-record.details.'
    );
  }

  try {
    validateAdversarialVerdictMetadata(eventRecord.metadata);
  } catch (error) {
    fail(
      'E_PHASE14_U1_METADATA_REQUIRED',
      'TL4.2 forced-destruction verdict requires inert adversarial verdict metadata.',
      { cause: error?.code ?? error?.message ?? String(error) }
    );
  }

  for (const field of U1_DETAIL_FIELDS) {
    if (typeof eventRecord.details[field] !== 'boolean') {
      fail(
        'E_PHASE14_U1_DESTROYER_FIELD_REQUIRED',
        `TL4.2 forced-destruction verdict requires boolean details.${field}.`,
        { field }
      );
    }
  }

  for (const flag of CLOSED_SURFACE_FLAGS) {
    if (eventRecord[flag] !== false) {
      fail(
        'E_PHASE14_U1_FORBIDDEN_RUNTIME_SURFACE',
        `TL4.2 forced-destruction verdict must keep ${flag} false.`,
        { flag }
      );
    }
  }

  return eventRecord;
}

function assertAcceptGates(eventRecord) {
  if (eventRecord.verdict !== 'ACCEPT') return;
  if (eventRecord.details.counterEvidenceSearched !== true) {
    fail(
      'E_PHASE14_U1_ACCEPT_COUNTER_EVIDENCE_REQUIRED',
      'TL4.2 ACCEPT requires counterEvidenceSearched true.'
    );
  }
  if (eventRecord.details.sfiInjected !== true) {
    fail(
      'E_PHASE14_U1_ACCEPT_SFI_REQUIRED',
      'TL4.2 ACCEPT requires sfiInjected true.'
    );
  }
  if (
    eventRecord.claimProfile?.quantitative === true
    && eventRecord.details.confounderHarnessChecked !== true
  ) {
    fail(
      'E_PHASE14_U1_ACCEPT_CONFOUNDER_REQUIRED',
      'TL4.2 quantitative ACCEPT requires confounderHarnessChecked true.'
    );
  }
}

function assertKillGates(eventRecord) {
  if (eventRecord.verdict !== 'KILL') return;
  const reason = nonBlankString(
    eventRecord.reason,
    'E_PHASE14_U1_KILL_REASON_REQUIRED',
    'event-record.reason'
  );
  if (!SALVAGEABLE_KILL_REASONS.has(reason)) return;

  if (eventRecord.details.salvagenteSeedProduced !== true) {
    fail(
      'E_PHASE14_U1_SALVAGENTE_REQUIRED',
      'TL4.2 salvageable KILL requires salvagenteSeedProduced true.',
      { reason }
    );
  }
  nonBlankString(
    eventRecord.details.serendipitySeedRef,
    'E_PHASE14_U1_SALVAGENTE_SEED_REQUIRED',
    'details.serendipitySeedRef'
  );
}

export function validateForcedDestructionVerdict(record) {
  const eventRecord = assertRecordShape(record);
  if (!['ACCEPT', 'REDIRECT', 'KILL'].includes(eventRecord.verdict)) {
    fail(
      'E_PHASE14_U1_VERDICT_REQUIRED',
      'TL4.2 forced-destruction verdict must be ACCEPT, REDIRECT, or KILL.',
      { verdict: eventRecord.verdict ?? null }
    );
  }

  assertAcceptGates(eventRecord);
  assertKillGates(eventRecord);

  return {
    ok: true,
    record: cloneJson(record),
    eventRecord: cloneJson(eventRecord)
  };
}
