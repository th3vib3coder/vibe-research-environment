import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = __dirname;

const paperFiles = [
  'paper-agrees.md',
  'paper-contradicts.md',
  'paper-buries-contradiction.md'
];

const requiredFiles = [
  'claim-ledger-fixture.json',
  ...paperFiles
];

const allowedKinds = new Set(['claim', 'method', 'confounder']);
const forbiddenProvenancePrefixes = [
  'wiki/',
  'query/',
  'chat/',
  'review/',
  'generated/'
];

const forbiddenScopePatterns = [
  /createClaimEdge/u,
  /claim-ledger writer/u,
  /write(?:s|n)? directly to the claim ledger/u,
  /vector database/u,
  /embedding store/u,
  /\bOBDK\b/u,
  /provider adapter/u,
  /real-data execution/u
];

const realDataPatterns = [
  /\bGSE\d+\b/u,
  /\bPMID[:\s]\d+\b/u,
  /\b10\.\d{4,9}\//u,
  /\bDOI\b/u,
  /\bpatient\b/iu,
  /\bdonor\b/iu
];

function readFixture(relativePath) {
  const filePath = path.join(fixtureDir, relativePath);
  assert.ok(fs.existsSync(filePath), `${relativePath} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonFixture(relativePath) {
  return JSON.parse(readFixture(relativePath));
}

function parsePaperAssertion(markdown, relativePath) {
  const match = markdown.match(/```json paperAssertion\r?\n([\s\S]*?)\r?\n```/u);
  assert.ok(match, `${relativePath} must contain a paperAssertion JSON block`);
  return JSON.parse(match[1]);
}

function loadPaper(relativePath) {
  const markdown = readFixture(relativePath);
  return {
    markdown,
    paperAssertion: parsePaperAssertion(markdown, relativePath)
  };
}

function loadClaimLedger() {
  const ledger = readJsonFixture('claim-ledger-fixture.json');
  assert.equal(ledger.syntheticFixture, true);
  assert.equal(ledger.notBiomedicalEvidence, true);
  assert.ok(Array.isArray(ledger.claims), 'claim ledger fixture must expose claims[]');
  assert.ok(ledger.claims.length > 0, 'claim ledger fixture must contain claims');

  return {
    ledger,
    claimsById: new Map(ledger.claims.map((claim) => [claim.id, claim]))
  };
}

function assertRawCitations(assertion, relativePath) {
  assert.ok(Array.isArray(assertion.cites), `${relativePath} cites must be an array`);
  assert.ok(assertion.cites.length > 0, `${relativePath} cites must not be empty`);

  for (const cite of assertion.cites) {
    assert.equal(typeof cite, 'string', `${relativePath} cite must be a string`);
    assert.ok(cite.startsWith('raw/'), `${relativePath} cite must resolve under raw/`);
    for (const prefix of forbiddenProvenancePrefixes) {
      assert.ok(!cite.startsWith(prefix), `${relativePath} cite must not use ${prefix}`);
    }
  }
}

function assertNoForbiddenScope(markdown, relativePath) {
  for (const pattern of forbiddenScopePatterns) {
    assert.ok(!pattern.test(markdown), `${relativePath} must not contain ${pattern}`);
  }
}

function assertSyntheticOnly(markdown, relativePath) {
  for (const pattern of realDataPatterns) {
    assert.ok(!pattern.test(markdown), `${relativePath} must not contain ${pattern}`);
  }
}

test('W-LIT fixture corpus exists with the expected files', () => {
  for (const relativePath of requiredFiles) {
    readFixture(relativePath);
  }
});

test('paper fixtures obey the TW-LIT.1 paper assertion contract', () => {
  for (const relativePath of paperFiles) {
    const { markdown, paperAssertion } = loadPaper(relativePath);
    assert.ok(allowedKinds.has(paperAssertion.kind), `${relativePath} has invalid kind`);
    assert.equal(paperAssertion.runtimeOpened, false);
    assert.equal(paperAssertion.syntheticFixture, true);
    assert.equal(paperAssertion.notBiomedicalEvidence, true);
    assertRawCitations(paperAssertion, relativePath);
    assertNoForbiddenScope(markdown, relativePath);
    assertSyntheticOnly(markdown, relativePath);
  }
});

test('agree and contradict fixtures reference real synthetic CLAIM ids', () => {
  const { claimsById } = loadClaimLedger();
  const agree = loadPaper('paper-agrees.md').paperAssertion;
  const contradict = loadPaper('paper-contradicts.md').paperAssertion;

  assert.equal(agree.supports?.length, 1);
  assert.ok(claimsById.has(agree.supports[0].claimId));
  assert.equal(agree.supports[0].proposalOnly, true);

  assert.equal(contradict.contradicts?.length, 1);
  assert.ok(claimsById.has(contradict.contradicts[0].claimId));
  assert.equal(contradict.contradicts[0].proposalOnly, true);
});

test('paper-contradicts is a semantic conflict, not a cosmetic label', () => {
  const { claimsById } = loadClaimLedger();
  const contradiction = loadPaper('paper-contradicts.md').paperAssertion;
  const edge = contradiction.contradicts[0];
  const claim = claimsById.get(edge.claimId);

  assert.match(claim.text, /supports ovarian-cancer transition/u);
  assert.match(contradiction.text, /does not support/u);
  assert.match(contradiction.text, /after controlling/u);
  assert.match(contradiction.text, /no increase/u);
  assert.notEqual(contradiction.text, claim.text);
});

test('buried contradiction states conflict in prose but has no edge stub', () => {
  const buried = loadPaper('paper-buries-contradiction.md');

  assert.match(buried.markdown, /does not support/u);
  assert.match(buried.markdown, /after controlling/u);
  assert.equal(Object.hasOwn(buried.paperAssertion, 'contradicts'), false);
  assert.equal(Object.hasOwn(buried.paperAssertion, 'supports'), false);
  assert.doesNotMatch(buried.markdown, /^contradicts:/mu);
  assert.doesNotMatch(buried.markdown, /^supports:/mu);
});

test('claim ledger fixture is synthetic and internally coherent', () => {
  const { ledger, claimsById } = loadClaimLedger();
  assert.equal(ledger.claims.length, claimsById.size);

  for (const claim of ledger.claims) {
    assert.equal(claim.syntheticFixture, true);
    assert.equal(claim.notBiomedicalEvidence, true);
    assert.equal(typeof claim.id, 'string');
    assert.match(claim.id, /^CLAIM-W-LIT-SYNTH-/u);
    assertSyntheticOnly(JSON.stringify(claim), claim.id);
  }
});
