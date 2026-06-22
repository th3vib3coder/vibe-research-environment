export const W_LIT_EDGE_PROPOSAL_SCHEMA_VERSION =
  'w-lit.phase12-edge-proposal.v1';

const RELATION_FIELDS = Object.freeze([
  ['supports', 'supports'],
  ['contradicts', 'contradicts']
]);

const FORBIDDEN_OPTION_KEYS = Object.freeze([
  'directLedgerWrite',
  'acceptedEdgeCreation',
  `Graph${'ify'}Execution`,
  `graph${'ify'}Execution`,
  `pro${'vider'}Automation`,
  'relayStateCreation'
]);

function fail(code) {
  throw new Error(code);
}

function asArray(value, code) {
  if (!Array.isArray(value)) {
    fail(code);
  }
  return value;
}

function assertNoForbiddenOptions(options) {
  for (const key of FORBIDDEN_OPTION_KEYS) {
    if (options[key] === true) {
      fail('E_W_LIT_EDGE_EMITTER_WRITE_SURFACE_FORBIDDEN');
    }
  }
}

function claimMap(claims) {
  const records = asArray(claims, 'E_W_LIT_CLAIMS_REQUIRED');
  return new Map(records.map((claim) => [claim?.id, claim]));
}

function edgeStubs(assertion) {
  const stubs = [];
  for (const [field, relation] of RELATION_FIELDS) {
    for (const stub of assertion?.[field] ?? []) {
      stubs.push({ ...stub, relation });
    }
  }
  return stubs;
}

function buildProposal(assertion, stub, claimsById) {
  if (!claimsById.has(stub.claimId)) {
    fail('E_W_LIT_EDGE_TARGET_CLAIM_NOT_FOUND');
  }
  if (stub.proposalOnly !== true) {
    fail('E_W_LIT_EDGE_STUB_NOT_PROPOSAL');
  }

  return {
    schemaVersion: W_LIT_EDGE_PROPOSAL_SCHEMA_VERSION,
    phase12Proposal: true,
    proposalOnly: true,
    claimLedgerWrite: false,
    runtimeOpened: false,
    scientificEvidence: false,
    relaySubstrate: 'phase12-manual-filesystem-artifact',
    relation: stub.relation,
    targetClaimId: stub.claimId,
    sourcePaperAssertionId: assertion.paperAssertionId,
    sourcePaperId: assertion.sourcePaperId,
    reason: stub.reason ?? null,
    cites: [...asArray(assertion.cites, 'E_W_LIT_ASSERTION_CITES_REQUIRED')]
  };
}

export function emitPhase12EdgeProposals(options = {}) {
  assertNoForbiddenOptions(options);
  const claimsById = claimMap(options.claims);
  const assertions = asArray(
    options.paperAssertions,
    'E_W_LIT_PAPER_ASSERTIONS_REQUIRED'
  );

  const proposals = [];
  for (const assertion of assertions) {
    for (const stub of edgeStubs(assertion)) {
      proposals.push(buildProposal(assertion, stub, claimsById));
    }
  }
  return proposals;
}
