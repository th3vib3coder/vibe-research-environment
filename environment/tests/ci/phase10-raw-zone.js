import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listRawDocuments,
  registerRawDocument
} from '../../phase10/raw-zone.js';

const DOMAIN = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-ci-raw',
  name: 'CI Raw Zone Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-ci-raw'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
};

function rawDocument(overrides = {}) {
  return {
    schemaVersion: 'phase10.raw-document.v1',
    rawDocumentId: 'RAW-ci-001',
    bundleId: 'SB-ci-001',
    domainId: 'KDOM-ci-raw',
    sourceType: 'pdf',
    trustTier: 'primary',
    sourceLocator: {
      kind: 'file',
      uri: 'raw/papers/RAW-ci-001/source.pdf'
    },
    contentHash: 'sha256:ci-raw-001',
    capturedAt: '2026-06-10T00:00:00.000Z',
    ingestion: {
      method: 'ci-fixture',
      operator: 'phase10-raw-zone-validator'
    },
    ...overrides
  };
}

async function copySchemaFixture(targetRoot) {
  const schemaRoot = path.join(targetRoot, 'environment', 'schemas');
  await fsCp(path.join(repoRoot, 'environment', 'schemas'), schemaRoot, { recursive: true });
}

async function fsCp(source, target, options) {
  const { cp } = await import('node:fs/promises');
  return cp(source, target, options);
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export default async function validatePhase10RawZone() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-raw-zone-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await writeJson(activeDomainRecordPath(projectRoot), DOMAIN);

    const registered = await registerRawDocument(projectRoot, {
      rawDocument: rawDocument(),
      rawPath: 'papers/RAW-ci-001/source.pdf',
      payload: 'ci raw payload'
    });

    assert(registered.ok === true, 'raw-zone registration must return ok:true');
    assert(
      registered.rawDocumentRecordPath.endsWith('KDOM-ci-raw/raw/_metadata/RAW-ci-001.json'),
      'raw-zone metadata must stay under the active domain raw tree'
    );

    const docs = await listRawDocuments(projectRoot, { domainId: 'KDOM-ci-raw' });
    assert(docs.length === 1, 'raw-zone list must return the registered raw document');
    assert(docs[0].trustTier === 'primary', 'raw-zone must preserve trustTier metadata');

    let escapeCaught = false;
    try {
      await registerRawDocument(projectRoot, {
        rawDocument: rawDocument({ rawDocumentId: 'RAW-ci-escape', contentHash: 'sha256:escape' }),
        rawPath: '../wiki/escape.md',
        payload: 'escape'
      });
    } catch (error) {
      escapeCaught = error.code === 'E_PHASE10_RAW_PATH_ESCAPE';
    }
    assert(escapeCaught, 'raw-zone must fail closed for raw path escape attempts');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-raw-zone', validatePhase10RawZone);
}
