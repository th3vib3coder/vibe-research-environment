import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE12_RELAY_VERDICT_TYPES,
  validatePhase12ArtifactSet
} from '../../phase12/artifact-contracts.js';

const ISO_TIME = '2026-06-18T00:00:00.000Z';

function validSet(overrides = {}) {
  const base = {
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
      budget: {
        maxTurns: 8,
        maxWallMinutes: 60,
        maxCostUsd: null
      },
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
      tracking: {
        governanceEventRefs: [],
        ledgerRefs: [],
        provenanceRefs: []
      },
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

  return { ...base, ...overrides };
}

function expectCode(input, code) {
  const result = validatePhase12ArtifactSet(input);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('phase12 relay verdict type aligns with Phase 10 bridge vocabulary', () => {
  assert.deepEqual(PHASE12_RELAY_VERDICT_TYPES, ['phase12-relay-verdict', 'relay-verdict']);
});

test('accepts a complete non-author accepted artifact set', () => {
  assert.deepEqual(validatePhase12ArtifactSet(validSet()), { ok: true, issues: [] });
});

test('rejects reviewer self-acceptance', () => {
  expectCode(validSet({
    review: {
      ...validSet().review,
      reviewer: 'codex'
    }
  }), 'E_PHASE12_SELF_ACCEPT_FORBIDDEN');
});

test('rejects final ACCEPT without non-author acceptedBy', () => {
  expectCode(validSet({
    finalVerdict: {
      ...validSet().finalVerdict,
      acceptedBy: null
    }
  }), 'E_PHASE12_ACCEPTED_BY_REQUIRED');
});

test('rejects ACCEPT without explicit residual risk', () => {
  const finalVerdict = { ...validSet().finalVerdict };
  delete finalVerdict.residualRisk;
  expectCode(validSet({ finalVerdict }), 'E_PHASE12_RESIDUAL_RISK_REQUIRED');
});

test('rejects REDIRECT without required actions', () => {
  expectCode(validSet({
    review: {
      ...validSet().review,
      verdict: 'REDIRECT',
      requiredActions: []
    }
  }), 'E_PHASE12_REDIRECT_ACTION_REQUIRED');
});

test('rejects BLOCK without findings', () => {
  expectCode(validSet({
    review: {
      ...validSet().review,
      verdict: 'BLOCK',
      findings: []
    }
  }), 'E_PHASE12_BLOCK_FINDING_REQUIRED');
});

test('rejects evidence artifacts without SHA-256', () => {
  const evidenceBundle = { ...validSet().evidenceBundle };
  evidenceBundle.artifacts = [{ path: 'candidate/candidate.md', type: 'candidate' }];
  expectCode(validSet({ evidenceBundle }), 'E_PHASE12_EVIDENCE_SHA_REQUIRED');
});

test('rejects raw chat as authoritative state', () => {
  const candidate = {
    ...validSet().candidate,
    sourceRefs: ['raw-chat:codex-thread']
  };
  expectCode(validSet({ candidate }), 'E_PHASE12_RAW_CHAT_NOT_AUTHORITY');
});

test('rejects query output as provenance', () => {
  const evidenceBundle = {
    ...validSet().evidenceBundle,
    tracking: {
      ...validSet().evidenceBundle.tracking,
      provenanceRefs: [{ kind: 'query-output', path: 'wiki/queries/q.md' }]
    }
  };
  expectCode(validSet({ evidenceBundle }), 'E_PHASE12_QUERY_OUTPUT_NOT_PROVENANCE');
});

test('rejects review verdict as provenance', () => {
  const evidenceBundle = {
    ...validSet().evidenceBundle,
    tracking: {
      ...validSet().evidenceBundle.tracking,
      provenanceRefs: [{ kind: 'phase12-relay-verdict', verdictId: 'VERDICT-001' }]
    }
  };
  expectCode(validSet({ evidenceBundle }), 'E_PHASE12_REVIEW_NOT_PROVENANCE');
});

test('rejects Graphify output as implementation evidence', () => {
  const evidenceBundle = {
    ...validSet().evidenceBundle,
    artifacts: [
      {
        path: 'graphify/run.json',
        sha256: 'c'.repeat(64),
        type: 'graphify-output'
      }
    ]
  };
  expectCode(validSet({ evidenceBundle }), 'E_PHASE12_GRAPHIFY_NOT_EVIDENCE');
});

test('rejects runtime opening under planning-only override', () => {
  const run = {
    ...validSet().run,
    operatorOverride: {
      scope: 'phase-entry-planning-only',
      allowsRuntime: false
    },
    state: 'ACCEPTED'
  };
  expectCode(validSet({ run }), 'E_PHASE12_RUNTIME_UNDER_PLANNING_OVERRIDE');
});

test('rejects GUI or clipboard relay substrate', () => {
  const run = {
    ...validSet().run,
    relaySubstrate: 'clipboard'
  };
  expectCode(validSet({ run }), 'E_PHASE12_GUI_CLIPBOARD_FORBIDDEN');
});

test('rejects provider or GUI automation authorization', () => {
  const run = {
    ...validSet().run,
    providerAutomationAllowed: true
  };
  expectCode(
    validSet({ run }),
    'E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN'
  );
});

test('rejects accepted stale run state', () => {
  const run = { ...validSet().run, state: 'STALE' };
  expectCode(validSet({ run }), 'E_PHASE12_STALE_RUN_ACCEPTED');
});

test('rejects missing iteration or budget caps', () => {
  const run = { ...validSet().run };
  delete run.maxIterations;
  expectCode(validSet({ run }), 'E_PHASE12_CAPS_REQUIRED');
});

test('rejects accepted bridge artifact without LAW 13 and Graphify checks', () => {
  const phase10Law13ReviewExtension = {
    ...validSet().phase10Law13ReviewExtension,
    queryNotProvenanceCheck: false
  };
  expectCode(
    validSet({ phase10Law13ReviewExtension }),
    'E_PHASE12_BRIDGE_CHECK_REQUIRED'
  );
});
