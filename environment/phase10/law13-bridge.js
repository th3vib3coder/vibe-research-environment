export const LAW13_BRIDGE_CONTRACT_ID = 'phase12.phase10-law13-review-extension';

export const REQUIRED_LAW13_BRIDGE_FIELDS = Object.freeze([
  'law13StatusChecked',
  'provenanceRefsChecked',
  'queryNotProvenanceCheck',
  'r2PathRequired',
  'r2PathPresent',
  'suppositionIsolationChecked'
]);

const RELAY_VERDICT_TYPES = new Set(['phase12-relay-verdict', 'relay-verdict']);
const CLAIMED_STATES = new Set(['claimed']);
const CLAIMED_REQUIRED_TRUE_FIELDS = Object.freeze([
  'law13StatusChecked',
  'provenanceRefsChecked',
  'queryNotProvenanceCheck',
  'suppositionIsolationChecked'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extensionFor(artifact) {
  return artifact?.law13ReviewExtension
    ?? artifact?.phase12Law13ReviewExtension
    ?? artifact?.payload
    ?? {};
}

function isClaimedTransition(artifact) {
  return CLAIMED_STATES.has(artifact?.transition)
    || CLAIMED_STATES.has(artifact?.status)
    || CLAIMED_STATES.has(artifact?.targetStatus)
    || CLAIMED_STATES.has(artifact?.finalStatus)
    || CLAIMED_STATES.has(artifact?.reviewTransition?.to);
}

function isRelayVerdictReference(ref) {
  const candidates = [
    ref?.type,
    ref?.kind,
    ref?.sourceType,
    ref?.targetType,
    ref?.targetRef?.type
  ];
  return candidates.some((candidate) => RELAY_VERDICT_TYPES.has(candidate));
}

function isQueryPath(value) {
  return typeof value === 'string' && value.replaceAll('\\', '/').startsWith('wiki/queries/');
}

function isQueryReference(ref) {
  return ref?.targetRef?.type === 'query-record'
    || ref?.type === 'query-record'
    || ref?.kind === 'query-output'
    || ref?.kind === 'query-origin'
    || isQueryPath(ref?.path)
    || isQueryPath(ref?.sourcePath)
    || isQueryPath(ref?.targetRef?.path);
}

function provenanceReferences(artifact, extension) {
  return [
    ...asArray(artifact?.provenanceRefs),
    ...asArray(artifact?.provenanceLinks),
    ...asArray(artifact?.evidenceRefs),
    ...asArray(artifact?.law13ProvenanceRefs),
    ...asArray(extension?.provenanceRefs)
  ];
}

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

export function validateLaw13BridgeArtifact(artifact = {}) {
  const issues = [];
  const extension = extensionFor(artifact);
  const claimed = isClaimedTransition(artifact);

  for (const field of REQUIRED_LAW13_BRIDGE_FIELDS) {
    if (!(field in extension)) {
      issue(
        issues,
        'E_PHASE10_LAW13_BRIDGE_FIELD_MISSING',
        `Missing Phase 12 LAW 13 bridge field: ${field}`,
        { field }
      );
      continue;
    }

    if (typeof extension[field] !== 'boolean') {
      issue(
        issues,
        'E_PHASE10_LAW13_BRIDGE_FIELD_TYPE',
        `Phase 12 LAW 13 bridge field must be boolean: ${field}`,
        { field, actualType: typeof extension[field] }
      );
    }
  }

  for (const ref of provenanceReferences(artifact, extension)) {
    if (isRelayVerdictReference(ref)) {
      issue(
        issues,
        'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE',
        'Phase 12 relay verdicts are review metadata, not LAW 13 provenance.',
        { ref }
      );
    }

    if (isQueryReference(ref)) {
      issue(
        issues,
        'E_PHASE10_QUERY_METADATA_NOT_PROVENANCE',
        'Query outputs and query-origin records are metadata, not LAW 13 provenance.',
        { ref }
      );
    }
  }

  if (claimed && extension.r2PathRequired === true && extension.r2PathPresent === false) {
    issue(
      issues,
      'E_PHASE10_R2_PATH_REQUIRED',
      'Claimed relay review transitions require an R2 path when r2PathRequired is true.'
    );
  }

  if (claimed && extension.suppositionIsolationChecked === false) {
    issue(
      issues,
      'E_PHASE10_SUPPOSITION_ISOLATION_UNCHECKED',
      'Claimed relay review transitions require supposition isolation to be checked.'
    );
  }

  if (claimed) {
    for (const field of CLAIMED_REQUIRED_TRUE_FIELDS) {
      if (extension[field] === false) {
        issue(
          issues,
          'E_PHASE10_LAW13_BRIDGE_CHECK_INCOMPLETE',
          `Claimed relay review transition has incomplete LAW 13 bridge check: ${field}`,
          { field }
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
