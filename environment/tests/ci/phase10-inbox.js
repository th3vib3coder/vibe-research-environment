import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listInboxForCurator,
  reviewInboxEntry,
  submitInboxCandidate
} from '../../phase10/inbox.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';

const DOMAIN = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-ci-inbox',
  name: 'CI Inbox Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-ci-inbox'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
};

function inboxEntry(overrides = {}) {
  return {
    schemaVersion: 'phase10.inbox-entry.v1',
    inboxEntryId: 'INBOX-ci-001',
    domainId: 'KDOM-ci-inbox',
    entryType: 'raw-document',
    sourceRef: {
      type: 'doi',
      id: '10.1000/ci-inbox'
    },
    dedupeKeys: ['doi:10.1000/ci-inbox'],
    discoveredBySkill: 'ci-fixture',
    discoveredByTask: {
      objectiveId: 'OBJ-ci-inbox',
      taskId: 'TASK-ci-inbox'
    },
    discoveredAt: '2026-06-10T00:00:00.000Z',
    selectionRationale: 'CI candidate for inbox review.',
    relevanceScore: 0.75,
    whyThisMatters: 'This source is used to prove inbox review behavior.',
    candidateStatus: 'pending',
    priority: 'normal',
    payloadStatus: 'metadata-only',
    preliminaryMetadata: {
      title: 'CI Inbox Source',
      doi: '10.1000/ci-inbox',
      pmid: 'PMID-CI-INBOX',
      fullPayload: 'FULL CI PAYLOAD MUST NOT REACH CURATOR'
    },
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
}

async function fsCp(source, target, options) {
  const { cp } = await import('node:fs/promises');
  return cp(source, target, options);
}

async function copySchemaFixture(targetRoot) {
  const schemaRoot = path.join(targetRoot, 'environment', 'schemas');
  await fsCp(path.join(repoRoot, 'environment', 'schemas'), schemaRoot, { recursive: true });
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export default async function validatePhase10Inbox() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-inbox-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await writeJson(activeDomainRecordPath(projectRoot), DOMAIN);

    const submitted = await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry(),
      payload: 'ci inbox payload'
    });
    assert(submitted.ok === true, 'inbox submission must return ok:true');

    let duplicateCaught = false;
    try {
      await submitInboxCandidate(projectRoot, {
        inboxEntry: inboxEntry({ inboxEntryId: 'INBOX-ci-duplicate' })
      });
    } catch (error) {
      duplicateCaught = error.code === 'E_PHASE10_INBOX_DUPLICATE_DEDUPE_KEY';
    }
    assert(duplicateCaught, 'inbox must reject duplicate normalized dedupe keys');

    const curatorEntries = await listInboxForCurator(projectRoot, { domainId: 'KDOM-ci-inbox' });
    const serialized = JSON.stringify(curatorEntries);
    assert(!serialized.includes('10.1000/ci-inbox'), 'curator view must redact DOI values');
    assert(!serialized.includes('PMID-CI-INBOX'), 'curator view must redact PMID values');
    assert(!serialized.includes('FULL CI PAYLOAD'), 'curator view must redact full payload');

    await reviewInboxEntry(projectRoot, {
      inboxEntryId: 'INBOX-ci-001',
      decision: 'approve',
      approval: {
        approvedBy: 'operator',
        license: 'open',
        trustTier: 'primary',
        scopeOfUse: ['evidence'],
        rawDocumentId: 'RAW-ci-inbox-001',
        bundleId: 'SB-ci-inbox-001',
        bundleVersion: 'v1',
        title: 'CI Inbox promoted source',
        sourceType: 'pdf',
        rawPath: 'papers/RAW-ci-inbox-001/source.pdf',
        contentHash: 'sha256:ci-inbox-approved-001'
      }
    });

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-ci-inbox' });
    assert(bundles.length === 1, 'approved inbox entry must promote one source bundle');
    assert(bundles[0].bundleId === 'SB-ci-inbox-001', 'promoted bundle id must match');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-inbox', validatePhase10Inbox);
}
