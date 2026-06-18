import { readFile } from 'node:fs/promises';
import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  validatePhase12BridgeReview
} from '../../phase12/bridge-validators.js';

const ISO_TIME = '2026-06-18T00:00:00.000Z';

export function validBridgeInput(overrides = {}) {
  const run = {
    schemaVersion: 'phase12.relay-run.v1',
    runId: 'RUN-20260618-000000-t12-5-0',
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
  };

  const candidate = {
    schemaVersion: 'phase12.relay-candidate.v1',
    runId: run.runId,
    artifactId: 'CAND-BRIDGE-001',
    artifactKind: 'implementation',
    author: 'codex',
    createdAt: ISO_TIME,
    artifactPath: 'candidate/t12-5-0.md',
    sourceRefs: ['phase12-implementation-plan/23-hat1-stop.md'],
    changedFiles: [],
    claimBoundary: 'implementation-candidate',
    validationPerformed: ['phase12-bridge-validators'],
    knownLimits: []
  };

  const review = {
    schemaVersion: 'phase12.relay-review.v1',
    runId: run.runId,
    reviewId: 'REV-BRIDGE-001',
    reviewer: 'claude-code',
    reviewedArtifactRef: candidate.artifactId,
    mode: ['implementation-review'],
    verdict: 'ACCEPT',
    severity: 'NONE',
    findings: [],
    requiredActions: [],
    residualRisk: [],
    selfCertificationCheck: 'reviewer-did-not-author-reviewed-artifact',
    createdAt: ISO_TIME
  };

  const finalVerdict = {
    schemaVersion: 'phase12.relay-final-verdict.v1',
    runId: run.runId,
    verdictId: 'VERDICT-BRIDGE-001',
    relayVerdictType: 'phase12-relay-verdict',
    author: 'codex',
    candidateAuthor: 'codex',
    acceptedBy: 'claude-code',
    reviewedArtifacts: [candidate.artifactId],
    finalState: 'ACCEPTED',
    iterationsUsed: 1,
    accepted: true,
    blockingFindings: [],
    requiredFollowup: [],
    residualRisk: [],
    operatorGoRef: 'gate:phase-12-t12.5.0',
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

  const evidenceBundle = {
    schemaVersion: 'phase12.relay-evidence-bundle.v1',
    runId: run.runId,
    artifacts: [
      { path: 'candidate/t12-5-0.md', sha256: 'a'.repeat(64), type: 'candidate' }
    ],
    reviewArtifacts: [
      { path: 'reviews/review-bridge.json', sha256: 'b'.repeat(64), type: 'review' }
    ],
    finalVerdictRef: 'verdicts/final-verdict.json',
    scenarioCoverage: [],
    validation: [
      {
        tool: 'phase12-bridge-validators',
        result: 'pass',
        evidenceRef: 'validation/phase12-bridge-validators.json',
        sha256: 'c'.repeat(64)
      }
    ],
    tracking: { governanceEventRefs: [], ledgerRefs: [], provenanceRefs: [] },
    createdAt: ISO_TIME
  };

  const phase10Law13ReviewExtension = {
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

  const phase11GraphReviewExtension = {
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

  return {
    run,
    candidate,
    review,
    finalVerdict,
    evidenceBundle,
    phase10Law13ReviewExtension,
    phase11GraphReviewExtension,
    bridgeReviewMetadata: {
      phase10PublicationRequested: false,
      phase10WritebackRequested: false,
      graphifyExecutionRequested: false,
      graphifyWritebackRequested: false,
      graphPathRole: 'navigation-metadata',
      validatorOutputAsLaw13Provenance: false
    },
    ...overrides
  };
}

function expectCode(input, code) {
  const result = validatePhase12BridgeReview(input);
  assert(result.ok === false, `expected ${code}`);
  assert(
    result.issues.some((issue) => issue.code === code),
    JSON.stringify(result.issues, null, 2)
  );
  return result;
}

export default async function validatePhase12BridgeValidators() {
  const valid = validatePhase12BridgeReview(validBridgeInput());
  assert(valid.ok === true, 'valid bridge review should pass');
  assert(valid.delegatedValidators.includes('validatePhase12ArtifactSet'));
  assert(valid.delegatedValidators.includes('validateLaw13BridgeArtifact'));

  const selfAccept = validBridgeInput({
    review: { ...validBridgeInput().review, reviewer: 'codex' }
  });
  expectCode(selfAccept, 'E_PHASE12_SELF_ACCEPT_FORBIDDEN');

  const missingR2 = validBridgeInput({
    phase10Law13ReviewExtension: {
      ...validBridgeInput().phase10Law13ReviewExtension,
      r2PathPresent: false
    }
  });
  expectCode(missingR2, 'E_PHASE10_R2_PATH_REQUIRED');

  const missingSourceRead = validBridgeInput({
    phase11GraphReviewExtension: {
      ...validBridgeInput().phase11GraphReviewExtension,
      sourceReadRequired: false
    }
  });
  expectCode(missingSourceRead, 'E_PHASE12_BRIDGE_CHECK_REQUIRED');

  expectCode(
    validBridgeInput({
      bridgeReviewMetadata: {
        ...validBridgeInput().bridgeReviewMetadata,
        graphPathRole: 'implementation-proof'
      }
    }),
    'E_PHASE12_GRAPH_PATH_NOT_IMPLEMENTATION_PROOF'
  );

  expectCode(
    validBridgeInput({
      bridgeReviewMetadata: {
        ...validBridgeInput().bridgeReviewMetadata,
        phase10WritebackRequested: true
      }
    }),
    'E_PHASE12_PHASE10_WRITEBACK_FORBIDDEN'
  );

  expectCode(
    validBridgeInput({
      bridgeReviewMetadata: {
        ...validBridgeInput().bridgeReviewMetadata,
        graphifyExecutionRequested: true
      }
    }),
    'E_PHASE12_GRAPHIFY_EXECUTION_FORBIDDEN'
  );

  expectCode(
    validBridgeInput({
      evidenceBundle: {
        ...validBridgeInput().evidenceBundle,
        tracking: {
          ...validBridgeInput().evidenceBundle.tracking,
          provenanceRefs: [{ kind: 'phase12-bridge-validator-output' }]
        }
      }
    }),
    'E_PHASE12_BRIDGE_VALIDATOR_OUTPUT_NOT_PROVENANCE'
  );

  const source = await readFile(`${repoRoot}/environment/phase12/bridge-validators.js`, 'utf8');
  assert(source.includes('validatePhase12ArtifactSet('), 'must delegate to T12.1 artifact contracts');
  assert(source.includes('validateLaw13BridgeArtifact('), 'must delegate to Phase 10 bridge validator');
  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-bridge-validators', validatePhase12BridgeValidators);
}
