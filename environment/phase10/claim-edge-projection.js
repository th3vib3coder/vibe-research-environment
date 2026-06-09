export const CLAIM_EDGE_PROJECTION_VERSION = 'phase10.claim-edge-projection.v1';
export const CLAIM_EDGE_SOURCE_SCHEMA_VERSION = 'phase9.claim-edge.v1';
export const CLAIM_EDGE_PROJECTION_RELATIONS = Object.freeze([
  'supports',
  'contradicts',
  'supersedes',
  'depends_on',
  'evolved_into',
  'related_to'
]);

const RELATION_SET = new Set(CLAIM_EDGE_PROJECTION_RELATIONS);
const STALE_MARKER_RELATIONS = new Set(['supersedes', 'evolved_into']);

export class ClaimEdgeProjectionError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'ClaimEdgeProjectionError';
    this.code = code;
    this.extra = extra;
  }
}

function failProjection(code, message, extra = {}) {
  throw new ClaimEdgeProjectionError({ code, message, extra });
}

function assertNoWriter(options) {
  if (options.edgeWriter != null) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_WRITER_FORBIDDEN',
      'Phase 10 claim-edge projection is read-only and must not receive an edge writer.'
    );
  }
}

function assertMetadataBoundary(options) {
  if (options.citeAsScientificEvidence === true) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_METADATA_NOT_EVIDENCE',
      'Claim-edge metadata is not scientific evidence.'
    );
  }

  if (options.relayVerdictAsProvenance != null) {
    failProjection(
      'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE',
      'Review relay verdicts are metadata, not scientific provenance.'
    );
  }
}

function resolveEdge(edgeId, edges) {
  if (typeof edgeId !== 'string' || !/^EDGE-.+/u.test(edgeId)) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_ID_INVALID',
      `Phase 10 edge projection requires an EDGE-* id: ${edgeId ?? '(missing)'}`,
      { edgeId }
    );
  }

  if (!Array.isArray(edges)) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_COLLECTION_INVALID',
      'Phase 10 edge projection requires an array of Phase 9 claim edges.'
    );
  }

  const matches = edges.filter((edge) => edge?.edgeId === edgeId);
  if (matches.length === 0) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_NOT_FOUND',
      `Phase 10 edge projection could not resolve ${edgeId}.`,
      { edgeId }
    );
  }

  if (matches.length > 1) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_DUPLICATE',
      `Phase 10 edge projection found duplicate records for ${edgeId}.`,
      { edgeId, count: matches.length }
    );
  }

  return { ...matches[0] };
}

function validateEdge(edge) {
  if (edge.schemaVersion !== CLAIM_EDGE_SOURCE_SCHEMA_VERSION) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_SCHEMA_VERSION',
      `Phase 10 projections consume only ${CLAIM_EDGE_SOURCE_SCHEMA_VERSION}.`,
      { schemaVersion: edge.schemaVersion }
    );
  }

  if (!RELATION_SET.has(edge.relation)) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_RELATION_UNKNOWN',
      `Claim-edge relation is not in the reviewed Phase 9 enum: ${edge.relation ?? '(missing)'}`,
      { relation: edge.relation }
    );
  }

  if (edge.fromId === edge.toId) {
    failProjection(
      'E_PHASE10_CLAIM_EDGE_SELF_LOOP',
      'Phase 10 projections reject self-loop claim edges like the Phase 9 store consumer.',
      { edgeId: edge.edgeId, claimId: edge.fromId }
    );
  }
}

function edgeMarkerFor(edge) {
  return STALE_MARKER_RELATIONS.has(edge.relation) ? edge.relation : 'current';
}

function projectionMarkdown(projection) {
  return [
    `# Claim Edge Projection ${projection.edgeId}`,
    '',
    '- kind: claim-edge-metadata',
    `- sourceSchemaVersion: ${projection.sourceSchemaVersion}`,
    `- relation: ${projection.relation}`,
    `- fromId: ${projection.fromId}`,
    `- toId: ${projection.toId}`,
    `- edgeMarker: ${projection.lifecycleMarker}`,
    '- scientificEvidence: false'
  ].join('\n');
}

export function projectClaimEdgeStub(options = {}) {
  assertNoWriter(options);
  assertMetadataBoundary(options);

  const edge = resolveEdge(options.edgeId, options.edges);
  validateEdge(edge);

  const marker = edgeMarkerFor(edge);
  const projection = {
    projectionVersion: CLAIM_EDGE_PROJECTION_VERSION,
    edgeId: edge.edgeId,
    sourceSchemaVersion: CLAIM_EDGE_SOURCE_SCHEMA_VERSION,
    kind: 'claim-edge-metadata',
    fromId: edge.fromId,
    toId: edge.toId,
    relation: edge.relation,
    objectiveId: edge.objectiveId ?? null,
    sourceR2EventId: edge.sourceR2EventId ?? null,
    confidence: edge.confidence ?? null,
    lifecycleMarker: marker,
    scientificEvidence: false,
    provenanceLink: {
      kind: 'edge',
      targetRef: { type: 'edge', id: edge.edgeId },
      edgeMarker: marker
    }
  };

  return {
    ...projection,
    markdown: projectionMarkdown(projection)
  };
}
