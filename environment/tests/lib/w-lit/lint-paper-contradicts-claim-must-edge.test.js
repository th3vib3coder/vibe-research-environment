import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONTRADICTION_TERMS,
  assertNoPaperContradictsClaimMustEdgeIssues,
  lintPaperContradictsClaimMustEdge
} from '../../../lib/w-lit/lint-paper-contradicts-claim-must-edge.js';
import {
  extractPaperAssertions
} from '../../../lib/w-lit/pass15-extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.resolve(vreRoot, 'tests', 'fixtures', 'w-lit');
const modulePath = path.resolve(
  vreRoot,
  'lib',
  'w-lit',
  'lint-paper-contradicts-claim-must-edge.js'
);

async function readFixture(fileName) {
  return fs.readFile(path.join(fixtureRoot, fileName), 'utf8');
}

async function lintFixture(fileName, mutateAssertion = (assertion) => assertion) {
  const markdown = await readFixture(fileName);
  const paperAssertions = extractPaperAssertions({
    sourcePath: `raw/w-lit/synthetic/${fileName}`,
    markdown
  }).map(mutateAssertion);

  return lintPaperContradictsClaimMustEdge({
    pages: [{
      sourcePath: `wiki/sources/${fileName}`,
      markdown,
      paperAssertions
    }]
  });
}

test('buried contradiction fails closed without a contradicts stub', async () => {
  const issues = await lintFixture('paper-buries-contradiction.md');

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['E_W_LIT_CONTRADICTION_EDGE_REQUIRED']
  );
  assert.match(issues[0].message, /contradiction vocabulary/u);
});

test('contradict and agree fixtures are discriminated without accepted edges', async () => {
  assertNoPaperContradictsClaimMustEdgeIssues(
    await lintFixture('paper-contradicts.md')
  );
  assertNoPaperContradictsClaimMustEdgeIssues(
    await lintFixture('paper-agrees.md')
  );
});

test('contradiction vocabulary is frozen to the Phase 10 design row', () => {
  assert.deepEqual(
    [...CONTRADICTION_TERMS],
    ['contradicts', 'disagrees with', 'refutes']
  );

  for (const term of CONTRADICTION_TERMS) {
    const issues = lintPaperContradictsClaimMustEdge({
      pages: [{
        sourcePath: `wiki/sources/${term.replaceAll(' ', '-')}.md`,
        markdown: `This synthetic paper ${term} CLAIM-W-LIT-SYNTH-001.`,
        paperAssertions: [{
          paperAssertionId: `PAPER-${term.replaceAll(' ', '-').toUpperCase()}`,
          kind: 'claim',
          cites: ['raw/w-lit/synthetic/inline.md'],
          runtimeOpened: false
        }]
      }]
    });
    assert.equal(issues[0]?.code, 'E_W_LIT_CONTRADICTION_EDGE_REQUIRED');
  }
});

test('malformed contradiction stubs fail closed', async () => {
  const malformedCases = [
    {
      name: 'missing proposalOnly',
      mutate: (assertion) => ({
        ...assertion,
        contradicts: [{ claimId: 'CLAIM-W-LIT-SYNTH-001' }]
      })
    },
    {
      name: 'missing claimId',
      mutate: (assertion) => ({
        ...assertion,
        contradicts: [{ proposalOnly: true }]
      })
    },
    {
      name: 'wrong relation',
      mutate: (assertion) => ({
        ...assertion,
        contradicts: [{
          relation: 'supports',
          claimId: 'CLAIM-W-LIT-SYNTH-001',
          proposalOnly: true
        }]
      })
    }
  ];

  for (const { name, mutate } of malformedCases) {
    const issues = await lintFixture('paper-contradicts.md', mutate);
    assert.equal(
      issues[0]?.code,
      'E_W_LIT_CONTRADICTION_EDGE_STUB_INVALID',
      name
    );
  }
});

test('lint source guard excludes write, provider, and claim-edge surfaces', async () => {
  const source = await fs.readFile(modulePath, 'utf8');
  const forbiddenPatterns = [
    /\bcreateClaimEdge\b/,
    /\benvironment\/claims\/edges\.js\b/,
    /\bedges\.jsonl\b/,
    /\bwriteFile\b/,
    /\bappendFile\b/,
    /\bfetch\b/,
    /\bchild_process\b/,
    /\bGraphify\b/,
    /\bvector\b/i,
    /\bembedding\b/i,
    /\bprovider\b/i
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `forbidden surface ${pattern}`);
  }
});
