export const ADVERSARIAL_VERDICT_PROVENANCE_CLASS = 'adversarial-verdict';
export const ADVERSARIAL_VERDICT_PROVENANCE_USE = 'review-survival-metadata';

const ALLOWED_VERDICTS = Object.freeze(new Set(['ACCEPT', 'REDIRECT', 'KILL']));
const CLAIM_EDGE_SCHEMA_VERSION = 'phase9.claim-edge.v1';

export class Phase14AdversarialVerdictError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Phase14AdversarialVerdictError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new Phase14AdversarialVerdictError(code, message, extra);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isAdversarialVerdictMetadata(value) {
  return isObject(value)
    && value.provenanceClass === ADVERSARIAL_VERDICT_PROVENANCE_CLASS;
}

function candidateCarriesAdversarialMetadata(candidate) {
  if (!isObject(candidate)) return false;
  if (isAdversarialVerdictMetadata(candidate.metadata)) return true;
  if (isAdversarialVerdictMetadata(candidate.provenance)) return true;
  if (isAdversarialVerdictMetadata(candidate.law13Provenance)) return true;

  const refs = [
    ...(Array.isArray(candidate.law13ProvenanceRefs) ? candidate.law13ProvenanceRefs : []),
    ...(Array.isArray(candidate.provenanceRefs) ? candidate.provenanceRefs : []),
    ...(Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs : [])
  ];

  return refs.some((ref) =>
    ref?.kind === ADVERSARIAL_VERDICT_PROVENANCE_CLASS
      || ref?.type === ADVERSARIAL_VERDICT_PROVENANCE_CLASS
      || ref?.targetRef?.type === ADVERSARIAL_VERDICT_PROVENANCE_CLASS
      || isAdversarialVerdictMetadata(ref)
  );
}

function isScientificEvidenceIngress(candidate) {
  if (!isObject(candidate)) return false;
  return candidate.schemaVersion === CLAIM_EDGE_SCHEMA_VERSION
    || candidate.kind === 'scientific-evidence-edge'
    || candidate.kind === 'law13-provenance-link'
    || candidate.target === 'law13-provenance'
    || Array.isArray(candidate.law13ProvenanceRefs);
}

export function buildAdversarialVerdictMetadata(input = {}) {
  requireString(
    input.reviewId,
    'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
    'reviewId'
  );
  requireString(
    input.reviewer,
    'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
    'reviewer'
  );
  const verdict = requireString(
    input.verdict,
    'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
    'verdict'
  );
  if (!ALLOWED_VERDICTS.has(verdict)) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
      'verdict must be ACCEPT, REDIRECT, or KILL',
      { verdict }
    );
  }

  return {
    provenanceClass: ADVERSARIAL_VERDICT_PROVENANCE_CLASS,
    provenanceUse: ADVERSARIAL_VERDICT_PROVENANCE_USE,
    law13Provenance: false,
    scientificEvidence: false,
    confidenceDelta: 0,
    runtimeOpened: false
  };
}

export function validateAdversarialVerdictMetadata(metadata) {
  if (!isObject(metadata)) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
      'adversarial verdict metadata must be an object'
    );
  }
  if (metadata.provenanceClass !== ADVERSARIAL_VERDICT_PROVENANCE_CLASS) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
      'adversarial verdict metadata requires provenanceClass adversarial-verdict',
      { provenanceClass: metadata.provenanceClass ?? null }
    );
  }
  if (metadata.provenanceUse !== ADVERSARIAL_VERDICT_PROVENANCE_USE) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
      'adversarial verdict metadata requires review-survival provenanceUse',
      { provenanceUse: metadata.provenanceUse ?? null }
    );
  }
  if (metadata.law13Provenance !== false) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_LAW13_FORBIDDEN',
      'adversarial verdict metadata is not LAW 13 provenance'
    );
  }
  if (metadata.scientificEvidence !== false) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_SCIENCE_FORBIDDEN',
      'adversarial verdict metadata is not scientific evidence'
    );
  }
  if (metadata.confidenceDelta !== 0) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_CONFIDENCE_FORBIDDEN',
      'adversarial verdict metadata must not change claim confidence',
      { confidenceDelta: metadata.confidenceDelta ?? null }
    );
  }
  if (metadata.runtimeOpened !== false) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_METADATA_REQUIRED',
      'adversarial verdict metadata must keep runtimeOpened false'
    );
  }

  return {
    ok: true,
    metadata: cloneJson(metadata)
  };
}

export function assertNoScientificEvidenceAttachment(candidate) {
  if (
    isScientificEvidenceIngress(candidate)
    && candidateCarriesAdversarialMetadata(candidate)
  ) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_EDGE_FORBIDDEN',
      'adversarial verdict metadata cannot attach to a scientific evidence edge'
    );
  }

  return {
    ok: true,
    candidate: cloneJson(candidate)
  };
}

export function assertConfidenceUnchanged(before, after) {
  const beforeConfidence = before?.confidence ?? null;
  const afterConfidence = after?.confidence ?? null;

  if (beforeConfidence !== afterConfidence) {
    fail(
      'E_PHASE14_ADVERSARIAL_VERDICT_CONFIDENCE_FORBIDDEN',
      'adversarial verdict metadata must not change claim confidence',
      { beforeConfidence, afterConfidence }
    );
  }

  return {
    ok: true,
    confidence: beforeConfidence
  };
}
