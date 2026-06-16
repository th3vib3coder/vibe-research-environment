import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  evaluatePhase10CrossDomainMerge
} from '../../phase10/cross-domain-merge.js';

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

export default async function validatePhase10CrossDomainMerge() {
  const result = evaluatePhase10CrossDomainMerge({
    operation: 'merge',
    domainIds: ['KDOM-ci-a', 'KDOM-ci-b'],
    gateRequest: {
      operation: 'merge',
      nextTaskId: 'T10.5.1',
      domainIds: ['KDOM-ci-a', 'KDOM-ci-b'],
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
    claimEdgeRelations: [],
    conflictPolicy: { mode: 'preserve-and-flag' },
    r2AuditedSynthesisPolicyPresent: true,
    requestedDecisionUse: 'research-only',
    inputDecisionUseClassifications: ['research-only'],
    coverage: {
      expectedDomainIds: ['KDOM-ci-a', 'KDOM-ci-b'],
      coveredDomainIds: ['KDOM-ci-a', 'KDOM-ci-b']
    }
  });

  assert(result.ok, `Valid merge plan failed: ${JSON.stringify(result.issues)}`);
  assert(result.decision === 'merge-plan-ready', `Unexpected decision: ${result.decision}`);
  assert(result.persisted === false, 'Merge plan must not be persisted');
  assert(result.authoritative === false, 'Merge plan must not be authoritative');
  assert(result.localProposalOnly === true, 'Merge plan must remain a local proposal');
  assert(result.authorizationGranted === false, 'Merge plan must not grant authorization');
  assert(result.performsWrite === false, 'Merge plan must not write');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-cross-domain-merge', validatePhase10CrossDomainMerge);
}
