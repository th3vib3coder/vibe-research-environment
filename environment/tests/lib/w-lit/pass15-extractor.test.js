import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractPaperAssertions
} from '../../../lib/w-lit/pass15-extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.resolve(vreRoot, 'tests', 'fixtures', 'w-lit');
const modulePath = path.resolve(vreRoot, 'lib', 'w-lit', 'pass15-extractor.js');

async function readFixture(fileName) {
  return fs.readFile(path.join(fixtureRoot, fileName), 'utf8');
}

async function extractFixture(fileName) {
  return extractPaperAssertions({
    sourcePath: `raw/w-lit/synthetic/${fileName}`,
    markdown: await readFixture(fileName)
  });
}

function assertLaw13RawCites(assertion) {
  assert.ok(Array.isArray(assertion.cites));
  assert.ok(assertion.cites.length > 0);
  for (const cite of assertion.cites) {
    assert.match(cite, /^raw\//u);
    assert.doesNotMatch(cite, /^(wiki|query|chat|review|generated)\//u);
  }
}

test('extractPaperAssertions parses agree and contradict fixtures', async () => {
  const agree = await extractFixture('paper-agrees.md');
  const contradict = await extractFixture('paper-contradicts.md');

  assert.equal(agree.length, 1);
  assert.equal(contradict.length, 1);
  assert.equal(agree[0].kind, 'claim');
  assert.equal(contradict[0].kind, 'claim');
  assert.equal(agree[0].paperAssertionId, 'PAPER-ASSERTION-W-LIT-AGREE-001');
  assert.equal(
    contradict[0].paperAssertionId,
    'PAPER-ASSERTION-W-LIT-CONTRADICT-001'
  );

  for (const assertion of [...agree, ...contradict]) {
    assert.equal(assertion.runtimeOpened, false);
    assert.equal(assertion.syntheticFixture, true);
    assert.equal(assertion.notBiomedicalEvidence, true);
    assertLaw13RawCites(assertion);
  }
});

test('extractPaperAssertions rejects bad assertion kinds and cite surfaces', () => {
  const badKind = [
    '```json paperAssertion',
    JSON.stringify({
      id: 'PAPER-ASSERTION-BAD-KIND',
      kind: 'summary',
      runtimeOpened: false,
      syntheticFixture: true,
      notBiomedicalEvidence: true,
      text: 'Bad kind.',
      cites: ['raw/w-lit/synthetic/bad.md']
    }),
    '```'
  ].join('\n');

  assert.throws(
    () => extractPaperAssertions({ sourcePath: 'raw/bad.md', markdown: badKind }),
    { message: 'E_W_LIT_ASSERTION_KIND_INVALID' }
  );

  const badCite = badKind.replace('"summary"', '"claim"')
    .replace('raw/w-lit/synthetic/bad.md', 'wiki/generated/bad.md');
  assert.throws(
    () => extractPaperAssertions({ sourcePath: 'raw/bad.md', markdown: badCite }),
    { message: 'E_W_LIT_ASSERTION_CITE_FORBIDDEN' }
  );
});

test('extractPaperAssertions handles confounder input without inventing text', () => {
  const confounderText = 'Synthetic confounder: toy age strata alter the endpoint.';
  const markdown = [
    '# Inline Synthetic Confounder',
    '',
    '```json paperAssertion',
    JSON.stringify({
      id: 'PAPER-ASSERTION-W-LIT-CONFOUNDER-001',
      kind: 'confounder',
      runtimeOpened: false,
      syntheticFixture: true,
      notBiomedicalEvidence: true,
      text: confounderText,
      cites: ['raw/w-lit/synthetic/confounder.md']
    }),
    '```'
  ].join('\n');

  const assertions = extractPaperAssertions({
    sourcePath: 'raw/w-lit/synthetic/confounder.md',
    markdown
  });

  assert.equal(assertions.length, 1);
  assert.equal(assertions[0].kind, 'confounder');
  assert.equal(assertions[0].text, confounderText);
  assertLaw13RawCites(assertions[0]);
});

test('pass15 extractor source guard excludes forbidden runtime surfaces', async () => {
  const source = await fs.readFile(modulePath, 'utf8');
  const forbiddenPatterns = [
    /\bcreateClaimEdge\b/,
    /\benvironment\/claims\/edges\.js\b/,
    /\bnode:fs\/promises\b/,
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
