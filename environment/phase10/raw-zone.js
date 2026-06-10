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

export const RAW_ZONE_LOCK_NAME = 'phase10-raw-zone';
export const RAW_DOCUMENT_SCHEMA_FILE = 'phase10-raw-document.schema.json';
export const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';

const SAFE_RAW_DOCUMENT_ID_PATTERN = /^RAW-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const FORBIDDEN_RAW_PATH_HEADS = new Set([
  '_inbox',
  'provenance-links',
  'queries',
  'source-bundles',
  'wiki'
]);

export class RawZoneError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'RawZoneError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failRaw(code, message, extra = {}) {
  throw new RawZoneError({ code, message, extra });
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

function assertSafeRawDocumentId(rawDocumentId) {
  if (
    typeof rawDocumentId !== 'string'
    || !SAFE_RAW_DOCUMENT_ID_PATTERN.test(rawDocumentId)
  ) {
    failRaw(
      'E_PHASE10_RAW_DOCUMENT_ID_INVALID',
      `rawDocumentId must be a safe RAW-* path segment: ${rawDocumentId}`
    );
  }
}

function domainRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainStateRootDir(projectRoot, options), domainId);
}

function rawRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainRootDir(projectRoot, domainId, options), 'raw');
}

function rawMetadataDir(projectRoot, domainId, options = {}) {
  return resolveInside(rawRootDir(projectRoot, domainId, options), '_metadata');
}

function rawMetadataPath(projectRoot, domainId, rawDocumentId, options = {}) {
  assertSafeRawDocumentId(rawDocumentId);
  return resolveInside(rawMetadataDir(projectRoot, domainId, options), `${rawDocumentId}.json`);
}

function assertRawPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    failRaw('E_PHASE10_RAW_PATH_REQUIRED', 'raw-zone registration requires rawPath');
  }
  if (path.isAbsolute(rawPath)) {
    failRaw('E_PHASE10_RAW_PATH_ESCAPE', 'rawPath must be relative to the active domain raw tree');
  }
  const parts = rawPath.split(/[\\/]+/u).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.includes('..')) {
    failRaw('E_PHASE10_RAW_PATH_ESCAPE', 'rawPath must stay inside the active domain raw tree');
  }
  if (FORBIDDEN_RAW_PATH_HEADS.has(parts[0])) {
    failRaw(
      'E_PHASE10_RAW_PATH_ESCAPE',
      `rawPath cannot target reserved Phase 10 surface: ${parts[0]}`
    );
  }
  return parts;
}

function rawPayloadPath(projectRoot, domainId, rawPath, options = {}) {
  const parts = assertRawPath(rawPath);
  try {
    return resolveInside(rawRootDir(projectRoot, domainId, options), ...parts);
  } catch (error) {
    failRaw(
      'E_PHASE10_RAW_PATH_ESCAPE',
      'rawPath must stay inside the active domain raw tree',
      { cause: error.message }
    );
  }
}

async function validateDomainRecord(projectRoot, domainRecord) {
  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failRaw('E_PHASE10_RAW_DOMAIN_SCHEMA_INVALID', error.message);
  }
}

async function readActiveDomainRecord(projectRoot, options = {}) {
  const recordPath = activeDomainRecordPath(projectRoot, options);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failRaw('E_PHASE10_RAW_DOMAIN_REQUIRED', 'No active Phase 10 knowledge domain exists');
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
    failRaw(
      'E_PHASE10_RAW_DOMAIN_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      {
        activeDomainId: domainRecord.domainId,
        requestedDomainId: domainId
      }
    );
  }
}

function assertWritableDomain(domainRecord) {
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failRaw(
      'E_PHASE10_RAW_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is archived and cannot receive raw writes`,
      { domainId: domainRecord.domainId }
    );
  }
}

async function validateRawDocument(projectRoot, rawDocument) {
  if (rawDocument == null || typeof rawDocument !== 'object' || Array.isArray(rawDocument)) {
    failRaw('E_PHASE10_RAW_DOCUMENT_SCHEMA_INVALID', 'rawDocument must be an object');
  }
  if (!Object.hasOwn(rawDocument, 'trustTier')) {
    failRaw('E_PHASE10_RAW_TRUST_TIER_REQUIRED', 'rawDocument.trustTier is required');
  }

  const validate = await loadValidator(projectRoot, RAW_DOCUMENT_SCHEMA_FILE);
  try {
    assertValid(validate, rawDocument, 'phase10 raw document');
  } catch (error) {
    failRaw('E_PHASE10_RAW_DOCUMENT_SCHEMA_INVALID', error.message);
  }
  assertSafeRawDocumentId(rawDocument.rawDocumentId);
}

async function readMetadataRecords(metadataDir) {
  let entries;
  try {
    entries = await readdir(metadataDir, { withFileTypes: true });
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
    records.push(JSON.parse(await readFile(path.join(metadataDir, entry.name), 'utf8')));
  }
  return records.sort((left, right) =>
    String(left.rawDocumentId).localeCompare(String(right.rawDocumentId))
  );
}

async function assertNoDuplicateRawDocument({
  projectRoot,
  domainId,
  rawDocument,
  options
}) {
  const recordPath = rawMetadataPath(projectRoot, domainId, rawDocument.rawDocumentId, options);
  if (await pathExists(recordPath)) {
    failRaw(
      'E_PHASE10_RAW_DUPLICATE_ID',
      `rawDocumentId already exists: ${rawDocument.rawDocumentId}`,
      { rawDocumentId: rawDocument.rawDocumentId }
    );
  }

  const records = await readMetadataRecords(rawMetadataDir(projectRoot, domainId, options));
  const duplicateHash = records.find((record) => record.contentHash === rawDocument.contentHash);
  if (duplicateHash) {
    failRaw(
      'E_PHASE10_RAW_DUPLICATE_HASH',
      `contentHash already exists: ${rawDocument.contentHash}`,
      {
        rawDocumentId: duplicateHash.rawDocumentId,
        contentHash: rawDocument.contentHash
      }
    );
  }
}

export async function registerRawDocument(projectPath, {
  rawDocument,
  rawPath,
  payload = '',
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };

  return withLock(projectRoot, RAW_ZONE_LOCK_NAME, async () => {
    const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
    assertWritableDomain(domainRecord);
    await validateRawDocument(projectRoot, rawDocument);
    assertExpectedDomain(domainRecord, rawDocument.domainId);

    const payloadPath = rawPayloadPath(projectRoot, domainRecord.domainId, rawPath, options);
    const recordPath = rawMetadataPath(
      projectRoot,
      domainRecord.domainId,
      rawDocument.rawDocumentId,
      options
    );
    await assertNoDuplicateRawDocument({
      projectRoot,
      domainId: domainRecord.domainId,
      rawDocument,
      options
    });

    await mkdir(path.dirname(payloadPath), { recursive: true });
    await writeFile(payloadPath, payload, typeof payload === 'string' ? 'utf8' : undefined);

    const metadataRecord = {
      ...rawDocument,
      registeredAt: timestamp,
      rawPayloadPath: toRepoRelative(projectRoot, payloadPath)
    };
    await atomicWriteJson(recordPath, metadataRecord);

    return {
      ok: true,
      phase10: true,
      command: 'raw register',
      domainId: domainRecord.domainId,
      rawDocumentId: rawDocument.rawDocumentId,
      rawDocumentRecordPath: toRepoRelative(projectRoot, recordPath),
      rawPayloadPath: toRepoRelative(projectRoot, payloadPath)
    };
  });
}

export async function readRawZoneStatus(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);

  const records = await readMetadataRecords(
    rawMetadataDir(projectRoot, domainRecord.domainId, options)
  );
  const rawRoot = rawRootDir(projectRoot, domainRecord.domainId, options);

  return {
    ok: true,
    phase10: true,
    command: 'raw status',
    domainId: domainRecord.domainId,
    lifecycleStatus: domainRecord.lifecycleStatus,
    writable: domainRecord.lifecycleStatus !== 'archived' && domainRecord.active !== false,
    rawRootPath: toRepoRelative(projectRoot, rawRoot),
    rawDocumentCount: records.length
  };
}

export async function listRawDocuments(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  return readMetadataRecords(rawMetadataDir(projectRoot, domainRecord.domainId, options));
}
