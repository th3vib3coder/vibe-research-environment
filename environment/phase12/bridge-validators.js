import { validateLaw13BridgeArtifact } from '../phase10/law13-bridge.js';
import { validatePhase12ArtifactSet } from './artifact-contracts.js';

const DELEGATED_VALIDATORS = Object.freeze([
  'validatePhase12ArtifactSet',
  'validateLaw13BridgeArtifact'
]);

const BRIDGE_VALIDATOR_OUTPUT_KINDS = new Set([
  'phase12-bridge-validator-output',
  'bridge-validator-output'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pushIssue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

function withSource(issue, source) {
  return { ...issue, source };
}

function law13BridgeArtifactFor(input) {
  return {
    artifactId: input?.finalVerdict?.verdictId ?? 'phase12-bridge-review',
    transition: input?.finalVerdict?.accepted === true ? 'claimed' : 'draft',
    law13ReviewExtension: input?.phase10Law13ReviewExtension,
    provenanceRefs: asArray(input?.evidenceBundle?.tracking?.provenanceRefs)
  };
}

function validateGraphPathRole(metadata, issues) {
  if (metadata.graphPathRole === 'implementation-proof'
    || metadata.graphPathsAsImplementationProof === true
    || asArray(metadata.graphImplementationProofRefs).length > 0) {
    pushIssue(
      issues,
      'E_PHASE12_GRAPH_PATH_NOT_IMPLEMENTATION_PROOF',
      'Phase 11 graph paths are navigation metadata, not implementation proof.'
    );
  }
}

function validateWritebackRequests(metadata, issues) {
  if (metadata.phase10PublicationRequested === true
    || metadata.phase10WritebackRequested === true
    || metadata.wikiWritebackRequested === true) {
    pushIssue(
      issues,
      'E_PHASE12_PHASE10_WRITEBACK_FORBIDDEN',
      'Phase 12 bridge validation cannot publish or write back Phase 10 pages.'
    );
  }

  if (metadata.graphifyExecutionRequested === true
    || metadata.graphifyWritebackRequested === true) {
    pushIssue(
      issues,
      'E_PHASE12_GRAPHIFY_EXECUTION_FORBIDDEN',
      'Phase 12 bridge validation cannot execute Graphify or write graph output.'
    );
  }
}

function isBridgeValidatorOutputRef(ref) {
  return BRIDGE_VALIDATOR_OUTPUT_KINDS.has(ref?.kind)
    || BRIDGE_VALIDATOR_OUTPUT_KINDS.has(ref?.type)
    || BRIDGE_VALIDATOR_OUTPUT_KINDS.has(ref?.targetRef?.type);
}

function validateValidatorOutputProvenance(input, metadata, issues) {
  if (metadata.validatorOutputAsLaw13Provenance === true) {
    pushIssue(
      issues,
      'E_PHASE12_BRIDGE_VALIDATOR_OUTPUT_NOT_PROVENANCE',
      'Bridge validator output is review metadata, not LAW 13 provenance.'
    );
  }

  for (const ref of asArray(input?.evidenceBundle?.tracking?.provenanceRefs)) {
    if (isObject(ref) && isBridgeValidatorOutputRef(ref)) {
      pushIssue(
        issues,
        'E_PHASE12_BRIDGE_VALIDATOR_OUTPUT_NOT_PROVENANCE',
        'Bridge validator output is review metadata, not LAW 13 provenance.',
        { ref }
      );
    }
  }
}

export function validatePhase12BridgeReview(input) {
  const artifactContractResult = validatePhase12ArtifactSet(input);
  const phase10BridgeResult = validateLaw13BridgeArtifact(law13BridgeArtifactFor(input));
  const issues = [
    ...artifactContractResult.issues.map((issue) => (
      withSource(issue, 'validatePhase12ArtifactSet')
    )),
    ...phase10BridgeResult.issues.map((issue) => (
      withSource(issue, 'validateLaw13BridgeArtifact')
    ))
  ];

  const metadata = input?.bridgeReviewMetadata ?? {};
  validateGraphPathRole(metadata, issues);
  validateWritebackRequests(metadata, issues);
  validateValidatorOutputProvenance(input, metadata, issues);

  return {
    ok: issues.length === 0,
    issues,
    delegatedValidators: [...DELEGATED_VALIDATORS]
  };
}
