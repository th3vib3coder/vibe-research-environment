import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  PHASE_ENTRY_REASON_CODES,
  evaluatePhaseEntryGate,
  makePhaseEntryRequestFixture
} from '../../phase11/phase-entry-gate.js';
import {
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';
import {
  makeReadyScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

const HASH = 'a'.repeat(64);
const R2_ACCEPT = Object.freeze({ status: 'passed', verdict: 'ACCEPT' });

function scientificInvariantInput(overrides = {}) {
  return {
    operation: 'claim-readiness',
    claimId: 'CLAIM-PHASE-ENTRY-CI',
    claim: {
      claimId: 'CLAIM-PHASE-ENTRY-CI',
      claimType: 'quantitative',
      target: 'Reviewed real-data HGSOC evidence',
      claimMetadata: {
        analysisLineage: { evidenceClass: 'analysis-derived-result' },
        evidenceClass: 'analysis-derived-result',
        resultKind: 'quantitative-result'
      }
    },
    derivationHarness: makeReadyScientificDerivationHarnessFixture(),
    citations: [{
      claimId: 'CLAIM-PHASE-ENTRY-CI',
      citationId: 'CIT-PHASE-ENTRY-CI',
      verificationStatus: 'VERIFIED',
      lifecycleStatus: 'active'
    }],
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

function assertBlocked(request, reason) {
  const result = evaluatePhaseEntryGate(request);
  assert(!result.ok, `Expected phase entry to block: ${JSON.stringify(result)}`);
  assert(
    result.reasons.includes(reason),
    `Expected reason ${reason}, got ${JSON.stringify(result.reasons)}`
  );
}

export default async function validatePhase11PhaseEntryGate() {
  assertBlocked(
    makePhaseEntryRequestFixture(),
    PHASE_ENTRY_REASON_CODES.priorPhaseOpen
  );
  assertBlocked(
    makePhaseEntryRequestFixture({
      priorPhaseStatus: 'closed',
      processArtifacts: { ciGreen: true, closeoutAccepted: true }
    }),
    PHASE_ENTRY_REASON_CODES.processArtifactOnly
  );
  assertBlocked(
    makePhaseEntryRequestFixture({
      priorPhaseStatus: 'closed',
      realResearchEvidence: realEvidence({ sourceKind: 'synthetic-only' })
    }),
    PHASE_ENTRY_REASON_CODES.syntheticOnly
  );
  assertBlocked(
    makePhaseEntryRequestFixture({
      priorPhaseStatus: 'closed',
      realResearchEvidence: realEvidence({
        firstResearchPacketExecution: makeFirstResearchPacketExecutionFixture()
      })
    }),
    PHASE_ENTRY_REASON_CODES.blockedFirstResearchPacket
  );
  assertBlocked(
    makePhaseEntryRequestFixture({
      priorPhaseStatus: 'closed',
      realResearchEvidence: realEvidence({ scientificInvariantInput: null })
    }),
    PHASE_ENTRY_REASON_CODES.substanceEvaluatorRequired
  );
  assertBlocked(
    makePhaseEntryRequestFixture({
      priorPhaseStatus: 'closed',
      realResearchEvidence: realEvidence({
        scientificInvariantInput: scientificInvariantInput({
          dependencies: [{ dependencyId: 'LAW9-HARNESS', status: 'blocked' }]
        })
      })
    }),
    PHASE_ENTRY_REASON_CODES.scientificInvariantRejected
  );

  const positive = evaluatePhaseEntryGate(makePhaseEntryRequestFixture({
    priorPhaseStatus: 'closed',
    realResearchEvidence: realEvidence()
  }));
  assert(positive.ok, `Expected real evidence to allow phase entry: ${JSON.stringify(positive)}`);
  assert(positive.decision === 'eligible', `Unexpected decision: ${positive.decision}`);
  assert(
    positive.authorizations.claims === false
      && positive.authorizations.export === false
      && positive.authorizations.runtime === false,
    'Phase entry gate must never authorize claims, export, or runtime.'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-phase-entry-gate', validatePhase11PhaseEntryGate);
}
