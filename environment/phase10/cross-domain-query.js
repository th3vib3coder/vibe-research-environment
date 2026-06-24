import {
  evaluatePhase10CrossDomainMerge
} from './cross-domain-merge.js';
import {
  evaluatePhase10MultiDomainGate
} from './multi-domain-gate.js';
import {
  computeQueryDecisionUse
} from './query-decision-use.js';

const METADATA_PROVENANCE_KINDS = Object.freeze(new Set([
  'adversarial-verdict',
  'gate-decision',
  'presentation',
  'previous-query-result',
  'query-output',
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

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function warning(warnings, code, message, extra = {}) {
  warnings.push({ code, message, ...extra });
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
    decision: issues.length === 0 ? 'query-boundary-ready' : 'blocked',
    persisted: false,
    authoritative: false,
    localBoundaryOnly: true,
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
  const text = `${ref?.path ?? ''} ${ref?.sourcePath ?? ''}`.toLowerCase();
  return [...METADATA_PROVENANCE_KINDS].some((metadataKind) => text.includes(metadataKind));
}

function validateDomainIds(domainIds, issues) {
  if (domainIds.length < 2) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_TWO_DOMAINS_REQUIRED',
      'Cross-domain query boundary requires at least two distinct domains.'
    );
  }
}

function validateGate(request, issues) {
  if (!isObject(request.gateRequest)) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_GATE_REQUIRED',
      'T10.5.2 requires a positive T10.5.0 query gate classification.'
    );
    return;
  }

  const gateResult = evaluatePhase10MultiDomainGate(request.gateRequest);
  if (
    gateResult.ok !== true
    || gateResult.eligibleForNextTask !== true
    || gateResult.authorizationGranted !== false
    || gateResult.performsOperation !== false
  ) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_GATE_REQUIRED',
      'T10.5.2 must consume a positive, classification-only T10.5.0 query gate.',
      { gateIssues: gateResult.issues ?? [] }
    );
  }
}

function validateMergePolicy(request, issues) {
  if (isObject(request.mergeRequest)) {
    const mergeResult = evaluatePhase10CrossDomainMerge(request.mergeRequest);
    if (
      mergeResult.ok === true
      && mergeResult.persisted === false
      && mergeResult.authoritative === false
      && mergeResult.localProposalOnly === true
      && mergeResult.authorizationGranted === false
      && mergeResult.performsWrite === false
    ) {
      return mergeResult.plan;
    }
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_POLICY_REQUIRED',
      'Cross-domain query requires accepted T10.5.1 merge/synthesis policy evidence.',
      { mergeIssues: mergeResult.issues ?? [] }
    );
    return null;
  }

  if (
    isObject(request.mergePolicyEvidence)
    && request.mergePolicyEvidence.accepted === true
    && request.mergePolicyEvidence.source === 'phase10-cross-domain-merge'
  ) {
    return {
      source: 'phase10-cross-domain-merge',
      evidenceId: request.mergePolicyEvidence.id ?? null
    };
  }

  issue(
    issues,
    'E_PHASE10_CROSS_DOMAIN_QUERY_POLICY_REQUIRED',
    'Cross-domain query requires T10.5.1 merge/synthesis policy evidence.'
  );
  return null;
}

function manifestIsStale(manifest, nowMs) {
  if (manifest?.stale === true) return true;
  const expiresAt = Date.parse(manifest?.expiresAt ?? '');
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

function hasVisibleStaleOverride(manifest) {
  return typeof manifest?.freshnessOverrideReason === 'string'
    && manifest.freshnessOverrideReason.trim().length > 0
    && manifest.freshnessCaveatVisible === true;
}

function validateManifests(request, domainIds, issues, warnings, flags) {
  const manifests = normalizeArray(request.manifests);
  const byDomain = new Map();
  for (const manifest of manifests) {
    if (typeof manifest?.domainId === 'string') {
      byDomain.set(manifest.domainId, manifest);
    }
  }

  const nowMs = Date.parse(request.now ?? new Date().toISOString());

  for (const domainId of domainIds) {
    const manifest = byDomain.get(domainId);
    if (!manifest) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_MANIFEST_REQUIRED',
        'Every participating domain requires a query manifest.',
        { domainId }
      );
      continue;
    }

    if (manifest.active === false) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_MANIFEST_INACTIVE',
        'Participating domain query manifests must be active.',
        { domainId }
      );
    }

    if (!manifestIsStale(manifest, nowMs)) {
      continue;
    }

    if (!manifest.freshnessOverrideReason) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_MANIFEST_STALE',
        'A stale manifest in any participating domain rejects by default.',
        { domainId }
      );
      continue;
    }

    if (!hasVisibleStaleOverride(manifest)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_STALE_CAVEAT_REQUIRED',
        'Stale overrides require an explicit reason and visible caveat.',
        { domainId }
      );
      continue;
    }

    flags.forceNotForDecision = true;
    warning(
      warnings,
      'W_PHASE10_CROSS_DOMAIN_QUERY_STALE_OVERRIDE_DOWNGRADED',
      'Stale override is visible; result is downgraded to not-for-decision.',
      { domainId }
    );
  }
}

function validateCoverage(request, domainIds, warnings, flags) {
  const expected = uniqueSortedStrings(request.coverage?.expectedDomainIds ?? domainIds);
  const covered = uniqueSortedStrings(request.coverage?.coveredDomainIds ?? domainIds);
  const missing = expected.filter((domainId) => !covered.includes(domainId));

  if (missing.length === 0) return;

  flags.forceNotForDecision = true;
  warning(
    warnings,
    'W_PHASE10_CROSS_DOMAIN_QUERY_INCOMPLETE_COVERAGE',
    'Incomplete cross-domain query coverage cannot be used for decisions.',
    { missingDomainIds: missing }
  );
}

function validateDecisionUseDeclaration(request, issues) {
  if (
    request.decisionUse != null
    || request.requestedDecisionUse != null
    || request.requestedDecisionUseClassification != null
  ) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_DECISION_USE_DECLARED',
      'Cross-domain query decision-use is computed and cannot be caller-declared.'
    );
  }
}

function computeBoundaryDecisionUse(request, issues, flags) {
  let decisionUse;
  try {
    decisionUse = computeQueryDecisionUse({
      queryClass: request.queryClass ?? 'lookup',
      status: request.status ?? 'complete',
      reportScope: request.reportScope,
      r2Audit: request.r2Audit,
      qualityGates: request.qualityGates,
      computedAt: request.computedAt
    });
  } catch (error) {
    issue(
      issues,
      error?.code ?? 'E_PHASE10_CROSS_DOMAIN_QUERY_DECISION_USE_INVALID',
      error?.message ?? 'Invalid cross-domain query decision-use input.'
    );
    return {
      classification: 'not-for-decision',
      computedBy: 'phase10-cross-domain-query',
      computedAt: request.computedAt
    };
  }

  if (flags.forceNotForDecision) {
    return {
      ...decisionUse,
      classification: 'not-for-decision'
    };
  }

  return decisionUse;
}

function validateProvenance(request, issues) {
  for (const ref of normalizeArray(request.law13ProvenanceRefs)) {
    if (refLooksLikeMetadata(ref)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_METADATA_NOT_PROVENANCE',
        'Metadata artifacts cannot be treated as LAW 13 provenance.',
        { refId: ref?.id, kind: refKind(ref) }
      );
    }
  }
}

function validateForbiddenScope(request, issues) {
  if (request.exportRequested === true || request.exportProfile != null) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_EXPORT_FORBIDDEN',
      'Cross-domain query export requires a future accepted export profile.'
    );
  }

  for (const write of normalizeArray(request.requestedWrites)) {
    const kind = typeof write === 'string' ? write : write?.kind;
    if (FORBIDDEN_WRITES.has(kind)) {
      issue(
        issues,
        'E_PHASE10_CROSS_DOMAIN_QUERY_WRITER_FORBIDDEN',
        'T10.5.2 cannot write query, wiki, provenance, claim, domain, presentation, or export state.',
        { kind }
      );
    }
  }

  if (request.cliVerb) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_CLI_FORBIDDEN',
      'T10.5.2 does not add a CLI verb.'
    );
  }

  if (request.outputPath) {
    issue(
      issues,
      'E_PHASE10_CROSS_DOMAIN_QUERY_OUTPUT_PATH_FORBIDDEN',
      'T10.5.2 cannot write filesystem output paths.'
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
      'E_PHASE10_CROSS_DOMAIN_QUERY_AUTHORIZATION_FORBIDDEN',
      'T10.5.2 boundaries cannot grant authorization, perform operations, or write.'
    );
  }
}

function buildBoundary(request, domainIds, decisionUse, mergePlan) {
  const manifestDomainIds = uniqueSortedStrings(
    normalizeArray(request.manifests).map((manifest) => manifest?.domainId)
  );
  const queryArtifactIds = uniqueSortedStrings(
    normalizeArray(request.queryArtifacts).map((artifact) => artifact?.id)
  );

  return {
    domainIds,
    manifestDomainIds,
    queryArtifactIds,
    mergePolicy: {
      consumed: true,
      source: 'phase10-cross-domain-merge',
      operation: mergePlan?.operation ?? 'merge'
    },
    decisionUse,
    persisted: false,
    authoritative: false,
    localBoundaryOnly: true,
    authorizationGranted: false
  };
}

export function evaluatePhase10CrossDomainQuery(request = {}) {
  const normalizedRequest = isObject(request) ? request : {};
  const domainIds = uniqueSortedStrings(normalizedRequest.domainIds);
  const issues = [];
  const warnings = [];
  const flags = { forceNotForDecision: false };

  validateDomainIds(domainIds, issues);
  validateGate(normalizedRequest, issues);
  const mergePlan = validateMergePolicy(normalizedRequest, issues);
  validateManifests(normalizedRequest, domainIds, issues, warnings, flags);
  validateCoverage(normalizedRequest, domainIds, warnings, flags);
  validateDecisionUseDeclaration(normalizedRequest, issues);
  const decisionUse = computeBoundaryDecisionUse(normalizedRequest, issues, flags);
  validateProvenance(normalizedRequest, issues);
  validateForbiddenScope(normalizedRequest, issues);

  if (issues.length > 0) {
    return {
      ...baseResult(issues, warnings),
      decision: 'blocked',
      boundary: null
    };
  }

  return {
    ...baseResult([], warnings),
    boundary: buildBoundary(normalizedRequest, domainIds, decisionUse, mergePlan)
  };
}
