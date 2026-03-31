import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DuplicatePaperError,
  linkPaperToClaim,
  listPapers,
  registerPaper,
  surfaceGaps,
} from '../../flows/literature.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function createFixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-literature-flow-'));
  await mkdir(path.join(root, 'environment'), { recursive: true });
  await cp(path.join(repoRoot, 'environment', 'templates'), path.join(root, 'environment', 'templates'), {
    recursive: true,
  });
  await cp(path.join(repoRoot, 'environment', 'schemas'), path.join(root, 'environment', 'schemas'), {
    recursive: true,
  });
  return root;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function listFiles(root) {
  const files = [];

  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else {
        files.push(relativePath.split(path.sep).join('/'));
      }
    }
  }

  await walk(root);
  return files.sort();
}

test('registerPaper bootstraps literature state and flow index through flow-state only', async () => {
  const projectRoot = await createFixtureProject();

  try {
    const result = await registerPaper(projectRoot, {
      title: 'Batch correction methods review',
      doi: '10.1234/batch-correction',
      authors: ['Author A', 'Author B'],
      year: 2026,
      relevance: 'supports claim C-001 methodology',
      linkedClaims: ['C-001'],
      methodologyConflicts: [],
    });

    assert.equal(result.paper.id, 'LIT-001');
    assert.equal(result.paper.title, 'Batch correction methods review');

    const literatureState = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'flows', 'literature.json'),
    );
    const flowIndex = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'flows', 'index.json'),
    );

    assert.equal(literatureState.papers.length, 1);
    assert.deepEqual(literatureState.papers[0], result.paper);
    assert.equal(flowIndex.activeFlow, 'literature');
    assert.equal(flowIndex.lastCommand, '/flow-literature --register');
    assert.equal(flowIndex.currentStage, 'literature-review');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('registerPaper prevents duplicate ids and duplicate DOIs', async () => {
  const projectRoot = await createFixtureProject();

  try {
    await registerPaper(projectRoot, {
      id: 'LIT-010',
      title: 'Original paper',
      doi: '10.5555/example',
      authors: ['Author A'],
      year: 2025,
      relevance: 'supports claim C-010',
      linkedClaims: ['C-010'],
      methodologyConflicts: [],
    });

    await assert.rejects(
      () =>
        registerPaper(projectRoot, {
          id: 'LIT-010',
          title: 'Different paper same id',
          doi: '10.5555/another',
          authors: ['Author B'],
          year: 2026,
          relevance: 'supports claim C-011',
          linkedClaims: [],
          methodologyConflicts: [],
        }),
      DuplicatePaperError,
    );

    await assert.rejects(
      () =>
        registerPaper(projectRoot, {
          id: 'LIT-011',
          title: 'Different paper same DOI',
          doi: '10.5555/EXAMPLE',
          authors: ['Author C'],
          year: 2026,
          relevance: 'supports claim C-011',
          linkedClaims: [],
          methodologyConflicts: [],
        }),
      DuplicatePaperError,
    );

    await assert.rejects(
      () =>
        registerPaper(projectRoot, {
          id: 'LIT-012',
          title: '  original   paper ',
          doi: '10.5555/new-one',
          authors: ['Author D'],
          year: 2026,
          relevance: 'supports claim C-012',
          linkedClaims: [],
          methodologyConflicts: [],
        }),
      DuplicatePaperError,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('surfaceGaps uses local state plus optional projections for honest gap analysis', async () => {
  const projectRoot = await createFixtureProject();

  try {
    await registerPaper(projectRoot, {
      id: 'LIT-001',
      title: 'Registered but unlinked',
      doi: '10.1000/unlinked',
      authors: ['Author A'],
      year: 2026,
      relevance: 'possible support for claim C-001',
      linkedClaims: [],
      methodologyConflicts: [],
    });

    await registerPaper(projectRoot, {
      id: 'LIT-002',
      title: 'Conflicting methodology paper',
      doi: '10.1000/conflict',
      authors: ['Author B'],
      year: 2025,
      relevance: 'directly discusses batch effects',
      linkedClaims: ['C-001'],
      methodologyConflicts: ['Normalization strategy conflicts with the baseline pipeline'],
    });

    const result = await surfaceGaps(projectRoot, {
      now: '2026-03-31T10:00:00Z',
      claimHeads: [{ claimId: 'C-001' }, { claimId: 'C-002' }],
      literatureSearches: [
        { claimId: 'C-002', query: 'claim C-002 batch correction', resultCount: 0 },
      ],
    });

    const gapKinds = result.gaps.map((gap) => gap.kind).sort();
    assert.deepEqual(gapKinds, [
      'empty-search',
      'methodology-conflict',
      'missing-claim-coverage',
      'unlinked-paper',
    ]);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.index.currentStage, 'literature-gap-analysis');
    assert.ok(result.index.blockers.some((message) => message.includes('No literature linked to claim C-002.')));

    const persisted = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'flows', 'literature.json'),
    );
    assert.equal(persisted.updatedAt, '2026-03-31T10:00:00.000Z');
    assert.equal(persisted.gaps.length, 4);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('linkPaperToClaim stores explicit claim links and reports degraded verification honestly', async () => {
  const projectRoot = await createFixtureProject();

  try {
    await registerPaper(projectRoot, {
      id: 'LIT-020',
      title: 'Linkable paper',
      doi: '10.2000/linkable',
      authors: ['Author A'],
      year: 2024,
      relevance: 'supports downstream validation',
      linkedClaims: [],
      methodologyConflicts: [],
    });

    const linked = await linkPaperToClaim(projectRoot, 'LIT-020', 'C-020', {
      claimHeads: [{ claimId: 'C-999' }],
      now: '2026-03-31T11:00:00Z',
    });

    assert.deepEqual(linked.paper.linkedClaims, ['C-020']);
    assert.ok(
      linked.warnings.some((warning) => warning.includes('Claim C-020 was not present in the provided claim heads')),
    );

    const linkedAgain = await linkPaperToClaim(projectRoot, 'LIT-020', 'C-020', {
      now: '2026-03-31T11:05:00Z',
    });

    assert.deepEqual(linkedAgain.paper.linkedClaims, ['C-020']);

    const listed = await listPapers(projectRoot, { claimId: 'C-020' });
    assert.deepEqual(
      listed.papers.map((paper) => paper.id),
      ['LIT-020'],
    );

    const linkedByDoi = await linkPaperToClaim(projectRoot, '10.2000/linkable', 'C-021', {
      now: '2026-03-31T11:06:00Z',
    });
    assert.deepEqual(linkedByDoi.paper.linkedClaims, ['C-020', 'C-021']);

    const persisted = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'flows', 'literature.json'),
    );
    assert.deepEqual(persisted.papers[0].linkedClaims, ['C-020', 'C-021']);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('literature helper never creates attempt or control-plane side effects', async () => {
  const projectRoot = await createFixtureProject();

  try {
    await registerPaper(projectRoot, {
      title: 'Safe local write',
      doi: '10.3000/safe-local-write',
      authors: ['Author A'],
      year: 2026,
      relevance: 'supports claim C-030',
      linkedClaims: [],
      methodologyConflicts: [],
    });
    await surfaceGaps(projectRoot, { now: '2026-03-31T12:00:00Z' });
    await listPapers(projectRoot);

    const rootStateDir = path.join(projectRoot, '.vibe-science-environment');
    const files = await listFiles(rootStateDir);

    assert.deepEqual(files, ['flows/index.json', 'flows/literature.json']);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
