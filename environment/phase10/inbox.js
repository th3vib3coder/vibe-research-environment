import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot,
  withLock
} from '../control/_io.js';
import {
  activeDomainRecordPath,
  domainStateRootDir
} from './domain-lifecycle.js';
import {
  registerRawDocument
} from './raw-zone.js';
import {
  registerSourceBundle
} from './source-bundles.js';

export const INBOX_LOCK_NAME = 'phase10-inbox';
export const INBOX_ENTRY_SCHEMA_FILE = 'phase10-inbox-entry.schema.json';
export const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';

const SAFE_INBOX_ENTRY_ID_PATTERN = /^INBOX-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DEFAULT_TASK_CAP = 10;
const STALE_AFTER_DAYS = 90;
const CURATOR_WHY_LIMIT = 80;

export class InboxError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'InboxError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failInbox(code, message, extra = {}) {
  throw new InboxError({ code, message, extra });
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function assertSafeInboxEntryId(inboxEntryId) {
  if (
    typeof inboxEntryId !== 'string'
    || !SAFE_INBOX_ENTRY_ID_PATTERN.test(inboxEntryId)
  ) {
    failInbox(
      'E_PHASE10_INBOX_ENTRY_ID_INVALID',
      `inboxEntryId must be a safe INBOX-* path segment: ${inboxEntryId}`
    );
  }
}

function domainRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainStateRootDir(projectRoot, options), domainId);
}

function inboxRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainRootDir(projectRoot, domainId, options), 'raw', '_inbox');
}

function inboxEntriesDir(projectRoot, domainId, options = {}) {
  return resolveInside(inboxRootDir(projectRoot, domainId, options), 'entries');
}

function inboxPayloadsDir(projectRoot, domainId, options = {}) {
  return resolveInside(inboxRootDir(projectRoot, domainId, options), 'payloads');
}

function inboxEntryPath(projectRoot, domainId, inboxEntryId, options = {}) {
  assertSafeInboxEntryId(inboxEntryId);
  return resolveInside(inboxEntriesDir(projectRoot, domainId, options), `${inboxEntryId}.json`);
}

function inboxPayloadPath(projectRoot, domainId, inboxEntryId, options = {}) {
  assertSafeInboxEntryId(inboxEntryId);
  return resolveInside(inboxPayloadsDir(projectRoot, domainId, options), `${inboxEntryId}.txt`);
}

async function validateDomainRecord(projectRoot, domainRecord) {
  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failInbox('E_PHASE10_INBOX_DOMAIN_SCHEMA_INVALID', error.message);
  }
}

async function readActiveDomainRecord(projectRoot, options = {}) {
  const recordPath = activeDomainRecordPath(projectRoot, options);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failInbox('E_PHASE10_INBOX_DOMAIN_REQUIRED', 'No active Phase 10 knowledge domain exists');
    }
    throw error;
  }
  await validateDomainRecord(projectRoot, domainRecord);
  return {
    domainRecord,
    recordPath
  };
}

function assertExpectedDomain(domainRecord, domainId) {
  if (domainId != null && domainRecord.domainId !== domainId) {
    failInbox(
      'E_PHASE10_INBOX_DOMAIN_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      {
        activeDomainId: domainRecord.domainId,
        requestedDomainId: domainId
      }
    );
  }
}

function isWritableDomain(domainRecord) {
  return domainRecord.lifecycleStatus !== 'archived' && domainRecord.active !== false;
}

function assertWritableDomain(domainRecord) {
  if (!isWritableDomain(domainRecord)) {
    failInbox(
      'E_PHASE10_INBOX_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is archived and cannot receive inbox writes`,
      { domainId: domainRecord.domainId }
    );
  }
}

async function validateInboxEntry(projectRoot, inboxEntry) {
  if (inboxEntry == null || typeof inboxEntry !== 'object' || Array.isArray(inboxEntry)) {
    failInbox('E_PHASE10_INBOX_ENTRY_INVALID', 'inboxEntry must be an object');
  }
  const validate = await loadValidator(projectRoot, INBOX_ENTRY_SCHEMA_FILE);
  try {
    assertValid(validate, inboxEntry, 'phase10 inbox entry');
  } catch (error) {
    failInbox('E_PHASE10_INBOX_ENTRY_SCHEMA_INVALID', error.message);
  }
  assertSafeInboxEntryId(inboxEntry.inboxEntryId);
}

function normalizeDedupeKey(key) {
  return String(key ?? '').trim().toLowerCase();
}

function taskKey(inboxEntry) {
  return [
    inboxEntry.discoveredByTask?.objectiveId ?? '',
    inboxEntry.discoveredByTask?.taskId ?? ''
  ].join('::');
}

async function readInboxRecords(entriesDir) {
  let entries;
  try {
    entries = await readdir(entriesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    records.push(JSON.parse(await readFile(path.join(entriesDir, entry.name), 'utf8')));
  }
  return records.sort((left, right) =>
    String(left.inboxEntryId).localeCompare(String(right.inboxEntryId))
  );
}

async function assertNoDuplicateInboxEntry({
  projectRoot,
  domainId,
  inboxEntry,
  options
}) {
  const recordPath = inboxEntryPath(projectRoot, domainId, inboxEntry.inboxEntryId, options);
  if (await pathExists(recordPath)) {
    failInbox(
      'E_PHASE10_INBOX_DUPLICATE_ID',
      `inboxEntryId already exists: ${inboxEntry.inboxEntryId}`,
      { inboxEntryId: inboxEntry.inboxEntryId }
    );
  }

  const incomingKeys = new Set(inboxEntry.dedupeKeys.map(normalizeDedupeKey));
  const records = await readInboxRecords(inboxEntriesDir(projectRoot, domainId, options));
  for (const record of records) {
    for (const existingKey of record.dedupeKeys ?? []) {
      if (incomingKeys.has(normalizeDedupeKey(existingKey))) {
        failInbox(
          'E_PHASE10_INBOX_DUPLICATE_DEDUPE_KEY',
          `dedupeKey already exists: ${existingKey}`,
          { inboxEntryId: record.inboxEntryId, dedupeKey: existingKey }
        );
      }
    }
  }
}

async function assertTaskCap({
  projectRoot,
  domainId,
  inboxEntry,
  options,
  taskCap
}) {
  const key = taskKey(inboxEntry);
  const records = await readInboxRecords(inboxEntriesDir(projectRoot, domainId, options));
  const sameTaskCount = records.filter((record) =>
    taskKey(record) === key && record.candidateStatus !== 'rejected'
  ).length;
  if (sameTaskCount >= taskCap) {
    failInbox(
      'E_PHASE10_INBOX_TASK_CAP_EXCEEDED',
      `inbox task cap exceeded for ${key}`,
      { taskKey: key, taskCap }
    );
  }
}

export async function submitInboxCandidate(projectPath, {
  inboxEntry,
  payload = null,
  stateRoot = null,
  timestamp = now(),
  taskCap = DEFAULT_TASK_CAP
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };

  return withLock(projectRoot, INBOX_LOCK_NAME, async () => {
    const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
    assertWritableDomain(domainRecord);
    assertExpectedDomain(domainRecord, inboxEntry?.domainId);
    await validateInboxEntry(projectRoot, inboxEntry);
    if (inboxEntry.candidateStatus !== 'pending') {
      failInbox(
        'E_PHASE10_INBOX_STATUS_FORBIDDEN',
        'new inbox candidates must start as pending'
      );
    }
    await assertNoDuplicateInboxEntry({
      projectRoot,
      domainId: domainRecord.domainId,
      inboxEntry,
      options
    });
    await assertTaskCap({
      projectRoot,
      domainId: domainRecord.domainId,
      inboxEntry,
      options,
      taskCap
    });

    const recordPath = inboxEntryPath(
      projectRoot,
      domainRecord.domainId,
      inboxEntry.inboxEntryId,
      options
    );
    const record = {
      ...inboxEntry,
      updatedAt: timestamp
    };
    await validateInboxEntry(projectRoot, record);
    await atomicWriteJson(recordPath, record);

    if (payload != null) {
      const payloadPath = inboxPayloadPath(
        projectRoot,
        domainRecord.domainId,
        inboxEntry.inboxEntryId,
        options
      );
      await mkdir(path.dirname(payloadPath), { recursive: true });
      await writeFile(payloadPath, payload, typeof payload === 'string' ? 'utf8' : undefined);
    }

    return {
      ok: true,
      phase10: true,
      command: 'inbox submit',
      domainId: domainRecord.domainId,
      inboxEntryId: inboxEntry.inboxEntryId,
      submittedAt: timestamp,
      inboxEntryPath: toRepoRelative(projectRoot, recordPath)
    };
  });
}

async function readEntryOrFail(projectRoot, domainId, inboxEntryId, options) {
  const recordPath = inboxEntryPath(projectRoot, domainId, inboxEntryId, options);
  try {
    return {
      record: await readJson(recordPath),
      recordPath
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failInbox(
        'E_PHASE10_INBOX_ENTRY_MISSING',
        `inbox entry does not exist: ${inboxEntryId}`,
        { inboxEntryId }
      );
    }
    throw error;
  }
}

function applyStaleView(record, nowIso) {
  if (record.candidateStatus !== 'pending') {
    return record;
  }
  const created = Date.parse(record.createdAt);
  const current = Date.parse(nowIso);
  if (!Number.isFinite(created) || !Number.isFinite(current)) {
    return record;
  }
  const ageDays = (current - created) / (24 * 60 * 60 * 1000);
  if (ageDays <= STALE_AFTER_DAYS) {
    return record;
  }
  return {
    ...record,
    candidateStatus: 'stale',
    stale: true
  };
}

function sortForReview(left, right) {
  if (left.candidateStatus === 'stale' && right.candidateStatus !== 'stale') {
    return -1;
  }
  if (left.candidateStatus !== 'stale' && right.candidateStatus === 'stale') {
    return 1;
  }
  return Number(right.relevanceScore ?? 0) - Number(left.relevanceScore ?? 0)
    || String(left.inboxEntryId).localeCompare(String(right.inboxEntryId));
}

export async function listInboxEntries(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  return readInboxRecords(inboxEntriesDir(projectRoot, domainRecord.domainId, options));
}

export async function listInboxForOperator(projectPath, {
  domainId = null,
  stateRoot = null,
  now: nowIso = now()
} = {}) {
  const entries = await listInboxEntries(projectPath, { domainId, stateRoot });
  return entries.map((entry) => applyStaleView(entry, nowIso)).sort(sortForReview);
}

function truncateForCurator(value) {
  const text = String(value ?? '');
  if (text.length <= CURATOR_WHY_LIMIT) {
    return text;
  }
  return text.slice(0, CURATOR_WHY_LIMIT);
}

export async function listInboxForCurator(projectPath, {
  domainId = null,
  stateRoot = null,
  now: nowIso = now()
} = {}) {
  const entries = await listInboxForOperator(projectPath, { domainId, stateRoot, now: nowIso });
  return entries.map((entry) => ({
    inboxEntryId: entry.inboxEntryId,
    domainId: entry.domainId,
    candidateStatus: entry.candidateStatus,
    priority: entry.priority,
    relevanceScore: entry.relevanceScore,
    whyThisMatters: truncateForCurator(entry.whyThisMatters),
    payloadStatus: entry.payloadStatus,
    sourceRef: {
      type: entry.sourceRef?.type ?? 'redacted',
      redacted: true
    }
  }));
}

function assertSingleEntryReview(inboxEntryId) {
  if (Array.isArray(inboxEntryId)) {
    failInbox(
      'E_PHASE10_INBOX_BULK_APPROVE_FORBIDDEN',
      'inbox review requires exactly one entry id per decision'
    );
  }
  assertSafeInboxEntryId(inboxEntryId);
}

function assertApprovalFields(approval) {
  if (
    approval == null
    || typeof approval !== 'object'
    || Array.isArray(approval)
    || typeof approval.license !== 'string'
    || typeof approval.trustTier !== 'string'
    || !Array.isArray(approval.scopeOfUse)
    || approval.scopeOfUse.length === 0
  ) {
    failInbox(
      'E_PHASE10_INBOX_APPROVAL_FIELDS_REQUIRED',
      'approval requires license, trustTier, and non-empty scopeOfUse'
    );
  }
}

async function readPayload(projectRoot, domainId, inboxEntryId, options) {
  const payloadPath = inboxPayloadPath(projectRoot, domainId, inboxEntryId, options);
  try {
    return await readFile(payloadPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function buildRawDocument({ domainId, record, approval, timestamp }) {
  return {
    schemaVersion: 'phase10.raw-document.v1',
    rawDocumentId: approval.rawDocumentId,
    bundleId: approval.bundleId,
    domainId,
    sourceType: approval.sourceType ?? record.entryType,
    trustTier: approval.trustTier,
    sourceLocator: {
      kind: 'file',
      uri: `raw/${approval.rawPath}`
    },
    contentHash: approval.contentHash,
    capturedAt: timestamp,
    ingestion: {
      method: 'phase10-inbox-review',
      operator: approval.approvedBy ?? 'operator'
    }
  };
}

function buildSourceBundle({ domainId, record, approval, timestamp }) {
  return {
    schemaVersion: 'phase10.source-bundle.v1',
    bundleId: approval.bundleId,
    bundleVersion: approval.bundleVersion,
    domainId,
    title: approval.title ?? record.preliminaryMetadata?.title ?? record.inboxEntryId,
    sourceType: approval.sourceType ?? record.entryType,
    trustTier: approval.trustTier,
    license: approval.license,
    allowTrackPayload: approval.allowTrackPayload === true,
    scopeOfUse: approval.scopeOfUse,
    rawDocumentRefs: [
      {
        rawDocumentId: approval.rawDocumentId,
        contentHash: approval.contentHash
      }
    ],
    sourceLocators: [
      {
        kind: 'file',
        uri: `raw/${approval.rawPath}`
      }
    ],
    collectedAt: timestamp,
    status: 'curated'
  };
}

async function approveInboxEntry({
  projectRoot,
  domainId,
  record,
  recordPath,
  approval,
  options,
  timestamp
}) {
  assertApprovalFields(approval);
  for (const field of ['rawDocumentId', 'bundleId', 'bundleVersion', 'rawPath', 'contentHash']) {
    if (typeof approval[field] !== 'string' || approval[field].trim() === '') {
      failInbox(
        'E_PHASE10_INBOX_APPROVAL_FIELDS_REQUIRED',
        `approval requires ${field}`
      );
    }
  }

  const updated = {
    ...record,
    candidateStatus: 'approved',
    payloadStatus: record.payloadStatus,
    approval: {
      approvedAt: timestamp,
      approvedBy: approval.approvedBy ?? 'operator',
      license: approval.license,
      trustTier: approval.trustTier,
      scopeOfUse: approval.scopeOfUse,
      promotedToBundle: {
        bundleId: approval.bundleId,
        bundleVersion: approval.bundleVersion
      }
    },
    updatedAt: timestamp
  };
  await validateInboxEntry(projectRoot, updated);

  const payload = await readPayload(projectRoot, domainId, record.inboxEntryId, options);
  await registerRawDocument(projectRoot, {
    rawDocument: buildRawDocument({ domainId, record, approval, timestamp }),
    rawPath: approval.rawPath,
    payload,
    stateRoot: options.stateRoot,
    timestamp
  });
  const sourceBundleResult = await registerSourceBundle(projectRoot, {
    sourceBundle: buildSourceBundle({ domainId, record, approval, timestamp }),
    stateRoot: options.stateRoot,
    timestamp
  });

  await atomicWriteJson(recordPath, updated);
  return {
    ...updated,
    promotedToBundle: updated.approval.promotedToBundle,
    sourceBundleRecordPath: sourceBundleResult.sourceBundleRecordPath
  };
}

async function rejectInboxEntry({ projectRoot, record, recordPath, rejection, timestamp }) {
  if (
    rejection == null
    || typeof rejection !== 'object'
    || typeof rejection.rejectReason !== 'string'
    || rejection.rejectReason.trim() === ''
  ) {
    failInbox(
      'E_PHASE10_INBOX_REJECTION_FIELDS_REQUIRED',
      'rejection requires rejectReason'
    );
  }

  const payloadStatus = rejection.payloadStatus ?? 'preserved';
  const updated = {
    ...record,
    candidateStatus: 'rejected',
    payloadStatus,
    rejection: {
      rejectedAt: timestamp,
      rejectedBy: rejection.rejectedBy ?? 'operator',
      rejectReason: rejection.rejectReason,
      payloadStatus
    },
    updatedAt: timestamp
  };
  await validateInboxEntry(projectRoot, updated);
  await atomicWriteJson(recordPath, updated);
  return updated;
}

async function deferInboxEntry({ projectRoot, record, recordPath, payloadStatus, timestamp }) {
  const updated = {
    ...record,
    candidateStatus: 'deferred',
    payloadStatus: payloadStatus ?? 'missing',
    updatedAt: timestamp
  };
  await validateInboxEntry(projectRoot, updated);
  await atomicWriteJson(recordPath, updated);
  return updated;
}

export async function reviewInboxEntry(projectPath, {
  inboxEntryId,
  decision,
  approval = null,
  rejection = null,
  payloadStatus = null,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  assertSingleEntryReview(inboxEntryId);

  return withLock(projectRoot, INBOX_LOCK_NAME, async () => {
    const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
    assertWritableDomain(domainRecord);
    const { record, recordPath } = await readEntryOrFail(
      projectRoot,
      domainRecord.domainId,
      inboxEntryId,
      options
    );

    if (decision === 'approve') {
      return approveInboxEntry({
        projectRoot,
        domainId: domainRecord.domainId,
        record,
        recordPath,
        approval,
        options,
        timestamp
      });
    }
    if (decision === 'reject') {
      return rejectInboxEntry({ projectRoot, record, recordPath, rejection, timestamp });
    }
    if (decision === 'needs-full-text') {
      return deferInboxEntry({ projectRoot, record, recordPath, payloadStatus, timestamp });
    }

    failInbox(
      'E_PHASE10_INBOX_DECISION_INVALID',
      `Unsupported inbox decision: ${decision}`
    );
  });
}

export async function readInboxStatus(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);

  const records = await readInboxRecords(
    inboxEntriesDir(projectRoot, domainRecord.domainId, options)
  );

  return {
    ok: true,
    phase10: true,
    command: 'inbox status',
    domainId: domainRecord.domainId,
    lifecycleStatus: domainRecord.lifecycleStatus,
    writable: isWritableDomain(domainRecord),
    inboxRootPath: toRepoRelative(
      projectRoot,
      inboxRootDir(projectRoot, domainRecord.domainId, options)
    ),
    inboxEntryCount: records.length
  };
}
