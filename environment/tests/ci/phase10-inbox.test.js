import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listInboxEntries,
  listInboxForCurator,
  listInboxForOperator,
  readInboxStatus,
  reviewInboxEntry,
  submitInboxCandidate
} from '../../phase10/inbox.js';
import {
  listRawDocuments
} from '../../phase10/raw-zone.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-inbox',
  name: 'Inbox Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-inbox'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
});

function inboxEntry(overrides = {}) {
  return {
    schemaVersion: 'phase10.inbox-entry.v1',
    inboxEntryId: 'INBOX-001',
    domainId: 'KDOM-inbox',
    entryType: 'raw-document',
    sourceRef: {
      type: 'doi',
      id: '10.1000/inbox-example'
    },
    dedupeKeys: ['doi:10.1000/inbox-example', 'title:inbox-example'],
    discoveredBySkill: 'operator-upload',
    discoveredByTask: {
      objectiveId: 'OBJ-inbox',
      taskId: 'TASK-inbox'
    },
    discoveredAt: '2026-06-10T00:00:00.000Z',
    selectionRationale: 'Candidate source for an active evidence gap.',
    relevanceScore: 0.9,
    whyThisMatters: 'This paper may answer the current mechanistic question with direct data.',
    candidateStatus: 'pending',
    priority: 'normal',
    payloadStatus: 'metadata-only',
    preliminaryMetadata: {
      title: 'Inbox Example',
      doi: '10.1000/inbox-example',
      pmid: 'PMID-12345',
      abstract: 'A short abstract.',
      fullPayload: 'FULL PAYLOAD MUST NOT REACH CURATOR'
    },
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
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

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function withProject(testName, fn) {
  const projectRoot = await createCliFixtureProject(testName);
  try {
    return await fn(projectRoot);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
}

async function installDomain(projectRoot, overrides = {}) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    ...ACTIVE_DOMAIN,
    ...overrides
  });
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('inbox submission rejects when no active domain exists', async () => {
  await withProject('phase10-inbox-missing-domain-', async (projectRoot) => {
    await expectCode(
      () => submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() }),
      'E_PHASE10_INBOX_DOMAIN_REQUIRED'
    );
  });
});

test('inbox submission stores a candidate without provenance or bundle side effects', async () => {
  await withProject('phase10-inbox-submit-', async (projectRoot) => {
    await installDomain(projectRoot);

    const result = await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry(),
      payload: 'full payload'
    });

    assert.equal(result.ok, true);
    assert.equal(result.inboxEntryId, 'INBOX-001');
    assert.match(result.inboxEntryPath, /KDOM-inbox\/raw\/_inbox\/entries\/INBOX-001\.json$/u);

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].candidateStatus, 'pending');

    for (const forbidden of [
      'source-bundles',
      'wiki',
      'provenance-links',
      'claim-ledger.md',
      'claims/edges.jsonl'
    ]) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created by inbox candidate submission`
      );
    }
  });
});

test('inbox submission rejects duplicate dedupe keys and per-task overflow', async () => {
  await withProject('phase10-inbox-dedupe-cap-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() });

    await expectCode(
      () => submitInboxCandidate(projectRoot, {
        inboxEntry: inboxEntry({ inboxEntryId: 'INBOX-dup' })
      }),
      'E_PHASE10_INBOX_DUPLICATE_DEDUPE_KEY'
    );

    for (let index = 2; index <= 10; index += 1) {
      await submitInboxCandidate(projectRoot, {
        inboxEntry: inboxEntry({
          inboxEntryId: `INBOX-${index}`,
          sourceRef: { type: 'url', id: `https://example.test/${index}` },
          dedupeKeys: [`url:https://example.test/${index}`],
          relevanceScore: 0.5
        })
      });
    }

    await expectCode(
      () => submitInboxCandidate(projectRoot, {
        inboxEntry: inboxEntry({
          inboxEntryId: 'INBOX-11',
          sourceRef: { type: 'url', id: 'https://example.test/11' },
          dedupeKeys: ['url:https://example.test/11']
        })
      }),
      'E_PHASE10_INBOX_TASK_CAP_EXCEEDED'
    );
  });
});

test('operator and curator inbox views enforce redaction boundaries', async () => {
  await withProject('phase10-inbox-redaction-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry(), payload: 'full payload' });

    const operatorEntries = await listInboxForOperator(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(operatorEntries[0].sourceRef.id, '10.1000/inbox-example');
    assert.equal(operatorEntries[0].preliminaryMetadata.pmid, 'PMID-12345');

    const curatorEntries = await listInboxForCurator(projectRoot, { domainId: 'KDOM-inbox' });
    const serialized = JSON.stringify(curatorEntries);
    assert.equal(serialized.includes('10.1000/inbox-example'), false);
    assert.equal(serialized.includes('PMID-12345'), false);
    assert.equal(serialized.includes('FULL PAYLOAD'), false);
    assert.equal(curatorEntries[0].whyThisMatters.length <= 80, true);
  });
});

test('review rejects bulk approval and missing operator approval fields', async () => {
  await withProject('phase10-inbox-review-guards-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() });

    await expectCode(
      () => reviewInboxEntry(projectRoot, {
        inboxEntryId: ['INBOX-001'],
        decision: 'approve',
        approval: {}
      }),
      'E_PHASE10_INBOX_BULK_APPROVE_FORBIDDEN'
    );

    await expectCode(
      () => reviewInboxEntry(projectRoot, {
        inboxEntryId: 'INBOX-001',
        decision: 'approve',
        approval: { license: 'open', trustTier: 'primary' }
      }),
      'E_PHASE10_INBOX_APPROVAL_FIELDS_REQUIRED'
    );
  });
});

test('needs-full-text keeps a candidate in inbox without creating a bundle', async () => {
  await withProject('phase10-inbox-needs-full-text-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() });

    const result = await reviewInboxEntry(projectRoot, {
      inboxEntryId: 'INBOX-001',
      decision: 'needs-full-text',
      payloadStatus: 'missing'
    });
    assert.equal(result.candidateStatus, 'deferred');

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(bundles.length, 0);
  });
});

test('rejection tombstones an entry without deletion', async () => {
  await withProject('phase10-inbox-reject-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() });

    await reviewInboxEntry(projectRoot, {
      inboxEntryId: 'INBOX-001',
      decision: 'reject',
      rejection: {
        rejectedBy: 'operator',
        rejectReason: 'Duplicate source.',
        payloadStatus: 'preserved'
      }
    });

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].candidateStatus, 'rejected');
    assert.equal(entries[0].rejection.rejectReason, 'Duplicate source.');
  });
});

test('stale entries older than 90 days resurface before ordinary pending entries', async () => {
  await withProject('phase10-inbox-stale-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry({
        inboxEntryId: 'INBOX-old',
        sourceRef: { type: 'url', id: 'https://example.test/old' },
        dedupeKeys: ['url:https://example.test/old'],
        createdAt: '2026-01-01T00:00:00.000Z'
      })
    });
    await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry({
        inboxEntryId: 'INBOX-new',
        sourceRef: { type: 'url', id: 'https://example.test/new' },
        dedupeKeys: ['url:https://example.test/new'],
        createdAt: '2026-06-09T00:00:00.000Z'
      })
    });

    const entries = await listInboxForOperator(projectRoot, {
      domainId: 'KDOM-inbox',
      now: '2026-06-10T00:00:00.000Z'
    });
    assert.equal(entries[0].inboxEntryId, 'INBOX-old');
    assert.equal(entries[0].candidateStatus, 'stale');
  });
});

test('promotion creates raw/source bundle only after one-entry approval', async () => {
  await withProject('phase10-inbox-promote-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry(),
      payload: 'approved payload'
    });

    const result = await reviewInboxEntry(projectRoot, {
      inboxEntryId: 'INBOX-001',
      decision: 'approve',
      approval: {
        approvedBy: 'operator',
        license: 'open',
        trustTier: 'primary',
        scopeOfUse: ['evidence'],
        rawDocumentId: 'RAW-inbox-001',
        bundleId: 'SB-inbox-001',
        bundleVersion: 'v1',
        title: 'Inbox promoted source',
        sourceType: 'pdf',
        rawPath: 'papers/RAW-inbox-001/source.pdf',
        contentHash: 'sha256:inbox-approved-001'
      }
    });

    assert.equal(result.candidateStatus, 'approved');
    assert.equal(result.promotedToBundle.bundleId, 'SB-inbox-001');

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0].bundleId, 'SB-inbox-001');
    assert.deepEqual(bundles[0].scopeOfUse, ['evidence']);
  });
});

test('invalid approval fails before creating raw or bundle side effects', async () => {
  await withProject('phase10-inbox-approval-atomic-', async (projectRoot) => {
    await installDomain(projectRoot);
    await submitInboxCandidate(projectRoot, {
      inboxEntry: inboxEntry(),
      payload: 'invalid approval payload'
    });

    await expectCode(
      () => reviewInboxEntry(projectRoot, {
        inboxEntryId: 'INBOX-001',
        decision: 'approve',
        approval: {
          approvedBy: 'operator',
          license: 'open',
          trustTier: 'primary',
          scopeOfUse: ['not-a-real-scope'],
          rawDocumentId: 'RAW-inbox-invalid',
          bundleId: 'SB-inbox-invalid',
          bundleVersion: 'v1',
          sourceType: 'pdf',
          rawPath: 'papers/RAW-inbox-invalid/source.pdf',
          contentHash: 'sha256:inbox-invalid-001'
        }
      }),
      'E_PHASE10_INBOX_ENTRY_SCHEMA_INVALID'
    );

    const rawDocuments = await listRawDocuments(projectRoot, { domainId: 'KDOM-inbox' });
    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(rawDocuments.length, 0);
    assert.equal(bundles.length, 0);
  });
});

test('archived domains block inbox writes and promotion but status is readable', async () => {
  await withProject('phase10-inbox-archived-', async (projectRoot) => {
    await installDomain(projectRoot, {
      lifecycleStatus: 'archived',
      active: false
    });

    const status = await readInboxStatus(projectRoot, { domainId: 'KDOM-inbox' });
    assert.equal(status.lifecycleStatus, 'archived');
    assert.equal(status.writable, false);

    await expectCode(
      () => submitInboxCandidate(projectRoot, { inboxEntry: inboxEntry() }),
      'E_PHASE10_INBOX_DOMAIN_ARCHIVED'
    );
  });
});
