import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DERIVATIVE_METADATA_PROVENANCE_CLASS,
  INTERNALS,
  walkLiteratureSources
} from '../../../lib/w-lit/literature-walk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const modulePath = path.resolve(vreRoot, 'lib', 'w-lit', 'literature-walk.js');

async function withSyntheticCorpus(run) {
  const corpusRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vre-w-lit-'));

  try {
    await fs.mkdir(path.join(corpusRoot, 'raw', 'papers', 'nested'), {
      recursive: true
    });
    await fs.mkdir(path.join(corpusRoot, 'raw', 'notes'), { recursive: true });
    await fs.mkdir(path.join(corpusRoot, 'wiki', 'sources'), {
      recursive: true
    });
    await fs.mkdir(path.join(corpusRoot, 'wiki', 'pages'), { recursive: true });

    await fs.writeFile(
      path.join(corpusRoot, 'raw', 'papers', 'z-paper.md'),
      'CXCL13 positive CD8 paper text.'
    );
    await fs.writeFile(
      path.join(corpusRoot, 'raw', 'papers', 'nested', 'a-paper.txt'),
      'Nested ovarian cancer paper text.'
    );
    await fs.writeFile(
      path.join(corpusRoot, 'wiki', 'sources', 'source-note.md'),
      'Source note derived from a paper.'
    );
    await fs.writeFile(
      path.join(corpusRoot, 'raw', 'notes', 'ignored.md'),
      'Not a paper path.'
    );
    await fs.writeFile(
      path.join(corpusRoot, 'wiki', 'pages', 'ignored.md'),
      'Not a source path.'
    );

    await run(corpusRoot);
  } finally {
    await fs.rm(corpusRoot, { recursive: true, force: true });
  }
}

test('walkLiteratureSources indexes only synthetic raw papers and wiki sources', async () => {
  await withSyntheticCorpus(async (corpusRoot) => {
    const countedTexts = [];
    const result = await walkLiteratureSources({
      corpusRoot,
      tokenCounterOptions: {
        providerCounter: async (text) => {
          countedTexts.push(text);
          return { count: text.length + 10 };
        }
      }
    });

    assert.deepEqual(
      result.map((entry) => entry.sourcePath),
      [
        'raw/papers/nested/a-paper.txt',
        'raw/papers/z-paper.md',
        'wiki/sources/source-note.md'
      ]
    );
    assert.deepEqual(
      result.map((entry) => entry.sourceKind),
      ['raw-paper', 'raw-paper', 'wiki-source']
    );

    for (const entry of result) {
      assert.equal(entry.provenanceClass, DERIVATIVE_METADATA_PROVENANCE_CLASS);
      assert.equal(entry.runtimeOpened, false);
      assert.equal(entry.law13Provenance, false);
      assert.equal(entry.tokenEstimateMode, 'provider_native');
      assert.match(entry.sourcePath, /^(raw\/papers|wiki\/sources)\//);
    }

    assert.equal(countedTexts.length, 3);
    assert.deepEqual(
      result.map((entry) => entry.tokenEstimate),
      countedTexts.map((text) => text.length + 10)
    );
  });
});

test('walkLiteratureSources source guard excludes forbidden runtime surfaces', async () => {
  const source = await fs.readFile(modulePath, 'utf8');
  const forbiddenPatterns = [
    /\bcreateClaimEdge\b/,
    /\bclaim[-_]?ledger\b/i,
    /\bvector\b/i,
    /\bembedding\b/i,
    /\bGraphify\b/i,
    /\bphase12\b/i,
    /\bfetch\b/,
    /\bhttps?:\/\//,
    /\bchild_process\b/,
    /\bspawn\b/,
    /\bexecFile?\b/,
    /\bwriteFile\b/,
    /\bappendFile\b/,
    /\bmkdir\b/,
    /\brm\b/,
    /\brename\b/,
    /\bcopyFile\b/
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `forbidden surface ${pattern}`);
  }
});

test('walkLiteratureSources rejects paths outside the corpus root', async () => {
  await withSyntheticCorpus(async (corpusRoot) => {
    const outsidePath = path.resolve(corpusRoot, '..', 'outside.md');
    assert.throws(
      () => INTERNALS.resolveInsideRoot(corpusRoot, outsidePath),
      { message: 'E_W_LIT_PATH_OUTSIDE_ROOT' }
    );

    const insidePath = path.join(corpusRoot, 'raw', 'papers', 'z-paper.md');
    assert.equal(
      INTERNALS.toSourcePath(corpusRoot, insidePath),
      'raw/papers/z-paper.md'
    );
  });
});

test('walkLiteratureSources rejects non-directory corpus roots', async () => {
  await withSyntheticCorpus(async (corpusRoot) => {
    const filePath = path.join(corpusRoot, 'raw', 'papers', 'z-paper.md');
    await assert.rejects(
      () => walkLiteratureSources({ corpusRoot: filePath }),
      { message: 'E_W_LIT_CORPUS_ROOT_NOT_DIRECTORY' }
    );
  });
});
