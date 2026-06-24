const CLOSED_CLOSEOUT_STATUSES = Object.freeze(new Set([
  'complete-operator-closure-go-recorded',
  'closed-operator-go-recorded'
]));

const REQUIRED_CLOSEOUTS = Object.freeze([
  ['wave10_1', 'E_PHASE10_MULTI_DOMAIN_WAVE10_1_CLOSEOUT_REQUIRED'],
  ['wave10_2', 'E_PHASE10_MULTI_DOMAIN_WAVE10_2_CLOSEOUT_REQUIRED'],
  ['wave10_3', 'E_PHASE10_MULTI_DOMAIN_WAVE10_3_CLOSEOUT_REQUIRED'],
  ['wave10_4', 'E_PHASE10_MULTI_DOMAIN_WAVE10_4_CLOSEOUT_REQUIRED']
]);

const METADATA_PROVENANCE_KINDS = Object.freeze(new Set([
  'adversarial-verdict',
  'gate-decision',
  'presentation',
  'query-result',
  'relay-verdict'
]));

const FORBIDDEN_WRITES = Object.freeze(new Set([
  'claim-edge',
  'claim-ledger',
  'domain-lifecycle',
  'provenance-link'
]));

const COMMIT_SHA = /^[a-f0-9]{40}$/u;

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSuccessfulCloseout(closeout) {
  return isObject(closeout)
    && CLOSED_CLOSEOUT_STATUSES.has(closeout.status)
    && typeof closeout.commit === 'string'
    && COMMIT_SHA.test(closeout.commit)
    && closeout.ciConclusion === 'success';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasTwoDomains(domainIds) {
  return new Set(normalizeArray(domainIds).filter((value) => typeof value === 'string')).size > 1;
}

function isOpenExportPackagingDeferral(deferral) {
  return !isObject(deferral) || deferral.status !== 'closed';
}

function validatePrerequisites(request, issues) {
  const closeouts = isObject(request.closeouts) ? request.closeouts : {};

  for (const [waveKey, code] of REQUIRED_CLOSEOUTS) {
    if (!hasSuccessfulCloseout(closeouts[waveKey])) {
      issue(
        issues,
        code,
        'Multi-domain behavior requires closed Wave 10 prerequisite evidence.',
        { waveKey }
      );
    }
  }

  if (request.schemaPresenceOnly === true) {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_SCHEMA_NOT_PERMISSION',
      'Schema presence is not permission to open multi-domain behavior.'
    );
  }

  if (request.classificationOnly !== true) {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_CLASSIFICATION_ONLY_REQUIRED',
      'T10.5.0 can only emit classification and future-task eligibility.'
    );
  }
}

function validateOperation(request, issues) {
  const operation = request.operation ?? 'gate-check';

  if (!['gate-check', 'merge', 'synthesis', 'query', 'export'].includes(operation)) {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_OPERATION_UNSUPPORTED',
      'Unknown multi-domain operation classification requested.',
      { operation }
    );
  }

  if (operation === 'merge' && request.nextTaskId !== 'T10.5.1') {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_MERGE_TASK_REQUIRED',
      'Cross-domain merge remains closed until an explicit T10.5.1 task.'
    );
  }

  if (operation === 'synthesis') {
    if (request.nextTaskId !== 'T10.5.1') {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_MERGE_TASK_REQUIRED',
        'Cross-domain synthesis depends on the future T10.5.1 merge task.'
      );
    }
    if (request.r2AuditedSynthesisPolicyPresent !== true) {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_SYNTHESIS_R2_REQUIRED',
        'Cross-domain synthesis requires an R2-audited synthesis policy.'
      );
    }
  }

  if (operation === 'query') {
    if (request.nextTaskId !== 'T10.5.2') {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_QUERY_TASK_REQUIRED',
        'Cross-domain query remains closed until an explicit T10.5.2 task.'
      );
    }
    if (request.mergePolicyPresent !== true) {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_QUERY_POLICY_REQUIRED',
        'Cross-domain query requires an explicit merge policy.'
      );
    }
    if (request.decisionUseRule === 'may-upgrade') {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_DECISION_USE_UPGRADE_FORBIDDEN',
        'Cross-domain query cannot upgrade decision-use classification.'
      );
    }
  }

  if (operation === 'export' && isOpenExportPackagingDeferral(request.exportPackagingDeferral)) {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_EXPORT_PACKAGING_DEFERRED',
      'Export packaging remains deferred by Wave 10.4 closeout.'
    );
  }
}

function validateForbiddenInputs(request, issues) {
  for (const ref of normalizeArray(request.law13ProvenanceRefs)) {
    if (METADATA_PROVENANCE_KINDS.has(ref?.kind)) {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_METADATA_NOT_PROVENANCE',
        'Metadata artifacts cannot be treated as LAW 13 provenance.',
        { kind: ref.kind }
      );
    }
  }

  for (const write of normalizeArray(request.requestedWrites)) {
    const kind = typeof write === 'string' ? write : write?.kind;
    if (FORBIDDEN_WRITES.has(kind)) {
      issue(
        issues,
        'E_PHASE10_MULTI_DOMAIN_WRITER_FORBIDDEN',
        'T10.5.0 cannot write provenance, claim, edge, or domain lifecycle state.',
        { kind }
      );
    }
  }

  if (
    request.authorizationToken
    || request.authorize === true
    || request.authorizationGranted === true
    || request.performOperation === true
  ) {
    issue(
      issues,
      'E_PHASE10_MULTI_DOMAIN_AUTHORIZATION_FORBIDDEN',
      'T10.5.0 cannot grant authorization or perform a multi-domain operation.'
    );
  }
}

export function evaluatePhase10MultiDomainGate(request = {}) {
  const normalizedRequest = isObject(request) ? request : {};
  const issues = [];

  validatePrerequisites(normalizedRequest, issues);
  validateOperation(normalizedRequest, issues);
  validateForbiddenInputs(normalizedRequest, issues);

  if (issues.length > 0) {
    return {
      ok: false,
      decision: 'blocked',
      eligibleForNextTask: false,
      authorizationGranted: false,
      performsOperation: false,
      issues
    };
  }

  if (!hasTwoDomains(normalizedRequest.domainIds)) {
    return {
      ok: true,
      decision: 'single-domain-no-multi-domain-opened',
      eligibleForNextTask: false,
      authorizationGranted: false,
      performsOperation: false,
      issues: []
    };
  }

  return {
    ok: true,
    decision: 'eligible-for-future-hat-task',
    eligibleForNextTask: true,
    authorizationGranted: false,
    performsOperation: false,
    issues: []
  };
}
