export const COMPUTED_BY = 'phase10-query-decision-use';

export const QUERY_CLASSES = Object.freeze([
  'lookup',
  'evidence-summary',
  'decision-support',
  'contradiction-audit',
  'report-generation'
]);

export const QUERY_STATUSES = Object.freeze([
  'complete',
  'incomplete',
  'failed'
]);

export const INFORMATIONAL_REPORT_SCOPES = Object.freeze([
  'domain-summary',
  'recent-week',
  'inbox-status'
]);

export const EVIDENCE_SUPPORT_REPORT_SCOPES = Object.freeze([
  'claim-status-overview',
  'single-objective'
]);

const QUERY_CLASS_SET = new Set(QUERY_CLASSES);
const QUERY_STATUS_SET = new Set(QUERY_STATUSES);
const INFORMATIONAL_SCOPE_SET = new Set(INFORMATIONAL_REPORT_SCOPES);
const EVIDENCE_SCOPE_SET = new Set(EVIDENCE_SUPPORT_REPORT_SCOPES);
const ACCEPTED_R2_STATUSES = new Set(['passed', 'accepted']);
const ACCEPTED_R2_VERDICTS = new Set(['ACCEPT', 'accepted']);

export class QueryDecisionUseError extends Error {
  constructor({ code, message, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'QueryDecisionUseError';
    this.code = code;
    this.extra = extra;
  }
}

function failDecisionUse(code, message, extra = {}) {
  throw new QueryDecisionUseError({ code, message, extra });
}

function hasAcceptedR2(r2Audit) {
  if (!r2Audit || typeof r2Audit !== 'object') return false;
  return ACCEPTED_R2_STATUSES.has(r2Audit.status)
    || ACCEPTED_R2_VERDICTS.has(r2Audit.verdict)
    || r2Audit.accepted === true;
}

function hasFullContradictionEnumeration(qualityGates) {
  return qualityGates?.fullContradictionEnumeration === true
    || qualityGates?.contradictionEnumerationComplete === true;
}

function assertNoDeclaredDecisionUse(decisionUse) {
  if (decisionUse == null) return;
  failDecisionUse(
    'E_PHASE10_DECISION_USE_DECLARED',
    'decisionUse must be computed by Phase 10, not supplied by the caller'
  );
}

function assertValidQueryClass(queryClass) {
  if (!QUERY_CLASS_SET.has(queryClass)) {
    failDecisionUse(
      'E_PHASE10_QUERY_CLASS_INVALID',
      `Invalid Phase 10 query class: ${queryClass}`,
      { queryClass }
    );
  }
}

function assertValidStatus(status) {
  if (!QUERY_STATUS_SET.has(status)) {
    failDecisionUse(
      'E_PHASE10_QUERY_STATUS_INVALID',
      `Invalid Phase 10 query status: ${status}`,
      { status }
    );
  }
}

function classificationForReportScope(reportScope) {
  if (INFORMATIONAL_SCOPE_SET.has(reportScope)) {
    return 'informational';
  }
  if (EVIDENCE_SCOPE_SET.has(reportScope)) {
    return 'evidence-support';
  }
  if (reportScope == null) {
    failDecisionUse(
      'E_PHASE10_REPORT_SCOPE_REQUIRED',
      'report-generation queries require reportScope'
    );
  }
  failDecisionUse(
    'E_PHASE10_REPORT_SCOPE_INVALID',
    `Invalid Phase 10 report scope: ${reportScope}`,
    { reportScope }
  );
}

export function computeQueryDecisionUse(input = {}) {
  assertNoDeclaredDecisionUse(input.decisionUse);

  const queryClass = input.queryClass ?? 'lookup';
  const status = input.status ?? 'complete';
  assertValidQueryClass(queryClass);
  assertValidStatus(status);

  let classification = 'not-for-decision';
  if (status === 'complete') {
    if (queryClass === 'lookup') {
      classification = 'informational';
    } else if (queryClass === 'evidence-summary') {
      classification = 'evidence-support';
    } else if (queryClass === 'decision-support' && hasAcceptedR2(input.r2Audit)) {
      classification = 'decision-grade';
    } else if (
      queryClass === 'contradiction-audit'
      && hasFullContradictionEnumeration(input.qualityGates)
    ) {
      classification = 'audit-grade';
    } else if (queryClass === 'report-generation') {
      classification = classificationForReportScope(input.reportScope);
    }
  }

  return {
    classification,
    computedBy: COMPUTED_BY,
    computedAt: input.computedAt
  };
}

export function acceptedR2AuditPresent(r2Audit) {
  return hasAcceptedR2(r2Audit);
}

export function fullContradictionEnumerationPresent(qualityGates) {
  return hasFullContradictionEnumeration(qualityGates);
}
