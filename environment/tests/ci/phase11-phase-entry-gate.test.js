import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE_ENTRY_REASON_CODES,
  evaluatePhaseEntryGate,
  makePhaseEntryRequestFixture
} from '../../phase11/phase-entry-gate.js';
import {
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';
import {
  makePhase11ResearchPacketFixture
} from '../../phase11/research-packet.js';
import {
  makeReadyScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

const HASH = 'a'.repeat(64);
const R2_ACCEPT = Object.freeze({ status: 'passed', verdict: 'ACCEPT' });

function verifiedCitation(overrides = {}) {
  return {
    claimId: 'CLAIM-PHASE-ENTRY',
    citationId: 'CIT-PHASE-ENTRY',
    verificationStatus: 'VERIFIED',
    lifecycleStatus: 'active',
    ...overrides
  };
}

function scientificInvariantInput(overrides = {}) {
  return {
    operation: 'claim-readiness',
    claimId: 'CLAIM-PHASE-ENTRY',
    claim: {
      claimId: 'CLAIM-PHASE-ENTRY',
      claimType: 'quantitative',
      target: 'Reviewed real-data HGSOC evidence',
      claimMetadata: {
        analysisLineage: { evidenceClass: 'analysis-derived-result' },
        evidenceClass: 'analysis-derived-result',
        resultKind: 'quantitative-result'
      }
    },
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [verifiedCitation()],
    r2Required: true,
    r2Audit: R2_ACCEPT,
    dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'ready' }],
    ...overrides
  };
}

function realEvidence(overrides = {}) {
  return {
    sourceKind: 'real-data-result',
    evidenceArtifact: {
      path: 'WIKI_VRE/closures/phase11-reviewed-real-data-evidence.json',
      sha256: HASH,
      provenance: 'real-data'
    },
    analysisLineage: {
      evidenceClass: 'analysis-derived-result',
      resultKind: 'quantitative-result'
    },
    humanMedicalReview: {
      status: 'accepted',
      reviewerRole: 'medical-supervisor',
      reviewedAt: '2026-06-17T00:00:00.000Z',
      evidencePath: 'WIKI_VRE/closures/medical-review.md'
    },
    scientificInvariantInput: scientificInvariantInput(),
    ...overrides
  };
}

function expectBlocked(request, reason) {
  const result = evaluatePhaseEntryGate(request);
  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(result.eligible, false);
  assert.equal(
    result.reasons.includes(reason),
    true,
    JSON.stringify(result, null, 2)
  );
  return result;
}

test('current Phase 12 entry remains visibly blocked', () => {
  const result = expectBlocked(
    makePhaseEntryRequestFixture(),
    PHASE_ENTRY_REASON_CODES.priorPhaseOpen
  );

  assert.equal(result.decision, 'blocked');
  assert(result.reasons.includes(
    PHASE_ENTRY_REASON_CODES.realResearchEvidenceMissing
  ));
});

test('prior phase still open blocks even with real evidence unless override exists', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    realResearchEvidence: realEvidence()
  }), PHASE_ENTRY_REASON_CODES.priorPhaseOpen);
});

test('process artifacts alone cannot count as real research evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    processArtifacts: {
      ciGreen: true,
      closeoutAccepted: true,
      reviewerAccepted: true
    }
  }), PHASE_ENTRY_REASON_CODES.processArtifactOnly);
});

test('synthetic-only evidence cannot count as real research evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({ sourceKind: 'synthetic-only' })
  }), PHASE_ENTRY_REASON_CODES.syntheticOnly);
});

test('fake execution cannot count as real research evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({
      sourceKind: 'fake-execution',
      fakeExecution: true
    })
  }), PHASE_ENTRY_REASON_CODES.fakeExecution);
});

test('current blocked first-research-packet is blocker evidence, not entry evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({
      firstResearchPacketExecution: makeFirstResearchPacketExecutionFixture()
    })
  }), PHASE_ENTRY_REASON_CODES.blockedFirstResearchPacket);
});

test('research packet scaffold alone cannot satisfy phase entry', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({
      scientificInvariantInput: null,
      researchPacket: makePhase11ResearchPacketFixture()
    })
  }), PHASE_ENTRY_REASON_CODES.researchPacketScaffoldOnly);
});

test('missing human medical review blocks real research evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({ humanMedicalReview: null })
  }), PHASE_ENTRY_REASON_CODES.humanReviewRequired);
});

test('missing analysis lineage blocks real research evidence', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({ analysisLineage: null })
  }), PHASE_ENTRY_REASON_CODES.analysisLineageRequired);
});

test('artifact lineage and review cannot bypass the scientific evaluators', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({ scientificInvariantInput: null })
  }), PHASE_ENTRY_REASON_CODES.substanceEvaluatorRequired);
});

test('killed citation blocks the positive real-evidence path', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({
      scientificInvariantInput: scientificInvariantInput({
        citations: [verifiedCitation({ lifecycleStatus: 'retracted' })]
      })
    })
  }), PHASE_ENTRY_REASON_CODES.scientificInvariantRejected);
});

test('blocked dependency blocks the positive real-evidence path', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence({
      scientificInvariantInput: scientificInvariantInput({
        dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'blocked' }]
      })
    })
  }), PHASE_ENTRY_REASON_CODES.scientificInvariantRejected);
});

test('valid real research evidence allows phase entry after prior phase closure', () => {
  const result = evaluatePhaseEntryGate(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence()
  }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'eligible');
  assert.equal(result.eligible, true);
  assert.deepEqual(result.authorizations, {
    claims: false,
    export: false,
    runtime: false
  });
});

test('vague standing-go override fails', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    operatorOverride: { approved: true, reason: 'standing go' }
  }), PHASE_ENTRY_REASON_CODES.operatorOverrideInvalid);
});

test('override missing required fields fails', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    operatorOverride: {
      approved: true,
      targetPhase: 12,
      reason: 'Continue planning'
    }
  }), PHASE_ENTRY_REASON_CODES.operatorOverrideInvalid);
});

test('override cannot authorize claims, export, or runtime', () => {
  expectBlocked(makePhaseEntryRequestFixture({
    operatorOverride: {
      approved: true,
      targetPhase: 12,
      reason: 'Scoped planning despite missing evidence',
      approvedAt: '2026-06-17T00:00:00.000Z',
      evidencePath: 'WIKI_VRE/closures/operator-override.md',
      scope: 'phase-entry-planning-only',
      allowsClaims: true,
      allowsExport: true,
      allowsRuntime: true
    }
  }), PHASE_ENTRY_REASON_CODES.operatorOverrideInvalid);
});

test('valid override allows scoped planning entry only', () => {
  const result = evaluatePhaseEntryGate(makePhaseEntryRequestFixture({
    operatorOverride: {
      approved: true,
      targetPhase: 12,
      reason: 'Scoped planning despite missing evidence',
      approvedAt: '2026-06-17T00:00:00.000Z',
      evidencePath: 'WIKI_VRE/closures/operator-override.md',
      scope: 'phase-entry-planning-only',
      allowsClaims: false,
      allowsExport: false,
      allowsRuntime: false
    }
  }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'eligible-via-operator-override');
  assert.deepEqual(result.authorizations, {
    claims: false,
    export: false,
    runtime: false
  });
});
