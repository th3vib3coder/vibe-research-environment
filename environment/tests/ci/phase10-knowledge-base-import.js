import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  importKnowledgeBaseSnapshot
} from '../../phase10/knowledge-base-import.js';
import {
  listInboxEntries
} from '../../phase10/inbox.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';

const DOMAIN = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-ci-kb-import',
  name: 'CI Knowledge Base Import Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-ci-kb-import'],
  active: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z'
};

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

async function writeKnowledgeBase(targetRoot, itemCount) {
  const knowledgeBasePath = path.join(targetRoot, '.vibe-science', 'KNOWLEDGE');
  await mkdir(knowledgeBasePath, { recursive: true });
  await writeJson(path.join(knowledgeBasePath, 'library.json'), {
    items: Array.from({ length: itemCount }, (_, index) => ({
      title: `CI legacy item ${index + 1}`,
      url: `https://example.test/ci-legacy/${index + 1}`
    }))
  });
  return knowledgeBasePath;
}

export default async function validatePhase10KnowledgeBaseImport() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-kb-import-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await writeJson(activeDomainRecordPath(projectRoot), DOMAIN);

    const knowledgeBasePath = await writeKnowledgeBase(projectRoot, 12);
    const result = await importKnowledgeBaseSnapshot(projectRoot, {
      knowledgeBasePath,
      importId: 'KBIMP-ci-batched',
      timestamp: '2026-06-10T00:00:00.000Z'
    });
    assert(result.ok === true, 'knowledge-base import must return ok:true');
    assert(result.candidateCount === 12, 'knowledge-base import must stage all 12 items');

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-ci-kb-import' });
    assert(entries.length === 12, 'knowledge-base import must create 12 inbox candidates');
    assert(
      entries.every((entry) => entry.sourceRef.type === 'file'),
      'knowledge-base candidates must use file source refs, not LAW 13 provenance'
    );

    const countsByTask = new Map();
    for (const entry of entries) {
      const taskId = entry.discoveredByTask.taskId;
      countsByTask.set(taskId, (countsByTask.get(taskId) ?? 0) + 1);
    }
    assert(
      [...countsByTask.values()].every((count) => count <= 10),
      'knowledge-base import must batch candidates without raising the inbox task cap'
    );

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-ci-kb-import' });
    assert(bundles.length === 0, 'knowledge-base import must not create source bundles');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-knowledge-base-import', validatePhase10KnowledgeBaseImport);
}
