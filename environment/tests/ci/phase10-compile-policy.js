import { isDirectRun, runValidator } from './_helpers.js';
import {
  resolveCompilePolicy
} from '../../phase10/compile-policy.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';

function policy(overrides = {}) {
  return {
    schemaVersion: 'phase10.compile-policy.v1',
    compilePolicyId: 'CP-compile-policy-validator',
    policy: 'two-pass',
    rationale: 'Validator fixture for deterministic compile policy resolution.',
    requiredReviewer: 'claude-code',
    createdAt: TIMESTAMP,
    ...overrides
  };
}

function draft(overrides = {}) {
  return {
    pageId: 'WIKI-compile-policy-validator',
    type: 'synthesis',
    assertionGraph: [
      {
        assertionId: 'ASSERT-compile-policy-validator',
        text: 'Validator synthesis assertion records a contradiction.',
        status: 'claimed',
        declaredKind: 'contradiction',
        cites: ['PROV-compile-policy-validator']
      }
    ],
    ...overrides
  };
}

function bundle(overrides = {}) {
  return {
    bundleId: 'SB-compile-policy-validator',
    bundleVersion: 'v1',
    sourceType: 'pdf',
    trustTier: 'primary',
    scopeOfUse: ['evidence'],
    ...overrides
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export default async function validatePhase10CompilePolicy() {
  const upgraded = resolveCompilePolicy({
    compilePolicy: policy(),
    draftPage: draft(),
    sourceBundles: [bundle()]
  });
  assert(upgraded.policy === 'three-pass-r2-audited', 'synthesis trigger did not upgrade');
  assert(
    upgraded.compilePolicyRationale === 'auto-upgraded-because-contradiction-signal',
    'synthesis trigger did not persist contradiction rationale'
  );

  const blocked = resolveCompilePolicy({
    compilePolicy: policy(),
    draftPage: draft({ type: 'concept' }),
    sourceBundles: [bundle({ trustTier: 'tertiary' })]
  });
  assert(blocked.reviewRequired === true, 'non-synthesis trigger did not fail closed');
  assert(blocked.reviewRouting === 'requires-synthesis', 'non-synthesis routing drifted');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-compile-policy', validatePhase10CompilePolicy);
}
