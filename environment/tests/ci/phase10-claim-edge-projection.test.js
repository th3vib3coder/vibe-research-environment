import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLAIM_EDGE_PROJECTION_RELATIONS,
  projectClaimEdgeStub
} from '../../phase10/claim-edge-projection.js';

function validEdge(overrides = {}) {
  return {
    schemaVersion: 'phase9.claim-edge.v1',
    edgeId: 'EDGE-001',
    fromId: 'CLAIM-alpha',
    toId: 'CLAIM-beta',
    relation: 'supports',
    createdAt: '2026-06-09T10:00:00.000Z',
    confidence: 0.9,
    sourceR2EventId: 'EV-0001',
    objectiveId: 'OBJ-001',
    ...overrides
  };
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('claim-edge projection relation catalog matches Phase 9 claim-edge enum', () => {
  assert.deepEqual(CLAIM_EDGE_PROJECTION_RELATIONS, [
    'supports',
    'contradicts',
    'supersedes',
    'depends_on',
    'evolved_into',
    'related_to'
  ]);
});

test('projects an existing active edge to deterministic metadata-only wiki stub', () => {
  const projection = projectClaimEdgeStub({
    edgeId: 'EDGE-001',
    edges: [validEdge()]
  });

  assert.deepEqual(projection, {
    projectionVersion: 'phase10.claim-edge-projection.v1',
    edgeId: 'EDGE-001',
    sourceSchemaVersion: 'phase9.claim-edge.v1',
    kind: 'claim-edge-metadata',
    fromId: 'CLAIM-alpha',
    toId: 'CLAIM-beta',
    relation: 'supports',
    objectiveId: 'OBJ-001',
    sourceR2EventId: 'EV-0001',
    confidence: 0.9,
    lifecycleMarker: 'current',
    scientificEvidence: false,
    provenanceLink: {
      kind: 'edge',
      targetRef: { type: 'edge', id: 'EDGE-001' },
      edgeMarker: 'current'
    },
    markdown: [
      '# Claim Edge Projection EDGE-001',
      '',
      '- kind: claim-edge-metadata',
      '- sourceSchemaVersion: phase9.claim-edge.v1',
      '- relation: supports',
      '- fromId: CLAIM-alpha',
      '- toId: CLAIM-beta',
      '- edgeMarker: current',
      '- scientificEvidence: false'
    ].join('\n')
  });
});

test('missing EDGE reference fails closed', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'EDGE-missing', edges: [validEdge()] }),
    'E_PHASE10_CLAIM_EDGE_NOT_FOUND'
  );
});

test('duplicate EDGE reference fails closed', () => {
  expectCode(
    () => projectClaimEdgeStub({
      edgeId: 'EDGE-001',
      edges: [validEdge(), validEdge({ fromId: 'CLAIM-other' })]
    }),
    'E_PHASE10_CLAIM_EDGE_DUPLICATE'
  );
});

test('writer injection fails closed before any projection', () => {
  expectCode(
    () => projectClaimEdgeStub({
      edgeId: 'EDGE-001',
      edges: [validEdge()],
      edgeWriter: () => ({ ok: true })
    }),
    'E_PHASE10_CLAIM_EDGE_WRITER_FORBIDDEN'
  );
});

test('projection does not mutate the input edge collection', () => {
  const edge = validEdge();
  const edges = [edge];
  const before = JSON.stringify(edges);
  projectClaimEdgeStub({ edgeId: 'EDGE-001', edges });
  assert.equal(JSON.stringify(edges), before);
});

test('wrong schemaVersion fails closed', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'EDGE-001', edges: [validEdge({ schemaVersion: 'phase10.claim-edge.v1' })] }),
    'E_PHASE10_CLAIM_EDGE_SCHEMA_VERSION'
  );
});

test('unknown relation fails closed', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'EDGE-001', edges: [validEdge({ relation: 'refutes' })] }),
    'E_PHASE10_CLAIM_EDGE_RELATION_UNKNOWN'
  );
});

test('self-loop edge fails closed like the Phase 9 store consumer guard', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'EDGE-001', edges: [validEdge({ toId: 'CLAIM-alpha' })] }),
    'E_PHASE10_CLAIM_EDGE_SELF_LOOP'
  );
});

test('edge metadata cannot be projected as scientific evidence', () => {
  expectCode(
    () => projectClaimEdgeStub({
      edgeId: 'EDGE-001',
      edges: [validEdge()],
      citeAsScientificEvidence: true
    }),
    'E_PHASE10_CLAIM_EDGE_METADATA_NOT_EVIDENCE'
  );
});

test('supersedes projection carries stale marker', () => {
  const projection = projectClaimEdgeStub({
    edgeId: 'EDGE-001',
    edges: [validEdge({ relation: 'supersedes' })]
  });

  assert.equal(projection.lifecycleMarker, 'supersedes');
  assert.equal(projection.provenanceLink.edgeMarker, 'supersedes');
  assert.match(projection.markdown, /edgeMarker: supersedes/u);
});

test('evolved_into projection carries stale marker', () => {
  const projection = projectClaimEdgeStub({
    edgeId: 'EDGE-001',
    edges: [validEdge({ relation: 'evolved_into' })]
  });

  assert.equal(projection.lifecycleMarker, 'evolved_into');
  assert.equal(projection.provenanceLink.edgeMarker, 'evolved_into');
});

test('review relay verdict cannot be included as scientific provenance', () => {
  expectCode(
    () => projectClaimEdgeStub({
      edgeId: 'EDGE-001',
      edges: [validEdge()],
      relayVerdictAsProvenance: { verdictId: 'RELAY-001' }
    }),
    'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE'
  );
});

test('projection requires an EDGE-* id', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'CLAIM-alpha', edges: [validEdge()] }),
    'E_PHASE10_CLAIM_EDGE_ID_INVALID'
  );
});

test('edge list must be an array', () => {
  expectCode(
    () => projectClaimEdgeStub({ edgeId: 'EDGE-001', edges: null }),
    'E_PHASE10_CLAIM_EDGE_COLLECTION_INVALID'
  );
});
