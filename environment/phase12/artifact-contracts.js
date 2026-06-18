export const PHASE12_RELAY_VERDICT_TYPES = Object.freeze([
  'phase12-relay-verdict',
  'relay-verdict'
]);

const TERMINAL_ACCEPT_STATES = new Set(['ACCEPTED']);
const QUERY_PROVENANCE_KINDS = new Set(['query-output', 'query-result']);
const REVIEW_PROVENANCE_KINDS = new Set([
  'phase12-relay-verdict',
  'relay-verdict',
  'review-verdict'
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushIssue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

function collectStringRefs(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringRefs(item));
  }
  if (isObject(value)) {
    return Object.values(value).flatMap((item) => collectStringRefs(item));
  }
  return typeof value === 'string' ? [value] : [];
}

function artifactRefs(bundle) {
  return [
    ...asArray(bundle?.artifacts),
    ...asArray(bundle?.reviewArtifacts),
    ...asArray(bundle?.validation)
  ];
}

function hasSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validateCaps(run, issues) {
  if (!Number.isInteger(run?.maxIterations) || run.maxIterations < 1) {
    pushIssue(issues, 'E_PHASE12_CAPS_REQUIRED', 'Run contract must declare maxIterations.');
  }

  const budget = run?.budget;
  if (!isObject(budget)
    || !Number.isInteger(budget.maxTurns)
    || !Number.isInteger(budget.maxWallMinutes)) {
    pushIssue(
      issues,
      'E_PHASE12_CAPS_REQUIRED',
      'Run contract must declare turn and wall-clock caps.'
    );
  }
}

function validateRunBoundary(run, finalVerdict, issues) {
  validateCaps(run, issues);

  if (run?.relaySubstrate !== 'filesystem') {
    pushIssue(
      issues,
      'E_PHASE12_GUI_CLIPBOARD_FORBIDDEN',
      'Phase 12 v1 relay substrate must be filesystem artifacts.'
    );
  }

  if (run?.providerAutomationAllowed !== false
    || run?.guiAutomationAllowed !== false) {
    pushIssue(
      issues,
      'E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN',
      'Phase 12 artifact contracts cannot authorize provider or GUI automation.'
    );
  }

  const override = run?.operatorOverride;
  if (override?.scope === 'phase-entry-planning-only'
    && override?.allowsRuntime === false
    && run?.state !== 'DRAFT') {
    pushIssue(
      issues,
      'E_PHASE12_RUNTIME_UNDER_PLANNING_OVERRIDE',
      'Planning-only override cannot open Phase 12 runtime.'
    );
  }

  if (run?.state === 'STALE' && finalVerdict?.accepted === true) {
    pushIssue(
      issues,
      'E_PHASE12_STALE_RUN_ACCEPTED',
      'Stale run state cannot be accepted.'
    );
  }
}

function validateReview(candidate, review, issues) {
  if (review?.verdict === 'ACCEPT' && review?.reviewer === candidate?.author) {
    pushIssue(
      issues,
      'E_PHASE12_SELF_ACCEPT_FORBIDDEN',
      'Reviewer must differ from candidate author for ACCEPT.'
    );
  }

  if (review?.verdict === 'REDIRECT' && asArray(review.requiredActions).length === 0) {
    pushIssue(
      issues,
      'E_PHASE12_REDIRECT_ACTION_REQUIRED',
      'REDIRECT verdict requires at least one required action.'
    );
  }

  if (review?.verdict === 'BLOCK' && asArray(review.findings).length === 0) {
    pushIssue(
      issues,
      'E_PHASE12_BLOCK_FINDING_REQUIRED',
      'BLOCK verdict requires at least one finding.'
    );
  }
}

function validateFinalVerdict(candidate, finalVerdict, issues) {
  if (finalVerdict?.accepted === true) {
    if (!hasText(finalVerdict.acceptedBy)
      || finalVerdict.acceptedBy === candidate?.author) {
      pushIssue(
        issues,
        'E_PHASE12_ACCEPTED_BY_REQUIRED',
        'Accepted final verdict requires non-author acceptedBy.'
      );
    }
  }

  if (finalVerdict?.accepted === true
    && !TERMINAL_ACCEPT_STATES.has(finalVerdict.finalState)) {
    pushIssue(
      issues,
      'E_PHASE12_ACCEPTED_STATE_MISMATCH',
      'accepted=true requires finalState ACCEPTED.'
    );
  }

  if (finalVerdict?.accepted === true && !Array.isArray(finalVerdict.residualRisk)) {
    pushIssue(
      issues,
      'E_PHASE12_RESIDUAL_RISK_REQUIRED',
      'ACCEPT requires explicit residualRisk array, even when empty.'
    );
  }

  if (finalVerdict?.relayVerdictType
    && !PHASE12_RELAY_VERDICT_TYPES.includes(finalVerdict.relayVerdictType)) {
    pushIssue(
      issues,
      'E_PHASE12_RELAY_VERDICT_TYPE_DRIFT',
      'Final verdict must align with Phase 10 relay verdict type vocabulary.'
    );
  }
}

function validateEvidenceBundle(candidate, evidenceBundle, issues) {
  for (const artifact of artifactRefs(evidenceBundle)) {
    if (!hasSha256(artifact?.sha256)) {
      pushIssue(
        issues,
        'E_PHASE12_EVIDENCE_SHA_REQUIRED',
        'Stored evidence artifact must carry SHA-256.',
        { path: artifact?.path }
      );
    }
    if (artifact?.type === 'graphify-output') {
      pushIssue(
        issues,
        'E_PHASE12_GRAPHIFY_NOT_EVIDENCE',
        'Graphify output is navigation metadata, not implementation evidence.',
        { path: artifact?.path }
      );
    }
  }

  const refs = collectStringRefs(candidate?.sourceRefs);
  if (refs.some((ref) => ref.toLowerCase().includes('raw-chat'))) {
    pushIssue(
      issues,
      'E_PHASE12_RAW_CHAT_NOT_AUTHORITY',
      'Raw chat cannot be cited as authoritative state.'
    );
  }

  for (const ref of asArray(evidenceBundle?.tracking?.provenanceRefs)) {
    if (QUERY_PROVENANCE_KINDS.has(ref?.kind)) {
      pushIssue(
        issues,
        'E_PHASE12_QUERY_OUTPUT_NOT_PROVENANCE',
        'Query output is metadata, not provenance.'
      );
    }
    if (REVIEW_PROVENANCE_KINDS.has(ref?.kind)) {
      pushIssue(
        issues,
        'E_PHASE12_REVIEW_NOT_PROVENANCE',
        'Review verdicts are relay metadata, not provenance.'
      );
    }
  }
}

function validateBridgeExtensions({
  finalVerdict,
  phase10Law13ReviewExtension,
  phase11GraphReviewExtension
}, issues) {
  if (finalVerdict?.accepted !== true) {
    return;
  }

  const law13Fields = [
    'law13StatusChecked',
    'provenanceRefsChecked',
    'queryNotProvenanceCheck',
    'suppositionIsolationChecked'
  ];
  for (const field of law13Fields) {
    if (phase10Law13ReviewExtension?.[field] !== true) {
      pushIssue(
        issues,
        'E_PHASE12_BRIDGE_CHECK_REQUIRED',
        `Accepted Phase 10 bridge review requires ${field}.`
      );
    }
  }

  const graphFields = [
    'graphAsNavigationOnlyChecked',
    'unsafeIndexingChecked',
    'staleGraphChecked',
    'sourceReadRequired',
    'wikiVreAuthorityPreserved'
  ];
  for (const field of graphFields) {
    if (phase11GraphReviewExtension?.[field] !== true) {
      pushIssue(
        issues,
        'E_PHASE12_BRIDGE_CHECK_REQUIRED',
        `Accepted Phase 11 bridge review requires ${field}.`
      );
    }
  }
}

export function validatePhase12ArtifactSet(input) {
  const issues = [];
  const candidate = input?.candidate;
  const review = input?.review;
  const finalVerdict = input?.finalVerdict;
  const evidenceBundle = input?.evidenceBundle;

  validateRunBoundary(input?.run, finalVerdict, issues);
  validateReview(candidate, review, issues);
  validateFinalVerdict(candidate, finalVerdict, issues);
  validateEvidenceBundle(candidate, evidenceBundle, issues);
  validateBridgeExtensions(input ?? {}, issues);

  return { ok: issues.length === 0, issues };
}
