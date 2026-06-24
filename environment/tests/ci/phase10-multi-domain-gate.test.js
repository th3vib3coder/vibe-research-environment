import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePhase10MultiDomainGate
} from '../../phase10/multi-domain-gate.js';

const COMPLETE_CLOSEOUTS = Object.freeze({
  wave10_1: { status: 'complete-operator-closure-go-recorded', commit: 'a'.repeat(40), ciConclusion: 'success' },
  wave10_2: { status: 'closed-operator-go-recorded', commit: 'b'.repeat(40), ciConclusion: 'success' },
  wave10_3: { status: 'closed-operator-go-recorded', commit: 'c'.repeat(40), ciConclusion: 'success' },
  wave10_4: { status: 'closed-operator-go-recorded', commit: 'd'.repeat(40), ciConclusion: 'success' }
});

function gateRequest(overrides = {}) {
  return {
    operation: 'gate-check',
    domainIds: ['KDOM-a', 'KDOM-b'],
    closeouts: COMPLETE_CLOSEOUTS,
    classificationOnly: true,
    exportPackagingDeferral: { id: 'W10.4-DEFERRED-EXPORT-PACKAGING-001', status: 'open' },
    ...overrides
  };
}

function expectIssue(request, code) {
  const result = evaluatePhase10MultiDomainGate(request);
  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(result.authorizationGranted, false);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('complete multi-domain gate-check returns next-task eligibility only', () => {
  const result = evaluatePhase10MultiDomainGate(gateRequest());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'eligible-for-future-hat-task');
  assert.equal(result.eligibleForNextTask, true);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.performsOperation, false);
});

test('single-domain input remains classifiable without opening multi-domain', () => {
  const result = evaluatePhase10MultiDomainGate(gateRequest({ domainIds: ['KDOM-a'] }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'single-domain-no-multi-domain-opened');
  assert.equal(result.eligibleForNextTask, false);
  assert.equal(result.authorizationGranted, false);
});

test('missing prerequisite closeouts reject fail-closed', () => {
  for (const [waveKey, code] of [
    ['wave10_1', 'E_PHASE10_MULTI_DOMAIN_WAVE10_1_CLOSEOUT_REQUIRED'],
    ['wave10_2', 'E_PHASE10_MULTI_DOMAIN_WAVE10_2_CLOSEOUT_REQUIRED'],
    ['wave10_3', 'E_PHASE10_MULTI_DOMAIN_WAVE10_3_CLOSEOUT_REQUIRED'],
    ['wave10_4', 'E_PHASE10_MULTI_DOMAIN_WAVE10_4_CLOSEOUT_REQUIRED']
  ]) {
    const closeouts = { ...COMPLETE_CLOSEOUTS };
    delete closeouts[waveKey];
    expectIssue(gateRequest({ closeouts }), code);
  }
});

test('schema presence alone never opens multi-domain behavior', () => {
  expectIssue(
    gateRequest({ closeouts: {}, schemaPresenceOnly: true }),
    'E_PHASE10_MULTI_DOMAIN_SCHEMA_NOT_PERMISSION'
  );
});

test('merge classification requires future T10.5.1 citation', () => {
  expectIssue(
    gateRequest({ operation: 'merge' }),
    'E_PHASE10_MULTI_DOMAIN_MERGE_TASK_REQUIRED'
  );
});

test('synthesis classification requires R2-audited policy', () => {
  expectIssue(
    gateRequest({ operation: 'synthesis', nextTaskId: 'T10.5.1' }),
    'E_PHASE10_MULTI_DOMAIN_SYNTHESIS_R2_REQUIRED'
  );
});

test('query classification requires merge policy and non-upgrade decision-use', () => {
  expectIssue(
    gateRequest({ operation: 'query', nextTaskId: 'T10.5.2' }),
    'E_PHASE10_MULTI_DOMAIN_QUERY_POLICY_REQUIRED'
  );

  expectIssue(
    gateRequest({
      operation: 'query',
      nextTaskId: 'T10.5.2',
      mergePolicyPresent: true,
      decisionUseRule: 'may-upgrade'
    }),
    'E_PHASE10_MULTI_DOMAIN_DECISION_USE_UPGRADE_FORBIDDEN'
  );
});

test('export classification remains blocked by Wave 10.4 packaging deferral', () => {
  expectIssue(
    gateRequest({ operation: 'export', nextTaskId: 'T10.5.2' }),
    'E_PHASE10_MULTI_DOMAIN_EXPORT_PACKAGING_DEFERRED'
  );
});

test('metadata artifacts are rejected as LAW 13 provenance', () => {
  for (const kind of ['query-result', 'relay-verdict', 'adversarial-verdict', 'presentation', 'gate-decision']) {
    expectIssue(
      gateRequest({ law13ProvenanceRefs: [{ kind, id: `${kind}-001` }] }),
      'E_PHASE10_MULTI_DOMAIN_METADATA_NOT_PROVENANCE'
    );
  }

  for (const ref of [
    { type: 'adversarial-verdict', id: 'adversarial-verdict-type-001' },
    {
      kind: 'computed-artifact',
      targetRef: {
        type: 'adversarial-verdict',
        id: 'adversarial-verdict-target-001'
      }
    }
  ]) {
    expectIssue(
      gateRequest({ law13ProvenanceRefs: [ref] }),
      'E_PHASE10_MULTI_DOMAIN_METADATA_NOT_PROVENANCE'
    );
  }
});

test('writer and mutation requests reject', () => {
  for (const requestedWrite of [
    'claim-ledger',
    'claim-edge',
    'provenance-link',
    'domain-lifecycle'
  ]) {
    expectIssue(
      gateRequest({ requestedWrites: [requestedWrite] }),
      'E_PHASE10_MULTI_DOMAIN_WRITER_FORBIDDEN'
    );
  }
});

test('authorization tokens and operation execution requests reject', () => {
  expectIssue(
    gateRequest({ authorizationToken: 'do-not-create-tokens' }),
    'E_PHASE10_MULTI_DOMAIN_AUTHORIZATION_FORBIDDEN'
  );

  expectIssue(
    gateRequest({ performOperation: true }),
    'E_PHASE10_MULTI_DOMAIN_AUTHORIZATION_FORBIDDEN'
  );
});

test('positive operation classification is not an authorization', () => {
  const result = evaluatePhase10MultiDomainGate(gateRequest({
    operation: 'synthesis',
    nextTaskId: 'T10.5.1',
    r2AuditedSynthesisPolicyPresent: true
  }));

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'eligible-for-future-hat-task');
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.performsOperation, false);
});
