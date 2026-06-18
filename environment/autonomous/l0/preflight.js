const SCHEMA_VERSION = 'phase13.l0-readiness-preflight.v1';
const ALLOWED_OPERATORS = Object.freeze(['Carmine', 'Elisa']);
const REQUIRED_OPERATOR_SET = new Set(ALLOWED_OPERATORS);
const OPTIONAL_SURFACE_RULES = Object.freeze([
  {
    key: 'connectors',
    pattern: /^connector .+ is degraded:/u,
    warningCode: 'W_L0_CONNECTOR_DEGRADED',
    blockerCode: 'E_L0_REQUIRED_CONNECTOR_DEGRADED',
    action: 'Repair required connector surfaces or remove them from the run profile.'
  },
  {
    key: 'automations',
    pattern: /^automation .+ is degraded:/u,
    warningCode: 'W_L0_AUTOMATION_DEGRADED',
    blockerCode: 'E_L0_REQUIRED_AUTOMATION_DEGRADED',
    action: 'Repair required automation surfaces or remove them from the run profile.'
  },
  {
    key: 'domainPacks',
    pattern: /^domain pack .+ is degraded:/u,
    warningCode: 'W_L0_DOMAIN_PACK_DEGRADED',
    blockerCode: 'E_L0_REQUIRED_DOMAIN_PACK_DEGRADED',
    action: 'Repair required domain-pack surfaces or remove them from the run profile.'
  }
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values)];
}

function buildIssue(code, message, extra = {}) {
  return {
    code,
    message,
    ...extra
  };
}

function requiredSurfacesFrom(runProfile) {
  return new Set(asArray(runProfile?.requiredSurfaces)
    .filter((value) => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim()));
}

function degradedReasonsFrom(capabilities) {
  return asArray(capabilities?.degradedReasons)
    .filter((reason) => typeof reason === 'string' && reason.trim() !== '')
    .map((reason) => reason.trim());
}

function classifyKernel(capabilities, blockers, actions) {
  const kernel = capabilities?.kernel ?? {};
  if (kernel.mode !== 'full') {
    blockers.push(buildIssue(
      'E_L0_KERNEL_NOT_FULL',
      'L0 preflight requires kernel.mode full.',
      { mode: kernel.mode ?? null }
    ));
    actions.push('Restore full kernel capability projections before L0 preflight.');
  }

  const unavailable = asArray(kernel.projections?.unavailable);
  if (unavailable.length > 0) {
    blockers.push(buildIssue(
      'E_L0_KERNEL_PROJECTION_UNAVAILABLE',
      'L0 preflight requires every kernel projection to be available.',
      { unavailable }
    ));
    actions.push('Repair unavailable kernel projections before L0 preflight.');
  }
}

function classifyMemory(capabilities, degradedReasons, blockers, actions) {
  const staleReason = degradedReasons.find((reason) => /^STALE\b/iu.test(reason));
  if (capabilities?.memory?.fresh !== true || staleReason) {
    blockers.push(buildIssue(
      'E_L0_MEMORY_STALE',
      'L0 preflight requires fresh synchronized memory.',
      {
        lastSyncAt: capabilities?.memory?.lastSyncAt ?? null,
        degradedReason: staleReason ?? null
      }
    ));
    actions.push('Refresh memory before L0 preflight.');
  }
}

function classifyCommandContracts(degradedReasons, blockers, actions) {
  const missingContracts = degradedReasons
    .filter((reason) =>
      /^executable command .+ is wired in bin\/vre but missing a reviewed markdown contract$/u
        .test(reason)
    );

  if (missingContracts.length > 0) {
    blockers.push(buildIssue(
      'E_L0_COMMAND_CONTRACTS_MISSING',
      'L0 preflight requires reviewed markdown contracts for executable commands.',
      { missingContracts }
    ));
    actions.push('Add reviewed markdown contracts for executable commands before L0 preflight.');
  }
}

function classifyHaltEvidence(guardEvidence, blockers, actions) {
  const halt = guardEvidence?.halt;
  if (!halt || typeof halt !== 'object' || Array.isArray(halt)) {
    blockers.push(buildIssue(
      'E_L0_HALT_EVIDENCE_MISSING',
      'L0 preflight requires injected or reviewed halt evidence.'
    ));
    actions.push('Provide deterministic halt evidence before L0 preflight.');
    return null;
  }

  if (!['injected-hypothetical', 'reviewed-runtime-evidence'].includes(halt.evidenceClass)) {
    blockers.push(buildIssue(
      'E_L0_HALT_EVIDENCE_CLASS_INVALID',
      'Halt evidence must be explicitly labeled as injected-hypothetical or reviewed-runtime-evidence.',
      { evidenceClass: halt.evidenceClass ?? null }
    ));
    actions.push('Label halt evidence honestly before L0 preflight.');
  }

  if (!REQUIRED_OPERATOR_SET.has(halt.requestedBy)) {
    blockers.push(buildIssue(
      'E_L0_HALT_OPERATOR_INVALID',
      'Halt evidence must be tied to an allowed operator.',
      { requestedBy: halt.requestedBy ?? null, allowedOperators: ALLOWED_OPERATORS }
    ));
    actions.push('Tie halt evidence to Carmine or Elisa before L0 preflight.');
  }

  if (halt.interruptsWithinOneIteration !== true) {
    blockers.push(buildIssue(
      'E_L0_HALT_INTERRUPT_NOT_PROVEN',
      'Halt evidence must prove interruption within one loop iteration.'
    ));
    actions.push('Prove the halt interrupts within one iteration before L0 preflight.');
  }

  if (halt.resumeRequiresOperatorGo !== true) {
    blockers.push(buildIssue(
      'E_L0_HALT_RESUME_GATE_MISSING',
      'Halt evidence must prove resume requires operator GO.'
    ));
    actions.push('Prove resume requires operator GO before L0 preflight.');
  }

  return halt.evidenceClass ?? null;
}

function classifyOperatorModel(guardEvidence, blockers, actions) {
  const observedOperators = new Set(asArray(guardEvidence?.operators)
    .map((operator) => operator?.name)
    .filter((name) => typeof name === 'string' && name.trim() !== '')
    .map((name) => name.trim()));
  const missingOperators = ALLOWED_OPERATORS.filter((name) => !observedOperators.has(name));

  if (missingOperators.length > 0) {
    blockers.push(buildIssue(
      'E_L0_OPERATOR_MODEL_INCOMPLETE',
      'L0 preflight requires both Carmine and Elisa in the operator model.',
      { missingOperators, requiredOperators: ALLOWED_OPERATORS }
    ));
    actions.push('Record both Carmine and Elisa in the operator model before L0 preflight.');
  }
}

function classifyOptionalSurfaces(degradedReasons, runProfile, blockers, warnings, actions) {
  const requiredSurfaces = requiredSurfacesFrom(runProfile);
  for (const rule of OPTIONAL_SURFACE_RULES) {
    const matches = degradedReasons.filter((reason) => rule.pattern.test(reason));
    if (matches.length === 0) {
      continue;
    }

    const issue = buildIssue(
      requiredSurfaces.has(rule.key) ? rule.blockerCode : rule.warningCode,
      `${rule.key} degraded during L0 preflight.`,
      { degradedReasons: matches, required: requiredSurfaces.has(rule.key) }
    );

    if (requiredSurfaces.has(rule.key)) {
      blockers.push(issue);
      actions.push(rule.action);
    } else {
      warnings.push(issue);
    }
  }
}

function classifyR2Caveat(degradedReasons, warnings) {
  const caveat = degradedReasons.find((reason) =>
    /unresolvedR2Count is currently derived from listUnresolvedClaims/iu.test(reason)
  );
  if (caveat) {
    warnings.push(buildIssue(
      'W_L0_UNRESOLVED_R2_DERIVED',
      'unresolvedR2Count is derived until a dedicated R2 projection lands.',
      { degradedReason: caveat }
    ));
  }
}

export function classifyL0Readiness({ capabilities, guardEvidence = {}, runProfile = {} } = {}) {
  const blockers = [];
  const warnings = [];
  const actions = [];
  const degradedReasons = degradedReasonsFrom(capabilities);

  classifyKernel(capabilities, blockers, actions);
  classifyMemory(capabilities, degradedReasons, blockers, actions);
  classifyCommandContracts(degradedReasons, blockers, actions);
  const haltEvidenceClass = classifyHaltEvidence(guardEvidence, blockers, actions);
  classifyOperatorModel(guardEvidence, blockers, actions);
  classifyOptionalSurfaces(degradedReasons, runProfile, blockers, warnings, actions);
  classifyR2Caveat(degradedReasons, warnings);

  return {
    schemaVersion: SCHEMA_VERSION,
    ready: blockers.length === 0,
    runtimeOpened: false,
    l0RuntimeAllowed: false,
    haltEvidenceClass,
    allowedOperators: ALLOWED_OPERATORS,
    blockers,
    warnings,
    requiredNextActions: unique(actions)
  };
}
