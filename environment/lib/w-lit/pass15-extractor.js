const ALLOWED_KINDS = new Set(['claim', 'method', 'confounder']);
const FORBIDDEN_CITE_PREFIXES = [
  'wiki/',
  'query/',
  'chat/',
  'review/',
  'generated/'
];

function fail(code) {
  throw new Error(code);
}

function asText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code);
  }
  return value;
}

function asArray(value, code) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(code);
  }
  return value;
}

function parseBlocks(markdown) {
  const blocks = [];
  const pattern = /```json paperAssertion\r?\n([\s\S]*?)\r?\n```/gu;
  for (const match of markdown.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      fail('E_W_LIT_ASSERTION_JSON_INVALID');
    }
  }

  if (blocks.length === 0) {
    fail('E_W_LIT_ASSERTION_BLOCK_MISSING');
  }
  return blocks;
}

function assertKind(kind) {
  if (!ALLOWED_KINDS.has(kind)) {
    fail('E_W_LIT_ASSERTION_KIND_INVALID');
  }
}

function assertCites(cites) {
  for (const cite of asArray(cites, 'E_W_LIT_ASSERTION_CITES_REQUIRED')) {
    if (typeof cite !== 'string' || cite.trim() === '') {
      fail('E_W_LIT_ASSERTION_CITE_INVALID');
    }
    if (!(cite.startsWith('raw/') || cite.startsWith('data/'))) {
      fail('E_W_LIT_ASSERTION_CITE_FORBIDDEN');
    }
    if (FORBIDDEN_CITE_PREFIXES.some((prefix) => cite.startsWith(prefix))) {
      fail('E_W_LIT_ASSERTION_CITE_FORBIDDEN');
    }
  }
}

function normalizeAssertion(raw, sourcePath) {
  const kind = asText(raw?.kind, 'E_W_LIT_ASSERTION_KIND_REQUIRED');
  assertKind(kind);
  assertCites(raw?.cites);

  const paperAssertionId = asText(
    raw.paperAssertionId ?? raw.id,
    'E_W_LIT_ASSERTION_ID_REQUIRED'
  );
  const text = asText(raw.text, 'E_W_LIT_ASSERTION_TEXT_REQUIRED');

  return {
    ...raw,
    id: raw.id ?? paperAssertionId,
    paperAssertionId,
    sourcePaperId: raw.sourcePaperId ?? sourcePath,
    kind,
    text,
    cites: [...raw.cites],
    supports: raw.supports == null ? undefined : [...raw.supports],
    contradicts: raw.contradicts == null ? undefined : [...raw.contradicts],
    runtimeOpened: false,
    syntheticFixture: raw.syntheticFixture === true,
    notBiomedicalEvidence: raw.notBiomedicalEvidence === true
  };
}

export function extractPaperAssertions(options = {}) {
  const markdown = asText(options.markdown, 'E_W_LIT_MARKDOWN_REQUIRED');
  const sourcePath = asText(options.sourcePath, 'E_W_LIT_SOURCE_PATH_REQUIRED');
  return parseBlocks(markdown).map((block) => normalizeAssertion(block, sourcePath));
}
