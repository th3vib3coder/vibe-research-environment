import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  selectNextScientificAction
} from '../../../autonomous/l0/action-selector.js';
import {
  buildLiteratureBrainProposalCandidate
} from '../../../lib/w-lit/literature-brain-action.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.resolve(vreRoot, 'tests', 'fixtures', 'w-lit');
const modulePath = path.resolve(
  vreRoot,
  'lib',
  'w-lit',
  'literature-brain-action.js'
);

async function readFixture(fileName) {
  return fs.readFile(path.join(fixtureRoot, fileName), 'utf8');
}

async function readClaimLedger() {
  return JSON.parse(await readFixture('claim-ledger-fixture.json'));
}

async function proposalCandidate(fileName = 'paper-contradicts.md') {
  const ledger = await readClaimLedger();
  return buildLiteratureBrainProposalCandidate({
    pages: [{
      sourcePath: `raw/w-lit/synthetic/${fileName}`,
      markdown: await readFixture(fileName)
    }],
    claims: ledger.claims,
    objectiveId: 'OBJ-W-LIT-BOUNDARY',
    directionId: 'DIR-W-LIT-PHASE12-PROPOSAL'
  });
}

test('buildLiteratureBrainProposalCandidate returns proposal-only L0 candidate', async () => {
  const result = await proposalCandidate();

  assert.equal(result.ok, true);
  assert.equal(result.runtimeOpened, false);
  assert.equal(result.claimLedgerWrite, false);
  assert.equal(result.phase12Proposal, true);
  assert.equal(result.proposalOnly, true);
  assert.equal(result.candidate.highStakes, true);
  assert.equal(result.candidate.actionType, 'phase12-edge-proposal-review');
  assert.equal(result.edgeProposals.length, 1);

  const proposal = result.edgeProposals[0];
  assert.equal(proposal.relation, 'contradicts');
  assert.equal(proposal.targetClaimId, 'CLAIM-W-LIT-SYNTH-001');
  assert.equal(proposal.proposalOnly, true);
  assert.equal(proposal.claimLedgerWrite, false);
  assert.equal(proposal.runtimeOpened, false);
  assert.ok(proposal.cites.every((cite) => cite.startsWith('raw/')));
});

test('buried contradiction fails closed through the existing W-LIT lint', async () => {
  await assert.rejects(
    () => proposalCandidate('paper-buries-contradiction.md'),
    { message: 'E_W_LIT_CONTRADICTION_EDGE_REQUIRED' }
  );
});

test('write and automation requests fail closed through the edge boundary', async () => {
  const ledger = await readClaimLedger();
  const markdown = await readFixture('paper-contradicts.md');
  const forbiddenOptions = [
    { directLedgerWrite: true },
    { acceptedEdgeCreation: true },
    { providerAutomation: true },
    { GraphifyExecution: true },
    { relayStateCreation: true }
  ];

  for (const options of forbiddenOptions) {
    await assert.rejects(
      () => buildLiteratureBrainProposalCandidate({
        pages: [{
          sourcePath: 'raw/w-lit/synthetic/paper-contradicts.md',
          markdown
        }],
        claims: ledger.claims,
        ...options
      }),
      { message: 'E_W_LIT_EDGE_EMITTER_WRITE_SURFACE_FORBIDDEN' }
    );
  }
});

test('proposal candidate routes through TL0.4 without executing an action', async () => {
  const result = await proposalCandidate();
  const selectorResult = await selectNextScientificAction({
    projectRoot: '/tmp/vre-w-lit',
    objectiveRecord: {
      objectiveId: 'OBJ-W-LIT-BOUNDARY',
      title: 'Review literature-brain proposal'
    },
    openGateRecords: [{
      gateId: 'phase-14-tw-lit.6-literature-brain-l0-proposal-bridge-hat1-stop',
      status: 'in-progress'
    }],
    candidates: [result.candidate]
  }, {
    checkDirection: async (_projectRoot, options) => ({
      ok: true,
      verdict: 'allow',
      directionId: options.directionId,
      summary: options.summary,
      written: false
    })
  });

  assert.equal(selectorResult.ok, true);
  assert.equal(selectorResult.actionExecuted, false);
  assert.equal(selectorResult.proposal.actionType, 'phase12-edge-proposal-review');
  assert.equal(selectorResult.proposal.requiresOperatorGate, true);
  assert.equal(selectorResult.proposal.requiredGate, 'TL0.4');
});

test('source guard excludes hard-excluded runtime surfaces', async () => {
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
    /\bobdk\b/i,
    /\breviewed-api\b/i,
    /\bprovider\b/i,
    /\bbin\/vre\b/,
    /\bl5-capstone\b/i
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `forbidden surface ${pattern}`);
  }
});
