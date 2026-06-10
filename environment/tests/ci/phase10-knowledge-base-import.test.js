import assert from 'node:assert/strict';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  importKnowledgeBaseSnapshot,
  listKnowledgeBaseImports,
  readKnowledgeBaseImportStatus
} from '../../phase10/knowledge-base-import.js';
import {
  listInboxEntries
} from '../../phase10/inbox.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-kb-import',
  name: 'Knowledge Base Import Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-kb-import'],
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});

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

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
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

async function writeKnowledgeBase(projectRoot, options = {}) {
  const knowledgeBasePath = path.join(projectRoot, '.vibe-science', 'KNOWLEDGE');
  await mkdir(knowledgeBasePath, { recursive: true });
  if (options.library !== false) {
    await writeJson(path.join(knowledgeBasePath, 'library.json'), {
      items: options.items ?? [
        {
          title: 'Legacy paper A',
          url: 'https://example.test/paper-a',
          note: 'Legacy library note A.'
        },
        {
          title: 'Legacy paper B',
          url: 'https://example.test/paper-b',
          note: 'Legacy library note B.'
        }
      ]
    });
  }
  if (options.patterns !== false) {
    await writeFile(
      path.join(knowledgeBasePath, 'patterns.md'),
      options.patterns ?? [
        '# Patterns',
        '',
        '## Synthetic lethality',
        'PARP inhibition was useful in this legacy note.'
      ].join('\n'),
      'utf8'
    );
  }
  if (options.methods === true) {
    await writeFile(
      path.join(knowledgeBasePath, 'methods.md'),
      '## Organoid protocol\nLegacy method note.\n',
      'utf8'
    );
  }
  return knowledgeBasePath;
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function readKnowledgeBaseFiles(knowledgeBasePath) {
  const files = {};
  for (const entry of await readdir(knowledgeBasePath)) {
    files[entry] = await readFile(path.join(knowledgeBasePath, entry), 'utf8');
  }
  return files;
}

test('knowledge-base import rejects when no active domain exists', async () => {
  await withProject('phase10-kb-import-missing-domain-', async (projectRoot) => {
    const knowledgeBasePath = await writeKnowledgeBase(projectRoot);

    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath,
        importId: 'KBIMP-missing-domain',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_DOMAIN_REQUIRED'
    );
  });
});

test('knowledge-base import fails closed for missing, empty, and malformed snapshots', async () => {
  await withProject('phase10-kb-import-fail-closed-', async (projectRoot) => {
    await installDomain(projectRoot);

    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath: path.join(projectRoot, '.vibe-science', 'KNOWLEDGE-missing'),
        importId: 'KBIMP-missing-snapshot',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_PATH_NOT_FOUND'
    );

    const emptyPath = path.join(projectRoot, '.vibe-science', 'KNOWLEDGE-empty');
    await mkdir(emptyPath, { recursive: true });
    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath: emptyPath,
        importId: 'KBIMP-empty-snapshot',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_EMPTY'
    );

    const malformedPath = path.join(projectRoot, '.vibe-science', 'KNOWLEDGE-malformed');
    await mkdir(malformedPath, { recursive: true });
    await writeFile(path.join(malformedPath, 'library.json'), '{ not-json', 'utf8');
    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath: malformedPath,
        importId: 'KBIMP-malformed-library',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_LIBRARY_INVALID'
    );

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-kb-import' });
    assert.equal(entries.length, 0);
  });
});

test('knowledge-base import stages legacy records through inbox only', async () => {
  await withProject('phase10-kb-import-stages-inbox-', async (projectRoot) => {
    await installDomain(projectRoot);
    const knowledgeBasePath = await writeKnowledgeBase(projectRoot);
    const beforeFiles = await readKnowledgeBaseFiles(knowledgeBasePath);

    const result = await importKnowledgeBaseSnapshot(projectRoot, {
      knowledgeBasePath,
      importId: 'KBIMP-basic',
      timestamp: TIMESTAMP
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidateCount, 3);
    assert.equal(result.batches.length, 1);
    assert.match(result.manifestPath, /knowledge-base-imports\/KBIMP-basic\.json$/u);

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-kb-import' });
    assert.equal(entries.length, 3);
    assert.equal(entries.every((entry) => entry.candidateStatus === 'pending'), true);
    assert.equal(entries.every((entry) => entry.sourceRef.type === 'file'), true);
    assert.equal(entries[0].discoveredBySkill, 'phase10-knowledge-base-import');
    assert.equal(entries[0].preliminaryMetadata.legacyNotProvenance, true);
    assert.match(entries[0].preliminaryMetadata.legacySnapshotPath, /KNOWLEDGE/u);

    const status = await readKnowledgeBaseImportStatus(projectRoot, {
      importId: 'KBIMP-basic',
      domainId: 'KDOM-kb-import'
    });
    assert.equal(status.importId, 'KBIMP-basic');
    assert.equal(status.legacyRuntimeFrozenForNewAccumulation, true);

    const imports = await listKnowledgeBaseImports(projectRoot, { domainId: 'KDOM-kb-import' });
    assert.equal(imports.length, 1);
    assert.equal(imports[0].candidateCount, 3);

    const manifest = await readJson(path.join(projectRoot, status.manifestPath));
    assert.deepEqual(manifest.inboxEntryIds, entries.map((entry) => entry.inboxEntryId));
    assert.deepEqual(await readKnowledgeBaseFiles(knowledgeBasePath), beforeFiles);

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-kb-import' });
    assert.equal(bundles.length, 0);

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
        `${forbidden} must not be created by knowledge-base import`
      );
    }
  });
});

test('knowledge-base import batches more than ten candidates without weakening inbox cap', async () => {
  await withProject('phase10-kb-import-batching-', async (projectRoot) => {
    await installDomain(projectRoot);
    const items = Array.from({ length: 12 }, (_, index) => ({
      title: `Legacy item ${index + 1}`,
      url: `https://example.test/legacy/${index + 1}`
    }));
    const knowledgeBasePath = await writeKnowledgeBase(projectRoot, {
      items,
      patterns: false
    });

    const result = await importKnowledgeBaseSnapshot(projectRoot, {
      knowledgeBasePath,
      importId: 'KBIMP-batched',
      timestamp: TIMESTAMP
    });

    assert.equal(result.candidateCount, 12);
    assert.deepEqual(result.batches.map((batch) => batch.taskId), [
      'T10.1.3-import-KBIMP-batched-batch-001',
      'T10.1.3-import-KBIMP-batched-batch-002'
    ]);

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-kb-import' });
    const countsByTask = new Map();
    for (const entry of entries) {
      const taskId = entry.discoveredByTask.taskId;
      countsByTask.set(taskId, (countsByTask.get(taskId) ?? 0) + 1);
    }
    assert.deepEqual([...countsByTask.values()].sort((a, b) => a - b), [2, 10]);
    assert.equal([...countsByTask.values()].every((count) => count <= 10), true);
  });
});

test('knowledge-base import rejects archived domains and duplicate import ids', async () => {
  await withProject('phase10-kb-import-guards-', async (projectRoot) => {
    await installDomain(projectRoot, {
      lifecycleStatus: 'archived',
      active: false
    });
    const archivedPath = await writeKnowledgeBase(projectRoot);

    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath: archivedPath,
        importId: 'KBIMP-archived',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_DOMAIN_ARCHIVED'
    );
  });

  await withProject('phase10-kb-import-duplicate-', async (projectRoot) => {
    await installDomain(projectRoot);
    const knowledgeBasePath = await writeKnowledgeBase(projectRoot, { patterns: false });

    await importKnowledgeBaseSnapshot(projectRoot, {
      knowledgeBasePath,
      importId: 'KBIMP-duplicate',
      timestamp: TIMESTAMP
    });
    await expectCode(
      () => importKnowledgeBaseSnapshot(projectRoot, {
        knowledgeBasePath,
        importId: 'KBIMP-duplicate',
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_KB_IMPORT_DUPLICATE'
    );

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-kb-import' });
    assert.equal(entries.length, 2);
  });
});
