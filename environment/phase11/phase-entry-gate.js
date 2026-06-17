import {
  evaluateFirstResearchPacketExecution
} from './first-research-packet.js';
import {
  evaluatePhase11ResearchPacket
} from './research-packet.js';
import {
  evaluateScientificInvariantBlockers
} from './scientific-invariant-blockers.js';

export const PHASE_ENTRY_REASON_CODES = Object.freeze({
  priorPhaseOpen: 'prior_phase_open',
  realResearchEvidenceMissing: 'real_research_evidence_missing',
  processArtifactOnly: 'process_artifact_only',
  syntheticOnly: 'synthetic_only',
  fakeExecution: 'fake_execution',
  blockedFirstResearchPacket: 'blocked_first_research_packet',
  researchPacketScaffoldOnly: 'research_packet_scaffold_only',
  humanReviewRequired: 'human_review_required',
  analysisLineageRequired: 'analysis_lineage_required',
  scientificInvariantRejected: 'scientific_invariant_rejected',
  substanceEvaluatorRequired: 'substance_evaluator_required',
  operatorOverrideInvalid: 'operator_override_invalid'
});

const AUTHORIZATIONS_CLOSED = Object.freeze({
  claims: false,
  export: false,
  runtime: false
});

const REQUIRED_OVERRIDE_SCOPE = 'phase-entry-planning-only';
const VALID_EVIDENCE_PROVENANCE = 'real-data';
const VAGUE_OVERRIDE_REASONS = new Set([
  'go',
  'ok',
  'proceed',
  'standing go',
  'continue',
  'approved'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, overrides = {}) {
  const output = clone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = clone(value);
    }
  }
  return output;
}

function addIssue(issues, code, reason, message, pathValue = null, extra = {}) {
  issues.push({ code, reason, message, path: pathValue, ...extra });
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function hasHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function hasObjectValue(value) {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function uniqueReasons(issues) {
  return [...new Set(issues.map((issue) => issue.reason))];
}

function validHumanMedicalReview(review) {
  return review?.status === 'accepted'
    && hasText(review.reviewerRole)
    && hasText(review.reviewedAt)
    && hasText(review.evidencePath);
}

function validateArtifact(evidence, issues) {
  const artifact = evidence?.evidenceArtifact ?? {};
  if (!hasText(artifact.path)
    || !hasHash(artifact.sha256)
    || artifact.provenance !== VALID_EVIDENCE_PROVENANCE) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_REAL_EVIDENCE_MISSING',
      PHASE_ENTRY_REASON_CODES.realResearchEvidenceMissing,
      'Phase entry requires a real-data evidence artifact with path, SHA-256, and provenance.',
      'realResearchEvidence.evidenceArtifact'
    );
  }
}

function validateSourceKind(evidence, issues) {
  if (evidence?.sourceKind === 'synthetic-only') {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_SYNTHETIC_ONLY',
      PHASE_ENTRY_REASON_CODES.syntheticOnly,
      'Synthetic-only fixtures cannot satisfy real research evidence for phase entry.',
      'realResearchEvidence.sourceKind'
    );
  }

  if (evidence?.sourceKind === 'fake-execution' || evidence?.fakeExecution === true) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_FAKE_EXECUTION',
      PHASE_ENTRY_REASON_CODES.fakeExecution,
      'Fake execution markers cannot satisfy real research evidence for phase entry.',
      'realResearchEvidence.sourceKind'
    );
  }
}

function validateResearchPacket(evidence, issues) {
  if (evidence?.researchPacket == null) {
    return null;
  }

  const result = evaluatePhase11ResearchPacket(evidence.researchPacket);
  if (result.ok !== true || result.claimReady !== true || result.performsAnalysis !== true) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_PACKET_SCAFFOLD_ONLY',
      PHASE_ENTRY_REASON_CODES.researchPacketScaffoldOnly,
      'A valid Phase 11 research packet scaffold is not real executed research evidence.',
      'realResearchEvidence.researchPacket',
      { packetResult: clone(result) }
    );
  }

  return result;
}

function validateFirstResearchPacket(evidence, issues) {
  if (evidence?.firstResearchPacketExecution == null) {
    return null;
  }

  const result = evaluateFirstResearchPacketExecution(evidence.firstResearchPacketExecution);
  if (
    result.ok !== true
    || result.decision === 'first-research-packet-blocked-actionable'
    || result.claimReady !== true
  ) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_BLOCKED_FIRST_RESEARCH_PACKET',
      PHASE_ENTRY_REASON_CODES.blockedFirstResearchPacket,
      'The current first-research-packet execution is a blocker artifact, not entry evidence.',
      'realResearchEvidence.firstResearchPacketExecution',
      { executionResult: clone(result) }
    );
  }

  return result;
}

function validateScientificInvariant(evidence, issues) {
  if (evidence?.scientificInvariantInput == null) {
    return null;
  }

  const result = evaluateScientificInvariantBlockers(evidence.scientificInvariantInput);
  if (
    result.ok !== true
    || result.scientificClaim !== true
    || result.claimReady !== true
  ) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_SCIENTIFIC_INVARIANT_REJECTED',
      PHASE_ENTRY_REASON_CODES.scientificInvariantRejected,
      'Scientific invariant blockers must accept the real-evidence claim path.',
      'realResearchEvidence.scientificInvariantInput',
      { scientificInvariantResult: clone(result) }
    );
  }

  return result;
}

function hasPassingSubstanceEvaluator(results) {
  const firstResearchPacket = results.firstResearchPacket;
  const researchPacket = results.researchPacket;
  const scientificInvariant = results.scientificInvariant;

  return (
    firstResearchPacket?.ok === true
      && firstResearchPacket.decision !== 'first-research-packet-blocked-actionable'
      && firstResearchPacket.claimReady === true
  ) || (
    researchPacket?.ok === true
      && researchPacket.claimReady === true
      && researchPacket.performsAnalysis === true
  ) || (
    scientificInvariant?.ok === true
      && scientificInvariant.scientificClaim === true
      && scientificInvariant.claimReady === true
  );
}

function validateRealResearchEvidence(request, issues) {
  const evidence = request?.realResearchEvidence;

  if (evidence == null) {
    if (request?.processArtifacts != null) {
      addIssue(
        issues,
        'E_PHASE11_PHASE_ENTRY_PROCESS_ARTIFACT_ONLY',
        PHASE_ENTRY_REASON_CODES.processArtifactOnly,
        'CI, closeout, and review artifacts alone are process evidence, not real research evidence.',
        'processArtifacts'
      );
      return false;
    }

    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_REAL_EVIDENCE_MISSING',
      PHASE_ENTRY_REASON_CODES.realResearchEvidenceMissing,
      'Phase entry requires accepted real research evidence or a scoped operator override.',
      'realResearchEvidence'
    );
    return false;
  }

  validateSourceKind(evidence, issues);
  validateArtifact(evidence, issues);

  if (!hasObjectValue(evidence.analysisLineage)) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_ANALYSIS_LINEAGE_REQUIRED',
      PHASE_ENTRY_REASON_CODES.analysisLineageRequired,
      'Real research evidence must carry analysis lineage, not only process metadata.',
      'realResearchEvidence.analysisLineage'
    );
  }

  if (!validHumanMedicalReview(evidence.humanMedicalReview)) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_HUMAN_REVIEW_REQUIRED',
      PHASE_ENTRY_REASON_CODES.humanReviewRequired,
      'Phase entry requires accepted human medical review metadata.',
      'realResearchEvidence.humanMedicalReview'
    );
  }

  const firstResearchPacket = validateFirstResearchPacket(evidence, issues);
  let researchPacket = null;
  let scientificInvariant = null;

  if (evidence.scientificInvariantInput == null) {
    researchPacket = validateResearchPacket(evidence, issues);
  } else {
    scientificInvariant = validateScientificInvariant(evidence, issues);
  }

  if (!hasPassingSubstanceEvaluator({
    firstResearchPacket,
    researchPacket,
    scientificInvariant
  })) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_SUBSTANCE_EVALUATOR_REQUIRED',
      PHASE_ENTRY_REASON_CODES.substanceEvaluatorRequired,
      'Real research evidence must pass at least one Phase 11 substance evaluator.',
      'realResearchEvidence'
    );
  }

  return !issues.some((issue) => issue.reason !== PHASE_ENTRY_REASON_CODES.priorPhaseOpen);
}

function overrideReasonValid(reason) {
  if (!hasText(reason)) {
    return false;
  }

  return !VAGUE_OVERRIDE_REASONS.has(reason.trim().toLowerCase());
}

function validateOperatorOverride(overrideValue, targetPhase, issues) {
  if (overrideValue == null) {
    return false;
  }

  const valid = overrideValue.approved === true
    && overrideValue.targetPhase === targetPhase
    && overrideReasonValid(overrideValue.reason)
    && hasText(overrideValue.approvedAt)
    && hasText(overrideValue.evidencePath)
    && overrideValue.scope === REQUIRED_OVERRIDE_SCOPE
    && overrideValue.allowsClaims === false
    && overrideValue.allowsExport === false
    && overrideValue.allowsRuntime === false;

  if (!valid) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_OPERATOR_OVERRIDE_INVALID',
      PHASE_ENTRY_REASON_CODES.operatorOverrideInvalid,
      'Operator override must be explicit, phase-scoped, evidenced, and non-authorizing.',
      'operatorOverride'
    );
  }

  return valid;
}

export function makePhaseEntryRequestFixture(overrides = {}) {
  const base = {
    schemaVersion: 'phase11.phase-entry-request.v1',
    requestedPhase: 12,
    priorPhase: 11,
    priorPhaseStatus: 'open',
    processArtifacts: null,
    realResearchEvidence: null,
    operatorOverride: null
  };

  return mergeDeep(base, overrides);
}

export function evaluatePhaseEntryGate(request = {}) {
  const issues = [];
  const requestedPhase = request.requestedPhase ?? request.targetPhase ?? 12;
  const overrideValid = validateOperatorOverride(
    request.operatorOverride,
    requestedPhase,
    issues
  );

  if (request.priorPhaseStatus !== 'closed' && !overrideValid) {
    addIssue(
      issues,
      'E_PHASE11_PHASE_ENTRY_PRIOR_PHASE_OPEN',
      PHASE_ENTRY_REASON_CODES.priorPhaseOpen,
      'The prior phase must be closed before the next phase can enter implementation.',
      'priorPhaseStatus'
    );
  }

  if (!overrideValid) {
    validateRealResearchEvidence(request, issues);
  }

  const ok = issues.length === 0;
  const decision = ok && overrideValid
    ? 'eligible-via-operator-override'
    : ok ? 'eligible' : 'blocked';

  return {
    ok,
    eligible: ok,
    decision,
    reasons: uniqueReasons(issues),
    issues,
    authorizations: clone(AUTHORIZATIONS_CLOSED)
  };
}
