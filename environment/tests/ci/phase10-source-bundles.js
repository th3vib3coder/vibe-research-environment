import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  registerRawDocument
} from '../../phase10/raw-zone.js';
import {
  listSourceBundles,
  registerSourceBundle,
  validateSourceBundleApprovalPolicy
} from '../../phase10/source-bundles.js';

const DOMAIN = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-ci-source',
  name: 'CI Source Bundle Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-ci-source'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
};

function rawDocument(overrides = {}) {
  return {
    schemaVersion: 'phase10.raw-document.v1',
    rawDocumentId: 'RAW-ci-source-001',
    bundleId: 'SB-ci-source-001',
    domainId: 'KDOM-ci-source',
    sourceType: 'pdf',
    trustTier: 'primary',
    sourceLocator: {
      kind: 'file',
      uri: 'raw/papers/RAW-ci-source-001/source.pdf'
    },
    contentHash: 'sha256:ci-source-raw-001',
    capturedAt: '2026-06-10T00:00:00.000Z',
    ingestion: {
      method: 'ci-fixture',
      operator: 'phase10-source-bundles-validator'
    },
    ...overrides
  };
}

function sourceBundle(overrides = {}) {
  return {
    schemaVersion: 'phase10.source-bundle.v1',
    bundleId: 'SB-ci-source-001',
    bundleVersion: 'v1',
    domainId: 'KDOM-ci-source',
    title: 'CI source bundle',
    sourceType: 'pdf',
    trustTier: 'primary',
    license: 'open',
    allowTrackPayload: false,
    scopeOfUse: ['evidence'],
    rawDocumentRefs: [
      {
        rawDocumentId: 'RAW-ci-source-001',
        contentHash: 'sha256:ci-source-raw-001'
      }
    ],
    sourceLocators: [
      {
        kind: 'file',
        uri: 'raw/papers/RAW-ci-source-001/source.pdf'
      }
    ],
    collectedAt: '2026-06-10T00:00:00.000Z',
    status: 'curated',
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

export default async function validatePhase10SourceBundles() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-source-bundles-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await writeJson(activeDomainRecordPath(projectRoot), DOMAIN);
    await registerRawDocument(projectRoot, {
      rawDocument: rawDocument(),
      rawPath: 'papers/RAW-ci-source-001/source.pdf',
      payload: 'ci source raw payload'
    });

    const registered = await registerSourceBundle(projectRoot, {
      sourceBundle: sourceBundle()
    });
    assert(registered.ok === true, 'source-bundle registration must return ok:true');
    assert(
      registered.sourceBundleRecordPath.endsWith('KDOM-ci-source/source-bundles/SB-ci-source-001/v1.json'),
      'source-bundle record must stay under the active domain source-bundles tree'
    );

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-ci-source' });
    assert(bundles.length === 1, 'source-bundle list must return the registered bundle');
    assert(bundles[0].license === 'open', 'source-bundle must preserve license metadata');

    let policyCaught = false;
    try {
      validateSourceBundleApprovalPolicy(sourceBundle({ license: 'unknown' }));
    } catch (error) {
      policyCaught = error.code === 'E_PHASE10_SOURCE_BUNDLE_LICENSE_UNKNOWN';
    }
    assert(policyCaught, 'runtime policy must reject curated bundles with unknown license');

    let missingRefCaught = false;
    try {
      await registerSourceBundle(projectRoot, {
        sourceBundle: sourceBundle({
          bundleId: 'SB-ci-source-002',
          rawDocumentRefs: [{ rawDocumentId: 'RAW-ci-missing', contentHash: 'sha256:missing' }]
        })
      });
    } catch (error) {
      missingRefCaught = error.code === 'E_PHASE10_SOURCE_BUNDLE_RAW_REF_MISSING';
    }
    assert(missingRefCaught, 'source-bundle registration must resolve raw refs fail-closed');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-source-bundles', validatePhase10SourceBundles);
}
