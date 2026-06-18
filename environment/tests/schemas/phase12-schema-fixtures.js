export const ISO_TIME = '2026-06-18T00:00:00.000Z';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validRun() {
  return {
    schemaVersion: 'phase12.relay-run.v1',
    runId: 'RUN-20260618-000000-t12-1-0',
    objectiveId: null,
    phaseScope: 'phase12',
    activeAuthor: 'codex',
    counterReviewer: 'claude-code',
    operator: 'carmine',
    createdAt: ISO_TIME,
    updatedAt: ISO_TIME,
    state: 'DRAFT',
    relaySubstrate: 'filesystem',
    maxIterations: 3,
    budget: {
      maxTurns: 8,
      maxWallMinutes: 60,
      maxCostUsd: null
    },
    providerAutomationAllowed: false,
    guiAutomationAllowed: false
  };
}

export function validCandidate() {
  return {
    schemaVersion: 'phase12.relay-candidate.v1',
    runId: 'RUN-20260618-000000-t12-1-0',
    artifactId: 'CAND-001',
    artifactKind: 'plan',
    author: 'codex',
    createdAt: ISO_TIME,
    artifactPath: 'candidate/candidate.md',
    sourceRefs: ['phase12-implementation-plan/14-hat1-stop.md'],
    changedFiles: ['environment/schemas/phase12-relay-run.schema.json'],
    claimBoundary: 'implementation-candidate',
    validationPerformed: ['wiki-lint'],
    knownLimits: []
  };
}

export function validReview() {
  return {
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
  };
}

export function validRebuttal() {
  return {
    schemaVersion: 'phase12.relay-rebuttal.v1',
    runId: 'RUN-20260618-000000-t12-1-0',
    rebuttalId: 'REB-001',
    author: 'codex',
    respondsToReviewId: 'REV-001',
    createdAt: ISO_TIME,
    acceptedFindings: ['FIND-001'],
    rejectedFindings: [
      {
        findingId: 'FIND-002',
        evidenceRefs: ['evidence/bundle.json']
      }
    ],
    changesMade: ['Added missing pre-survey evidence.'],
    residualRisks: [],
    operatorDecisionsRequired: []
  };
}

export function validFinalVerdict() {
  return {
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
  };
}

export function validEvidenceBundle() {
  return {
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
    validation: [
      {
        command: 'node environment/tests/ci/run-all.js',
        result: 'pass',
        evidenceRef: 'logs/run-all.txt',
        sha256: 'c'.repeat(64)
      }
    ],
    tracking: {
      governanceEventRefs: [],
      ledgerRefs: [],
      provenanceRefs: []
    },
    createdAt: ISO_TIME
  };
}

export function validLaw13Extension() {
  return {
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
  };
}

export function validGraphExtension() {
  return {
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
  };
}
