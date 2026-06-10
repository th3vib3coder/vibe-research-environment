const REVIEWED_POLICIES = new Set(['two-pass', 'three-pass-r2-audited']);
const CONTRADICTION_SCOPE_USES = new Set([
  'contradictory-evidence',
  'failed-replication'
]);
const LOWER_TRUST_TIERS = new Set(['tertiary', 'operator-provided']);

export const COMPILE_POLICY_RATIONALES = Object.freeze({
  contradiction: 'auto-upgraded-because-contradiction-signal',
  sourceMix: 'auto-upgraded-because-source-mix',
  lowerTrustTier: 'auto-upgraded-because-lower-trust-tier',
  default: 'default-from-compile-policy'
});

export class CompilePolicyError extends Error {
  constructor({ code, message, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'CompilePolicyError';
    this.code = code;
    this.extra = extra;
  }
}

function failPolicy(code, message, extra = {}) {
  throw new CompilePolicyError({ code, message, extra });
}

function assertReviewedPolicy(compilePolicy) {
  const policy = compilePolicy?.policy;
  if (!REVIEWED_POLICIES.has(policy)) {
    failPolicy(
      'E_PHASE10_COMPILE_POLICY_DOWNGRADE_FORBIDDEN',
      `Compile policy is below the reviewed Phase 10 floor: ${policy ?? '(missing)'}`,
      { policy }
    );
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasContradictionSignal(draftPage, sourceBundles) {
  const hasContradictionAssertion = asArray(draftPage?.assertionGraph)
    .some((assertion) => assertion?.declaredKind === 'contradiction');
  const hasContradictingEdge = asArray(draftPage?.claimEdges)
    .some((edge) => edge?.relation === 'contradicts');
  const hasContradictionBundle = sourceBundles.some((bundle) =>
    asArray(bundle?.scopeOfUse).some((scope) => CONTRADICTION_SCOPE_USES.has(scope))
  );

  return hasContradictionAssertion || hasContradictingEdge || hasContradictionBundle;
}

function hasSourceMix(sourceBundles) {
  if (sourceBundles.length < 2) {
    return false;
  }

  const sourceTypes = new Set(sourceBundles.map((bundle) => bundle?.sourceType).filter(Boolean));
  const trustTiers = new Set(sourceBundles.map((bundle) => bundle?.trustTier).filter(Boolean));
  return sourceTypes.size > 1 || trustTiers.size > 1;
}

function hasLowerTrustTier(sourceBundles) {
  return sourceBundles.some((bundle) => LOWER_TRUST_TIERS.has(bundle?.trustTier));
}

function collectHeuristics({ draftPage, sourceBundles }) {
  const triggers = [];
  if (hasContradictionSignal(draftPage, sourceBundles)) {
    triggers.push(COMPILE_POLICY_RATIONALES.contradiction);
  }
  if (hasSourceMix(sourceBundles)) {
    triggers.push(COMPILE_POLICY_RATIONALES.sourceMix);
  }
  if (hasLowerTrustTier(sourceBundles)) {
    triggers.push(COMPILE_POLICY_RATIONALES.lowerTrustTier);
  }
  return triggers;
}

export function resolveCompilePolicy({
  compilePolicy,
  draftPage,
  sourceBundles = []
} = {}) {
  assertReviewedPolicy(compilePolicy);

  const resolvedBundles = asArray(sourceBundles);
  const triggeredHeuristics = collectHeuristics({
    draftPage,
    sourceBundles: resolvedBundles
  });
  const compilePolicyRationale = triggeredHeuristics[0]
    ?? COMPILE_POLICY_RATIONALES.default;

  if (triggeredHeuristics.length === 0) {
    return {
      policy: compilePolicy.policy,
      compilePolicyRationale,
      triggeredHeuristics,
      reviewRequired: false
    };
  }

  if (draftPage?.type !== 'synthesis') {
    return {
      policy: compilePolicy.policy,
      compilePolicyRationale,
      triggeredHeuristics,
      reviewRequired: true,
      reviewRouting: 'requires-synthesis'
    };
  }

  return {
    policy: 'three-pass-r2-audited',
    compilePolicyRationale,
    triggeredHeuristics,
    reviewRequired: false
  };
}
