import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePhase10CrossDomainMerge
} from '../../phase10/cross-domain-merge.js';

const COMPLETE_CLOSEOUTS = Object.freeze({
  wave10_1: { status: 'complete-operator-closure-go-recorded', commit: 'a'.repeat(40), ciConclusion: 'success' },
  wave10_2: { status: 'closed-operator-go-recorded', commit: 'b'.repeat(40), ciConclusion: 'success' },
  wave10_3: { status: 'closed-operator-go-recorded', commit: 'c'.repeat(40), ciConclusion: 'success' },
  wave10_4: { status: 'closed-operator-go-recorded', commit: 'd'.repeat(40), ciConclusion: 'success' }
});

const SOURCE_REF = Object.freeze({
  id: 'SRC-raw-001',
  kind: 'raw-document',
  reResolvedOriginalSource: true
});

function request(overrides = {}) {
  return {
    operation: 'merge',
    domainIds: ['KDOM-a', 'KDOM-b'],
    gateRequest: {
      operation: 'merge',
      nextTaskId: 'T10.5.1',
      domainIds: ['KDOM-a', 'KDOM-b'],
      classificationOnly: true,
      closeouts: COMPLETE_CLOSEOUTS
    },
    assertions: [
      { id: 'ASSERT-b', domainId: 'KDOM-b', sourceRefs: [{ ...SOURCE_REF, id: 'SRC-b' }] },
      { id: 'ASSERT-a', domainId: 'KDOM-a', sourceRefs: [{ ...SOURCE_REF, id: 'SRC-a' }] }
    ],
    claimEdgeRelations: [
      { id: 'EDGE-live', sourceDomainId: 'KDOM-a', targetDomainId: 'KDOM-b' }
    ],
    conflictPolicy: { mode: 'preserve-and-flag' },
    r2AuditedSynthesisPolicyPresent: true,
    requestedDecisionUse: 'research-only',
    inputDecisionUseClassifications: ['research-only', 'research-only'],
    coverage: {
      expectedDomainIds: ['KDOM-a', 'KDOM-b'],
      coveredDomainIds: ['KDOM-a', 'KDOM-b']
    },
    ...overrides
  };
}

function expectIssue(overrides, code) {
  const result = evaluatePhase10CrossDomainMerge(request(overrides));
  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(result.persisted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.localProposalOnly, true);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid merge returns a local non-authoritative plan only', () => {
  const result = evaluatePhase10CrossDomainMerge(request());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'merge-plan-ready');
  assert.equal(result.persisted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.localProposalOnly, true);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.performsOperation, false);
  assert.equal(result.performsWrite, false);
  assert.deepEqual(result.plan.domainIds, ['KDOM-a', 'KDOM-b']);
  assert.deepEqual(result.plan.assertionIds, ['ASSERT-a', 'ASSERT-b']);
});

test('valid synthesis requires R2 policy and remains local proposal only', () => {
  const result = evaluatePhase10CrossDomainMerge(request({ operation: 'synthesis' }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'synthesis-plan-ready');
  assert.equal(result.plan.operation, 'synthesis');
  assert.equal(result.plan.r2AuditedSynthesisPolicyPresent, true);
  assert.equal(result.authoritative, false);
});

test('missing or negative T10.5.0 gate rejects', () => {
  expectIssue({ gateRequest: undefined }, 'E_PHASE10_CROSS_DOMAIN_GATE_REQUIRED');
  expectIssue(
    { gateRequest: { operation: 'merge', domainIds: ['KDOM-a', 'KDOM-b'] } },
    'E_PHASE10_CROSS_DOMAIN_GATE_REQUIRED'
  );
});

test('single-domain input rejects', () => {
  expectIssue({
    domainIds: ['KDOM-a'],
    gateRequest: { ...request().gateRequest, domainIds: ['KDOM-a'] }
  }, 'E_PHASE10_CROSS_DOMAIN_TWO_DOMAINS_REQUIRED');
});

test('empty merge content rejects', () => {
  expectIssue({
    assertions: [],
    evidenceRefs: []
  }, 'E_PHASE10_CROSS_DOMAIN_CONTENT_REQUIRED');
});

test('missing original-source re-resolution rejects', () => {
  expectIssue({
    assertions: [
      { id: 'ASSERT-a', domainId: 'KDOM-a', sourceRefs: [{ id: 'SRC-a', kind: 'raw-document' }] }
    ]
  }, 'E_PHASE10_CROSS_DOMAIN_SOURCE_RERESOLUTION_REQUIRED');
});

test('metadata artifacts cannot be LAW 13 provenance', () => {
  for (const kind of ['query-result', 'relay-verdict', 'adversarial-verdict', 'presentation', 'gate-decision']) {
    expectIssue({
      assertions: [
        {
          id: 'ASSERT-a',
          domainId: 'KDOM-a',
          sourceRefs: [{ id: `${kind}-001`, kind, reResolvedOriginalSource: true }]
        }
      ]
    }, 'E_PHASE10_CROSS_DOMAIN_METADATA_NOT_PROVENANCE');
  }
});

test('conflict, stale, and superseded relations require explicit handling', () => {
  expectIssue({
    conflicts: [{ id: 'CONFLICT-001', assertionIds: ['ASSERT-a', 'ASSERT-b'] }],
    conflictPolicy: undefined
  }, 'E_PHASE10_CROSS_DOMAIN_CONFLICT_POLICY_REQUIRED');

  for (const relation of [
    { id: 'EDGE-stale', stale: true },
    { id: 'EDGE-superseded', superseded: true }
  ]) {
    expectIssue({
      claimEdgeRelations: [relation],
      conflictPolicy: { mode: 'preserve-and-flag' }
    }, 'E_PHASE10_CROSS_DOMAIN_STALE_RELATION_POLICY_REQUIRED');
  }
});

test('synthesis without R2 audit rejects', () => {
  expectIssue({
    operation: 'synthesis',
    r2AuditedSynthesisPolicyPresent: false
  }, 'E_PHASE10_CROSS_DOMAIN_R2_SYNTHESIS_REQUIRED');
});

test('incomplete coverage cannot produce decision-grade output', () => {
  expectIssue({
    requestedDecisionUse: 'decision-grade',
    inputDecisionUseClassifications: ['decision-grade'],
    coverage: {
      expectedDomainIds: ['KDOM-a', 'KDOM-b', 'KDOM-c'],
      coveredDomainIds: ['KDOM-a', 'KDOM-b']
    }
  }, 'E_PHASE10_CROSS_DOMAIN_INCOMPLETE_COVERAGE_DECISION_GRADE_FORBIDDEN');
});

test('decision-use upgrades reject', () => {
  expectIssue({
    requestedDecisionUse: 'decision-grade',
    inputDecisionUseClassifications: ['research-only']
  }, 'E_PHASE10_CROSS_DOMAIN_DECISION_USE_UPGRADE_FORBIDDEN');
});

test('write, CLI, and filesystem output requests reject', () => {
  for (const requestedWrite of [
    'claim-ledger',
    'claim-edge',
    'provenance-link',
    'domain-lifecycle',
    'wiki-page',
    'query-record',
    'presentation',
    'export-package'
  ]) {
    expectIssue({ requestedWrites: [requestedWrite] }, 'E_PHASE10_CROSS_DOMAIN_WRITER_FORBIDDEN');
  }

  expectIssue({ cliVerb: 'vre domain merge' }, 'E_PHASE10_CROSS_DOMAIN_CLI_FORBIDDEN');
  expectIssue({ outputPath: 'out/merge.json' }, 'E_PHASE10_CROSS_DOMAIN_OUTPUT_PATH_FORBIDDEN');
});

test('query and export operations remain future scope', () => {
  expectIssue({ operation: 'query' }, 'E_PHASE10_CROSS_DOMAIN_QUERY_SCOPE_FORBIDDEN');
  expectIssue({ operation: 'export' }, 'E_PHASE10_CROSS_DOMAIN_EXPORT_SCOPE_FORBIDDEN');
});

test('merge plan is deterministic under domain input order changes', () => {
  const first = evaluatePhase10CrossDomainMerge(request());
  const second = evaluatePhase10CrossDomainMerge(request({
    domainIds: ['KDOM-b', 'KDOM-a'],
    gateRequest: {
      ...request().gateRequest,
      domainIds: ['KDOM-b', 'KDOM-a']
    },
    assertions: [...request().assertions].reverse()
  }));

  assert.equal(first.ok, true, JSON.stringify(first, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second, null, 2));
  assert.deepEqual(second.plan, first.plan);
});

test('T10.5.2 query boundary does not reopen merge planner query scope', () => {
  const result = evaluatePhase10CrossDomainMerge(request({ operation: 'query' }));

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(result.persisted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.localProposalOnly, true);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.performsOperation, false);
  assert.equal(result.performsWrite, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'E_PHASE10_CROSS_DOMAIN_QUERY_SCOPE_FORBIDDEN'),
    true,
    JSON.stringify(result.issues, null, 2)
  );
});
