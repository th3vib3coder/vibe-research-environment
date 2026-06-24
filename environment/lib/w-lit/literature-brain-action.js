import { emitPhase12EdgeProposals } from './edge-emitter.js';
import { walkLiteratureSources } from './literature-walk.js';
import {
  extractPaperAssertions
} from './pass15-extractor.js';
import {
  assertNoPaperContradictsClaimMustEdgeIssues,
  lintPaperContradictsClaimMustEdge
} from './lint-paper-contradicts-claim-must-edge.js';

export const W_LIT_L0_BRIDGE_SCHEMA_VERSION =
  'w-lit.l0-proposal-bridge.v1';
export const W_LIT_L0_ACTION_TYPE = 'phase12-edge-proposal-review';

const DEFAULT_ACTION_ID = 'w-lit-phase12-edge-proposal-review';
const DEFAULT_DIRECTION_ID = 'DIR-W-LIT-PHASE12-EDGE-PROPOSAL-REVIEW';
const DEFAULT_SUMMARY =
  'Review W-LIT Phase12 edge proposals from paper assertions';

function fail(code) {
  throw new Error(code);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function asArray(value, code) {
  if (!Array.isArray(value)) {
    fail(code);
  }
  return value;
}

function asPages(value) {
  const pages = asArray(value, 'E_W_LIT_BRIDGE_PAGES_REQUIRED');
  if (pages.length === 0) {
    fail('E_W_LIT_BRIDGE_PAGES_REQUIRED');
  }
  return pages;
}

function normalizePage(page) {
  if (!page || typeof page !== 'object') {
    fail('E_W_LIT_BRIDGE_PAGE_INVALID');
  }
  if (!nonEmptyString(page.sourcePath)) {
    fail('E_W_LIT_BRIDGE_SOURCE_PATH_REQUIRED');
  }
  if (!nonEmptyString(page.markdown)) {
    fail('E_W_LIT_BRIDGE_MARKDOWN_REQUIRED');
  }
  return {
    sourcePath: page.sourcePath.trim(),
    markdown: page.markdown
  };
}

async function pagesFromCorpus(options) {
  const entries = await walkLiteratureSources({
    corpusRoot: options.corpusRoot,
    tokenCounterOptions: options.tokenCounterOptions
  });
  if (typeof options.readSource !== 'function') {
    fail('E_W_LIT_BRIDGE_READ_SOURCE_REQUIRED');
  }

  const pages = [];
  for (const entry of entries) {
    const markdown = await options.readSource(entry);
    pages.push(normalizePage({
      sourcePath: entry.sourcePath,
      markdown
    }));
  }
  return asPages(pages);
}

async function collectPages(options) {
  if (Array.isArray(options.pages)) {
    return asPages(options.pages).map(normalizePage);
  }
  if (nonEmptyString(options.corpusRoot)) {
    return pagesFromCorpus(options);
  }
  fail('E_W_LIT_BRIDGE_PAGES_REQUIRED');
}

function extractAssertions(pages) {
  return pages.flatMap((page) =>
    extractPaperAssertions({
      sourcePath: page.sourcePath,
      markdown: page.markdown
    })
  );
}

function lintPages(pages, paperAssertions) {
  const assertionsByPath = new Map();
  for (const assertion of paperAssertions) {
    const list = assertionsByPath.get(assertion.sourcePaperId) ?? [];
    list.push(assertion);
    assertionsByPath.set(assertion.sourcePaperId, list);
  }

  const issues = lintPaperContradictsClaimMustEdge({
    pages: pages.map((page) => ({
      sourcePath: page.sourcePath,
      markdown: page.markdown,
      paperAssertions: assertionsByPath.get(page.sourcePath) ?? []
    }))
  });
  assertNoPaperContradictsClaimMustEdgeIssues(issues);
}

function buildCandidate(options, edgeProposals, paperAssertions) {
  const actionId = nonEmptyString(options.actionId)
    ? options.actionId.trim()
    : DEFAULT_ACTION_ID;
  const summary = nonEmptyString(options.summary)
    ? options.summary.trim()
    : DEFAULT_SUMMARY;
  const directionId = nonEmptyString(options.directionId)
    ? options.directionId.trim()
    : DEFAULT_DIRECTION_ID;

  return {
    id: actionId,
    actionType: W_LIT_L0_ACTION_TYPE,
    summary,
    priority: Number.isFinite(options.priority) ? options.priority : 0,
    highStakes: true,
    proposalOnly: true,
    actionExecuted: false,
    runtimeOpened: false,
    claimLedgerWrite: false,
    phase12Proposal: true,
    direction: {
      directionId,
      summary
    },
    rationale: {
      schemaVersion: `${W_LIT_L0_BRIDGE_SCHEMA_VERSION}.rationale`,
      objectiveId: nonEmptyString(options.objectiveId)
        ? options.objectiveId.trim()
        : null,
      proposalCount: edgeProposals.length,
      paperAssertionCount: paperAssertions.length,
      proposalRelations: edgeProposals.map((proposal) => proposal.relation),
      proposalOnly: true,
      actionExecuted: false,
      runtimeOpened: false
    }
  };
}

export async function buildLiteratureBrainProposalCandidate(options = {}) {
  const pages = await collectPages(options);
  const paperAssertions = extractAssertions(pages);
  lintPages(pages, paperAssertions);

  const edgeProposals = emitPhase12EdgeProposals({
    ...options,
    paperAssertions,
    claims: asArray(options.claims, 'E_W_LIT_CLAIMS_REQUIRED')
  });

  if (edgeProposals.length === 0) {
    fail('E_W_LIT_BRIDGE_EDGE_PROPOSAL_REQUIRED');
  }

  return {
    ok: true,
    schemaVersion: W_LIT_L0_BRIDGE_SCHEMA_VERSION,
    proposalOnly: true,
    actionExecuted: false,
    runtimeOpened: false,
    claimLedgerWrite: false,
    phase12Proposal: true,
    paperAssertions,
    edgeProposals,
    candidate: buildCandidate(options, edgeProposals, paperAssertions)
  };
}
