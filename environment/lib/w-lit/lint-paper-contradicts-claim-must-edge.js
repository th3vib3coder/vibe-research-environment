import {
  extractPaperAssertions
} from './pass15-extractor.js';

export const CONTRADICTION_TERMS = Object.freeze([
  'contradicts',
  'disagrees with',
  'refutes'
]);

const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/gu;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const CONTRADICTION_PATTERN = new RegExp(
  `\\b(?:${CONTRADICTION_TERMS.map(escapeRegex).join('|')})\\b`,
  'iu'
);

function pageText(page) {
  if (typeof page?.markdown !== 'string') {
    return '';
  }
  return page.markdown.replace(FENCED_BLOCK_PATTERN, '');
}

function assertionsForPage(page) {
  if (Array.isArray(page?.paperAssertions)) {
    return page.paperAssertions;
  }
  if (typeof page?.markdown !== 'string') {
    return [];
  }
  try {
    return extractPaperAssertions({
      markdown: page.markdown,
      sourcePath: page.sourcePath ?? 'wiki/sources/unknown.md'
    });
  } catch {
    return [];
  }
}

function contradictionStubs(assertions) {
  return assertions.flatMap((assertion) => assertion?.contradicts ?? []);
}

function isValidContradictionStub(stub) {
  const relation = stub?.relation ?? 'contradicts';
  return relation === 'contradicts'
    && typeof stub?.claimId === 'string'
    && stub.claimId.trim() !== ''
    && stub.proposalOnly === true;
}

function issue(code, page, message) {
  return {
    code,
    sourcePath: page?.sourcePath ?? null,
    message
  };
}

export function lintPaperContradictsClaimMustEdge(input = {}) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const issues = [];

  for (const page of pages) {
    if (!CONTRADICTION_PATTERN.test(pageText(page))) {
      continue;
    }

    const stubs = contradictionStubs(assertionsForPage(page));
    if (stubs.length === 0) {
      issues.push(issue(
        'E_W_LIT_CONTRADICTION_EDGE_REQUIRED',
        page,
        'Paper page uses contradiction vocabulary without a contradicts proposal stub.'
      ));
      continue;
    }

    if (!stubs.some(isValidContradictionStub)) {
      issues.push(issue(
        'E_W_LIT_CONTRADICTION_EDGE_STUB_INVALID',
        page,
        'Contradiction proposal stubs require proposalOnly:true and a target claimId.'
      ));
    }
  }

  return issues;
}

export function assertNoPaperContradictsClaimMustEdgeIssues(issues) {
  if (Array.isArray(issues) && issues.length === 0) {
    return;
  }
  const firstCode = Array.isArray(issues) ? issues[0]?.code : 'unknown';
  throw new Error(firstCode ?? 'E_W_LIT_CONTRADICTION_LINT_FAILED');
}
