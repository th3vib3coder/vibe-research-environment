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
