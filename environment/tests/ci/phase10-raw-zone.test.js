import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listRawDocuments,
  readRawZoneStatus,
  registerRawDocument
} from '../../phase10/raw-zone.js';
import { lintPhase10Corpus } from '../../phase10/law13-lint.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-raw',
  name: 'Raw Zone Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-raw'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
});

function rawDocument(overrides = {}) {
  return {
    schemaVersion: 'phase10.raw-document.v1',
    rawDocumentId: 'RAW-001',
    bundleId: 'SB-001',
    domainId: 'KDOM-raw',
    sourceType: 'pdf',
    trustTier: 'primary',
    sourceLocator: {
      kind: 'file',
      uri: 'raw/papers/RAW-001/source.pdf'
    },
    contentHash: 'sha256:raw-001',
    capturedAt: '2026-06-10T00:00:00.000Z',
    ingestion: {
      method: 'operator-upload',
      operator: 'codex-test'
    },
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

test('raw registration rejects when no active domain exists', async () => {
  await withProject('phase10-raw-zone-missing-domain-', async (projectRoot) => {
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument(),
        rawPath: 'papers/RAW-001/source.pdf',
        payload: 'paper bytes'
      }),
      'E_PHASE10_RAW_DOMAIN_REQUIRED'
    );
  });
});

test('raw registration writes metadata and payload under the active domain raw tree', async () => {
  await withProject('phase10-raw-zone-register-', async (projectRoot) => {
    await installDomain(projectRoot);

    const result = await registerRawDocument(projectRoot, {
      rawDocument: rawDocument(),
      rawPath: 'papers/RAW-001/source.pdf',
      payload: 'paper bytes'
    });

    assert.equal(result.ok, true);
    assert.equal(result.phase10, true);
    assert.equal(result.domainId, 'KDOM-raw');
    assert.equal(result.rawDocumentId, 'RAW-001');
    assert.match(result.rawDocumentRecordPath, /KDOM-raw\/raw\/_metadata\/RAW-001\.json$/u);
    assert.match(result.rawPayloadPath, /KDOM-raw\/raw\/papers\/RAW-001\/source\.pdf$/u);

    const recordPath = path.join(projectRoot, result.rawDocumentRecordPath);
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    assert.equal(record.rawDocumentId, 'RAW-001');
    assert.equal(record.trustTier, 'primary');
    const payloadPath = path.join(projectRoot, result.rawPayloadPath);
    assert.equal(await readFile(payloadPath, 'utf8'), 'paper bytes');

    for (const forbidden of [
      'wiki',
      'queries',
      'raw/_inbox',
      'source-bundles',
      'provenance-links'
    ]) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created by raw-zone registration`
      );
    }
  });
});

test('archived active domain rejects raw writes but keeps raw-zone status readable', async () => {
  await withProject('phase10-raw-zone-archived-', async (projectRoot) => {
    await installDomain(projectRoot, {
      lifecycleStatus: 'archived',
      active: false
    });

    const status = await readRawZoneStatus(projectRoot, { domainId: 'KDOM-raw' });
    assert.equal(status.lifecycleStatus, 'archived');
    assert.equal(status.writable, false);

    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument(),
        rawPath: 'papers/RAW-001/source.pdf',
        payload: 'paper bytes'
      }),
      'E_PHASE10_RAW_DOMAIN_ARCHIVED'
    );
  });
});

test('raw path escape outside active domain raw tree rejects', async () => {
  await withProject('phase10-raw-zone-path-escape-', async (projectRoot) => {
    await installDomain(projectRoot);
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument(),
        rawPath: '../wiki/escape.md',
        payload: 'escape'
      }),
      'E_PHASE10_RAW_PATH_ESCAPE'
    );
  });
});

test('raw document missing trust tier rejects before persistence', async () => {
  await withProject('phase10-raw-zone-trust-tier-', async (projectRoot) => {
    await installDomain(projectRoot);
    const { trustTier: _removed, ...withoutTrustTier } = rawDocument();
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: withoutTrustTier,
        rawPath: 'papers/RAW-001/source.pdf',
        payload: 'paper bytes'
      }),
      'E_PHASE10_RAW_TRUST_TIER_REQUIRED'
    );
  });
});

test('raw document schema invalid rejects before persistence', async () => {
  await withProject('phase10-raw-zone-schema-invalid-', async (projectRoot) => {
    await installDomain(projectRoot);
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument({ sourceType: 'spreadsheet' }),
        rawPath: 'papers/RAW-001/source.pdf',
        payload: 'paper bytes'
      }),
      'E_PHASE10_RAW_DOCUMENT_SCHEMA_INVALID'
    );
  });
});

test('raw document domain mismatch rejects', async () => {
  await withProject('phase10-raw-zone-domain-mismatch-', async (projectRoot) => {
    await installDomain(projectRoot);
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument({ domainId: 'KDOM-other' }),
        rawPath: 'papers/RAW-001/source.pdf',
        payload: 'paper bytes'
      }),
      'E_PHASE10_RAW_DOMAIN_MISMATCH'
    );
  });
});

test('duplicate rawDocumentId and contentHash reject without silent overwrite', async () => {
  await withProject('phase10-raw-zone-duplicate-', async (projectRoot) => {
    await installDomain(projectRoot);
    await registerRawDocument(projectRoot, {
      rawDocument: rawDocument(),
      rawPath: 'papers/RAW-001/source.pdf',
      payload: 'first'
    });

    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument({ contentHash: 'sha256:other' }),
        rawPath: 'papers/RAW-001/other.pdf',
        payload: 'second'
      }),
      'E_PHASE10_RAW_DUPLICATE_ID'
    );
    await expectCode(
      () => registerRawDocument(projectRoot, {
        rawDocument: rawDocument({ rawDocumentId: 'RAW-002' }),
        rawPath: 'papers/RAW-002/source.pdf',
        payload: 'second'
      }),
      'E_PHASE10_RAW_DUPLICATE_HASH'
    );

    const docs = await listRawDocuments(projectRoot, { domainId: 'KDOM-raw' });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].rawDocumentId, 'RAW-001');
  });
});

test('LAW 13 raw trust-tier lint remains fail-closed for missing trust tier', () => {
  const result = lintPhase10Corpus({
    wikiPages: [],
    rawDocuments: [{ rawDocumentId: 'RAW-no-trust' }],
    provenanceLinks: [],
    queryRecords: [],
    claimEdges: [],
    domains: [{ domainId: 'KDOM-raw', objectiveLinks: ['OBJ-raw'] }],
    objectives: [{ objectiveId: 'OBJ-raw', domainId: 'KDOM-raw' }],
    implementationRefs: ['phase10.knowledge-domain.v1']
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'E_PHASE10_RAW_DOCUMENT_REQUIRES_TRUST_TIER'),
    true
  );
});
