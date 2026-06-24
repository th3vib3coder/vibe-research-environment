import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePhase10CrossDomainQuery
} from '../../phase10/cross-domain-query.js';
import { runWikiQuery } from '../../phase10/wiki-query.js';

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

function gateRequest(domainIds = ['KDOM-a', 'KDOM-b']) {
  return {
    operation: 'query',
    nextTaskId: 'T10.5.2',
    domainIds,
    classificationOnly: true,
    mergePolicyPresent: true,
    closeouts: COMPLETE_CLOSEOUTS
  };
}

function mergeRequest(domainIds = ['KDOM-a', 'KDOM-b']) {
  return {
    operation: 'merge',
    domainIds,
    gateRequest: {
      operation: 'merge',
      nextTaskId: 'T10.5.1',
      domainIds,
      classificationOnly: true,
      closeouts: COMPLETE_CLOSEOUTS
    },
    assertions: [
      { id: 'ASSERT-a', domainId: 'KDOM-a', sourceRefs: [{ ...SOURCE_REF, id: 'SRC-a' }] },
      { id: 'ASSERT-b', domainId: 'KDOM-b', sourceRefs: [{ ...SOURCE_REF, id: 'SRC-b' }] }
    ],
    conflictPolicy: { mode: 'preserve-and-flag' },
    r2AuditedSynthesisPolicyPresent: true,
    requestedDecisionUse: 'research-only',
    inputDecisionUseClassifications: ['research-only', 'research-only']
  };
}

function manifests(overrides = {}) {
  return [
    {
      domainId: 'KDOM-a',
      queryId: 'Q-a',
      active: true,
      expiresAt: '2099-01-01T00:00:00.000Z',
      ...overrides.a
    },
    {
      domainId: 'KDOM-b',
      queryId: 'Q-b',
      active: true,
      expiresAt: '2099-01-01T00:00:00.000Z',
      ...overrides.b
    }
  ];
}

function request(overrides = {}) {
  return {
    domainIds: ['KDOM-b', 'KDOM-a'],
    gateRequest: gateRequest(['KDOM-b', 'KDOM-a']),
    mergeRequest: mergeRequest(['KDOM-b', 'KDOM-a']),
    manifests: manifests(),
    queryClass: 'evidence-summary',
    status: 'complete',
    coverage: {
      expectedDomainIds: ['KDOM-a', 'KDOM-b'],
      coveredDomainIds: ['KDOM-a', 'KDOM-b']
    },
    law13ProvenanceRefs: [
      { id: 'SRC-a', kind: 'raw-document', reResolvedOriginalSource: true }
    ],
    queryArtifacts: [
      { id: 'Q-b-result', domainId: 'KDOM-b' },
      { id: 'Q-a-result', domainId: 'KDOM-a' }
    ],
    ...overrides
  };
}

function expectIssue(overrides, code) {
  const result = evaluatePhase10CrossDomainQuery(request(overrides));
  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(result.persisted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.localBoundaryOnly, true);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid boundary returns local non-authoritative result only', () => {
  const result = evaluatePhase10CrossDomainQuery(request());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'query-boundary-ready');
  assert.equal(result.persisted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.localBoundaryOnly, true);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.performsOperation, false);
  assert.equal(result.performsWrite, false);
  assert.deepEqual(result.boundary.domainIds, ['KDOM-a', 'KDOM-b']);
  assert.deepEqual(result.boundary.queryArtifactIds, ['Q-a-result', 'Q-b-result']);
  assert.equal(result.boundary.decisionUse.classification, 'evidence-support');
});

test('missing or wrong T10.5.0 query gate rejects', () => {
  expectIssue({ gateRequest: undefined }, 'E_PHASE10_CROSS_DOMAIN_QUERY_GATE_REQUIRED');
  expectIssue({
    gateRequest: { ...gateRequest(), nextTaskId: 'T10.5.1' }
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_GATE_REQUIRED');
});

test('missing or negative T10.5.1 policy evidence rejects', () => {
  expectIssue({ mergeRequest: undefined }, 'E_PHASE10_CROSS_DOMAIN_QUERY_POLICY_REQUIRED');
  expectIssue({
    mergeRequest: { ...mergeRequest(), assertions: [] }
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_POLICY_REQUIRED');
});

test('single-domain input rejects', () => {
  expectIssue({
    domainIds: ['KDOM-a'],
    gateRequest: gateRequest(['KDOM-a']),
    mergeRequest: mergeRequest(['KDOM-a']),
    manifests: [manifests()[0]]
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_TWO_DOMAINS_REQUIRED');
});

test('single-domain wiki query runner still rejects cross-domain input', async () => {
  await assert.rejects(
    () => runWikiQuery(process.cwd(), {
      domainId: 'KDOM-a',
      domainIds: ['KDOM-a', 'KDOM-b'],
      crossDomain: true,
      queryId: 'Q-cross',
      queryText: 'cxcl13 cd8',
      queryClass: 'lookup'
    }),
    (error) => error?.code === 'E_PHASE10_QUERY_CROSS_DOMAIN_FORBIDDEN'
  );
});

test('stale manifest in any participating domain rejects by default', () => {
  expectIssue({
    manifests: manifests({ b: { expiresAt: '2020-01-01T00:00:00.000Z' } })
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_MANIFEST_STALE');
});

test('stale override requires visible caveat and downgrades to not-for-decision', () => {
  expectIssue({
    manifests: manifests({
      b: {
        expiresAt: '2020-01-01T00:00:00.000Z',
        freshnessOverrideReason: 'reviewing historical cross-domain state'
      }
    })
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_STALE_CAVEAT_REQUIRED');

  const result = evaluatePhase10CrossDomainQuery(request({
    manifests: manifests({
      b: {
        expiresAt: '2020-01-01T00:00:00.000Z',
        freshnessOverrideReason: 'reviewing historical cross-domain state',
        freshnessCaveatVisible: true
      }
    })
  }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.boundary.decisionUse.classification, 'not-for-decision');
  assert.equal(
    result.warnings.some((warning) => warning.code === 'W_PHASE10_CROSS_DOMAIN_QUERY_STALE_OVERRIDE_DOWNGRADED'),
    true,
    JSON.stringify(result.warnings, null, 2)
  );
});

test('caller-declared decision-use or upgrade attempts reject', () => {
  expectIssue({ decisionUse: { classification: 'decision-grade' } }, 'E_PHASE10_CROSS_DOMAIN_QUERY_DECISION_USE_DECLARED');
  expectIssue({ requestedDecisionUseClassification: 'decision-grade' }, 'E_PHASE10_CROSS_DOMAIN_QUERY_DECISION_USE_DECLARED');
  expectIssue({
    gateRequest: { ...gateRequest(), decisionUseRule: 'may-upgrade' }
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_GATE_REQUIRED');
});

test('incomplete coverage warns and remains not-for-decision', () => {
  const result = evaluatePhase10CrossDomainQuery(request({
    coverage: {
      expectedDomainIds: ['KDOM-a', 'KDOM-b', 'KDOM-c'],
      coveredDomainIds: ['KDOM-a', 'KDOM-b']
    }
  }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.boundary.decisionUse.classification, 'not-for-decision');
  assert.equal(
    result.warnings.some((warning) => warning.code === 'W_PHASE10_CROSS_DOMAIN_QUERY_INCOMPLETE_COVERAGE'),
    true,
    JSON.stringify(result.warnings, null, 2)
  );
});

test('R2 and contradiction gates preserve query decision-use floors', () => {
  assert.equal(
    evaluatePhase10CrossDomainQuery(request({ queryClass: 'decision-support' }))
      .boundary.decisionUse.classification,
    'not-for-decision'
  );
  assert.equal(
    evaluatePhase10CrossDomainQuery(request({
      queryClass: 'decision-support',
      r2Audit: { status: 'accepted' }
    })).boundary.decisionUse.classification,
    'decision-grade'
  );
  assert.equal(
    evaluatePhase10CrossDomainQuery(request({ queryClass: 'contradiction-audit' }))
      .boundary.decisionUse.classification,
    'not-for-decision'
  );
  assert.equal(
    evaluatePhase10CrossDomainQuery(request({
      queryClass: 'contradiction-audit',
      qualityGates: { fullContradictionEnumeration: true }
    })).boundary.decisionUse.classification,
    'audit-grade'
  );
});

test('metadata artifacts cannot be LAW 13 provenance', () => {
  for (const kind of [
    'query-result',
    'previous-query-result',
    'relay-verdict',
    'adversarial-verdict',
    'presentation',
    'gate-decision'
  ]) {
    expectIssue({
      law13ProvenanceRefs: [{ id: `${kind}-001`, kind, reResolvedOriginalSource: true }]
    }, 'E_PHASE10_CROSS_DOMAIN_QUERY_METADATA_NOT_PROVENANCE');
  }

  expectIssue({
    law13ProvenanceRefs: [{
      id: 'computed-adversarial-verdict-001',
      kind: 'computed-artifact',
      targetRef: {
        type: 'adversarial-verdict',
        id: 'ADV-001'
      },
      reResolvedOriginalSource: true
    }]
  }, 'E_PHASE10_CROSS_DOMAIN_QUERY_METADATA_NOT_PROVENANCE');
});

test('export remains blocked', () => {
  expectIssue({ exportRequested: true }, 'E_PHASE10_CROSS_DOMAIN_QUERY_EXPORT_FORBIDDEN');
  expectIssue({ exportProfile: { kind: 'public-package' } }, 'E_PHASE10_CROSS_DOMAIN_QUERY_EXPORT_FORBIDDEN');
});

test('write, CLI, and output path requests reject', () => {
  for (const requestedWrite of [
    'query-record',
    'wiki-page',
    'filesystem',
    'provenance-link',
    'claim-ledger',
    'claim-edge',
    'domain-lifecycle',
    'presentation',
    'export-package'
  ]) {
    expectIssue({ requestedWrites: [requestedWrite] }, 'E_PHASE10_CROSS_DOMAIN_QUERY_WRITER_FORBIDDEN');
  }

  expectIssue({ cliVerb: 'vre domain query --cross-domain' }, 'E_PHASE10_CROSS_DOMAIN_QUERY_CLI_FORBIDDEN');
  expectIssue({ outputPath: 'out/query.md' }, 'E_PHASE10_CROSS_DOMAIN_QUERY_OUTPUT_PATH_FORBIDDEN');
});

test('boundary output is deterministic under domain input order changes', () => {
  const first = evaluatePhase10CrossDomainQuery(request());
  const second = evaluatePhase10CrossDomainQuery(request({
    domainIds: ['KDOM-a', 'KDOM-b'],
    gateRequest: gateRequest(['KDOM-a', 'KDOM-b']),
    mergeRequest: mergeRequest(['KDOM-a', 'KDOM-b']),
    manifests: manifests().reverse(),
    queryArtifacts: [...request().queryArtifacts].reverse()
  }));

  assert.equal(first.ok, true, JSON.stringify(first, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second, null, 2));
  assert.deepEqual(second.boundary, first.boundary);
});

test('positive output carries non-authorization markers', () => {
  const result = evaluatePhase10CrossDomainQuery(request());

  assert.equal(result.boundary.persisted, false);
  assert.equal(result.boundary.authoritative, false);
  assert.equal(result.boundary.localBoundaryOnly, true);
  assert.equal(result.boundary.authorizationGranted, false);
});
