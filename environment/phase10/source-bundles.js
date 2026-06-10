import { access, mkdir, readdir, readFile } from 'node:fs/promises';
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
  listRawDocuments
} from './raw-zone.js';

export const SOURCE_BUNDLE_LOCK_NAME = 'phase10-source-bundles';
export const SOURCE_BUNDLE_SCHEMA_FILE = 'phase10-source-bundle.schema.json';
export const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';

const SAFE_BUNDLE_ID_PATTERN = /^SB-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_BUNDLE_VERSION_PATTERN = /^v[0-9][A-Za-z0-9._-]*$/u;
const FORBIDDEN_LOCATOR_HEADS = new Set([
  '_inbox',
  'export',
  'exports',
  'presentation',
  'presentations',
  'provenance-links',
  'queries',
  'query',
  'skill-cache',
  'wiki'
]);
const TRACK_PAYLOAD_LICENSES = new Set(['open', 'user-owned', 'permission-granted']);

export class SourceBundleError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'SourceBundleError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failSource(code, message, extra = {}) {
  throw new SourceBundleError({ code, message, extra });
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

function assertSafeBundleId(bundleId) {
  if (typeof bundleId !== 'string' || !SAFE_BUNDLE_ID_PATTERN.test(bundleId)) {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_ID_INVALID',
      `bundleId must be a safe SB-* path segment: ${bundleId}`
    );
  }
}

function assertSafeBundleVersion(bundleVersion) {
  if (typeof bundleVersion !== 'string' || !SAFE_BUNDLE_VERSION_PATTERN.test(bundleVersion)) {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_VERSION_INVALID',
      `bundleVersion must be a safe vN path segment: ${bundleVersion}`
    );
  }
}

function domainRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainStateRootDir(projectRoot, options), domainId);
}

function sourceBundlesRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainRootDir(projectRoot, domainId, options), 'source-bundles');
}

function sourceBundleVersionDir(projectRoot, domainId, bundleId, options = {}) {
  assertSafeBundleId(bundleId);
  return resolveInside(sourceBundlesRootDir(projectRoot, domainId, options), bundleId);
}

function sourceBundleRecordPath(projectRoot, domainId, bundleId, bundleVersion, options = {}) {
  assertSafeBundleVersion(bundleVersion);
  return resolveInside(
    sourceBundleVersionDir(projectRoot, domainId, bundleId, options),
    `${bundleVersion}.json`
  );
}

async function validateDomainRecord(projectRoot, domainRecord) {
  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failSource('E_PHASE10_SOURCE_BUNDLE_DOMAIN_SCHEMA_INVALID', error.message);
  }
}

async function readActiveDomainRecord(projectRoot, options = {}) {
  const recordPath = activeDomainRecordPath(projectRoot, options);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_DOMAIN_REQUIRED',
        'No active Phase 10 knowledge domain exists'
      );
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
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_DOMAIN_MISMATCH',
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
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is archived and cannot receive source bundles`,
      { domainId: domainRecord.domainId }
    );
  }
}

export function validateSourceBundleApprovalPolicy(sourceBundle) {
  if (sourceBundle == null || typeof sourceBundle !== 'object' || Array.isArray(sourceBundle)) {
    failSource('E_PHASE10_SOURCE_BUNDLE_INVALID', 'sourceBundle must be an object');
  }

  if (sourceBundle.status !== 'curated') {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_STATUS_FORBIDDEN',
      'source-bundle registration only approves curated bundles'
    );
  }

  if (sourceBundle.license === 'unknown') {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_LICENSE_UNKNOWN',
      'curated source bundles require an operator-reviewed non-unknown license'
    );
  }
  if (!Array.isArray(sourceBundle.scopeOfUse) || sourceBundle.scopeOfUse.length === 0) {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_SCOPE_REQUIRED',
      'curated source bundles require at least one scopeOfUse'
    );
  }

  if (
    sourceBundle.allowTrackPayload === true
    && !TRACK_PAYLOAD_LICENSES.has(sourceBundle.license)
  ) {
    failSource(
      'E_PHASE10_SOURCE_BUNDLE_PAYLOAD_TRACKING_FORBIDDEN',
      'allowTrackPayload requires an open, user-owned, or permission-granted license'
    );
  }
}

function assertLocatorBoundary(sourceBundle) {
  for (const locator of sourceBundle.sourceLocators ?? []) {
    if (locator?.kind !== 'file' && locator?.kind !== 'obsidian') {
      continue;
    }
    const uri = String(locator.uri ?? '');
    if (path.isAbsolute(uri)) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_LOCATOR_FORBIDDEN',
        'source bundle file locators must be repository-relative'
      );
    }
    const parts = uri.split(/[\\/]+/u).filter(Boolean);
    if (parts.includes('..') || FORBIDDEN_LOCATOR_HEADS.has(parts[0])) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_LOCATOR_FORBIDDEN',
        `source bundle locator cannot target reserved workflow path: ${uri}`
      );
    }
  }
}

async function validateSourceBundleSchema(projectRoot, sourceBundle) {
  const validate = await loadValidator(projectRoot, SOURCE_BUNDLE_SCHEMA_FILE);
  try {
    assertValid(validate, sourceBundle, 'phase10 source bundle');
  } catch (error) {
    failSource('E_PHASE10_SOURCE_BUNDLE_SCHEMA_INVALID', error.message);
  }
}

async function assertRawDocumentRefsResolve(projectRoot, domainId, sourceBundle, options) {
  const rawDocuments = await listRawDocuments(projectRoot, { domainId, stateRoot: options.stateRoot });
  const byId = new Map(rawDocuments.map((record) => [record.rawDocumentId, record]));
  for (const rawRef of sourceBundle.rawDocumentRefs ?? []) {
    const rawRecord = byId.get(rawRef.rawDocumentId);
    if (!rawRecord) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISSING',
        `rawDocumentRef does not resolve: ${rawRef.rawDocumentId}`,
        { rawDocumentId: rawRef.rawDocumentId }
      );
    }
    if (rawRecord.domainId !== domainId) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISMATCH',
        `rawDocumentRef ${rawRef.rawDocumentId} belongs to ${rawRecord.domainId}`,
        { rawDocumentId: rawRef.rawDocumentId, rawDomainId: rawRecord.domainId, domainId }
      );
    }
    if (rawRef.contentHash != null && rawRef.contentHash !== rawRecord.contentHash) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISMATCH',
        `rawDocumentRef contentHash mismatch for ${rawRef.rawDocumentId}`,
        {
          rawDocumentId: rawRef.rawDocumentId,
          expectedContentHash: rawRecord.contentHash,
          actualContentHash: rawRef.contentHash
        }
      );
    }
    if (!rawRecord.trustTier) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISMATCH',
        `rawDocumentRef ${rawRef.rawDocumentId} has no trustTier`,
        { rawDocumentId: rawRef.rawDocumentId }
      );
    }
  }
}

async function readSourceBundleRecords(rootDir) {
  let bundleDirs;
  try {
    bundleDirs = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const bundleDir of bundleDirs) {
    if (!bundleDir.isDirectory()) {
      continue;
    }
    const versionRoot = path.join(rootDir, bundleDir.name);
    const versions = await readdir(versionRoot, { withFileTypes: true });
    for (const version of versions) {
      if (!version.isFile() || !version.name.endsWith('.json')) {
        continue;
      }
      records.push(JSON.parse(await readFile(path.join(versionRoot, version.name), 'utf8')));
    }
  }
  return records.sort((left, right) =>
    `${left.bundleId}:${left.bundleVersion}`.localeCompare(`${right.bundleId}:${right.bundleVersion}`)
  );
}

export async function registerSourceBundle(projectPath, {
  sourceBundle,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };

  return withLock(projectRoot, SOURCE_BUNDLE_LOCK_NAME, async () => {
    const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
    assertWritableDomain(domainRecord);
    assertExpectedDomain(domainRecord, sourceBundle?.domainId);
    validateSourceBundleApprovalPolicy(sourceBundle);
    await validateSourceBundleSchema(projectRoot, sourceBundle);
    assertLocatorBoundary(sourceBundle);
    await assertRawDocumentRefsResolve(projectRoot, domainRecord.domainId, sourceBundle, options);

    const recordPath = sourceBundleRecordPath(
      projectRoot,
      domainRecord.domainId,
      sourceBundle.bundleId,
      sourceBundle.bundleVersion,
      options
    );
    if (await pathExists(recordPath)) {
      failSource(
        'E_PHASE10_SOURCE_BUNDLE_DUPLICATE_VERSION',
        `source bundle version already exists: ${sourceBundle.bundleId} ${sourceBundle.bundleVersion}`,
        {
          bundleId: sourceBundle.bundleId,
          bundleVersion: sourceBundle.bundleVersion
        }
      );
    }

    await mkdir(path.dirname(recordPath), { recursive: true });
    await atomicWriteJson(recordPath, sourceBundle);

    return {
      ok: true,
      phase10: true,
      command: 'source-bundle register',
      domainId: domainRecord.domainId,
      bundleId: sourceBundle.bundleId,
      bundleVersion: sourceBundle.bundleVersion,
      registeredAt: timestamp,
      sourceBundleRecordPath: toRepoRelative(projectRoot, recordPath)
    };
  });
}

export async function readSourceBundleStatus(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);

  const records = await readSourceBundleRecords(
    sourceBundlesRootDir(projectRoot, domainRecord.domainId, options)
  );

  return {
    ok: true,
    phase10: true,
    command: 'source-bundle status',
    domainId: domainRecord.domainId,
    lifecycleStatus: domainRecord.lifecycleStatus,
    writable: domainRecord.lifecycleStatus !== 'archived' && domainRecord.active !== false,
    sourceBundleRootPath: toRepoRelative(
      projectRoot,
      sourceBundlesRootDir(projectRoot, domainRecord.domainId, options)
    ),
    sourceBundleCount: records.length
  };
}

export async function listSourceBundles(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord } = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  return readSourceBundleRecords(sourceBundlesRootDir(projectRoot, domainRecord.domainId, options));
}
