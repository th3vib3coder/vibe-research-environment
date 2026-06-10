import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CompilePolicyError,
  resolveCompilePolicy
} from '../../phase10/compile-policy.js';

const TWO_PASS_POLICY = Object.freeze({
  schemaVersion: 'phase10.compile-policy.v1',
  compilePolicyId: 'CP-policy-test',
  policy: 'two-pass',
  rationale: 'Baseline two-pass compile policy.',
  requiredReviewer: 'reviewer-2',
  createdAt: '2026-06-10T00:00:00.000Z'
});

const THREE_PASS_POLICY = Object.freeze({
  ...TWO_PASS_POLICY,
  compilePolicyId: 'CP-policy-r2-test',
  policy: 'three-pass-r2-audited',
  rationale: 'Baseline R2-audited synthesis policy.'
});

function bundle(overrides = {}) {
  return {
    bundleId: 'SB-policy-001',
    bundleVersion: 'v1',
    sourceType: 'pdf',
    trustTier: 'primary',
    scopeOfUse: ['evidence'],
    ...overrides
  };
}

function draftPage(overrides = {}) {
  return {
    pageId: 'WIKI-policy-001',
    type: 'concept',
    assertionGraph: [
      {
        assertionId: 'ASSERT-policy-001',
        text: 'Baseline assertion.',
        status: 'sourced',
        declaredKind: 'extractive-fact',
        cites: ['PROV-policy-001']
      }
    ],
    ...overrides
  };
}

test('compile policy keeps no-trigger pages on the supplied baseline', () => {
  const result = resolveCompilePolicy({
    compilePolicy: TWO_PASS_POLICY,
    draftPage: draftPage(),
    sourceBundles: [bundle()]
  });

  assert.equal(result.policy, 'two-pass');
  assert.equal(result.compilePolicyRationale, 'default-from-compile-policy');
  assert.equal(result.reviewRequired, false);
  assert.deepEqual(result.triggeredHeuristics, []);
});

test('compile policy escalates synthesis contradiction signals only with R2', () => {
  const result = resolveCompilePolicy({
    compilePolicy: TWO_PASS_POLICY,
    draftPage: draftPage({
      type: 'synthesis',
      assertionGraph: [
        {
          assertionId: 'ASSERT-policy-contradiction',
          text: 'A synthesis assertion records a contradiction.',
          status: 'claimed',
          declaredKind: 'contradiction',
          cites: ['PROV-policy-001']
        }
      ]
    }),
    sourceBundles: [bundle()]
  });

  assert.equal(result.policy, 'three-pass-r2-audited');
  assert.equal(
    result.compilePolicyRationale,
    'auto-upgraded-because-contradiction-signal'
  );
  assert.equal(result.reviewRequired, false);
});

test('compile policy routes non-synthesis triggers to review-required', () => {
  const result = resolveCompilePolicy({
    compilePolicy: TWO_PASS_POLICY,
    draftPage: draftPage({
      type: 'concept',
      assertionGraph: [
        {
          assertionId: 'ASSERT-policy-contradiction',
          text: 'A concept assertion records a contradiction.',
          status: 'claimed',
          declaredKind: 'contradiction',
          cites: ['PROV-policy-001']
        }
      ]
    }),
    sourceBundles: [bundle()]
  });

  assert.equal(result.policy, 'two-pass');
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reviewRouting, 'requires-synthesis');
  assert.equal(
    result.compilePolicyRationale,
    'auto-upgraded-because-contradiction-signal'
  );
});

test('compile policy orders multiple heuristic triggers deterministically', () => {
  const result = resolveCompilePolicy({
    compilePolicy: THREE_PASS_POLICY,
    draftPage: draftPage({
      type: 'synthesis',
      assertionGraph: [
        {
          assertionId: 'ASSERT-policy-contradiction',
          text: 'A synthesis assertion records a contradiction.',
          status: 'claimed',
          declaredKind: 'contradiction',
          cites: ['PROV-policy-001']
        }
      ]
    }),
    sourceBundles: [
      bundle({ bundleId: 'SB-policy-001', sourceType: 'pdf' }),
      bundle({
        bundleId: 'SB-policy-002',
        sourceType: 'webpage',
        trustTier: 'tertiary'
      })
    ]
  });

  assert.deepEqual(result.triggeredHeuristics, [
    'auto-upgraded-because-contradiction-signal',
    'auto-upgraded-because-source-mix',
    'auto-upgraded-because-lower-trust-tier'
  ]);
  assert.equal(
    result.compilePolicyRationale,
    'auto-upgraded-because-contradiction-signal'
  );
});

test('compile policy rejects values below the reviewed floor', () => {
  assert.throws(
    () => resolveCompilePolicy({
      compilePolicy: { ...TWO_PASS_POLICY, policy: 'single-pass' },
      draftPage: draftPage(),
      sourceBundles: [bundle()]
    }),
    (error) =>
      error instanceof CompilePolicyError
      && error.code === 'E_PHASE10_COMPILE_POLICY_DOWNGRADE_FORBIDDEN'
  );
});
