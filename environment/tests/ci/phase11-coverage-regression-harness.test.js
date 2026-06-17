import assert from 'node:assert/strict';
import test from 'node:test';

import { exportEligibility, EXPORT_ELIGIBILITY_REASON_CODES } from '../../lib/export-eligibility.js';
import {
  evaluateScientificInvariantBlockers,
  SCIENTIFIC_INVARIANT_REASON_CODES
} from '../../phase11/scientific-invariant-blockers.js';
import {
  makeReadyScientificDerivationHarnessFixture,
  makeScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

const CLAIM_ID = 'C-884';
const R2_ACCEPT = Object.freeze({ status: 'passed', verdict: 'ACCEPT' });

function verifiedCitation(overrides = {}) {
  return {
    claimId: CLAIM_ID,
    citationId: 'CIT-884',
    verificationStatus: 'VERIFIED',
    lifecycleStatus: 'active',
    ...overrides
  };
}

function promotedHead(overrides = {}) {
  return {
    claimId: CLAIM_ID,
    currentStatus: 'PROMOTED',
    confidence: 0.91,
    governanceProfileAtCreation: 'strict',
    ...overrides
  };
}

function createReader({
  heads = [promotedHead()],
  citations = [verifiedCitation()],
  scientificInvariantReviews = []
} = {}) {
  return {
    async listClaimHeads() {
      return heads;
    },
    async listUnresolvedClaims() {
      return [];
    },
    async listCitationChecks(options = {}) {
      if (options.claimId == null) {
        return citations;
      }
      return citations.filter((citation) => citation.claimId === options.claimId);
    },
    async listScientificInvariantReviews(options = {}) {
      if (options.claimId == null) {
        return scientificInvariantReviews;
      }
      return scientificInvariantReviews.filter((review) => review.claimId === options.claimId);
    }
  };
}

test('fake Python success remains non-authoritative without scientific harness evidence', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [
      promotedHead({
        claimMetadata: { target: 'CXCL13+ CD8 fraction in HGSOC' }
      })
    ]
  }), {
    scientificInvariantEvidence: {
      interpreterResult: {
        ok: true,
        runner: 'python',
        scientificReady: false
      },
      r2Audit: R2_ACCEPT,
      dependencies: [{ dependencyId: 'fake-python-corridor', status: 'ready' }]
    }
  });

  assert.equal(result.eligible, false);
  assert(result.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.scientificInvariantBlocked));
  assert(result.scientificInvariantResult.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady
  ));
});

test('fake output claiming scientificReady cannot bypass T11.1.0 harness evidence', () => {
  const result = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: { claimId: CLAIM_ID, target: 'CXCL13+ CD8 fraction in HGSOC' },
    interpreterResult: {
      ok: true,
      runner: 'python',
      scientificReady: true
    },
    citations: [verifiedCitation()],
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'fake-python-corridor', status: 'ready' }]
  });

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert(result.reasons.includes(SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady));
  assert.equal(result.claimReady, false);
  assert.equal(result.exportEligible, false);
});

test('blocked harness plus successful interpreter fails closed', () => {
  const result = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: { claimId: CLAIM_ID, target: 'CXCL13+ CD8 fraction in HGSOC' },
    interpreterResult: { ok: true, runner: 'python' },
    derivationHarness: makeScientificDerivationHarnessFixture(),
    citations: [verifiedCitation()],
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'fake-python-corridor', status: 'ready' }]
  });

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert(result.reasons.includes(SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady));
});

test('ready harness can pass invariants without promoting claims or computing fractions', () => {
  const result = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: { claimId: CLAIM_ID, target: 'CXCL13+ CD8 fraction in HGSOC' },
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [verifiedCitation()],
    r2Required: true,
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }]
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.claimReady, true);
  assert.equal(result.exportEligible, true);
  assert.equal(result.promotesClaim, false);
  assert.equal(result.computesFraction, false);
});

test('ready harness still fails export when citation lifecycle is retracted', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [
      promotedHead({
        claimMetadata: { target: 'CXCL13+ CD8 fraction in HGSOC' }
      })
    ],
    citations: [verifiedCitation({ lifecycleStatus: 'retracted' })]
  }), {
    scientificInvariantEvidence: {
      derivationHarness: makeReadyScientificDerivationHarnessFixture(),
      r2Required: true,
      r2Audit: R2_ACCEPT,
      dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }]
    }
  });

  assert.equal(result.eligible, false);
  assert(result.scientificInvariantResult.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.citationKilled
  ));
});

test('ready harness still fails export on transitive blocked dependency', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [
      promotedHead({
        claimMetadata: { target: 'CXCL13+ CD8 fraction in HGSOC' }
      })
    ]
  }), {
    scientificInvariantEvidence: {
      derivationHarness: makeReadyScientificDerivationHarnessFixture(),
      r2Required: true,
      r2Audit: R2_ACCEPT,
      dependencies: [
        {
          dependencyId: 'outer-ready',
          status: 'ready',
          dependencies: [{ dependencyId: 'inner-open', status: 'open' }]
        }
      ]
    }
  });

  assert.equal(result.eligible, false);
  assert(result.scientificInvariantResult.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.dependencyBlocked
  ));
});

test('ready harness still fails export on missing R2 when R2 is required', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [
      promotedHead({
        claimMetadata: { target: 'CXCL13+ CD8 fraction in HGSOC' }
      })
    ]
  }), {
    scientificInvariantEvidence: {
      derivationHarness: makeReadyScientificDerivationHarnessFixture(),
      r2Required: true,
      dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }]
    }
  });

  assert.equal(result.eligible, false);
  assert(result.scientificInvariantResult.reasons.includes(
    SCIENTIFIC_INVARIANT_REASON_CODES.r2Required
  ));
});

test('legacy non-scientific strict export remains compatible', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [promotedHead({ claimMetadata: { target: 'release notes' } })]
  }));

  assert.equal(result.eligible, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.reasons, []);
  assert.equal(result.scientificInvariantResult.scientificClaim, false);
});

test('keyword-free structural scientific lineage blocks through exportEligibility', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [
      promotedHead({
        title: 'Result bundle A',
        claimMetadata: {
          analysisLineage: [
            {
              kind: 'analysis-output',
              stage: 'conditioned-result',
              authority: 'review-required'
            }
          ],
          evidenceClass: 'analysis-derived-result',
          resultKind: 'quantitative-result'
        }
      })
    ]
  }));

  assert.equal(result.eligible, false, JSON.stringify(result, null, 2));
  assert(result.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.scientificInvariantBlocked));
  assert.equal(result.scientificInvariantResult.scientificClaim, true);
});
