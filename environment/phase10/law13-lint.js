export const LAW13_CHECKS = Object.freeze([
  'wiki-page-requires-provenance',
  'raw-document-requires-trust-tier',
  'assertion-cites-required',
  'query-not-provenance',
  'synthesis-not-cites-query',
  'synthesis-r2-audit-required',
  'transitive-isolation',
  'edge-reference-resolves',
  'edge-stale-or-superseded-marker-required',
  'domain-link-bidirectional-integrity',
  'phase10-domain-name-anti-clash'
]);

const AUTHORITATIVE_PAGE_TYPES = new Set(['source', 'concept', 'synthesis', 'entity']);
const STALE_EDGE_STATUSES = new Set(['stale', 'superseded', 'retracted']);
const ACCEPTED_EDGE_MARKERS = new Set(['stale', 'superseded', 'retracted', 'accepted-stale', 'accepted-superseded']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function refId(cite) {
  if (typeof cite === 'string') return cite;
  if (cite && typeof cite === 'object') return cite.ref ?? cite.linkId ?? cite.id;
  return undefined;
}

function objectiveIdForDomainLink(link) {
  if (typeof link === 'string') return link;
  if (link && typeof link === 'object') return link.objectiveId;
  return undefined;
}

function isQueryPath(value) {
  return typeof value === 'string' && value.replaceAll('\\', '/').startsWith('wiki/queries/');
}

function isPhase10DomainReference(value) {
  return typeof value === 'string' && /\bphase10\.domain\.v1\b/u.test(value);
}

function hasPassedR2Audit(page) {
  return page?.r2Audit?.status === 'passed' || page?.r2Audit?.verdict === 'ACCEPT';
}

function isEdgeProvenanceLink(link) {
  return link?.kind === 'edge' || link?.targetRef?.type === 'edge';
}

function isRelayVerdictLink(link) {
  const targetType = link?.targetRef?.type;
  return targetType === 'phase12-relay-verdict' || targetType === 'relay-verdict';
}

function edgeIdForLink(link) {
  if (link?.targetRef?.type === 'edge') return link.targetRef.id;
  if (typeof link?.edgeId === 'string') return link.edgeId;
  return undefined;
}

function buildIndexes(corpus) {
  const provenanceById = new Map();
  for (const link of asArray(corpus.provenanceLinks)) {
    if (typeof link?.linkId === 'string') provenanceById.set(link.linkId, link);
  }

  const pageById = new Map();
  for (const page of asArray(corpus.wikiPages)) {
    if (typeof page?.pageId === 'string') pageById.set(page.pageId, page);
  }

  const edgeById = new Map();
  for (const edge of asArray(corpus.claimEdges)) {
    if (typeof edge?.edgeId === 'string') edgeById.set(edge.edgeId, edge);
  }

  const domainById = new Map();
  for (const domain of asArray(corpus.domains)) {
    if (typeof domain?.domainId === 'string') domainById.set(domain.domainId, domain);
  }

  const objectiveById = new Map();
  for (const objective of asArray(corpus.objectives)) {
    if (typeof objective?.objectiveId === 'string') objectiveById.set(objective.objectiveId, objective);
  }

  return { provenanceById, pageById, edgeById, domainById, objectiveById };
}

export function lintPhase10Corpus(corpus = {}) {
  const issues = [];
  const indexes = buildIndexes(corpus);

  function issue(code, check, message, extra = {}) {
    issues.push({ code, check, message, ...extra });
  }

  function linkForCitation(cite) {
    const id = refId(cite);
    return id ? indexes.provenanceById.get(id) : undefined;
  }

  for (const page of asArray(corpus.wikiPages)) {
    const assertions = asArray(page?.assertionGraph);
    if (assertions.length === 0 && AUTHORITATIVE_PAGE_TYPES.has(page?.type)) {
      issue(
        'E_PHASE10_WIKI_PAGE_REQUIRES_PROVENANCE',
        'wiki-page-requires-provenance',
        'Authoritative wiki page has no assertion graph.',
        { pageId: page?.pageId }
      );
    }

    for (const assertion of assertions) {
      if (!Array.isArray(assertion?.cites)) {
        issue(
          'E_PHASE10_WIKI_PAGE_REQUIRES_PROVENANCE',
          'wiki-page-requires-provenance',
          'Assertion-level cites[] is required; page-level provenance is not sufficient.',
          { pageId: page?.pageId, assertionId: assertion?.assertionId }
        );
        continue;
      }

      if (assertion.cites.length === 0) {
        issue(
          'E_PHASE10_ASSERTION_CITES_REQUIRED',
          'assertion-cites-required',
          'Assertion cites[] must be non-empty.',
          { pageId: page?.pageId, assertionId: assertion?.assertionId }
        );
      }

      for (const cite of assertion.cites) {
        const link = linkForCitation(cite);
        if (!link) continue;

        const queryAsEvidence = isQueryPath(link.sourcePath)
          || link.targetRef?.type === 'query-record'
          || isQueryPath(link.targetRef?.path);
        if (queryAsEvidence) {
          issue(
            'E_PHASE10_QUERY_NOT_PROVENANCE',
            'query-not-provenance',
            'Query outputs may be origin metadata, not LAW 13 provenance.',
            { pageId: page?.pageId, assertionId: assertion?.assertionId, linkId: link.linkId }
          );
          if (page?.type === 'synthesis') {
            issue(
              'E_PHASE10_SYNTHESIS_NOT_CITES_QUERY',
              'synthesis-not-cites-query',
              'Synthesis pages must cite original sources, not query outputs.',
              { pageId: page?.pageId, assertionId: assertion?.assertionId, linkId: link.linkId }
            );
          }
        }

        if (AUTHORITATIVE_PAGE_TYPES.has(page?.type)) {
          const targetPage = link.targetRef?.type === 'wiki-page'
            ? indexes.pageById.get(link.targetRef.id)
            : undefined;
          if (targetPage?.type === 'hypothesis' || link.targetRef?.type === 'hypothesis') {
            issue(
              'E_PHASE10_TRANSITIVE_ISOLATION',
              'transitive-isolation',
              'Authoritative pages must not cite hypothesis pages as provenance.',
              { pageId: page?.pageId, assertionId: assertion?.assertionId, linkId: link.linkId }
            );
          }
        }

        if (isRelayVerdictLink(link)) {
          issue(
            'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE',
            'query-not-provenance',
            'Phase 12 relay verdicts are metadata and cannot be LAW 13 provenance.',
            { pageId: page?.pageId, assertionId: assertion?.assertionId, linkId: link.linkId }
          );
        }
      }
    }

    if (page?.type === 'synthesis' && !hasPassedR2Audit(page)) {
      issue(
        'E_PHASE10_SYNTHESIS_R2_AUDIT_REQUIRED',
        'synthesis-r2-audit-required',
        'Synthesis pages require a passed R2 audit before publication.',
        { pageId: page?.pageId }
      );
    }
  }

  for (const raw of asArray(corpus.rawDocuments)) {
    if (typeof raw?.trustTier !== 'string' || raw.trustTier.length === 0) {
      issue(
        'E_PHASE10_RAW_DOCUMENT_REQUIRES_TRUST_TIER',
        'raw-document-requires-trust-tier',
        'Raw documents require trustTier.',
        { rawDocumentId: raw?.rawDocumentId }
      );
    }
  }

  for (const link of asArray(corpus.provenanceLinks)) {
    if (!isEdgeProvenanceLink(link)) continue;
    const edgeId = edgeIdForLink(link);
    const edge = edgeId ? indexes.edgeById.get(edgeId) : undefined;
    if (!edge) {
      issue(
        'E_PHASE10_EDGE_REFERENCE_RESOLVES',
        'edge-reference-resolves',
        'EDGE provenance references must resolve to an existing Phase 9 claim edge.',
        { linkId: link?.linkId, edgeId }
      );
      continue;
    }

    if (STALE_EDGE_STATUSES.has(edge.lifecycleStatus) && !ACCEPTED_EDGE_MARKERS.has(link.edgeMarker)) {
      issue(
        'E_PHASE10_EDGE_STALE_MARKER_REQUIRED',
        'edge-stale-or-superseded-marker-required',
        'Stale or superseded edge references require an explicit marker.',
        { linkId: link?.linkId, edgeId }
      );
    }
  }

  for (const domain of asArray(corpus.domains)) {
    for (const objectiveLink of asArray(domain?.objectiveLinks)) {
      const objectiveId = objectiveIdForDomainLink(objectiveLink);
      const objective = indexes.objectiveById.get(objectiveId);
      if (!objective || objective.domainId !== domain.domainId) {
        issue(
          'E_PHASE10_DOMAIN_LINK_BIDIRECTIONAL_INTEGRITY',
          'domain-link-bidirectional-integrity',
          'Domain objectiveLinks must point to objectives that link back to the same domain.',
          { domainId: domain?.domainId, objectiveId }
        );
      }
    }
  }

  for (const objective of asArray(corpus.objectives)) {
    if (typeof objective?.domainId !== 'string') continue;
    const domain = indexes.domainById.get(objective.domainId);
    const hasReciprocalLink = domain
      ? asArray(domain.objectiveLinks).some((link) => objectiveIdForDomainLink(link) === objective.objectiveId)
      : false;
    if (!hasReciprocalLink) {
      issue(
        'E_PHASE10_DOMAIN_LINK_BIDIRECTIONAL_INTEGRITY',
        'domain-link-bidirectional-integrity',
        'Objective domainId must point to a domain that links back to the objective.',
        { domainId: objective.domainId, objectiveId: objective.objectiveId }
      );
    }
  }

  for (const reference of asArray(corpus.implementationRefs)) {
    if (isPhase10DomainReference(reference)) {
      issue(
        'E_PHASE10_DOMAIN_NAME_ANTI_CLASH',
        'phase10-domain-name-anti-clash',
        'Implementation-facing Phase 10 domain references must use phase10.knowledge-domain.v1.',
        { reference }
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
