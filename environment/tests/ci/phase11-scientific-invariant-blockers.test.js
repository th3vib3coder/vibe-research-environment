import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateScientificInvariantBlockers,
  SCIENTIFIC_INVARIANT_REASON_CODES
} from '../../phase11/scientific-invariant-blockers.js';
import {
  makeReadyScientificDerivationHarnessFixture,
  makeScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

const CLAIM_ID = 'C-777';
const R2_ACCEPT = Object.freeze({ status: 'passed', verdict: 'ACCEPT' });

function scientificClaim(overrides = {}) {
  return {
    claimId: CLAIM_ID,
    currentStatus: 'PROMOTED',
    claimType: 'quantitative',
    target: 'CXCL13+ CD8 fraction in HGSOC',
    ...overrides
  };
}

function verifiedCitation(overrides = {}) {
  return {
    claimId: CLAIM_ID,
    citationId: 'CIT-777',
    verificationStatus: 'VERIFIED',
    lifecycleStatus: 'active',
    ...overrides
  };
}

function readyInput(overrides = {}) {
  return {
    operation: 'export',
    claimId: CLAIM_ID,
    claim: scientificClaim(),
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [verifiedCitation()],
    r2Required: true,
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }],
    ...overrides
  };
}

function expectReason(overrides, reason) {
  const result = evaluateScientificInvariantBlockers(readyInput(overrides));

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.reasons.includes(reason),
    true,
    JSON.stringify(result, null, 2)
  );
}

test('ready scientific invariant packet is claim/export ready', () => {
  const result = evaluateScientificInvariantBlockers(readyInput());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.claimReady, true);
  assert.equal(result.exportEligible, true);
  assert.equal(result.scientificClaim, true);
});

test('scientific-substance claim with omitted flag still requires evidence', () => {
  const result = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: scientificClaim({ scientific: undefined }),
    citations: [verifiedCitation()],
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }]
  });

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert(result.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady
  ));
});

test('blocked LAW 9 harness prevents claim and export readiness', () => {
  expectReason({
    derivationHarness: makeScientificDerivationHarnessFixture()
  }, SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady);
});

test('killed citation blocks independently from VERIFIED status', () => {
  expectReason({
    citations: [
      verifiedCitation({
        verificationStatus: 'VERIFIED',
        lifecycleStatus: 'retracted'
      })
    ]
  }, SCIENTIFIC_INVARIANT_REASON_CODES.citationKilled);
});

test('unverified citation blocks scientific export readiness', () => {
  expectReason({
    citations: [verifiedCitation({ verificationStatus: 'PENDING' })]
  }, SCIENTIFIC_INVARIANT_REASON_CODES.citationUnverified);
});

test('R2 redirect blocks beyond synthesis compilation', () => {
  expectReason({
    r2Audit: { status: 'failed', verdict: 'REDIRECT' }
  }, SCIENTIFIC_INVARIANT_REASON_CODES.r2NotAccepted);
});

test('missing required R2 audit fails closed', () => {
  expectReason({
    r2Audit: null,
    r2Required: true
  }, SCIENTIFIC_INVARIANT_REASON_CODES.r2Required);
});

test('blocked dependency blocks transitively even when current claim is promoted', () => {
  expectReason({
    dependencies: [
      {
        dependencyId: 'C-123',
        status: 'ready',
        dependencies: [{ dependencyId: 'C-122', status: 'blocked' }]
      }
    ]
  }, SCIENTIFIC_INVARIANT_REASON_CODES.dependencyBlocked);
});

test('successful interpreter result does not create scientific readiness', () => {
  const result = evaluateScientificInvariantBlockers({
    operation: 'claim-readiness',
    claimId: CLAIM_ID,
    claim: scientificClaim(),
    interpreterResult: {
      ok: true,
      runner: 'python',
      exitCode: 0
    },
    citations: [verifiedCitation()],
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'executor', status: 'complete' }]
  });

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert(result.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady
  ));
});
