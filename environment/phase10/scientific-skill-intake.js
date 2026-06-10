import { access, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';
import {
  activeDomainRecordPath
} from './domain-lifecycle.js';
import {
  submitInboxCandidate
} from './inbox.js';

export const SCIENTIFIC_SKILL_CACHE_ROOT = '.vre-local/skill-cache';
export const SCIENTIFIC_SKILL_CACHE_TTL_DAYS = 7;
export const SCIENTIFIC_SKILL_INTAKE_SCHEMA_VERSION =
  'phase10.skill-cache-record.v1';

const execFileAsync = promisify(execFile);
const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';
const SUPPORTED_PROVIDERS = new Set(['pubmed', 'geo', 'alphafold', 'openalex']);
const BATCH_SIZE = 10;

export class ScientificSkillIntakeError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'ScientificSkillIntakeError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failSkillIntake(code, message, extra = {}) {
  throw new ScientificSkillIntakeError({ code, message, extra });
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function stableHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function slug(value) {
  return normalizeText(value)
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

function addDays(timestamp, days) {
  const parsed = Date.parse(timestamp);
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
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

async function validateDomainRecord(projectRoot, domainRecord) {
  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failSkillIntake('E_PHASE10_SKILL_INTAKE_DOMAIN_SCHEMA_INVALID', error.message);
  }
}

async function readActiveDomainRecord(projectRoot) {
  const recordPath = activeDomainRecordPath(projectRoot);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failSkillIntake(
        'E_PHASE10_SKILL_INTAKE_DOMAIN_REQUIRED',
        'No active Phase 10 knowledge domain exists'
      );
    }
    throw error;
  }
  await validateDomainRecord(projectRoot, domainRecord);
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failSkillIntake(
      'E_PHASE10_SKILL_INTAKE_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} cannot receive scientific-skill output`,
      { domainId: domainRecord.domainId }
    );
  }
  return domainRecord;
}

function providerOf(discovery) {
  const provider = normalizeLower(discovery?.provider);
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    failSkillIntake(
      'E_PHASE10_SKILL_PROVIDER_UNSUPPORTED',
      `Unsupported scientific discovery provider: ${discovery?.provider ?? ''}`,
      { provider: discovery?.provider ?? null }
    );
  }
  return provider;
}

function assertDiscoveryAuthorship(discovery) {
  if (!normalizeText(discovery?.discoveredBySkill)) {
    failSkillIntake(
      'E_PHASE10_SKILL_DISCOVERED_BY_SKILL_REQUIRED',
      'discoveredBySkill is required'
    );
  }
  if (
    discovery?.discoveredByTask == null
    || typeof discovery.discoveredByTask !== 'object'
    || !normalizeText(discovery.discoveredByTask.objectiveId)
    || !normalizeText(discovery.discoveredByTask.taskId)
  ) {
    failSkillIntake(
      'E_PHASE10_SKILL_DISCOVERED_BY_TASK_REQUIRED',
      'discoveredByTask.objectiveId and discoveredByTask.taskId are required'
    );
  }
}

function prefixed(prefix, value) {
  const text = normalizeText(value);
  return text ? `${prefix}:${text}` : null;
}

function sourceForDiscovery(provider, discovery) {
  const doi = normalizeLower(discovery.doi);
  const pmid = normalizeText(discovery.pmid).replace(/^pmid:/iu, '');
  const url = normalizeText(discovery.url);
  const geo = normalizeText(discovery.accession ?? discovery.geoAccession);
  const model = normalizeText(discovery.modelId ?? discovery.uniprotId);
  const openAlex = normalizeText(discovery.openAlexId ?? discovery.openalexId);

  if (provider === 'pubmed' && pmid) {
    return {
      sourceRef: { type: 'pmid', id: pmid },
      dedupeKey: `pmid:${pmid.toLowerCase()}`
    };
  }
  if (doi) {
    return {
      sourceRef: { type: 'doi', id: doi },
      dedupeKey: `doi:${doi}`
    };
  }
  if (provider === 'geo' && geo) {
    const id = prefixed('geo', geo);
    return {
      sourceRef: { type: 'other', id },
      dedupeKey: id.toLowerCase()
    };
  }
  if (provider === 'alphafold' && model) {
    const id = prefixed('alphafold', model);
    return {
      sourceRef: { type: 'other', id },
      dedupeKey: id.toLowerCase()
    };
  }
  if (provider === 'openalex' && openAlex) {
    const id = prefixed('openalex', openAlex);
    return {
      sourceRef: { type: 'other', id },
      dedupeKey: id.toLowerCase()
    };
  }
  if (url) {
    return {
      sourceRef: { type: 'url', id: url },
      dedupeKey: `url:${url.toLowerCase()}`
    };
  }

  failSkillIntake(
    'E_PHASE10_SKILL_STABLE_ID_REQUIRED',
    'scientific discovery requires a stable id or URL',
    { provider }
  );
}

function missingReviewFields(discovery) {
  const missing = [];
  if (!normalizeText(discovery.selectionRationale)) {
    missing.push('selectionRationale');
  }
  if (typeof discovery.relevanceScore !== 'number') {
    missing.push('relevanceScore');
  }
  if (!normalizeText(discovery.whyThisMatters)) {
    missing.push('whyThisMatters');
  }
  return missing;
}

function cacheRootDir(projectRoot) {
  return resolveInside(projectRoot, '.vre-local', 'skill-cache');
}

async function assertSkillCacheGitIgnored(projectRoot, cachePath) {
  try {
    await execFileAsync('git', ['check-ignore', '-q', '--', cachePath], {
      cwd: projectRoot
    });
  } catch {
    failSkillIntake(
      'E_PHASE10_SKILL_CACHE_NOT_GITIGNORED',
      `skill-cache path must be ignored by git: ${cachePath}`,
      { cachePath }
    );
  }
}

async function writeCacheRecord(projectRoot, {
  domainRecord,
  provider,
  discovery,
  source,
  reason,
  missingFields = [],
  timestamp
}) {
  const cacheId = `SKCACHE-${provider}-${stableHash({
    provider,
    reason,
    sourceRef: source.sourceRef,
    discovery
  }).slice(0, 16)}`;
  const recordPath = resolveInside(cacheRootDir(projectRoot), provider, `${cacheId}.json`);
  const cachePath = toRepoRelative(projectRoot, recordPath);
  await assertSkillCacheGitIgnored(projectRoot, cachePath);
  const record = {
    schemaVersion: SCIENTIFIC_SKILL_INTAKE_SCHEMA_VERSION,
    cacheId,
    domainId: domainRecord.domainId,
    provider,
    sourceRef: source.sourceRef,
    dedupeKey: source.dedupeKey,
    reason,
    missingFields,
    notProvenance: true,
    ttlDays: SCIENTIFIC_SKILL_CACHE_TTL_DAYS,
    cachedAt: timestamp,
    ttlExpiresAt: addDays(timestamp, SCIENTIFIC_SKILL_CACHE_TTL_DAYS),
    discovery
  };
  await atomicWriteJson(recordPath, record);
  return {
    cacheId,
    reason,
    provider,
    cachePath
  };
}

function buildDedupeKeys(discovery, primaryKey) {
  const keys = new Set([primaryKey]);
  const doi = normalizeLower(discovery.doi);
  const pmid = normalizeText(discovery.pmid).replace(/^pmid:/iu, '');
  const url = normalizeText(discovery.url);
  if (doi) keys.add(`doi:${doi}`);
  if (pmid) keys.add(`pmid:${pmid.toLowerCase()}`);
  if (url) keys.add(`url:${url.toLowerCase()}`);
  return [...keys];
}

function buildInboxEntry({
  domainRecord,
  discovery,
  provider,
  source,
  taskId,
  timestamp
}) {
  const title = normalizeText(discovery.title ?? discovery.label ?? source.sourceRef.id);
  const inboxEntryId = `INBOX-SKILL-${provider}-${slug(source.dedupeKey)}`;
  return {
    schemaVersion: 'phase10.inbox-entry.v1',
    inboxEntryId,
    domainId: domainRecord.domainId,
    entryType: 'raw-document',
    sourceRef: source.sourceRef,
    dedupeKeys: buildDedupeKeys(discovery, source.dedupeKey),
    discoveredBySkill: normalizeText(discovery.discoveredBySkill),
    discoveredByTask: {
      objectiveId: normalizeText(discovery.discoveredByTask.objectiveId),
      taskId
    },
    discoveredAt: timestamp,
    selectionRationale: normalizeText(discovery.selectionRationale),
    relevanceScore: discovery.relevanceScore,
    whyThisMatters: normalizeText(discovery.whyThisMatters),
    candidateStatus: 'pending',
    priority: discovery.priority ?? 'normal',
    payloadStatus: discovery.payloadStatus ?? (discovery.abstract ? 'abstract-only' : 'metadata-only'),
    preliminaryMetadata: {
      provider,
      title,
      notProvenance: true,
      sourceRef: source.sourceRef,
      abstract: discovery.abstract ?? null,
      licenseGuess: discovery.licenseGuess ?? 'unknown'
    },
    licenseGuess: discovery.licenseGuess ?? 'unknown',
    trustTierSuggestion: discovery.trustTierSuggestion ?? 'tertiary',
    createdAt: timestamp
  };
}

function batchedTaskId(discovery, indexForTask) {
  const originalTaskId = normalizeText(discovery.discoveredByTask.taskId);
  const batchIndex = Math.floor(indexForTask / BATCH_SIZE) + 1;
  return `${originalTaskId}-batch-${String(batchIndex).padStart(3, '0')}`;
}

export async function ingestScientificSkillDiscoveries(projectPath, {
  discoveries = [],
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  if (!Array.isArray(discoveries)) {
    failSkillIntake(
      'E_PHASE10_SKILL_DISCOVERIES_INVALID',
      'discoveries must be an array'
    );
  }
  const domainRecord = await readActiveDomainRecord(projectRoot);
  const taskCounts = new Map();
  const submissions = [];
  const cacheRecords = [];

  for (const discovery of discoveries) {
    const provider = providerOf(discovery);
    assertDiscoveryAuthorship(discovery);
    const source = sourceForDiscovery(provider, discovery);
    const missingFields = missingReviewFields(discovery);
    if (missingFields.length > 0) {
      cacheRecords.push(await writeCacheRecord(projectRoot, {
        domainRecord,
        provider,
        discovery,
        source,
        reason: 'incomplete-review-fields',
        missingFields,
        timestamp
      }));
      continue;
    }

    const taskKey = [
      normalizeText(discovery.discoveredByTask.objectiveId),
      normalizeText(discovery.discoveredByTask.taskId)
    ].join('::');
    const taskIndex = taskCounts.get(taskKey) ?? 0;
    taskCounts.set(taskKey, taskIndex + 1);
    const inboxEntry = buildInboxEntry({
      domainRecord,
      discovery,
      provider,
      source,
      taskId: batchedTaskId(discovery, taskIndex),
      timestamp
    });

    try {
      submissions.push(await submitInboxCandidate(projectRoot, {
        inboxEntry,
        timestamp
      }));
    } catch (error) {
      if (![
        'E_PHASE10_INBOX_DUPLICATE_DEDUPE_KEY',
        'E_PHASE10_INBOX_DUPLICATE_ID'
      ].includes(error?.code)) {
        throw error;
      }
      cacheRecords.push(await writeCacheRecord(projectRoot, {
        domainRecord,
        provider,
        discovery,
        source,
        reason: 'duplicate-dedupe-key',
        timestamp
      }));
    }
  }

  return {
    ok: true,
    phase10: true,
    command: 'scientific-skill intake',
    domainId: domainRecord.domainId,
    inboxCandidateCount: submissions.length,
    cacheRecordCount: cacheRecords.length,
    submissions,
    cacheRecords
  };
}

async function readCacheProviderRecords(providerDir) {
  let entries;
  try {
    entries = await readdir(providerDir, { withFileTypes: true });
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
    records.push(await readJson(path.join(providerDir, entry.name)));
  }
  return records;
}

export async function listScientificSkillCache(projectPath, { provider = null } = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const root = cacheRootDir(projectRoot);
  if (provider != null) {
    return readCacheProviderRecords(resolveInside(root, providerOf({ provider })));
  }
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    records.push(...await readCacheProviderRecords(path.join(root, entry.name)));
  }
  return records.sort((left, right) => String(left.cacheId).localeCompare(right.cacheId));
}
