const SHA_FIELDS = Object.freeze([
  'sourcePageSha',
  'provenanceManifestSha',
  'edgeManifestSha',
  'templateVersion'
]);

const CURRENT_SHA_ERROR_CODES = Object.freeze({
  sourcePageSha: 'E_PHASE10_PRESENTATION_SOURCE_SHA_STALE',
  provenanceManifestSha: 'E_PHASE10_PRESENTATION_PROVENANCE_SHA_STALE',
  edgeManifestSha: 'E_PHASE10_PRESENTATION_EDGE_SHA_STALE',
  templateVersion: 'E_PHASE10_PRESENTATION_TEMPLATE_SHA_STALE'
});

const HEX_64 = /^[a-f0-9]{64}$/u;

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function warning(warnings, code, message, extra = {}) {
  warnings.push({ code, message, ...extra });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSha(value) {
  return typeof value === 'string' && HEX_64.test(value);
}

function hasOverrideReason(override) {
  return override?.requested === true && nonEmptyString(override.reason);
}

export function validatePhase10PresentationStaleness(presentation, current = {}) {
  const issues = [];
  const warnings = [];

  if (!isObject(presentation)) {
    issue(
      issues,
      'E_PHASE10_PRESENTATION_MANIFEST_MISSING',
      'Presentation staleness requires an explicit presentation manifest.'
    );
    return {
      ok: false,
      issues,
      warnings,
      freshnessStatus: 'blocked',
      exportAllowed: false,
      localReviewOnly: true
    };
  }

  if (!isObject(current)) {
    issue(
      issues,
      'E_PHASE10_PRESENTATION_CURRENT_STATE_MISSING',
      'Presentation staleness requires current dependency hashes.'
    );
  }

  if (presentation.decisionUseAtRender === 'not-for-decision') {
    issue(
      issues,
      'E_PHASE10_PRESENTATION_NOT_FOR_DECISION',
      'Not-for-decision material cannot pass as decision presentation material.'
    );
  }

  for (const field of SHA_FIELDS) {
    if (!validSha(presentation[field])) {
      issue(
        issues,
        'E_PHASE10_PRESENTATION_DEPENDENCY_MISSING',
        'Presentation manifest is missing a required dependency SHA.',
        { field }
      );
    }
    if (!validSha(current[field])) {
      issue(
        issues,
        'E_PHASE10_PRESENTATION_CURRENT_SHA_MISSING',
        'Current dependency state is missing a required SHA.',
        { field }
      );
    }
  }

  if (!validSha(presentation.renderedContentSha)) {
    issue(
      issues,
      'E_PHASE10_PRESENTATION_DEPENDENCY_MISSING',
      'Presentation manifest is missing renderedContentSha.',
      { field: 'renderedContentSha' }
    );
  }

  const staleIssues = [];
  if (issues.length === 0) {
    for (const field of SHA_FIELDS) {
      if (presentation[field] !== current[field]) {
        issue(
          staleIssues,
          CURRENT_SHA_ERROR_CODES[field],
          'Presentation dependency SHA differs from current dependency state.',
          { field }
        );
      }
    }

    if (
      presentation.presentationStatus === 'archived'
      && validSha(current.renderedContentSha)
      && presentation.renderedContentSha !== current.renderedContentSha
    ) {
      issue(
        staleIssues,
        'E_PHASE10_ARCHIVED_PRESENTATION_REWRITE',
        'Archived presentation content must be immutable.'
      );
    }
  }

  const override = presentation.freshnessOverride;
  if (staleIssues.length > 0 && override?.requested === true) {
    if (!hasOverrideReason(override)) {
      issue(
        issues,
        'E_PHASE10_PRESENTATION_OVERRIDE_REASON_REQUIRED',
        'Freshness override requires an explicit reason.'
      );
    } else if (override.affectsDecisionUse === true && override.localReviewOnly !== true) {
      issue(
        issues,
        'E_PHASE10_PRESENTATION_OVERRIDE_EXPORT_FORBIDDEN',
        'Decision-use affected freshness override must remain local-review-only.'
      );
    } else {
      for (const staleIssue of staleIssues) {
        warning(warnings, staleIssue.code, staleIssue.message, staleIssue);
      }
      return {
        ok: true,
        issues: [],
        warnings,
        freshnessStatus: 'overridden-stale',
        exportAllowed: false,
        localReviewOnly: true
      };
    }
  } else {
    issues.push(...staleIssues);
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    freshnessStatus: issues.length === 0 ? 'fresh' : 'blocked',
    exportAllowed: false,
    localReviewOnly: true
  };
}
