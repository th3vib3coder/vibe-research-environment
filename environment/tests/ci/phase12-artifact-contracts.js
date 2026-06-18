import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  PHASE12_RELAY_VERDICT_TYPES,
  validatePhase12ArtifactSet
} from '../../phase12/artifact-contracts.js';

const ISO_TIME = '2026-06-18T00:00:00.000Z';

function validSet() {
  return {
    run: {
      schemaVersion: 'phase12.relay-run.v1',
      runId: 'RUN-20260618-000000-t12-1-0',
      phaseScope: 'phase12',
      activeAuthor: 'codex',
      counterReviewer: 'claude-code',
      operator: 'carmine',
      createdAt: ISO_TIME,
      updatedAt: ISO_TIME,
      state: 'ACCEPTED',
      relaySubstrate: 'filesystem',
      maxIterations: 3,
      budget: { maxTurns: 8, maxWallMinutes: 60, maxCostUsd: null },
      providerAutomationAllowed: false,
      guiAutomationAllowed: false
    },
    candidate: {
      schemaVersion: 'phase12.relay-candidate.v1',
      runId: 'RUN-20260618-000000-t12-1-0',
      artifactId: 'CAND-001',
      artifactKind: 'plan',
      author: 'codex',
      createdAt: ISO_TIME,
      artifactPath: 'candidate/candidate.md',
      sourceRefs: ['phase12-implementation-plan/14-hat1-stop.md'],
      changedFiles: [],
      claimBoundary: 'implementation-candidate',
      validationPerformed: ['wiki-lint'],
      knownLimits: []
    },
    review: {
      schemaVersion: 'phase12.relay-review.v1',
      runId: 'RUN-20260618-000000-t12-1-0',
      reviewId: 'REV-001',
      reviewer: 'claude-code',
      reviewedArtifactRef: 'CAND-001',
      mode: ['plan-review'],
      verdict: 'ACCEPT',
      severity: 'NONE',
      findings: [],
      requiredActions: [],
      residualRisk: [],
      selfCertificationCheck: 'reviewer-did-not-author-reviewed-artifact',
      createdAt: ISO_TIME
    },
    finalVerdict: {
      schemaVersion: 'phase12.relay-final-verdict.v1',
      runId: 'RUN-20260618-000000-t12-1-0',
      verdictId: 'VERDICT-001',
      relayVerdictType: 'phase12-relay-verdict',
      author: 'codex',
      candidateAuthor: 'codex',
      acceptedBy: 'claude-code',
      reviewedArtifacts: ['CAND-001'],
      finalState: 'ACCEPTED',
      iterationsUsed: 1,
      accepted: true,
      blockingFindings: [],
      requiredFollowup: [],
      residualRisk: [],
      operatorGoRef: 'gate:phase-12-t12.1.0',
      closureSignalStatus: {
        implementationMatchesPlan: 'pass',
        testsPass: 'pass',
        risksHandled: 'pass',
        duplicationAvoided: 'pass',
        hatsAligned: 'pass',
        noRegression: 'pass'
      },
      createdAt: ISO_TIME
    },
    evidenceBundle: {
      schemaVersion: 'phase12.relay-evidence-bundle.v1',
      runId: 'RUN-20260618-000000-t12-1-0',
      artifacts: [
        {
          path: 'candidate/candidate.md',
          sha256: 'a'.repeat(64),
          type: 'candidate'
        }
      ],
      reviewArtifacts: [
        {
          path: 'reviews/review-001.json',
          sha256: 'b'.repeat(64),
          type: 'review'
        }
      ],
      finalVerdictRef: 'verdicts/final-verdict.json',
      scenarioCoverage: [],
      validation: [],
      tracking: { governanceEventRefs: [], ledgerRefs: [], provenanceRefs: [] },
      createdAt: ISO_TIME
    },
    phase10Law13ReviewExtension: {
      schemaVersion: 'phase12.phase10-law13-review-extension.v1',
      relayVerdictType: 'phase12-relay-verdict',
      law13StatusChecked: true,
      provenanceRefsChecked: true,
      queryNotProvenanceCheck: true,
      r2PathRequired: true,
      r2PathPresent: true,
      suppositionIsolationChecked: true,
      checkedAssertionRefs: [],
      checkedProvenanceRefs: [],
      checkedSourceRefs: [],
      evidenceBundleRefs: []
    },
    phase11GraphReviewExtension: {
      schemaVersion: 'phase12.phase11-graph-review-extension.v1',
      graphAsNavigationOnlyChecked: true,
      unsafeIndexingChecked: true,
      staleGraphChecked: true,
      sourceReadRequired: true,
      wikiVreAuthorityPreserved: true,
      checkedGraphRunRefs: [],
      checkedWikiRefs: [],
      checkedSourceRefs: [],
      staleGraphMetadataRefs: []
    }
  };
}

export default async function validatePhase12ArtifactContracts() {
  assert(
    JSON.stringify(PHASE12_RELAY_VERDICT_TYPES)
      === JSON.stringify(['phase12-relay-verdict', 'relay-verdict']),
    'Phase 12 relay verdict type vocabulary drifted from Phase 10 bridge'
  );

  const valid = validatePhase12ArtifactSet(validSet());
  assert(valid.ok, `Valid Phase 12 artifact set failed: ${JSON.stringify(valid.issues)}`);

  const selfAccept = validSet();
  selfAccept.review.reviewer = 'codex';
  const selfAcceptResult = validatePhase12ArtifactSet(selfAccept);
  assert(
    selfAcceptResult.issues.some((issue) => issue.code === 'E_PHASE12_SELF_ACCEPT_FORBIDDEN'),
    'self-ACCEPT must fail closed'
  );

  const relayProvenance = validSet();
  relayProvenance.evidenceBundle.tracking.provenanceRefs = [
    { kind: 'phase12-relay-verdict', verdictId: 'VERDICT-001' }
  ];
  const relayProvenanceResult = validatePhase12ArtifactSet(relayProvenance);
  assert(
    relayProvenanceResult.issues.some((issue) => issue.code === 'E_PHASE12_REVIEW_NOT_PROVENANCE'),
    'relay verdicts must not be treated as provenance'
  );

  const providerAutomation = validSet();
  providerAutomation.run.providerAutomationAllowed = true;
  const providerAutomationResult = validatePhase12ArtifactSet(providerAutomation);
  assert(
    providerAutomationResult.issues.some(
      (issue) => issue.code === 'E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN'
    ),
    'provider and GUI automation must fail closed'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-artifact-contracts', validatePhase12ArtifactContracts);
}
