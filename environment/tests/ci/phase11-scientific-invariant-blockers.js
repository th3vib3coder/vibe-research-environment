import { assert, isDirectRun, runValidator } from './_helpers.js';

import {
  evaluateScientificInvariantBlockers,
  SCIENTIFIC_INVARIANT_REASON_CODES
} from '../../phase11/scientific-invariant-blockers.js';
import {
  makeReadyScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

function baseInput(overrides = {}) {
  return {
    operation: 'export',
    claimId: 'C-777',
    claim: {
      claimId: 'C-777',
      currentStatus: 'PROMOTED',
      target: 'CXCL13+ CD8 fraction in HGSOC'
    },
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [
      {
        claimId: 'C-777',
        citationId: 'CIT-777',
        verificationStatus: 'VERIFIED',
        lifecycleStatus: 'active'
      }
    ],
    r2Required: true,
    r2Audit: { status: 'passed', verdict: 'ACCEPT' },
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }],
    ...overrides
  };
}

export default function validatePhase11ScientificInvariantBlockers() {
  const ready = evaluateScientificInvariantBlockers(baseInput());
  assert(ready.ok === true, 'Ready scientific invariant fixture must pass');
  assert(ready.claimReady === true, 'Ready scientific fixture must be claim-ready');
  assert(ready.exportEligible === true, 'Ready scientific fixture must be export-eligible');
  assert(ready.promotesClaim === false, 'Validator must not promote claims');
  assert(ready.computesFraction === false, 'Validator must not compute fractions');

  const omittedFlag = evaluateScientificInvariantBlockers({
    operation: 'export',
    claimId: 'C-777',
    claim: { claimId: 'C-777', target: 'CXCL13+ CD8 fraction in HGSOC' },
    citations: [{ citationId: 'CIT-777', verificationStatus: 'VERIFIED' }],
    r2Audit: { status: 'passed', verdict: 'ACCEPT' }
  });
  assert(omittedFlag.ok === false, 'Scientific-substance claim without flag must fail closed');
  assert(
    omittedFlag.reasons.includes(SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady),
    'Scientific-substance claim without harness must expose harness_not_ready'
  );

  const killedCitation = evaluateScientificInvariantBlockers(baseInput({
    citations: [
      {
        claimId: 'C-777',
        citationId: 'CIT-RETRACTED',
        verificationStatus: 'VERIFIED',
        lifecycleStatus: 'retracted'
      }
    ]
  }));
  assert(
    killedCitation.reasons.includes(SCIENTIFIC_INVARIANT_REASON_CODES.citationKilled),
    'Retracted citation must block independently of VERIFIED'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-scientific-invariant-blockers',
    validatePhase11ScientificInvariantBlockers,
  );
}
