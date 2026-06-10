import {
  validateLaw13BridgeArtifact
} from './law13-bridge.js';

export const WIKI_R2_AUDIT_CONTRACT_ID = 'phase10.r2-audited-synthesis.v1';

const ACCEPTED_R2_STATUSES = new Set(['passed']);
const ACCEPTED_R2_VERDICTS = new Set(['ACCEPT']);
const REJECTED_R2_STATUSES = new Set(['failed', 'rejected']);
const FORBIDDEN_REPAIR_FIELDS = [
  'addedSources',
  'createdProvenance',
  'llmGenerated',
  'usedLlm'
];

export class WikiR2AuditError extends Error {
  constructor({ code, message, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'WikiR2AuditError';
    this.code = code;
    this.exitCode = 1;
    this.extra = extra;
  }
}

function failR2(code, message, extra = {}) {
  throw new WikiR2AuditError({ code, message, extra });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function isRelayVerdictReference(ref) {
  return ref?.targetRef?.type === 'phase12-relay-verdict'
    || ref?.targetRef?.type === 'relay-verdict'
    || ref?.type === 'phase12-relay-verdict'
    || ref?.type === 'relay-verdict'
    || ref?.kind === 'relay-verdict';
}

function assertRepairMetadata(r2Audit) {
  const attemptsByEvent = new Map();
  for (const attempt of asArray(r2Audit.repairAttempts)) {
    const eventId = attempt?.rejectionEventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      failR2(
        'E_PHASE10_WIKI_R2_REPAIR_EVENT_REQUIRED',
        'R2 repair metadata requires rejectionEventId.'
      );
    }
    attemptsByEvent.set(eventId, (attemptsByEvent.get(eventId) ?? 0) + 1);
    if (attemptsByEvent.get(eventId) > 1) {
      failR2(
        'E_PHASE10_WIKI_R2_REPAIR_ATTEMPT_LIMIT',
        'R2 repair metadata may record at most one attempt per rejection event.',
        { rejectionEventId: eventId }
      );
    }
    if (!Array.isArray(attempt.rejectedStatementIds) || attempt.rejectedStatementIds.length === 0) {
      failR2(
        'E_PHASE10_WIKI_R2_REJECTED_STATEMENTS_REQUIRED',
        'R2 repair metadata requires rejectedStatementIds[].',
        { rejectionEventId: eventId }
      );
    }
    for (const field of FORBIDDEN_REPAIR_FIELDS) {
      if (attempt[field] === true || asArray(attempt[field]).length > 0) {
        failR2(
          'E_PHASE10_WIKI_R2_REPAIR_FORBIDDEN',
          'R2 repair metadata must not claim LLM generation, source addition, or provenance creation.',
          { field, rejectionEventId: eventId }
        );
      }
    }
  }
}

function assertAcceptedR2(r2Audit) {
  if (!r2Audit || typeof r2Audit !== 'object') {
    failR2('E_PHASE10_WIKI_R2_AUDIT_REQUIRED', 'Synthesis pages require R2 audit metadata.');
  }

  const rejected = REJECTED_R2_STATUSES.has(r2Audit.status)
    || r2Audit.verdict === 'REDIRECT'
    || r2Audit.verdict === 'REJECT';
  if (rejected && !Array.isArray(r2Audit.rejectedStatementIds)) {
    failR2(
      'E_PHASE10_WIKI_R2_REJECTED_STATEMENTS_REQUIRED',
      'Rejected R2 verdicts must identify rejectedStatementIds[].'
    );
  }

  if (!ACCEPTED_R2_STATUSES.has(r2Audit.status) || !ACCEPTED_R2_VERDICTS.has(r2Audit.verdict)) {
    failR2(
      'E_PHASE10_WIKI_R2_ACCEPT_REQUIRED',
      'Synthesis publication requires status:passed and verdict:ACCEPT.',
      { status: r2Audit.status, verdict: r2Audit.verdict }
    );
  }

  if (typeof r2Audit.reviewer !== 'string' || r2Audit.reviewer.length === 0) {
    failR2('E_PHASE10_WIKI_R2_REVIEWER_REQUIRED', 'R2 audit metadata requires reviewer.');
  }
  if (typeof r2Audit.reviewedAt !== 'string' || r2Audit.reviewedAt.length === 0) {
    failR2('E_PHASE10_WIKI_R2_REVIEWED_AT_REQUIRED', 'R2 audit metadata requires reviewedAt.');
  }
}

function assertBridgeMetadata(r2Audit) {
  const bridgeResult = validateLaw13BridgeArtifact({
    transition: 'claimed',
    provenanceRefs: r2Audit.provenanceRefs,
    law13ReviewExtension: r2Audit.law13ReviewExtension
  });
  if (!bridgeResult.ok) {
    const firstIssue = bridgeResult.issues[0];
    failR2(
      firstIssue.code,
      `Invalid Phase 12 LAW 13 bridge metadata: ${firstIssue.message}`,
      { issue: firstIssue }
    );
  }
}

function assertSynthesisCitesOriginalProvenance(draftPage, provenanceLinks) {
  for (const assertion of asArray(draftPage.assertionGraph)) {
    for (const cite of asArray(assertion?.cites)) {
      const link = provenanceLinks.get(cite);
      if (!link) {
        continue;
      }
      if (isRelayVerdictReference(link)) {
        failR2(
          'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE',
          'Synthesis pages must not cite relay verdict metadata as provenance.',
          { linkId: link.linkId, assertionId: assertion?.assertionId }
        );
      }
      if (isQueryReference(link)) {
        failR2(
          'E_PHASE10_QUERY_METADATA_NOT_PROVENANCE',
          'Synthesis pages must cite original sources, not query outputs or query-origin metadata.',
          { linkId: link.linkId, assertionId: assertion?.assertionId }
        );
      }
    }
  }
}

export function normalizeSynthesisR2Audit({
  compilePolicy,
  draftPage,
  provenanceLinks
}) {
  if (compilePolicy?.policy !== 'three-pass-r2-audited') {
    failR2(
      'E_PHASE10_WIKI_SYNTHESIS_R2_POLICY_REQUIRED',
      'Synthesis pages require compilePolicy.policy: three-pass-r2-audited.',
      { policy: compilePolicy?.policy }
    );
  }

  const r2Audit = draftPage?.r2Audit;
  assertAcceptedR2(r2Audit);
  assertBridgeMetadata(r2Audit);
  assertRepairMetadata(r2Audit);
  assertSynthesisCitesOriginalProvenance(draftPage, provenanceLinks);

  const normalized = {
    status: r2Audit.status,
    verdict: r2Audit.verdict,
    reviewer: r2Audit.reviewer,
    reviewedAt: r2Audit.reviewedAt,
    law13ReviewExtension: { ...r2Audit.law13ReviewExtension }
  };
  if (Array.isArray(r2Audit.repairAttempts) && r2Audit.repairAttempts.length > 0) {
    normalized.repairAttempts = r2Audit.repairAttempts.map((attempt) => ({
      rejectionEventId: attempt.rejectionEventId,
      rejectedStatementIds: [...attempt.rejectedStatementIds],
      action: attempt.action ?? 'metadata-only-retry'
    }));
  }
  return normalized;
}
