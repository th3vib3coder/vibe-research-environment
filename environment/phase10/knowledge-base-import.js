import { access, readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';
import {
  activeDomainRecordPath,
  domainStateRootDir
} from './domain-lifecycle.js';
import {
  submitInboxCandidate
} from './inbox.js';

export const KNOWLEDGE_BASE_IMPORT_LOCK_TASK = 'T10.1.3';
export const KNOWLEDGE_BASE_IMPORT_SCHEMA_VERSION = 'phase10.knowledge-base-import.v1';
export const KNOWLEDGE_BASE_IMPORT_DIR = 'knowledge-base-imports';

const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';
const INBOX_BATCH_SIZE = 10;
const SAFE_IMPORT_ID_PATTERN = /^KBIMP-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SUPPORTED_FILES = Object.freeze([
  ['library.json', 'library'],
  ['patterns.md', 'pattern'],
  ['methods.md', 'method'],
  ['dead-ends.md', 'dead-end']
]);

export class KnowledgeBaseImportError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'KnowledgeBaseImportError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failImport(code, message, extra = {}) {
  throw new KnowledgeBaseImportError({ code, message, extra });
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function toDisplayPath(projectRoot, targetPath) {
  const relativePath = path.relative(projectRoot, targetPath);
  if (relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join('/');
  }
  return path.resolve(targetPath).split(path.sep).join('/');
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

function assertSafeImportId(importId) {
  if (typeof importId !== 'string' || !SAFE_IMPORT_ID_PATTERN.test(importId)) {
    failImport(
      'E_PHASE10_KB_IMPORT_ID_INVALID',
      `importId must be a safe KBIMP-* path segment: ${importId}`
    );
  }
}

function resolveKnowledgeBasePath(projectRoot, knowledgeBasePath) {
  if (typeof knowledgeBasePath !== 'string' || knowledgeBasePath.trim() === '') {
    failImport('E_PHASE10_KB_PATH_REQUIRED', 'knowledgeBasePath is required');
  }
  return path.isAbsolute(knowledgeBasePath)
    ? path.resolve(knowledgeBasePath)
    : path.resolve(projectRoot, knowledgeBasePath);
}

async function assertSnapshotDirectory(knowledgeBaseRoot) {
  let stats;
  try {
    stats = await stat(knowledgeBaseRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failImport(
        'E_PHASE10_KB_PATH_NOT_FOUND',
        `knowledge-base snapshot directory not found: ${knowledgeBaseRoot}`,
        { knowledgeBasePath: knowledgeBaseRoot }
      );
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    failImport(
      'E_PHASE10_KB_PATH_NOT_FOUND',
      `knowledge-base snapshot path is not a directory: ${knowledgeBaseRoot}`,
      { knowledgeBasePath: knowledgeBaseRoot }
    );
  }
}

async function readActiveDomainRecord(projectRoot, options = {}) {
  const recordPath = activeDomainRecordPath(projectRoot, options);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failImport('E_PHASE10_KB_DOMAIN_REQUIRED', 'No active Phase 10 knowledge domain exists');
    }
    throw error;
  }

  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failImport('E_PHASE10_KB_DOMAIN_SCHEMA_INVALID', error.message);
  }
  return domainRecord;
}

function assertDomainWritable(domainRecord) {
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failImport(
      'E_PHASE10_KB_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is archived and cannot receive migration candidates`,
      { domainId: domainRecord.domainId }
    );
  }
}

function assertExpectedDomain(domainRecord, domainId) {
  if (domainId != null && domainRecord.domainId !== domainId) {
    failImport(
      'E_PHASE10_KB_DOMAIN_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      { activeDomainId: domainRecord.domainId, requestedDomainId: domainId }
    );
  }
}

function requireObjectiveId(domainRecord) {
  const objectiveId = domainRecord.objectiveLinks?.[0];
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
    failImport(
      'E_PHASE10_KB_OBJECTIVE_REQUIRED',
      `Domain ${domainRecord.domainId} has no objective link for inbox discovery metadata`,
      { domainId: domainRecord.domainId }
    );
  }
  return objectiveId;
}

function importRootDir(projectRoot, domainId, options = {}) {
  return resolveInside(domainStateRootDir(projectRoot, options), domainId, KNOWLEDGE_BASE_IMPORT_DIR);
}

function importManifestPath(projectRoot, domainId, importId, options = {}) {
  assertSafeImportId(importId);
  return resolveInside(importRootDir(projectRoot, domainId, options), `${importId}.json`);
}

async function collectFiles(rootPath, prefix = '') {
  const entries = await readdir(path.join(rootPath, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(rootPath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function fingerprintSnapshot(knowledgeBaseRoot) {
  const files = await collectFiles(knowledgeBaseRoot);
  const records = [];
  for (const relativePath of files) {
    const buffer = await readFile(path.join(knowledgeBaseRoot, relativePath));
    records.push({
      relativePath,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex')
    });
  }
  return records;
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60) || 'legacy-item';
}

function normalizeLibraryCollections(value) {
  if (Array.isArray(value)) {
    return [['item', value]];
  }
  if (value == null || typeof value !== 'object') {
    return [];
  }

  const collections = [];
  for (const [key, entries] of Object.entries(value)) {
    if (Array.isArray(entries)) {
      const kind = key.endsWith('s') ? key.slice(0, -1) : key;
      collections.push([kind || 'item', entries]);
    }
  }
  return collections;
}

function titleFromLibraryItem(item, index) {
  if (typeof item === 'string') {
    return item.trim() || `Legacy library item ${index + 1}`;
  }
  if (item != null && typeof item === 'object') {
    return String(
      item.title
        ?? item.name
        ?? item.citation
        ?? item.id
        ?? `Legacy library item ${index + 1}`
    ).trim();
  }
  return `Legacy library item ${index + 1}`;
}

function libraryPayload(item) {
  return typeof item === 'string' ? item : JSON.stringify(item, null, 2);
}

async function parseLibraryFile(knowledgeBaseRoot) {
  const filePath = path.join(knowledgeBaseRoot, 'library.json');
  if (!(await pathExists(filePath))) {
    return [];
  }

  let value;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    failImport('E_PHASE10_KB_LIBRARY_INVALID', `library.json is not valid JSON: ${error.message}`);
  }

  const records = [];
  let ordinal = 0;
  for (const [kind, entries] of normalizeLibraryCollections(value)) {
    for (const item of entries) {
      const title = titleFromLibraryItem(item, ordinal);
      records.push({
        kind,
        relativePath: 'library.json',
        sectionLabel: `${kind}-${ordinal + 1}`,
        title,
        payload: libraryPayload(item),
        metadata: {
          legacyKind: kind,
          originalRecord: item
        }
      });
      ordinal += 1;
    }
  }
  return records;
}

function pushMarkdownSection(records, section, relativePath, kind) {
  if (!section) return;
  const content = section.body.join('\n').trim();
  if (!content) return;
  records.push({
    kind,
    relativePath,
    sectionLabel: section.title,
    title: section.title,
    payload: content,
    metadata: {
      legacyKind: kind,
      headingDepth: section.depth
    }
  });
}

function parseMarkdownContent(relativePath, kind, text) {
  const records = [];
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      pushMarkdownSection(records, current, relativePath, kind);
      current = {
        depth: heading[1].length,
        title: heading[2].trim(),
        body: []
      };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  pushMarkdownSection(records, current, relativePath, kind);
  if (records.length === 0 && text.trim()) {
    records.push({
      kind,
      relativePath,
      sectionLabel: path.basename(relativePath),
      title: path.basename(relativePath, '.md'),
      payload: text.trim(),
      metadata: {
        legacyKind: kind,
        headingDepth: null
      }
    });
  }
  return records;
}

async function parseMarkdownFile(knowledgeBaseRoot, relativePath, kind) {
  const filePath = path.join(knowledgeBaseRoot, relativePath);
  if (!(await pathExists(filePath))) {
    return [];
  }
  return parseMarkdownContent(relativePath, kind, await readFile(filePath, 'utf8'));
}

async function parseKnowledgeBaseRecords(knowledgeBaseRoot) {
  const records = [];
  for (const [relativePath, kind] of SUPPORTED_FILES) {
    if (relativePath === 'library.json') {
      records.push(...await parseLibraryFile(knowledgeBaseRoot));
    } else {
      records.push(...await parseMarkdownFile(knowledgeBaseRoot, relativePath, kind));
    }
  }
  if (records.length === 0) {
    failImport(
      'E_PHASE10_KB_EMPTY',
      'knowledge-base snapshot contains no migratable library or markdown records'
    );
  }
  return records;
}

function batchTaskId(importId, index) {
  const batchNumber = Math.floor(index / INBOX_BATCH_SIZE) + 1;
  return `${KNOWLEDGE_BASE_IMPORT_LOCK_TASK}-import-${importId}-batch-${String(batchNumber).padStart(3, '0')}`;
}

function batchSummary(importId, candidateCount) {
  const batches = [];
  for (let index = 0; index < candidateCount; index += INBOX_BATCH_SIZE) {
    const batchIndex = Math.floor(index / INBOX_BATCH_SIZE);
    batches.push({
      taskId: batchTaskId(importId, index),
      batchNumber: batchIndex + 1,
      candidateCount: Math.min(INBOX_BATCH_SIZE, candidateCount - index)
    });
  }
  return batches;
}

function candidateEntry({
  domainRecord,
  objectiveId,
  projectRoot,
  knowledgeBaseRoot,
  importId,
  record,
  index,
  timestamp
}) {
  const ordinal = String(index + 1).padStart(3, '0');
  const legacySource = `${toDisplayPath(projectRoot, knowledgeBaseRoot)}/${record.relativePath}`
    + `#${slugify(record.sectionLabel)}`;
  const titleSlug = slugify(record.title);
  return {
    schemaVersion: 'phase10.inbox-entry.v1',
    inboxEntryId: `INBOX-${importId}-${ordinal}`,
    domainId: domainRecord.domainId,
    entryType: record.relativePath === 'library.json' ? 'raw-document' : 'wiki-page',
    sourceRef: {
      type: 'file',
      id: legacySource
    },
    dedupeKeys: [
      `legacy-kb:${importId}:${record.relativePath}:${ordinal}:${titleSlug}`
    ],
    discoveredBySkill: 'phase10-knowledge-base-import',
    discoveredByTask: {
      objectiveId,
      taskId: batchTaskId(importId, index)
    },
    discoveredAt: timestamp,
    selectionRationale:
      `Legacy knowledge-base snapshot path ${legacySource} is staged for operator review only.`,
    relevanceScore: record.relativePath === 'library.json' ? 0.6 : 0.5,
    whyThisMatters:
      'Legacy VRE memory may be useful after review, but it is not LAW 13 provenance.',
    candidateStatus: 'pending',
    priority: 'normal',
    payloadStatus: 'preserved',
    preliminaryMetadata: {
      title: record.title,
      legacyImportId: importId,
      legacyKind: record.kind,
      legacySnapshotPath: toDisplayPath(projectRoot, knowledgeBaseRoot),
      legacyPath: record.relativePath,
      legacySectionLabel: record.sectionLabel,
      legacyNotProvenance: true,
      ...record.metadata
    },
    licenseGuess: 'unknown',
    trustTierSuggestion: 'operator-provided',
    createdAt: timestamp
  };
}

async function submitCandidates({
  projectRoot,
  domainRecord,
  objectiveId,
  knowledgeBaseRoot,
  importId,
  records,
  stateRoot,
  timestamp
}) {
  const submitted = [];
  for (const [index, record] of records.entries()) {
    const inboxEntry = candidateEntry({
      domainRecord,
      objectiveId,
      projectRoot,
      knowledgeBaseRoot,
      importId,
      record,
      index,
      timestamp
    });
    await submitInboxCandidate(projectRoot, {
      inboxEntry,
      payload: record.payload,
      stateRoot,
      timestamp,
      taskCap: INBOX_BATCH_SIZE
    });
    submitted.push(inboxEntry.inboxEntryId);
  }
  return submitted;
}

function assertSnapshotUnchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    failImport(
      'E_PHASE10_KB_SOURCE_MUTATED',
      'knowledge-base snapshot changed while the import was running'
    );
  }
}

export async function importKnowledgeBaseSnapshot(projectPath, {
  knowledgeBasePath,
  importId,
  domainId = null,
  stateRoot = null,
  timestamp = new Date().toISOString()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  assertSafeImportId(importId);

  const domainRecord = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  assertDomainWritable(domainRecord);
  const objectiveId = requireObjectiveId(domainRecord);

  const knowledgeBaseRoot = resolveKnowledgeBasePath(projectRoot, knowledgeBasePath);
  await assertSnapshotDirectory(knowledgeBaseRoot);

  const manifestPath = importManifestPath(projectRoot, domainRecord.domainId, importId, options);
  if (await pathExists(manifestPath)) {
    failImport(
      'E_PHASE10_KB_IMPORT_DUPLICATE',
      `knowledge-base import already exists: ${importId}`,
      { importId }
    );
  }

  const sourceFingerprintBefore = await fingerprintSnapshot(knowledgeBaseRoot);
  const records = await parseKnowledgeBaseRecords(knowledgeBaseRoot);
  const inboxEntryIds = await submitCandidates({
    projectRoot,
    domainRecord,
    objectiveId,
    knowledgeBaseRoot,
    importId,
    records,
    stateRoot,
    timestamp
  });
  const sourceFingerprintAfter = await fingerprintSnapshot(knowledgeBaseRoot);
  assertSnapshotUnchanged(sourceFingerprintBefore, sourceFingerprintAfter);

  const manifest = {
    schemaVersion: KNOWLEDGE_BASE_IMPORT_SCHEMA_VERSION,
    importId,
    domainId: domainRecord.domainId,
    objectiveId,
    legacyKnowledgeBasePath: toDisplayPath(projectRoot, knowledgeBaseRoot),
    legacyRuntimeFrozenForNewAccumulation: true,
    freezeReason:
      'Phase 10 migration bridge reads legacy KNOWLEDGE as a snapshot and stages inbox candidates.',
    candidateCount: inboxEntryIds.length,
    inboxEntryIds,
    batches: batchSummary(importId, inboxEntryIds.length),
    sourceFiles: sourceFingerprintAfter,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await atomicWriteJson(manifestPath, manifest);

  return {
    ok: true,
    phase10: true,
    command: 'knowledge-base import',
    importId,
    domainId: domainRecord.domainId,
    candidateCount: inboxEntryIds.length,
    inboxEntryIds,
    batches: manifest.batches,
    legacyRuntimeFrozenForNewAccumulation: true,
    manifestPath: toRepoRelative(projectRoot, manifestPath)
  };
}

export async function listKnowledgeBaseImports(projectPath, {
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const domainRecord = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);

  const root = importRootDir(projectRoot, domainRecord.domainId, options);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const manifests = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const manifest = await readJson(path.join(root, entry.name));
    manifests.push({
      ...manifest,
      manifestPath: toRepoRelative(projectRoot, path.join(root, entry.name))
    });
  }
  return manifests.sort((left, right) => left.importId.localeCompare(right.importId));
}

export async function readKnowledgeBaseImportStatus(projectPath, {
  importId,
  domainId = null,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  assertSafeImportId(importId);
  const domainRecord = await readActiveDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  const manifestPath = importManifestPath(projectRoot, domainRecord.domainId, importId, options);
  try {
    return {
      ...await readJson(manifestPath),
      manifestPath: toRepoRelative(projectRoot, manifestPath)
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failImport(
        'E_PHASE10_KB_IMPORT_MISSING',
        `knowledge-base import does not exist: ${importId}`,
        { importId }
      );
    }
    throw error;
  }
}
