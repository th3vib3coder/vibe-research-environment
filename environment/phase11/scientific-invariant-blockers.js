import {
  evaluateScientificDerivationHarness
} from './scientific-derivation-harness.js';

export const SCIENTIFIC_INVARIANT_REASON_CODES = Object.freeze({
  harnessNotReady: 'harness_not_ready',
  citationKilled: 'citation_killed',
  citationUnverified: 'citation_unverified',
  r2Required: 'r2_required',
  r2NotAccepted: 'r2_not_accepted',
  dependencyBlocked: 'dependency_blocked'
});

const SCIENCE_TEXT_PATTERNS = Object.freeze([
  /biomedical/iu,
  /cxcl13/iu,
  /cd8/iu,
  /confounder/iu,
  /derivation harness/iu,
  /endometriosis/iu,
  /gse184880/iu,
  /hgsoc/iu,
  /law\s*9/iu,
  /ovarian/iu,
  /single[-\s]?cell/iu,
  /scrna/iu
]);

const KILLED_CITATION_STATUSES = new Set([
  'citation-invalidated',
  'invalid',
  'invalidated',
  'killed',
  'retracted',
  'withdrawn'
]);

const BLOCKED_DEPENDENCY_STATUSES = new Set([
  'blocked',
  'failed',
  'missing',
  'open',
  'rejected',
  'unknown'
]);

const STRUCTURAL_SCIENCE_VALUES = Object.freeze([
  'analysis-derived-result',
  'analysis-output',
  'assay-result',
  'conditioned-result',
  'derived-result',
  'law9-harness',
  'quantitative-output',
  'quantitative-result',
  'reviewed-derivation',
  'scientific-output'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addIssue(issues, code, reason, message, pathValue = null, extra = {}) {
  issues.push({ code, reason, message, path: pathValue, ...extra });
}

function normalizedStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function textMatchesScience(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  return SCIENCE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeStructuralValue(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replaceAll('_', '-')
    : '';
}

function structuralValueSignalsScience(value) {
  const normalized = normalizeStructuralValue(value);
  if (normalized === '') {
    return false;
  }

  return STRUCTURAL_SCIENCE_VALUES.some((signal) => normalized.includes(signal));
}

function objectHasStructuralScienceSignal(value, seen = new Set()) {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => objectHasStructuralScienceSignal(entry, seen));
  }

  for (const [key, entry] of Object.entries(value)) {
    if (structuralValueSignalsScience(key) || structuralValueSignalsScience(entry)) {
      return true;
    }

    if (entry != null && typeof entry === 'object'
      && objectHasStructuralScienceSignal(entry, seen)) {
      return true;
    }
  }

  return false;
}

function hasStructuralScientificLineage(claim) {
  if (claim == null || typeof claim !== 'object') {
    return false;
  }

  const metadata = claim.claimMetadata;
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }

  return [
    metadata.analysisLineage,
    metadata.scientificLineage,
    metadata.derivationLineage,
    metadata.evidenceClass,
    metadata.resultKind,
    metadata.outputKind
  ].some((value) => objectHasStructuralScienceSignal(value));
}

function collectClaimText(claim) {
  if (claim == null || typeof claim !== 'object') {
    return '';
  }

  return [
    claim.target,
    claim.title,
    claim.question,
    claim.summary,
    claim.claimText,
    claim.text,
    claim.claimMetadata == null ? '' : JSON.stringify(claim.claimMetadata)
  ].filter((value) => typeof value === 'string').join(' ');
}

function hasScientificSubstance(input) {
  const claim = input?.claim ?? {};
  if (
    input?.scientific === true
    || input?.requiresScientificInvariantEvidence === true
    || input?.r2Required === true
    || claim.scientific === true
    || claim.requiresScientificInvariantEvidence === true
  ) {
    return true;
  }

  if (
    input?.derivationHarness != null
    || input?.scientificDerivationHarness != null
    || input?.derivationHarnessResult != null
    || input?.scientificDerivationHarnessResult != null
    || input?.law9Harness != null
  ) {
    return true;
  }

  if (hasStructuralScientificLineage(claim)) {
    return true;
  }

  return textMatchesScience(collectClaimText(claim));
}

function resolveHarnessResult(input) {
  if (input?.derivationHarnessResult != null) {
    return clone(input.derivationHarnessResult);
  }

  if (input?.scientificDerivationHarnessResult != null) {
    return clone(input.scientificDerivationHarnessResult);
  }

  const harness = input?.derivationHarness ?? input?.scientificDerivationHarness;
  if (harness != null) {
    return evaluateScientificDerivationHarness(harness);
  }

  return null;
}

function validateHarness(input, issues) {
  const result = resolveHarnessResult(input);
  if (result?.ok === true && result.readyForQuantitativeRun === true) {
    return clone(result);
  }

  addIssue(
    issues,
    'E_PHASE11_SCIENCE_HARNESS_NOT_READY',
    SCIENTIFIC_INVARIANT_REASON_CODES.harnessNotReady,
    'Scientific claim/export readiness requires a ready T11.1.0 harness.',
    'derivationHarness',
    { harnessResult: clone(result) }
  );
  return clone(result);
}

function citationLifecycleStatus(citation) {
  return [
    citation?.lifecycleStatus,
    citation?.citationStatus,
    citation?.status,
    citation?.reviewStatus
  ].map(normalizedStatus).find((status) => status !== '') ?? '';
}

function validateCitations(input, issues) {
  const citations = asArray(input?.citations ?? input?.citationChecks);
  for (const [index, citation] of citations.entries()) {
    const lifecycleStatus = citationLifecycleStatus(citation);
    if (KILLED_CITATION_STATUSES.has(lifecycleStatus)) {
      addIssue(
        issues,
        'E_PHASE11_SCIENCE_CITATION_KILLED',
        SCIENTIFIC_INVARIANT_REASON_CODES.citationKilled,
        'Killed, invalidated, retracted, or withdrawn citations cannot support scientific export.',
        `citations.${index}`,
        { citationId: citation?.citationId ?? null, lifecycleStatus }
      );
    }

    if (citation?.verificationStatus !== 'VERIFIED') {
      addIssue(
        issues,
        'E_PHASE11_SCIENCE_CITATION_UNVERIFIED',
        SCIENTIFIC_INVARIANT_REASON_CODES.citationUnverified,
        'Scientific export requires verified citations.',
        `citations.${index}`,
        {
          citationId: citation?.citationId ?? null,
          verificationStatus: citation?.verificationStatus ?? null
        }
      );
    }
  }
}

function r2Required(input, scientificClaim) {
  if (input?.r2Required === true) return true;
  if (input?.r2Required === false) return false;
  return scientificClaim
    && (input?.operation === 'export' || input?.operation === 'claim-readiness');
}

function validateR2(input, issues, scientificClaim) {
  if (!r2Required(input, scientificClaim)) {
    return;
  }

  const audit = input?.r2Audit ?? input?.r2Review;
  if (audit == null) {
    addIssue(
      issues,
      'E_PHASE11_SCIENCE_R2_REQUIRED',
      SCIENTIFIC_INVARIANT_REASON_CODES.r2Required,
      'Scientific claim/export readiness requires R2 audit metadata.',
      'r2Audit'
    );
    return;
  }

  if (audit.status !== 'passed' || audit.verdict !== 'ACCEPT') {
    addIssue(
      issues,
      'E_PHASE11_SCIENCE_R2_NOT_ACCEPTED',
      SCIENTIFIC_INVARIANT_REASON_CODES.r2NotAccepted,
      'Scientific claim/export readiness requires status:passed and verdict:ACCEPT.',
      'r2Audit',
      { status: audit.status ?? null, verdict: audit.verdict ?? null }
    );
  }
}

function dependencyStatus(dependency) {
  if (dependency?.blocked === true || dependency?.ok === false) {
    return 'blocked';
  }

  return [
    dependency?.status,
    dependency?.rawStatus,
    dependency?.state,
    dependency?.decision
  ].map(normalizedStatus).find((status) => status !== '') ?? 'unknown';
}

function dependencyChildren(dependency) {
  return [
    ...asArray(dependency?.dependencies),
    ...asArray(dependency?.dependencyStates),
    ...asArray(dependency?.blockedDependencies)
  ];
}

function validateDependency(dependency, issues, pathValue, seen) {
  const dependencyId = dependency?.dependencyId
    ?? dependency?.claimId
    ?? dependency?.taskId
    ?? pathValue;
  const seenKey = `${pathValue}:${dependencyId}`;
  if (seen.has(seenKey)) return;
  seen.add(seenKey);

  const status = dependencyStatus(dependency);
  if (BLOCKED_DEPENDENCY_STATUSES.has(status)) {
    addIssue(
      issues,
      'E_PHASE11_SCIENCE_DEPENDENCY_BLOCKED',
      SCIENTIFIC_INVARIANT_REASON_CODES.dependencyBlocked,
      'Blocked, open, missing, failed, or rejected dependencies block scientific readiness.',
      pathValue,
      { dependencyId, status }
    );
  }

  for (const [index, child] of dependencyChildren(dependency).entries()) {
    validateDependency(child, issues, `${pathValue}.dependencies.${index}`, seen);
  }
}

function validateDependencies(input, issues) {
  const seen = new Set();
  for (const [index, dependency] of asArray(input?.dependencies).entries()) {
    validateDependency(dependency, issues, `dependencies.${index}`, seen);
  }
}

function uniqueReasons(issues) {
  return [...new Set(issues.map((issue) => issue.reason))];
}

export function evaluateScientificInvariantBlockers(input = {}) {
  const issues = [];
  const scientificClaim = hasScientificSubstance(input);
  let harnessResult = null;

  if (!scientificClaim) {
    return {
      ok: true,
      scientificClaim: false,
      claimReady: false,
      exportEligible: false,
      reasons: [],
      harnessResult: null,
      promotesClaim: false,
      computesFraction: false,
      performsRealDataAnalysis: false,
      issues: []
    };
  }

  if (scientificClaim) {
    harnessResult = validateHarness(input, issues);
  }

  validateCitations(input, issues);
  validateR2(input, issues, scientificClaim);
  validateDependencies(input, issues);

  const ok = issues.length === 0;
  return {
    ok,
    scientificClaim,
    claimReady: ok && scientificClaim,
    exportEligible: ok && scientificClaim,
    reasons: uniqueReasons(issues),
    harnessResult,
    promotesClaim: false,
    computesFraction: false,
    performsRealDataAnalysis: false,
    issues
  };
}
