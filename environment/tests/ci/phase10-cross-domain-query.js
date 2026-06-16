import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  evaluatePhase10CrossDomainQuery
} from '../../phase10/cross-domain-query.js';

const closeouts = Object.freeze({
  wave10_1: {
    status: 'complete-operator-closure-go-recorded',
    commit: 'a'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_2: {
    status: 'closed-operator-go-recorded',
    commit: 'b'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_3: {
    status: 'closed-operator-go-recorded',
    commit: 'c'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_4: {
    status: 'closed-operator-go-recorded',
    commit: 'd'.repeat(40),
    ciConclusion: 'success'
  }
});

const domainIds = Object.freeze(['KDOM-ci-a', 'KDOM-ci-b']);

export default async function validatePhase10CrossDomainQuery() {
  const result = evaluatePhase10CrossDomainQuery({
    domainIds,
    gateRequest: {
      operation: 'query',
      nextTaskId: 'T10.5.2',
      domainIds,
      classificationOnly: true,
      mergePolicyPresent: true,
      closeouts
    },
    mergeRequest: {
      operation: 'merge',
      domainIds,
      gateRequest: {
        operation: 'merge',
        nextTaskId: 'T10.5.1',
        domainIds,
        classificationOnly: true,
        closeouts
      },
      assertions: [
        {
          id: 'ASSERT-ci-a',
          domainId: 'KDOM-ci-a',
          sourceRefs: [
            {
              id: 'SRC-ci-a',
              kind: 'raw-document',
              reResolvedOriginalSource: true
            }
          ]
        },
        {
          id: 'ASSERT-ci-b',
          domainId: 'KDOM-ci-b',
          sourceRefs: [
            {
              id: 'SRC-ci-b',
              kind: 'computed-artifact',
              reResolvedOriginalSource: true
            }
          ]
        }
      ],
      conflictPolicy: { mode: 'preserve-and-flag' },
      r2AuditedSynthesisPolicyPresent: true,
      requestedDecisionUse: 'research-only',
      inputDecisionUseClassifications: ['research-only']
    },
    manifests: [
      {
        domainId: 'KDOM-ci-a',
        queryId: 'Q-ci-a',
        active: true,
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      {
        domainId: 'KDOM-ci-b',
        queryId: 'Q-ci-b',
        active: true,
        expiresAt: '2099-01-01T00:00:00.000Z'
      }
    ],
    queryClass: 'evidence-summary',
    status: 'complete',
    coverage: {
      expectedDomainIds: domainIds,
      coveredDomainIds: domainIds
    },
    law13ProvenanceRefs: [
      {
        id: 'SRC-ci-a',
        kind: 'raw-document',
        reResolvedOriginalSource: true
      }
    ],
    queryArtifacts: [
      { id: 'Q-ci-a-result', domainId: 'KDOM-ci-a' },
      { id: 'Q-ci-b-result', domainId: 'KDOM-ci-b' }
    ]
  });

  assert(result.ok, `Valid cross-domain query boundary failed: ${JSON.stringify(result.issues)}`);
  assert(result.decision === 'query-boundary-ready', `Unexpected decision: ${result.decision}`);
  assert(result.persisted === false, 'Query boundary must not be persisted');
  assert(result.authoritative === false, 'Query boundary must not be authoritative');
  assert(result.localBoundaryOnly === true, 'Query boundary must remain local-only');
  assert(result.authorizationGranted === false, 'Query boundary must not grant authorization');
  assert(result.performsOperation === false, 'Query boundary must not perform query execution');
  assert(result.performsWrite === false, 'Query boundary must not write');
  assert(result.boundary.decisionUse.classification === 'evidence-support', 'Unexpected decisionUse');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-cross-domain-query', validatePhase10CrossDomainQuery);
}
