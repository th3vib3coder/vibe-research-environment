const SUPPORTED_CAPABILITIES = Object.freeze({
  'local-logic': new Set(['output-only', 'programmatic']),
  'local-cli': new Set(['fire-and-forget', 'output-only', 'streaming']),
  'local-subprocess': new Set(['output-only', 'programmatic']),
  // WP-162: provider-cli supports only output-only + programmatic. No
  // streaming (single JSON response, not SSE) and no fire-and-forget
  // (review needs a verdict). The existing local-cli → api fallback is
  // intentionally NOT extended to provider-cli; per WP-162 that would be
  // silent substitution (the anti-pattern Phase 5.5 Wave 3 rejected).
  'provider-cli': new Set(['output-only', 'programmatic']),
  sdk: new Set(['output-only', 'streaming', 'programmatic']),
  api: new Set(['output-only', 'streaming', 'programmatic']),
  'cloud-task': new Set(['fire-and-forget', 'output-only']),
});

function getLaneConfig(lanePolicies, laneId) {
  const laneConfig = lanePolicies?.lanes?.[laneId] ?? null;
  if (!laneConfig) {
    throw new Error(`Lane policy missing for ${laneId}.`);
  }

  return laneConfig;
}

function supportsCapability(integrationKind, capability) {
  if (!capability) {
    return true;
  }

  return SUPPORTED_CAPABILITIES[integrationKind]?.has(capability) ?? false;
}

function resolveExecutor(executors = {}, binding) {
  if (!binding.providerRef) {
    return executors[binding.integrationKind] ?? null;
  }

  return (
    executors[`${binding.providerRef}:${binding.integrationKind}`]
    ?? executors[binding.providerRef]?.[binding.integrationKind]
    ?? executors[binding.integrationKind]
    ?? null
  );
}

export function selectLaneBinding({
  laneId,
  lanePolicies,
  continuityProfile = null,
  requiredCapability = null,
  providerExecutors = {},
  systemDefaultAllowApiFallback = false,
}) {
  const laneConfig = getLaneConfig(lanePolicies, laneId);
  if (!laneConfig.enabled) {
    throw new Error(`Lane ${laneId} is disabled by policy.`);
  }

  const effectiveApiFallbackAllowed =
    typeof laneConfig.apiFallbackAllowed === 'boolean'
      ? laneConfig.apiFallbackAllowed
      : continuityProfile?.runtime?.defaultAllowApiFallback ?? systemDefaultAllowApiFallback;

  const capability = requiredCapability ?? laneConfig.supervisionCapability;
  const primaryBinding = {
    laneId,
    providerRef: laneConfig.providerRef,
    integrationKind: laneConfig.integrationKind,
    authMode: laneConfig.authMode,
    billingMode: laneConfig.billingMode,
    supervisionCapability: laneConfig.supervisionCapability,
    effectiveApiFallbackAllowed,
    fallbackApplied: false,
  };

  if (supportsCapability(primaryBinding.integrationKind, capability)) {
    return primaryBinding;
  }

  if (
    primaryBinding.integrationKind === 'local-cli'
    && primaryBinding.providerRef
    && effectiveApiFallbackAllowed
  ) {
    const fallbackBinding = {
      ...primaryBinding,
      integrationKind: 'api',
      fallbackApplied: true,
    };

    if (supportsCapability('api', capability) && resolveExecutor(providerExecutors, fallbackBinding)) {
      return fallbackBinding;
    }
  }

  throw new Error(
    `Lane ${laneId} cannot satisfy ${capability} with ${primaryBinding.integrationKind}.`,
  );
}

export async function invokeLaneBinding(binding, providerExecutors = {}, payload = {}) {
  const executor = resolveExecutor(providerExecutors, binding);
  if (!executor) {
    throw new Error(
      `No provider executor declared for ${binding.providerRef ?? 'local'}:${binding.integrationKind}.`,
    );
  }

  return executor(payload, binding);
}
