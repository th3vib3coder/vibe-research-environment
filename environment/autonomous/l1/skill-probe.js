export class Phase13SkillProbeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Phase13SkillProbeError';
    this.code = code;
  }
}

const TARGET_KIND_CHECKS = Object.freeze({
  'host-skill': (targetId, registry) => registry.hostSkills.has(targetId),
  'skill-family': (targetId, registry) => registry.skillFamilies.has(targetId),
  'vibe-science-workflow': (targetId, registry) =>
    registry.vibeScienceWorkflows.has(targetId)
});

function fail(code, message) {
  throw new Phase13SkillProbeError(code, message);
}

function assertObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
}

function normalizeStringSet(values, label) {
  if (!Array.isArray(values)) {
    fail('E_PHASE13_L1_PROBE_REGISTRY_REQUIRED', `${label} must be an array`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      fail('E_PHASE13_L1_PROBE_REGISTRY_REQUIRED', `${label} entries must be strings`);
    }
    return value.trim();
  });
  return new Set(normalized);
}

function normalizeRegistry(registry) {
  assertObject(registry, 'E_PHASE13_L1_PROBE_REGISTRY_REQUIRED', 'registry');
  return {
    hostSkills: normalizeStringSet(registry.hostSkills, 'hostSkills'),
    skillFamilies: normalizeStringSet(registry.skillFamilies, 'skillFamilies'),
    vibeScienceWorkflows: normalizeStringSet(
      registry.vibeScienceWorkflows,
      'vibeScienceWorkflows'
    ),
    codexGlobalInstalls: normalizeStringSet(
      registry.codexGlobalInstalls,
      'codexGlobalInstalls'
    )
  };
}

function normalizeTable(table) {
  assertObject(table, 'E_PHASE13_L1_PROBE_TABLE_REQUIRED', 'table');
  if (!Array.isArray(table.stages)) {
    fail('E_PHASE13_L1_PROBE_TABLE_REQUIRED', 'table.stages must be an array');
  }
  return table;
}

function assertKnownTargetKind(target) {
  if (!Object.hasOwn(TARGET_KIND_CHECKS, target.targetKind)) {
    fail(
      'E_PHASE13_L1_UNKNOWN_TARGET_KIND',
      `unknown target kind ${target.targetKind}`
    );
  }
}

function targetKey(stageId, targetId) {
  return `${stageId}::${targetId}`;
}

function requireNonBlankString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function buildTargetResult(stage, target, registry) {
  assertKnownTargetKind(target);
  const available = TARGET_KIND_CHECKS[target.targetKind](target.targetId, registry);
  return {
    resultId: targetKey(stage.stageId, target.targetId),
    stageId: stage.stageId,
    targetId: target.targetId,
    targetKind: target.targetKind,
    required: target.required === true,
    status: available ? 'available' : 'missing',
    runtimeOpened: false,
    skillInvocationAttempted: false
  };
}

function buildVibeNamingStates(registry) {
  const hostSkillVibe = registry.hostSkills.has('vibe');
  const workflowVibe = registry.vibeScienceWorkflows.has('vibe')
    || registry.vibeScienceWorkflows.has('vibe-science');
  const globalInstall = registry.codexGlobalInstalls.has('vibe')
    || registry.codexGlobalInstalls.has('vibe-science');

  return {
    hostSkillVibe: {
      targetKind: 'host-skill',
      status: hostSkillVibe ? 'available' : 'missing'
    },
    vibeScienceWorkflow: {
      targetKind: 'vibe-science-workflow',
      status: workflowVibe ? 'available' : 'missing'
    },
    codexGlobalInstall: {
      targetKind: 'future-codex-global-install',
      status: globalInstall ? 'available' : 'missing'
    }
  };
}

function buildSummary(targetResults) {
  const available = targetResults.filter((row) => row.status === 'available').length;
  const requiredMissing = targetResults.filter((row) =>
    row.required && row.status === 'missing'
  ).length;
  return {
    totalTargets: targetResults.length,
    availableTargets: available,
    missingTargets: targetResults.length - available,
    requiredMissingTargets: requiredMissing
  };
}

function assertAvailabilityReport(report) {
  assertObject(
    report,
    'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED',
    'availabilityReport'
  );
  if (
    report.schemaVersion !== 'phase13.l1-skill-availability-report.v1'
    || report.runtimeOpened !== false
    || report.skillInvocationAttempted !== false
    || report.degradeApplied !== false
    || !Array.isArray(report.targetResults)
  ) {
    fail(
      'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED',
      'availability report must be a clean L1 probe report'
    );
  }
}

function assertTargetResult(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    fail('E_PHASE13_L1_DEGRADE_RESULT_INVALID', 'target result must be an object');
  }
  const stageId = requireNonBlankString(
    row.stageId,
    'E_PHASE13_L1_DEGRADE_RESULT_INVALID',
    'stageId'
  );
  const targetId = requireNonBlankString(
    row.targetId,
    'E_PHASE13_L1_DEGRADE_RESULT_INVALID',
    'targetId'
  );
  const targetKind = requireNonBlankString(
    row.targetKind,
    'E_PHASE13_L1_DEGRADE_RESULT_INVALID',
    'targetKind'
  );
  if (row.status !== 'available' && row.status !== 'missing') {
    fail('E_PHASE13_L1_DEGRADE_RESULT_INVALID', 'target status must be known');
  }
  if (row.runtimeOpened !== false || row.skillInvocationAttempted !== false) {
    fail('E_PHASE13_L1_DEGRADE_RESULT_INVALID', 'target result must be policy-only');
  }
  return {
    stageId,
    targetId,
    targetKind,
    required: row.required === true,
    status: row.status
  };
}

function buildRequiredGap(row, operatorAction) {
  return {
    marker: 'SKILL_UNAVAILABLE',
    stageId: row.stageId,
    targetId: row.targetId,
    targetKind: row.targetKind,
    required: true,
    status: 'missing',
    operatorAction,
    claimedStageRan: false,
    fabricatedOutput: false
  };
}

function buildOptionalGap(row) {
  return {
    marker: 'OPTIONAL_SKILL_MISSING',
    stageId: row.stageId,
    targetId: row.targetId,
    targetKind: row.targetKind,
    required: false,
    status: 'missing',
    blocking: false,
    claimedStageRan: false,
    fabricatedOutput: false
  };
}

export function evaluateSkillAvailability(tableInput, registryInput) {
  const table = normalizeTable(tableInput);
  const registry = normalizeRegistry(registryInput);
  const seen = new Set();
  const targetResults = [];

  for (const stage of table.stages) {
    if (!stage || !Array.isArray(stage.targets)) {
      fail('E_PHASE13_L1_PROBE_TABLE_REQUIRED', 'each stage requires id and targets');
    }
    const stageId = requireNonBlankString(
      stage.stageId,
      'E_PHASE13_L1_PROBE_TABLE_REQUIRED',
      'stageId'
    );
    for (const target of stage.targets) {
      if (!target) {
        fail('E_PHASE13_L1_PROBE_TABLE_REQUIRED', 'each target requires targetId');
      }
      const targetId = requireNonBlankString(
        target.targetId,
        'E_PHASE13_L1_PROBE_TABLE_REQUIRED',
        'targetId'
      );
      const normalizedStage = { ...stage, stageId };
      const normalizedTarget = { ...target, targetId };
      const key = targetKey(stageId, targetId);
      if (seen.has(key)) {
        fail('E_PHASE13_L1_DUPLICATE_TARGET', `duplicate target ${key}`);
      }
      seen.add(key);
      targetResults.push(buildTargetResult(normalizedStage, normalizedTarget, registry));
    }
  }

  return {
    schemaVersion: 'phase13.l1-skill-availability-report.v1',
    phase: 13,
    layer: 'L1',
    artifact: 'skill-availability-report',
    policyOnly: true,
    runtimeOpened: false,
    skillInvocationAttempted: false,
    degradeApplied: false,
    generatedFrom: 'registry-injected',
    targetResults,
    vibeNamingStates: buildVibeNamingStates(registry),
    summary: buildSummary(targetResults)
  };
}

export function buildMissingSkillDegradeReport(availabilityReport, options = {}) {
  assertAvailabilityReport(availabilityReport);
  const operatorAction = typeof options.operatorAction === 'string'
    && options.operatorAction.trim() !== ''
    ? options.operatorAction.trim()
    : 'install-or-route-to-human';
  const seen = new Set();
  const requiredGaps = [];
  const optionalGaps = [];

  for (const rawRow of availabilityReport.targetResults) {
    const row = assertTargetResult(rawRow);
    const key = targetKey(row.stageId, row.targetId);
    if (seen.has(key)) {
      fail('E_PHASE13_L1_DEGRADE_DUPLICATE_RESULT', `duplicate result ${key}`);
    }
    seen.add(key);
    if (row.status !== 'missing') {
      continue;
    }
    if (row.required) {
      requiredGaps.push(buildRequiredGap(row, operatorAction));
    } else {
      optionalGaps.push(buildOptionalGap(row));
    }
  }

  return {
    schemaVersion: 'phase13.l1-missing-skill-degrade.v1',
    phase: 13,
    layer: 'L1',
    artifact: 'missing-skill-degrade-report',
    policyOnly: true,
    generatedFrom: 'availability-report',
    runtimeOpened: false,
    skillInvocationAttempted: false,
    providerAutomationInvoked: false,
    degradeApplied: requiredGaps.length > 0,
    blocking: requiredGaps.length > 0,
    requiredGaps,
    optionalGaps,
    summary: {
      requiredGapCount: requiredGaps.length,
      optionalGapCount: optionalGaps.length,
      totalGapCount: requiredGaps.length + optionalGaps.length
    }
  };
}
