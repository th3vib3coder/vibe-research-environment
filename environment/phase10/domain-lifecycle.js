import { access, readdir } from 'node:fs/promises';
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
  objectiveRecordPath,
  objectivesRootDir,
  readObjectiveRecord,
  writeObjectiveRecord
} from '../objectives/store.js';

export const DOMAIN_STATE_ROOT_RELATIVE_PATH = '.vibe-science-environment/phase10/knowledge-domains';
export const ACTIVE_DOMAIN_RECORD_FILE = 'active-knowledge-domain.json';
export const ACTIVE_DOMAIN_RECORD_RELATIVE_PATH =
  `${DOMAIN_STATE_ROOT_RELATIVE_PATH}/${ACTIVE_DOMAIN_RECORD_FILE}`;
export const DOMAIN_LOCK_NAME = 'phase10-knowledge-domain-lifecycle';
export const KNOWLEDGE_DOMAIN_SCHEMA_FILE = 'phase10-knowledge-domain.schema.json';

const SAFE_DOMAIN_ID_PATTERN = /^KDOM-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_OBJECTIVE_ID_PATTERN = /^OBJ-[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export class DomainLifecycleError extends Error {
  constructor({ code, message, command = null, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'DomainLifecycleError';
    this.code = code;
    this.command = command;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failDomain(code, message, extra = {}) {
  throw new DomainLifecycleError({ code, message, extra });
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

function isPathInside(baseDir, candidatePath) {
  const relativePath = path.relative(baseDir, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function assertSafeDomainId(domainId) {
  if (typeof domainId !== 'string' || !SAFE_DOMAIN_ID_PATTERN.test(domainId)) {
    failDomain(
      'E_PHASE10_DOMAIN_ID_INVALID',
      `domainId must be a safe KDOM-* path segment: ${domainId}`
    );
  }
}

function assertSafeObjectiveId(objectiveId) {
  if (typeof objectiveId !== 'string' || !SAFE_OBJECTIVE_ID_PATTERN.test(objectiveId)) {
    failDomain(
      'E_PHASE10_OBJECTIVE_ID_INVALID',
      `objectiveId must be a safe OBJ-* path segment: ${objectiveId}`
    );
  }
}

export function domainStateRootDir(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const defaultRoot = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'phase10',
    'knowledge-domains'
  );

  if (options.stateRoot == null || options.stateRoot === '') {
    return defaultRoot;
  }

  const requestedRoot = path.isAbsolute(options.stateRoot)
    ? path.resolve(options.stateRoot)
    : path.resolve(projectRoot, options.stateRoot);
  const gitignoredStateRoot = resolveInside(projectRoot, '.vibe-science-environment');
  if (!isPathInside(gitignoredStateRoot, requestedRoot)) {
    failDomain(
      'E_PHASE10_DOMAIN_STORAGE_ESCAPE',
      'domain state root must stay under .vibe-science-environment/',
      {
        requestedRoot: options.stateRoot,
        resolvedRoot: requestedRoot,
        allowedRoot: gitignoredStateRoot
      }
    );
  }
  return requestedRoot;
}

export function activeDomainRecordPath(projectPath, options = {}) {
  return resolveInside(domainStateRootDir(projectPath, options), ACTIVE_DOMAIN_RECORD_FILE);
}

async function validateDomainRecord(projectRoot, domainRecord) {
  const validate = await loadValidator(projectRoot, KNOWLEDGE_DOMAIN_SCHEMA_FILE);
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    throw new DomainLifecycleError({
      code: 'E_PHASE10_DOMAIN_SCHEMA_INVALID',
      message: error.message
    });
  }
}

async function readExistingDomainRecord(projectRoot, options = {}) {
  const recordPath = activeDomainRecordPath(projectRoot, options);
  let domainRecord;
  try {
    domainRecord = await readJson(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failDomain('E_PHASE10_DOMAIN_NOT_FOUND', 'No Phase 10 knowledge domain exists');
    }
    throw error;
  }
  await validateDomainRecord(projectRoot, domainRecord);
  return {
    domainRecord,
    recordPath
  };
}

async function writeDomainRecord(projectRoot, domainRecord, options = {}) {
  await validateDomainRecord(projectRoot, domainRecord);
  const recordPath = activeDomainRecordPath(projectRoot, options);
  await atomicWriteJson(recordPath, domainRecord);
  return recordPath;
}

async function requireObjective(projectRoot, objectiveId) {
  assertSafeObjectiveId(objectiveId);
  try {
    return await readObjectiveRecord(projectRoot, objectiveId);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failDomain(
        'E_PHASE10_OBJECTIVE_NOT_FOUND',
        `Objective record not found for ${objectiveId}`,
        { objectiveId }
      );
    }
    throw error;
  }
}

async function listObjectives(projectRoot) {
  const root = objectivesRootDir(projectRoot);
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
    const objectiveId = entry.name;
    if (!SAFE_OBJECTIVE_ID_PATTERN.test(objectiveId)) {
      continue;
    }
    try {
      records.push(await readObjectiveRecord(projectRoot, objectiveId));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return records;
}

function assertExpectedDomain(domainRecord, domainId) {
  assertSafeDomainId(domainId);
  if (domainRecord.domainId !== domainId) {
    failDomain(
      'E_PHASE10_DOMAIN_ID_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      {
        activeDomainId: domainRecord.domainId,
        requestedDomainId: domainId
      }
    );
  }
}

async function assertDomainObjectiveSymmetry(projectRoot, domainRecord) {
  const links = new Set(domainRecord.objectiveLinks);
  for (const objectiveId of links) {
    const objectiveRecord = await requireObjective(projectRoot, objectiveId);
    if (objectiveRecord.domainId !== domainRecord.domainId) {
      failDomain(
        'E_PHASE10_DOMAIN_LINK_INCONSISTENT',
        `Domain links ${objectiveId} but objective.domainId is not ${domainRecord.domainId}`,
        {
          domainId: domainRecord.domainId,
          objectiveId,
          objectiveDomainId: objectiveRecord.domainId ?? null
        }
      );
    }
  }

  for (const objectiveRecord of await listObjectives(projectRoot)) {
    if (objectiveRecord.domainId === domainRecord.domainId && !links.has(objectiveRecord.objectiveId)) {
      failDomain(
        'E_PHASE10_DOMAIN_LINK_INCONSISTENT',
        `Objective ${objectiveRecord.objectiveId} points to ${domainRecord.domainId} but domain does not link it`,
        {
          domainId: domainRecord.domainId,
          objectiveId: objectiveRecord.objectiveId
        }
      );
    }
  }
}

function assertDomainWritable(domainRecord) {
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failDomain(
      'E_PHASE10_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is archived and cannot be mutated`,
      { domainId: domainRecord.domainId }
    );
  }
}

function withDomainTimestamp(domainRecord, timestamp) {
  return {
    ...domainRecord,
    updatedAt: timestamp
  };
}

async function commitDomainAndObjectivePair(projectRoot, {
  previousDomain = null,
  nextDomain,
  previousObjective,
  nextObjective,
  options = {}
}) {
  const domainPath = activeDomainRecordPath(projectRoot, options);
  let objectiveWritten = false;
  try {
    await writeObjectiveRecord(projectRoot, nextObjective);
    objectiveWritten = true;
    await writeDomainRecord(projectRoot, nextDomain, options);
    return domainPath;
  } catch (error) {
    if (objectiveWritten) {
      await writeObjectiveRecord(projectRoot, previousObjective).catch(() => {});
    }
    if (previousDomain) {
      await writeDomainRecord(projectRoot, previousDomain, options).catch(() => {});
    }
    throw error;
  }
}

function phase10Payload(command, extra = {}) {
  return {
    ok: true,
    command,
    phase10: true,
    ...extra
  };
}

export async function createKnowledgeDomain(projectPath, {
  domainId,
  name,
  objectiveId,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertSafeDomainId(domainId);
  assertSafeObjectiveId(objectiveId);
  if (typeof name !== 'string' || name.trim() === '') {
    failDomain('E_PHASE10_DOMAIN_NAME_REQUIRED', 'domain create requires --name');
  }

  return withLock(projectRoot, DOMAIN_LOCK_NAME, async () => {
    const options = { stateRoot };
    const existingPath = activeDomainRecordPath(projectRoot, options);
    if (await pathExists(existingPath)) {
      failDomain(
        'E_PHASE10_ACTIVE_DOMAIN_EXISTS',
        'Phase 10 v1 supports only one knowledge domain record',
        { domainRecordPath: toRepoRelative(projectRoot, existingPath) }
      );
    }

    const objectiveRecord = await requireObjective(projectRoot, objectiveId);
    if (objectiveRecord.domainId && objectiveRecord.domainId !== domainId) {
      failDomain(
        'E_PHASE10_DOMAIN_LINK_INCONSISTENT',
        `Objective ${objectiveId} already belongs to ${objectiveRecord.domainId}`,
        { objectiveId, domainId: objectiveRecord.domainId }
      );
    }

    const domainRecord = {
      schemaVersion: 'phase10.knowledge-domain.v1',
      domainId,
      name: name.trim(),
      lifecycleStatus: 'active',
      objectiveLinks: [objectiveId],
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const nextObjective = {
      ...objectiveRecord,
      domainId,
      lastUpdatedAt: timestamp
    };

    const recordPath = await commitDomainAndObjectivePair(projectRoot, {
      nextDomain: domainRecord,
      previousObjective: objectiveRecord,
      nextObjective,
      options
    });

    return phase10Payload('domain create', {
      domainId,
      lifecycleStatus: domainRecord.lifecycleStatus,
      active: domainRecord.active,
      objectiveLinks: domainRecord.objectiveLinks,
      domainRecordPath: toRepoRelative(projectRoot, recordPath)
    });
  });
}

export async function linkObjectiveToDomain(projectPath, {
  domainId,
  objectiveId,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertSafeDomainId(domainId);
  assertSafeObjectiveId(objectiveId);

  return withLock(projectRoot, DOMAIN_LOCK_NAME, async () => {
    const options = { stateRoot };
    const { domainRecord } = await readExistingDomainRecord(projectRoot, options);
    assertExpectedDomain(domainRecord, domainId);
    assertDomainWritable(domainRecord);
    await assertDomainObjectiveSymmetry(projectRoot, domainRecord);

    const objectiveRecord = await requireObjective(projectRoot, objectiveId);
    if (objectiveRecord.domainId && objectiveRecord.domainId !== domainId) {
      failDomain(
        'E_PHASE10_DOMAIN_LINK_INCONSISTENT',
        `Objective ${objectiveId} already belongs to ${objectiveRecord.domainId}`,
        { objectiveId, domainId: objectiveRecord.domainId }
      );
    }

    const objectiveLinks = [...new Set([...domainRecord.objectiveLinks, objectiveId])].sort();
    const nextDomain = withDomainTimestamp({ ...domainRecord, objectiveLinks }, timestamp);
    const nextObjective = {
      ...objectiveRecord,
      domainId,
      lastUpdatedAt: timestamp
    };
    const recordPath = await commitDomainAndObjectivePair(projectRoot, {
      previousDomain: domainRecord,
      nextDomain,
      previousObjective: objectiveRecord,
      nextObjective,
      options
    });

    return phase10Payload('domain link', {
      domainId,
      objectiveId,
      objectiveLinks,
      domainRecordPath: toRepoRelative(projectRoot, recordPath)
    });
  });
}

export async function unlinkObjectiveFromDomain(projectPath, {
  domainId,
  objectiveId,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertSafeDomainId(domainId);
  assertSafeObjectiveId(objectiveId);

  return withLock(projectRoot, DOMAIN_LOCK_NAME, async () => {
    const options = { stateRoot };
    const { domainRecord } = await readExistingDomainRecord(projectRoot, options);
    assertExpectedDomain(domainRecord, domainId);
    assertDomainWritable(domainRecord);
    await assertDomainObjectiveSymmetry(projectRoot, domainRecord);

    if (!domainRecord.objectiveLinks.includes(objectiveId)) {
      failDomain(
        'E_PHASE10_DOMAIN_LINK_INCONSISTENT',
        `Domain ${domainId} does not link objective ${objectiveId}`,
        { domainId, objectiveId }
      );
    }
    const objectiveLinks = domainRecord.objectiveLinks.filter((entry) => entry !== objectiveId);
    if (objectiveLinks.length === 0) {
      failDomain(
        'E_PHASE10_DOMAIN_OBJECTIVE_REQUIRED',
        'phase10.knowledge-domain.v1 requires at least one objective link'
      );
    }

    const objectiveRecord = await requireObjective(projectRoot, objectiveId);
    const { domainId: _removedDomainId, ...nextObjectiveWithoutDomain } = objectiveRecord;
    const nextObjective = {
      ...nextObjectiveWithoutDomain,
      lastUpdatedAt: timestamp
    };
    const nextDomain = withDomainTimestamp({ ...domainRecord, objectiveLinks }, timestamp);
    const recordPath = await commitDomainAndObjectivePair(projectRoot, {
      previousDomain: domainRecord,
      nextDomain,
      previousObjective: objectiveRecord,
      nextObjective,
      options
    });

    return phase10Payload('domain unlink', {
      domainId,
      objectiveId,
      objectiveLinks,
      domainRecordPath: toRepoRelative(projectRoot, recordPath)
    });
  });
}

export async function readKnowledgeDomainStatus(projectPath, {
  domainId,
  stateRoot = null
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const { domainRecord, recordPath } = await readExistingDomainRecord(projectRoot, options);
  assertExpectedDomain(domainRecord, domainId);
  await assertDomainObjectiveSymmetry(projectRoot, domainRecord);

  return phase10Payload('domain status', {
    domainId: domainRecord.domainId,
    name: domainRecord.name,
    lifecycleStatus: domainRecord.lifecycleStatus,
    active: domainRecord.active,
    objectiveLinks: [...domainRecord.objectiveLinks],
    domainRecordPath: toRepoRelative(projectRoot, recordPath),
    createdAt: domainRecord.createdAt,
    updatedAt: domainRecord.updatedAt
  });
}

export async function archiveKnowledgeDomain(projectPath, {
  domainId,
  reason = null,
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertSafeDomainId(domainId);

  return withLock(projectRoot, DOMAIN_LOCK_NAME, async () => {
    const options = { stateRoot };
    const { domainRecord, recordPath } = await readExistingDomainRecord(projectRoot, options);
    assertExpectedDomain(domainRecord, domainId);
    await assertDomainObjectiveSymmetry(projectRoot, domainRecord);

    const nextDomain = withDomainTimestamp({
      ...domainRecord,
      lifecycleStatus: 'archived',
      active: false
    }, timestamp);
    await writeDomainRecord(projectRoot, nextDomain, options);

    return phase10Payload('domain archive', {
      domainId,
      reason,
      lifecycleStatus: nextDomain.lifecycleStatus,
      active: nextDomain.active,
      objectiveLinks: [...nextDomain.objectiveLinks],
      domainRecordPath: toRepoRelative(projectRoot, recordPath)
    });
  });
}

export function domainRecordRepoPath(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  return toRepoRelative(projectRoot, activeDomainRecordPath(projectRoot, options));
}

export function objectiveDomainRecordPath(projectPath, objectiveId) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertSafeObjectiveId(objectiveId);
  return toRepoRelative(projectRoot, objectiveRecordPath(projectRoot, objectiveId));
}

