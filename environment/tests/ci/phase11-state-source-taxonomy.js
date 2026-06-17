import { assert, isDirectRun, readJson, runValidator } from './_helpers.js';

const REQUIRED_SOURCE_IDS = Object.freeze([
  'decision-gates-json',
  'git-and-github-actions',
  'phase11-feature-ledger',
  'phase9-feature-ledger',
  'wiki-curated-pages',
  'wiki-generated-registries',
  'wiki-mirror',
  'wiki-coverage-inventories',
  'ci-run-all',
  'ci-validate-counts',
  'scratch-tmp-vre',
  'scratch-tmp',
  'scratch-analysis',
  'scratch-audit-config',
  'scratch-audit',
  'scratch-nested-vibe-science',
  'research-loop-governance-flake'
]);

const RESEARCH_SCRATCH_IDS = Object.freeze(new Set([
  'scratch-analysis',
  'scratch-audit-config',
  'scratch-audit',
  'scratch-nested-vibe-science'
]));

const REQUIRED_DOWNSTREAM_BINDINGS = Object.freeze([
  'T11.2.1',
  'T11.2.2'
]);

const REQUIRED_DOWNSTREAM_RULES = Object.freeze([
  'cleanupPolicy',
  'authority-not-regenerated',
  'projection-generator-and-check'
]);

const REQUIRED_FOLLOW_UP = 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001';

export const PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES = Object.freeze({
  invalidSchemaVersion: 'E_PHASE11_STATE_SOURCE_TAXONOMY_SCHEMA_VERSION',
  wrongPhase: 'E_PHASE11_STATE_SOURCE_TAXONOMY_WRONG_PHASE',
  wrongWave: 'E_PHASE11_STATE_SOURCE_TAXONOMY_WRONG_WAVE',
  requiredSourceMissing: 'E_PHASE11_STATE_SOURCE_REQUIRED_MISSING',
  sourceFieldMissing: 'E_PHASE11_STATE_SOURCE_FIELD_MISSING',
  authorityOwnerMissing: 'E_PHASE11_STATE_AUTHORITY_OWNER_MISSING',
  authorityCheckMissing: 'E_PHASE11_STATE_AUTHORITY_CHECK_MISSING',
  authorityRegenerationAllowed: 'E_PHASE11_STATE_AUTHORITY_REGENERATION_ALLOWED',
  projectionGeneratorMissing: 'E_PHASE11_STATE_PROJECTION_GENERATOR_MISSING',
  projectionCheckMissing: 'E_PHASE11_STATE_PROJECTION_CHECK_MISSING',
  projectionSourceMissing: 'E_PHASE11_STATE_PROJECTION_SOURCE_MISSING',
  runtimeLedgerAppendOnlyMissing: 'E_PHASE11_STATE_LEDGER_APPEND_ONLY_MISSING',
  runtimeLedgerValidatorMissing: 'E_PHASE11_STATE_LEDGER_VALIDATOR_MISSING',
  ciCheckMissing: 'E_PHASE11_STATE_CI_CHECK_MISSING',
  scratchCleanupPolicyMissing: 'E_PHASE11_STATE_SCRATCH_CLEANUP_POLICY_MISSING',
  scratchCleanupOwnerMissing: 'E_PHASE11_STATE_SCRATCH_CLEANUP_OWNER_MISSING',
  researchScratchAutoDelete: 'E_PHASE11_STATE_RESEARCH_SCRATCH_AUTO_DELETE',
  followUpMissing: 'E_PHASE11_STATE_FOLLOW_UP_MISSING',
  stateRiskTreatmentMissing: 'E_PHASE11_STATE_RISK_TREATMENT_MISSING',
  downstreamBindingMissing: 'E_PHASE11_STATE_DOWNSTREAM_BINDING_MISSING',
  downstreamRuleMissing: 'E_PHASE11_STATE_DOWNSTREAM_RULE_MISSING'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function hasRule(binding, rule) {
  return Array.isArray(binding?.mustConsume) && binding.mustConsume.includes(rule);
}

function isResearchScratch(source) {
  return RESEARCH_SCRATCH_IDS.has(source.id)
    || source.path === 'analysis/'
    || source.path === 'audit.config.yaml'
    || source.path === 'audit/'
    || source.path === 'vibe-science/';
}

function validateCommonSourceFields(source, issues) {
  for (const field of ['id', 'kind', 'path']) {
    if (!hasText(source?.[field])) {
      issues.push(issue(
        PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.sourceFieldMissing,
        { sourceId: source?.id, field }
      ));
    }
  }
}

function validateAuthority(source, issues) {
  if (!hasText(source.owner)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.authorityOwnerMissing,
      { sourceId: source.id }
    ));
  }
  if (!hasText(source.checkCommand)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.authorityCheckMissing,
      { sourceId: source.id }
    ));
  }
  if (source.regenerationAllowed !== false) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.authorityRegenerationAllowed,
      { sourceId: source.id }
    ));
  }
}

function validateProjection(source, issues) {
  if (!hasText(source.generatorCommand)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.projectionGeneratorMissing,
      { sourceId: source.id }
    ));
  }
  if (!hasText(source.checkCommand)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.projectionCheckMissing,
      { sourceId: source.id }
    ));
  }
  if (!hasText(source.sourceAuthority)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.projectionSourceMissing,
      { sourceId: source.id }
    ));
  }
}

function validateRuntimeLedger(source, issues) {
  if (!hasText(source.appendOnlyPolicy)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.runtimeLedgerAppendOnlyMissing,
      { sourceId: source.id }
    ));
  }
  if (!hasText(source.owningValidator)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.runtimeLedgerValidatorMissing,
      { sourceId: source.id }
    ));
  }
}

function validateScratchNoise(source, issues) {
  if (!hasText(source.cleanupPolicy)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.scratchCleanupPolicyMissing,
      { sourceId: source.id }
    ));
  }

  if (source.cleanupEligible === true && !hasText(source.cleanupOwner)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.scratchCleanupOwnerMissing,
      { sourceId: source.id }
    ));
  }

  if (
    isResearchScratch(source)
    && (source.cleanupEligible === true || source.cleanupPolicy !== 'never-auto-delete')
  ) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.researchScratchAutoDelete,
      { sourceId: source.id }
    ));
  }
}

function validateStateRisk(source, issues) {
  if (!hasText(source.requiredTreatment)) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.stateRiskTreatmentMissing,
      { sourceId: source.id }
    ));
  }
}

export function validateStateSourceTaxonomy(taxonomy) {
  const issues = [];

  if (taxonomy?.schemaVersion !== 'phase11.state-source-taxonomy.v1') {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.invalidSchemaVersion
    ));
  }
  if (taxonomy?.phase !== 11) {
    issues.push(issue(PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.wrongPhase));
  }
  if (taxonomy?.wave !== '11.2') {
    issues.push(issue(PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.wrongWave));
  }

  const sources = Array.isArray(taxonomy?.sources) ? taxonomy.sources : [];
  const byId = new Map(sources.map((source) => [source.id, source]));

  for (const sourceId of REQUIRED_SOURCE_IDS) {
    if (!byId.has(sourceId)) {
      issues.push(issue(
        PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.requiredSourceMissing,
        { sourceId }
      ));
    }
  }

  for (const source of sources) {
    validateCommonSourceFields(source, issues);

    if (source.kind === 'authority') {
      validateAuthority(source, issues);
    } else if (source.kind === 'projection') {
      validateProjection(source, issues);
    } else if (source.kind === 'runtime-ledger') {
      validateRuntimeLedger(source, issues);
    } else if (source.kind === 'ci-enforcement') {
      if (!hasText(source.checkCommand)) {
        issues.push(issue(
          PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.ciCheckMissing,
          { sourceId: source.id }
        ));
      }
    } else if (source.kind === 'scratch-noise') {
      validateScratchNoise(source, issues);
    } else if (source.kind === 'state-risk') {
      validateStateRisk(source, issues);
    }
  }

  const followUp = sources.find((source) => source.followUpId === REQUIRED_FOLLOW_UP);
  if (followUp == null) {
    issues.push(issue(
      PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.followUpMissing,
      { followUpId: REQUIRED_FOLLOW_UP }
    ));
  }

  const downstreamBindings = Array.isArray(taxonomy?.downstreamBindings)
    ? taxonomy.downstreamBindings
    : [];
  const bindingByTask = new Map(downstreamBindings.map((binding) => [
    binding.taskId,
    binding
  ]));

  for (const taskId of REQUIRED_DOWNSTREAM_BINDINGS) {
    const binding = bindingByTask.get(taskId);
    if (binding == null) {
      issues.push(issue(
        PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.downstreamBindingMissing,
        { taskId }
      ));
      continue;
    }
    for (const rule of REQUIRED_DOWNSTREAM_RULES) {
      if (!hasRule(binding, rule)) {
        issues.push(issue(
          PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.downstreamRuleMissing,
          { taskId, rule }
        ));
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    authorityCount: sources.filter((source) => source.kind === 'authority').length,
    projectionCount: sources.filter((source) => source.kind === 'projection').length,
    scratchCount: sources.filter((source) => source.kind === 'scratch-noise').length
  };
}

export default async function validatePhase11StateSourceTaxonomy() {
  const taxonomy = await readJson('environment/tests/fixtures/phase11/state-source-taxonomy.json');
  const result = validateStateSourceTaxonomy(taxonomy);

  assert(result.ok, `State-source taxonomy failed: ${JSON.stringify(result.issues)}`);
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-state-source-taxonomy', validatePhase11StateSourceTaxonomy);
}
