import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPUTED_BY,
  computeQueryDecisionUse
} from '../../phase10/query-decision-use.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';

function classify(overrides = {}) {
  return computeQueryDecisionUse({
    queryClass: 'lookup',
    status: 'complete',
    computedAt: TIMESTAMP,
    ...overrides
  });
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('decision-use incomplete and failed statuses are never decision inputs', () => {
  for (const status of ['incomplete', 'failed']) {
    for (const queryClass of [
      'lookup',
      'evidence-summary',
      'decision-support',
      'contradiction-audit',
      'report-generation'
    ]) {
      const result = classify({
        status,
        queryClass,
        reportScope: 'domain-summary'
      });
      assert.equal(result.classification, 'not-for-decision');
      assert.equal(result.computedBy, COMPUTED_BY);
    }
  }
});

test('decision-use maps lookup and evidence-summary classes', () => {
  assert.equal(classify({ queryClass: 'lookup' }).classification, 'informational');
  assert.equal(
    classify({ queryClass: 'evidence-summary' }).classification,
    'evidence-support'
  );
});

test('decision-use gates decision-support behind accepted R2', () => {
  assert.equal(
    classify({ queryClass: 'decision-support' }).classification,
    'not-for-decision'
  );
  assert.equal(
    classify({
      queryClass: 'decision-support',
      r2Audit: { status: 'passed', verdict: 'ACCEPT' }
    }).classification,
    'decision-grade'
  );
});

test('decision-use gates contradiction-audit behind full enumeration', () => {
  assert.equal(
    classify({ queryClass: 'contradiction-audit' }).classification,
    'not-for-decision'
  );
  assert.equal(
    classify({
      queryClass: 'contradiction-audit',
      qualityGates: { fullContradictionEnumeration: true }
    }).classification,
    'audit-grade'
  );
});

test('decision-use maps report-generation scopes', () => {
  for (const reportScope of ['domain-summary', 'recent-week', 'inbox-status']) {
    assert.equal(
      classify({ queryClass: 'report-generation', reportScope }).classification,
      'informational'
    );
  }
  for (const reportScope of ['claim-status-overview', 'single-objective']) {
    assert.equal(
      classify({ queryClass: 'report-generation', reportScope }).classification,
      'evidence-support'
    );
  }
});

test('decision-use fails closed on invalid classes and missing report scope', () => {
  expectCode(
    () => classify({ queryClass: 'targeted-read' }),
    'E_PHASE10_QUERY_CLASS_INVALID'
  );
  expectCode(
    () => classify({ queryClass: 'report-generation' }),
    'E_PHASE10_REPORT_SCOPE_REQUIRED'
  );
});

test('decision-use rejects author-declared classification input', () => {
  expectCode(
    () => classify({
      decisionUse: {
        classification: 'decision-grade',
        declaredBy: 'caller'
      }
    }),
    'E_PHASE10_DECISION_USE_DECLARED'
  );
});
