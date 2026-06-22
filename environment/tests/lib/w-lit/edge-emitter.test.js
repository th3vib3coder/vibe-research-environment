import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  emitPhase12EdgeProposals
} from '../../../lib/w-lit/edge-emitter.js';
import {
  extractPaperAssertions
} from '../../../lib/w-lit/pass15-extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.resolve(vreRoot, 'tests', 'fixtures', 'w-lit');
const modulePath = path.resolve(vreRoot, 'lib', 'w-lit', 'edge-emitter.js');

async function readFixture(fileName) {
  return fs.readFile(path.join(fixtureRoot, fileName), 'utf8');
}

async function readClaimLedger() {
  const text = await readFixture('claim-ledger-fixture.json');
  return JSON.parse(text);
}

async function extractFixture(fileName) {
  return extractPaperAssertions({
    sourcePath: `raw/w-lit/synthetic/${fileName}`,
    markdown: await readFixture(fileName)
  });
}

test('emitPhase12EdgeProposals emits supports and contradicts proposals', async () => {
  const ledger = await readClaimLedger();
  const paperAssertions = [
    ...(await extractFixture('paper-agrees.md')),
    ...(await extractFixture('paper-contradicts.md'))
  ];

  const proposals = emitPhase12EdgeProposals({
    paperAssertions,
    claims: ledger.claims
  });

  assert.deepEqual(
    proposals.map((proposal) => proposal.relation).sort(),
    ['contradicts', 'supports']
  );

  for (const proposal of proposals) {
    assert.equal(proposal.schemaVersion, 'w-lit.phase12-edge-proposal.v1');
    assert.equal(proposal.phase12Proposal, true);
    assert.equal(proposal.proposalOnly, true);
    assert.equal(proposal.claimLedgerWrite, false);
    assert.equal(proposal.runtimeOpened, false);
    assert.equal(proposal.scientificEvidence, false);
    assert.equal(proposal.relaySubstrate, 'phase12-manual-filesystem-artifact');
    assert.equal(proposal.targetClaimId, 'CLAIM-W-LIT-SYNTH-001');
    assert.match(proposal.sourcePaperAssertionId, /^PAPER-ASSERTION-W-LIT-/u);
    assert.ok(Array.isArray(proposal.cites));
    assert.ok(proposal.cites.every((cite) => cite.startsWith('raw/')));
  }
});

test('emitPhase12EdgeProposals fails closed for unknown claim targets', async () => {
  const [assertion] = await extractFixture('paper-contradicts.md');
  const badAssertion = {
    ...assertion,
    contradicts: [{ claimId: 'CLAIM-W-LIT-MISSING', proposalOnly: true }]
  };

  assert.throws(
    () => emitPhase12EdgeProposals({
      paperAssertions: [badAssertion],
      claims: []
    }),
    { message: 'E_W_LIT_EDGE_TARGET_CLAIM_NOT_FOUND' }
  );
});

test('emitPhase12EdgeProposals rejects write and automation requests', async () => {
  const [assertion] = await extractFixture('paper-agrees.md');
  const ledger = await readClaimLedger();
  const forbiddenOptions = [
    { directLedgerWrite: true },
    { acceptedEdgeCreation: true },
    { graphifyExecution: true },
    { providerAutomation: true },
    { relayStateCreation: true }
  ];

  for (const options of forbiddenOptions) {
    assert.throws(
      () => emitPhase12EdgeProposals({
        paperAssertions: [assertion],
        claims: ledger.claims,
        ...options
      }),
      { message: 'E_W_LIT_EDGE_EMITTER_WRITE_SURFACE_FORBIDDEN' }
    );
  }
});

test('edge emitter source guard excludes forbidden writer surfaces', async () => {
  const source = await fs.readFile(modulePath, 'utf8');
  const forbiddenPatterns = [
    /\bcreateClaimEdge\b/,
    /\benvironment\/claims\/edges\.js\b/,
    /\bedges\.jsonl\b/,
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
