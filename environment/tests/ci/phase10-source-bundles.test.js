import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  registerRawDocument
} from '../../phase10/raw-zone.js';
import {
  listSourceBundles,
  readSourceBundleStatus,
  registerSourceBundle,
  validateSourceBundleApprovalPolicy
} from '../../phase10/source-bundles.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-source',
  name: 'Source Bundle Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-source'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
});

function rawDocument(overrides = {}) {
  return {
    schemaVersion: 'phase10.raw-document.v1',
    rawDocumentId: 'RAW-source-001',
    bundleId: 'SB-source-001',
    domainId: 'KDOM-source',
    sourceType: 'pdf',
    trustTier: 'primary',
    sourceLocator: {
      kind: 'file',
      uri: 'raw/papers/RAW-source-001/source.pdf'
    },
    contentHash: 'sha256:source-raw-001',
    capturedAt: '2026-06-10T00:00:00.000Z',
    ingestion: {
      method: 'operator-upload',
      operator: 'codex-test'
    },
    ...overrides
  };
}

function sourceBundle(overrides = {}) {
  return {
    schemaVersion: 'phase10.source-bundle.v1',
    bundleId: 'SB-source-001',
    bundleVersion: 'v1',
    domainId: 'KDOM-source',
    title: 'Curated source bundle',
    sourceType: 'pdf',
    trustTier: 'primary',
    license: 'open',
    allowTrackPayload: false,
    scopeOfUse: ['evidence'],
    rawDocumentRefs: [
      {
        rawDocumentId: 'RAW-source-001',
        contentHash: 'sha256:source-raw-001'
      }
    ],
    sourceLocators: [
      {
        kind: 'file',
        uri: 'raw/papers/RAW-source-001/source.pdf'
      }
    ],
    collectedAt: '2026-06-10T00:00:00.000Z',
    status: 'curated',
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

async function installRawDocument(projectRoot, overrides = {}) {
  return registerRawDocument(projectRoot, {
    rawDocument: rawDocument(overrides),
    rawPath: 'papers/RAW-source-001/source.pdf',
    payload: 'source bytes'
  });
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('source bundle registration rejects when no active domain exists', async () => {
  await withProject('phase10-source-bundles-missing-domain-', async (projectRoot) => {
    await expectCode(
      () => registerSourceBundle(projectRoot, { sourceBundle: sourceBundle() }),
      'E_PHASE10_SOURCE_BUNDLE_DOMAIN_REQUIRED'
    );
  });
});

test('source bundle registration writes a curated bundle from a real raw-zone record', async () => {
  await withProject('phase10-source-bundles-register-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installRawDocument(projectRoot);

    const result = await registerSourceBundle(projectRoot, {
      sourceBundle: sourceBundle()
    });

    assert.equal(result.ok, true);
    assert.equal(result.phase10, true);
    assert.equal(result.domainId, 'KDOM-source');
    assert.equal(result.bundleId, 'SB-source-001');
    assert.equal(result.bundleVersion, 'v1');
    assert.match(result.sourceBundleRecordPath, /KDOM-source\/source-bundles\/SB-source-001\/v1\.json$/u);

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-source' });
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0].license, 'open');
    assert.deepEqual(bundles[0].scopeOfUse, ['evidence']);

    for (const forbidden of [
      'wiki',
      'queries',
      '_inbox',
      'provenance-links',
      'claims/edges.jsonl'
    ]) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created by source-bundle registration`
      );
    }
  });
});

test('archived active domain rejects source-bundle writes but status remains readable', async () => {
  await withProject('phase10-source-bundles-archived-', async (projectRoot) => {
    await installDomain(projectRoot, {
      lifecycleStatus: 'archived',
      active: false
    });

    const status = await readSourceBundleStatus(projectRoot, { domainId: 'KDOM-source' });
    assert.equal(status.lifecycleStatus, 'archived');
    assert.equal(status.writable, false);

    await expectCode(
      () => registerSourceBundle(projectRoot, { sourceBundle: sourceBundle() }),
      'E_PHASE10_SOURCE_BUNDLE_DOMAIN_ARCHIVED'
    );
  });
});

test('runtime approval policy rejects curated unknown license and empty scope', () => {
  assert.throws(
    () => validateSourceBundleApprovalPolicy(sourceBundle({ license: 'unknown' })),
    /E_PHASE10_SOURCE_BUNDLE_LICENSE_UNKNOWN/u
  );
  assert.throws(
    () => validateSourceBundleApprovalPolicy(sourceBundle({ scopeOfUse: [] })),
    /E_PHASE10_SOURCE_BUNDLE_SCOPE_REQUIRED/u
  );
});

test('runtime approval policy only accepts curated approved source bundles', () => {
  for (const status of ['raw', 'rejected', 'archived']) {
    assert.throws(
      () => validateSourceBundleApprovalPolicy(sourceBundle({ status })),
      /E_PHASE10_SOURCE_BUNDLE_STATUS_FORBIDDEN/u
    );
  }
});

test('payload tracking requires reviewed payload license conditions', () => {
  assert.throws(
    () => validateSourceBundleApprovalPolicy(sourceBundle({
      allowTrackPayload: true,
      license: 'restricted'
    })),
    /E_PHASE10_SOURCE_BUNDLE_PAYLOAD_TRACKING_FORBIDDEN/u
  );
});

test('source bundle registration resolves raw refs and rejects missing or mismatched refs', async () => {
  await withProject('phase10-source-bundles-raw-ref-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installRawDocument(projectRoot);

    await expectCode(
      () => registerSourceBundle(projectRoot, {
        sourceBundle: sourceBundle({
          rawDocumentRefs: [{ rawDocumentId: 'RAW-missing', contentHash: 'sha256:nope' }]
        })
      }),
      'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISSING'
    );

    await expectCode(
      () => registerSourceBundle(projectRoot, {
        sourceBundle: sourceBundle({
          rawDocumentRefs: [{ rawDocumentId: 'RAW-source-001', contentHash: 'sha256:wrong' }]
        })
      }),
      'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISMATCH'
    );
  });
});

test('duplicate bundle version rejects and corrigendum version creates a new record', async () => {
  await withProject('phase10-source-bundles-corrigendum-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installRawDocument(projectRoot);
    await registerSourceBundle(projectRoot, { sourceBundle: sourceBundle() });

    await expectCode(
      () => registerSourceBundle(projectRoot, { sourceBundle: sourceBundle() }),
      'E_PHASE10_SOURCE_BUNDLE_DUPLICATE_VERSION'
    );

    await registerSourceBundle(projectRoot, {
      sourceBundle: sourceBundle({ bundleVersion: 'v2' })
    });
    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-source' });
    assert.equal(bundles.length, 2);
  });
});

test('reserved workflow paths reject as source locators', async () => {
  await withProject('phase10-source-bundles-reserved-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installRawDocument(projectRoot);

    await expectCode(
      () => registerSourceBundle(projectRoot, {
        sourceBundle: sourceBundle({
          sourceLocators: [{ kind: 'file', uri: '_inbox/candidate.pdf' }]
        })
      }),
      'E_PHASE10_SOURCE_BUNDLE_LOCATOR_FORBIDDEN'
    );
  });
});
