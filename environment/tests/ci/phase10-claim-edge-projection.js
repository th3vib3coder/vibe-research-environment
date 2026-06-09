import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  CLAIM_EDGE_PROJECTION_RELATIONS,
  projectClaimEdgeStub
} from '../../phase10/claim-edge-projection.js';

function validEdge(overrides = {}) {
  return {
    schemaVersion: 'phase9.claim-edge.v1',
    edgeId: 'EDGE-ci',
    fromId: 'CLAIM-ci-a',
    toId: 'CLAIM-ci-b',
    relation: 'supports',
    createdAt: '2026-06-09T10:00:00.000Z',
    objectiveId: 'OBJ-ci',
    ...overrides
  };
}

export default async function validatePhase10ClaimEdgeProjection() {
  assert(
    JSON.stringify(CLAIM_EDGE_PROJECTION_RELATIONS) === JSON.stringify([
      'supports',
      'contradicts',
      'supersedes',
      'depends_on',
      'evolved_into',
      'related_to'
    ]),
    'Phase 10 claim-edge projection relation catalog drifted from phase9.claim-edge.v1'
  );

  const projection = projectClaimEdgeStub({
    edgeId: 'EDGE-ci',
    edges: [validEdge()]
  });

  assert(
    projection.provenanceLink.kind === 'edge'
      && projection.scientificEvidence === false
      && projection.kind === 'claim-edge-metadata',
    'Claim-edge projection must stay metadata-only with edge provenance linkage'
  );

  try {
    projectClaimEdgeStub({
      edgeId: 'EDGE-ci',
      edges: [validEdge()],
      edgeWriter: () => ({ ok: true })
    });
    throw new Error('writer guard did not fail');
  } catch (error) {
    assert(
      error.code === 'E_PHASE10_CLAIM_EDGE_WRITER_FORBIDDEN',
      `Expected writer guard failure, got ${error.code ?? error.message}`
    );
  }

  try {
    projectClaimEdgeStub({
      edgeId: 'EDGE-ci',
      edges: [validEdge()],
      citeAsScientificEvidence: true
    });
    throw new Error('metadata evidence guard did not fail');
  } catch (error) {
    assert(
      error.code === 'E_PHASE10_CLAIM_EDGE_METADATA_NOT_EVIDENCE',
      `Expected metadata evidence guard failure, got ${error.code ?? error.message}`
    );
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-claim-edge-projection', validatePhase10ClaimEdgeProjection);
}
