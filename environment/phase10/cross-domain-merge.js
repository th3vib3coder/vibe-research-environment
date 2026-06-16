import {
  evaluatePhase10MultiDomainGate
} from './multi-domain-gate.js';

const METADATA_PROVENANCE_KINDS = Object.freeze(new Set([
  'gate-decision',
  'presentation',
  'query-result',
  'relay-verdict'
]));

const FORBIDDEN_WRITES = Object.freeze(new Set([
  'claim-edge',
  'claim-ledger',
  'domain-lifecycle',
  'export-package',
  'filesystem',
  'presentation',
  'provenance-link',
  'query-record',
  'wiki-page'
]));

const DECISION_USE_RANKS = Object.freeze({
  'exploratory': 0,
  'hypothesis-generating': 1,
  'research-only': 2,
  'decision-support': 3,
  'decision-grade': 4
});

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSortedStrings(value) {
  return [...new Set(normalizeArray(value).filter((item) => typeof item === 'string'))].sort();
}

function baseResult(issues = [], warnings = []) {
  return {
    ok: issues.length === 0,
    decision: issues.length === 0 ? 'ready' : 'blocked',
    persisted: false,
    authoritative: false,
    localProposalOnly: true,
    authorizationGranted: false,
    performsOperation: false,
    performsWrite: false,
    issues,
    warnings
  };
}

function refKind(ref) {
  if (!isObject(ref)) return undefined;
  return ref.kind ?? ref.type ?? ref.targetRef?.type;
}

function refLooksLikeMetadata(ref) {
  const kind = refKind(ref);
  if (METADATA_PROVENANCE_KINDS.has(kind)) {
    return true;
  }
  const pathText = `${ref?.path ?? ''} ${ref?.sourcePath ?? ''}`.toLowerCase();
  return [...METADATA_PROVENANCE_KINDS].some((metadataKind) => pathText.includes(metadataKind));
}

function validateGate(request, operation, domainIds, issues) {
  if (!isObject(request.gateRequest)) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_GATE_REQUIRED',
      'T10.5.1 requires a positive T10.5.0 gate classification.'
    );
    return;
  }

  const gateResult = evaluatePhase10MultiDomainGate({
    ...request.gateRequest,
    operation,
    nextTaskId: 'T10.5.1',
    domainIds,
    r2AuditedSynthesisPolicyPresent: request.r2AuditedSynthesisPolicyPresent
  });

  if (
    gateResult.ok !== true
    || gateResult.eligibleForNextTask !== true
    || gateResult.authorizationGranted !== false
    || gateResult.performsOperation !== false
  ) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_GATE_REQUIRED',
      'T10.5.1 must consume a positive, classification-only T10.5.0 gate result.',
      { gateIssues: gateResult.issues ?? [] }
    );
  }
}

function validateOperation(operation, issues) {
  if (operation === 'query') {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_SCOPE_FORBIDDEN',
      'Cross-domain query remains T10.5.2 scope.'
    );
    return;
  }
  if (operation === 'export') {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_EXPORT_SCOPE_FORBIDDEN',
      'Cross-domain export remains outside T10.5.1 scope.'
    );
    return;
  }
  if (!['merge', 'synthesis'].includes(operation)) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_OPERATION_UNSUPPORTED',
      'T10.5.1 supports only merge or synthesis planning.',
      { operation }
    );
  }
}

function validateDomainCoverage(request, domainIds, issues, warnings) {
  if (domainIds.length < 2) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_TWO_DOMAINS_REQUIRED',
      'Cross-domain merge/synthesis requires at least two distinct domains.'
    );
  }

  const expected = uniqueSortedStrings(request.coverage?.expectedDomainIds ?? domainIds);
  const covered = uniqueSortedStrings(request.coverage?.coveredDomainIds ?? domainIds);
  const missing = expected.filter((domainId) => !covered.includes(domainId));

  if (missing.length > 0) {
    warnings.push({
      code: 'W_PHASE10_CROSS_DOMAIN_INCOMPLETE_COVERAGE',
      message: 'Some expected domains are not covered by the proposed plan.',
      missingDomainIds: missing
    });
    if (request.requestedDecisionUse === 'decision-grade') {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_INCOMPLETE_COVERAGE_DECISION_GRADE_FORBIDDEN',
        'Incomplete cross-domain coverage cannot produce decision-grade output.',
        { missingDomainIds: missing }
      );
    }
  }
}

function validateSources(request, issues) {
  const references = [];
  const assertions = normalizeArray(request.assertions);
  const evidenceRefs = normalizeArray(request.evidenceRefs);

  if (assertions.length === 0 && evidenceRefs.length === 0) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_CONTENT_REQUIRED',
      'Cross-domain merge/synthesis planning requires at least one assertion or evidence reference.'
    );
  }

  for (const assertion of assertions) {
    const sourceRefs = normalizeArray(assertion?.sourceRefs);
    if (sourceRefs.length === 0) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_SOURCE_RERESOLUTION_REQUIRED',
        'Every merged assertion requires re-resolved original source references.',
        { assertionId: assertion?.id }
      );
    }
    references.push(...sourceRefs.map((ref) => ({ ref, assertionId: assertion?.id })));
  }

  for (const ref of evidenceRefs) {
    references.push({ ref, assertionId: undefined });
  }

  for (const { ref, assertionId } of references) {
    if (!isObject(ref) || ref.reResolvedOriginalSource !== true) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_SOURCE_RERESOLUTION_REQUIRED',
        'Every merged evidence reference must be re-resolved to an original source.',
        { assertionId, refId: ref?.id }
      );
    }
    if (refLooksLikeMetadata(ref)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_METADATA_NOT_PROVENANCE',
        'Metadata artifacts cannot be treated as LAW 13 provenance.',
        { assertionId, refId: ref?.id, kind: refKind(ref) }
      );
    }
  }
}

function hasStaleOrConflictRelation(relation) {
  return relation?.stale === true
    || relation?.superseded === true
    || relation?.retracted === true
    || relation?.refuted === true
    || relation?.contradicts === true;
}

function validatePolicies(request, operation, issues) {
  const conflicts = normalizeArray(request.conflicts);
  if (conflicts.length > 0 && !isObject(request.conflictPolicy)) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_CONFLICT_POLICY_REQUIRED',
      'Contradictory cross-domain relations require an explicit conflict policy.'
    );
  }

  for (const relation of normalizeArray(request.claimEdgeRelations)) {
    if (hasStaleOrConflictRelation(relation) && !isObject(request.staleRelationPolicy)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_STALE_RELATION_POLICY_REQUIRED',
        'Stale, superseded, retracted, or contradicted claim-edge relations need explicit handling.',
        { relationId: relation?.id }
      );
    }
  }

  if (operation === 'synthesis' && request.r2AuditedSynthesisPolicyPresent !== true) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_R2_SYNTHESIS_REQUIRED',
      'Cross-domain synthesis requires an R2-audited synthesis policy.'
    );
  }
}

function rankDecisionUse(value) {
  return DECISION_USE_RANKS[value] ?? 0;
}

function validateDecisionUse(request, issues) {
  const requestedRank = rankDecisionUse(request.requestedDecisionUse);
  const inputRanks = normalizeArray(request.inputDecisionUseClassifications).map(rankDecisionUse);
  const ceiling = inputRanks.length > 0 ? Math.min(...inputRanks) : requestedRank;

  if (requestedRank > ceiling) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_DECISION_USE_UPGRADE_FORBIDDEN',
      'Cross-domain merge/synthesis can keep or downgrade decision-use only.',
      { requestedDecisionUse: request.requestedDecisionUse }
    );
  }
}

function validateForbiddenScope(request, issues) {
  for (const write of normalizeArray(request.requestedWrites)) {
    const kind = typeof write === 'string' ? write : write?.kind;
    if (FORBIDDEN_WRITES.has(kind)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_WRITER_FORBIDDEN',
        'T10.5.1 cannot write claim, provenance, domain, wiki, query, presentation, or export state.',
        { kind }
      );
    }
  }

  if (request.cliVerb) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_CLI_FORBIDDEN',
      'T10.5.1 does not add a CLI verb.'
    );
  }

  if (request.outputPath) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_OUTPUT_PATH_FORBIDDEN',
      'T10.5.1 cannot write filesystem output paths.'
    );
  }

  if (
    request.authorizationToken
    || request.authorizationGranted === true
    || request.performOperation === true
    || request.performsWrite === true
  ) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_AUTHORIZATION_FORBIDDEN',
      'T10.5.1 plans cannot grant authorization, perform operations, or write.'
    );
  }
}

function buildPlan(request, operation, domainIds) {
  const assertionIds = normalizeArray(request.assertions)
    .map((assertion) => assertion?.id)
    .filter((id) => typeof id === 'string')
    .sort();
  const evidenceRefIds = normalizeArray(request.evidenceRefs)
    .map((ref) => ref?.id)
    .filter((id) => typeof id === 'string')
    .sort();
  const relationIds = normalizeArray(request.claimEdgeRelations)
    .map((relation) => relation?.id)
    .filter((id) => typeof id === 'string')
    .sort();

  return {
    operation,
    domainIds,
    assertionIds,
    evidenceRefIds,
    relationIds,
    requestedDecisionUse: request.requestedDecisionUse ?? 'research-only',
    r2AuditedSynthesisPolicyPresent: request.r2AuditedSynthesisPolicyPresent === true,
    persisted: false,
    authoritative: false,
    localProposalOnly: true
  };
}

export function evaluatePhase10CrossDomainMerge(request = {}) {
  const normalizedRequest = isObject(request) ? request : {};
  const operation = normalizedRequest.operation ?? 'merge';
  const domainIds = uniqueSortedStrings(normalizedRequest.domainIds);
  const issues = [];
  const warnings = [];

  validateOperation(operation, issues);
  validateGate(normalizedRequest, operation, domainIds, issues);
  validateDomainCoverage(normalizedRequest, domainIds, issues, warnings);
  validateSources(normalizedRequest, issues);
  validatePolicies(normalizedRequest, operation, issues);
  validateDecisionUse(normalizedRequest, issues);
  validateForbiddenScope(normalizedRequest, issues);

  if (issues.length > 0) {
    return {
      ...baseResult(issues, warnings),
      decision: 'blocked',
      plan: null
    };
  }

  const plan = buildPlan(normalizedRequest, operation, domainIds);
  return {
    ...baseResult([], warnings),
    decision: operation === 'synthesis' ? 'synthesis-plan-ready' : 'merge-plan-ready',
    plan
  };
}
