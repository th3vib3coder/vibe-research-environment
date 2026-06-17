import { assert, isDirectRun, runValidator } from './_helpers.js';

import { exportEligibility, EXPORT_ELIGIBILITY_REASON_CODES } from '../../lib/export-eligibility.js';
import {
  evaluateScientificInvariantBlockers,
  SCIENTIFIC_INVARIANT_REASON_CODES
} from '../../phase11/scientific-invariant-blockers.js';
import {
  makeReadyScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

const CLAIM_ID = 'C-884';

function verifiedCitation() {
  return {
    claimId: CLAIM_ID,
    citationId: 'CIT-884',
    verificationStatus: 'VERIFIED',
    lifecycleStatus: 'active'
  };
}

function createReader(head) {
  return {
    async listClaimHeads() {
      return [head];
    },
    async listUnresolvedClaims() {
      return [];
    },
    async listCitationChecks() {
      return [verifiedCitation()];
    }
  };
}

export default async function validatePhase11CoverageRegressionHarness() {
  const fakeExecution = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: { claimId: CLAIM_ID, target: 'CXCL13+ CD8 fraction in HGSOC' },
    interpreterResult: { ok: true, runner: 'python', scientificReady: true },
    citations: [verifiedCitation()],
    r2Audit: { status: 'passed', verdict: 'ACCEPT' },
    dependencies: [{ dependencyId: 'fake-python-corridor', status: 'ready' }]
  });
  assert(fakeExecution.ok === false, 'Fake execution must not create scientific authority');
  assert(
    fakeExecution.reasons.includes(SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady),
    'Fake execution without harness must expose harness_not_ready'
  );

  const readyHarness = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: CLAIM_ID,
    claim: { claimId: CLAIM_ID, target: 'CXCL13+ CD8 fraction in HGSOC' },
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [verifiedCitation()],
    r2Required: true,
    r2Audit: { status: 'passed', verdict: 'ACCEPT' },
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }]
  });
  assert(readyHarness.ok === true, 'Ready harness fixture should pass invariants');
  assert(readyHarness.promotesClaim === false, 'Harness must not promote claims');
  assert(readyHarness.computesFraction === false, 'Harness must not compute fractions');

  const structural = await exportEligibility(CLAIM_ID, createReader({
    claimId: CLAIM_ID,
    currentStatus: 'PROMOTED',
    confidence: 0.91,
    governanceProfileAtCreation: 'strict',
    title: 'Result bundle A',
    claimMetadata: {
      analysisLineage: [{ kind: 'analysis-output', stage: 'conditioned-result' }],
      evidenceClass: 'analysis-derived-result',
      resultKind: 'quantitative-result'
    }
  }));
  assert(structural.eligible === false, 'Structural scientific lineage must block export');
  assert(
    structural.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.scientificInvariantBlocked),
    'Structural lineage block must use production export eligibility reason'
  );
  assert(
    structural.scientificInvariantResult.scientificClaim === true,
    'Structural lineage must classify as scientific'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-coverage-regression-harness',
    validatePhase11CoverageRegressionHarness,
  );
}
