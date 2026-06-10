import {
  scanAssertionRisk
} from './risk-scanner.js';

export const DECLARED_ASSERTION_KINDS = Object.freeze([
  'extractive-fact',
  'definition',
  'synonym',
  'observed-association',
  'quantitative-observation',
  'method-description',
  'causal-claim',
  'mechanism',
  'contradiction',
  'cross-source-comparison',
  'clinical-implication',
  'priority-ranking'
]);

const ALL_KINDS = new Set(DECLARED_ASSERTION_KINDS);
const EXTRACTIVE_KINDS = new Set([
  'extractive-fact',
  'definition',
  'synonym',
  'observed-association',
  'quantitative-observation',
  'method-description'
]);
const ENTITY_KINDS = new Set(['extractive-fact', 'definition', 'synonym']);
const LAW13_STATUSES = new Set(['sourced', 'computed', 'claimed', 'supposition']);
const PAGE_TYPES = new Set(['source', 'concept', 'synthesis', 'hypothesis', 'entity']);
const COMPUTED_ASSERTION_FIELDS = ['riskFlags', 'finalRouting'];

export class AssertionGraphError extends Error {
  constructor({ code, message, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'AssertionGraphError';
    this.code = code;
    this.extra = extra;
  }
}

function failGraph(code, message, extra = {}) {
  throw new AssertionGraphError({ code, message, extra });
}

function allowedKindsForPageType(pageType) {
  if (pageType === 'source' || pageType === 'concept') return EXTRACTIVE_KINDS;
  if (pageType === 'entity') return ENTITY_KINDS;
  if (pageType === 'synthesis' || pageType === 'hypothesis') return ALL_KINDS;
  return new Set();
}

function hasPositiveRisk(riskFlags) {
  return riskFlags.includes('causal-or-mechanistic-language');
}

function hasHypothesisReviewSignal(assertion, riskFlags) {
  return assertion.status === 'supposition' || riskFlags.includes('hedge-causality');
}

function assertEdgeRefsResolve(assertion, claimEdges) {
  const edgeRefs = assertion.edgeRefs ?? [];
  if (!Array.isArray(edgeRefs)) {
    failGraph(
      'E_PHASE10_ASSERTION_EDGE_REFS_INVALID',
      'edgeRefs must be an array when present',
      { assertionId: assertion.assertionId }
    );
  }

  const edgeIds = new Set((claimEdges ?? []).map((edge) => edge?.edgeId).filter(Boolean));
  for (const edgeRef of edgeRefs) {
    if (!edgeIds.has(edgeRef)) {
      failGraph(
        'E_PHASE10_ASSERTION_EDGE_REFERENCE_MISSING',
        `Assertion edge reference does not resolve: ${edgeRef}`,
        { assertionId: assertion.assertionId, edgeRef }
      );
    }
  }

  return [...edgeRefs];
}

function routeAssertion({ pageType, assertion, riskFlags }) {
  const allowedKinds = allowedKindsForPageType(pageType);
  const declaredKind = assertion.declaredKind;

  if (pageType === 'hypothesis') {
    return 'allowed';
  }

  if (hasPositiveRisk(riskFlags)) {
    if (pageType === 'concept') {
      return 'auto-upgraded-to-synthesis';
    }
    if (pageType === 'source' || pageType === 'entity') {
      failGraph(
        'E_PHASE10_ASSERTION_RISK_CATEGORIZATION',
        `${pageType} pages cannot carry causal or mechanistic assertion risk`,
        { assertionId: assertion.assertionId, pageType, riskFlags }
      );
    }
  }

  if (!allowedKinds.has(declaredKind)) {
    failGraph(
      'E_PHASE10_ASSERTION_KIND_FOR_PAGE_TYPE',
      `${declaredKind} is not allowed for ${pageType} pages`,
      { assertionId: assertion.assertionId, pageType, declaredKind }
    );
  }

  if (pageType !== 'hypothesis' && hasHypothesisReviewSignal(assertion, riskFlags)) {
    return 'routed-to-hypothesis-review';
  }

  return 'allowed';
}

function pageRoutingFor(finalRoutings) {
  if (finalRoutings.includes('auto-upgraded-to-synthesis')) {
    return 'requires-synthesis';
  }
  if (finalRoutings.includes('routed-to-hypothesis-review')) {
    return 'hypothesis-review';
  }
  return 'publishable';
}

function normalizeAssertion({ pageType, assertion, claimEdges }) {
  if (!LAW13_STATUSES.has(assertion?.status)) {
    failGraph(
      'E_PHASE10_ASSERTION_STATUS_INVALID',
      `Invalid LAW 13 assertion status: ${assertion?.status}`,
      { assertionId: assertion?.assertionId }
    );
  }
  if (!ALL_KINDS.has(assertion?.declaredKind)) {
    failGraph(
      'E_PHASE10_ASSERTION_KIND_INVALID',
      `Invalid declared assertion kind: ${assertion?.declaredKind}`,
      { assertionId: assertion?.assertionId }
    );
  }
  for (const field of COMPUTED_ASSERTION_FIELDS) {
    if (Object.hasOwn(assertion, field)) {
      failGraph(
        'E_PHASE10_WIKI_ASSERTION_COMPUTED_FIELD_FORBIDDEN',
        `${field} is computed by T10.2.2 routing and cannot be authored`,
        { assertionId: assertion.assertionId, field }
      );
    }
  }

  const riskFlags = scanAssertionRisk(assertion);
  const finalRouting = routeAssertion({ pageType, assertion, riskFlags });
  const edgeRefs = assertEdgeRefsResolve(assertion, claimEdges);

  const normalized = {
    assertionId: assertion.assertionId,
    text: assertion.text,
    status: assertion.status,
    declaredKind: assertion.declaredKind,
    riskFlags,
    finalRouting,
    cites: [...assertion.cites]
  };

  if (edgeRefs.length > 0) {
    normalized.edgeRefs = edgeRefs;
  }

  return normalized;
}

export function materializeAssertionGraph({
  pageType,
  assertions = [],
  claimEdges = []
} = {}) {
  if (!PAGE_TYPES.has(pageType)) {
    failGraph('E_PHASE10_ASSERTION_PAGE_TYPE_INVALID', `Invalid page type: ${pageType}`);
  }
  if (!Array.isArray(assertions) || assertions.length === 0) {
    failGraph(
      'E_PHASE10_WIKI_ASSERTION_CITES_REQUIRED',
      'wiki page drafts require assertionGraph entries with cites'
    );
  }

  const assertionGraph = assertions.map((assertion) => normalizeAssertion({
    pageType,
    assertion,
    claimEdges
  }));

  return {
    assertionGraph,
    pageRouting: pageType === 'hypothesis'
      ? 'publishable'
      : pageRoutingFor(assertionGraph.map((assertion) => assertion.finalRouting)),
    createdSynthesisPages: []
  };
}
