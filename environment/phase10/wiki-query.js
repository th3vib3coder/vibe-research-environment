import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';
import {
  activeDomainRecordPath,
  domainStateRootDir
} from './domain-lifecycle.js';

export const QUERY_RECORD_SCHEMA_FILE = 'phase10-query-record.schema.json';
export const WIKI_PAGE_SCHEMA_FILE = 'phase10-wiki-page.schema.json';
export const WIKI_QUERY_MANIFEST_FILE = 'compiled-manifest.json';

export const QUERY_ESTIMATION_TABLE = Object.freeze({
  'targeted-read': Object.freeze({
    queryClass: 'targeted-read',
    expectedPages: 5,
    expectedTokens: 2000,
    expectedHops: 1,
    maxResultRefs: 5,
    maxCitationRefs: 20
  }),
  'broad-read': Object.freeze({
    queryClass: 'broad-read',
    expectedPages: 12,
    expectedTokens: 6000,
    expectedHops: 2,
    maxResultRefs: 12,
    maxCitationRefs: 50
  })
});

const SAFE_DOMAIN_ID_PATTERN = /^KDOM-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_QUERY_ID_PATTERN = /^QUERY-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_WIKI_PAGE_ID_PATTERN = /^WIKI-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const COMPUTED_BY = 'phase10-wiki-query';
const FORBIDDEN_DECISION_USE_CLASSIFICATIONS = new Set(['decision-grade', 'audit-grade']);
const RESERVED_SOURCE_SEGMENTS = new Set([
  '_inbox',
  'raw',
  'skill-cache',
  'export',
  'exports',
  'presentation',
  'presentations',
  'provenance-links',
  'queries',
  'query'
]);

export class WikiQueryError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'WikiQueryError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failQuery(code, message, extra = {}) {
  throw new WikiQueryError({ code, message, extra });
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function normalizeSlashes(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function assertSafeDomainId(domainId) {
  if (typeof domainId !== 'string' || !SAFE_DOMAIN_ID_PATTERN.test(domainId)) {
    failQuery('E_PHASE10_QUERY_DOMAIN_INVALID', `Invalid Phase 10 domain id: ${domainId}`);
  }
}

function assertSafeQueryId(queryId) {
  if (typeof queryId !== 'string' || !SAFE_QUERY_ID_PATTERN.test(queryId)) {
    failQuery('E_PHASE10_QUERY_ID_INVALID', `Invalid query id: ${queryId}`);
  }
}

function assertSafeWikiPageId(pageId) {
  if (typeof pageId !== 'string' || !SAFE_WIKI_PAGE_ID_PATTERN.test(pageId)) {
    failQuery('E_PHASE10_QUERY_PAGE_ID_INVALID', `Invalid wiki page id: ${pageId}`);
  }
}

async function readActiveDomainRecord(projectRoot, options) {
  let domainRecord;
  try {
    domainRecord = await readJson(activeDomainRecordPath(projectRoot, options));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failQuery('E_PHASE10_QUERY_DOMAIN_REQUIRED', 'No active Phase 10 domain exists');
    }
    throw error;
  }

  const validate = await loadValidator(projectRoot, 'phase10-knowledge-domain.schema.json');
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failQuery('E_PHASE10_QUERY_DOMAIN_SCHEMA_INVALID', error.message);
  }

  return domainRecord;
}

function assertActiveDomain(domainRecord, domainId) {
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failQuery(
      'E_PHASE10_QUERY_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is not queryable`,
      { domainId: domainRecord.domainId }
    );
  }
  if (domainRecord.domainId !== domainId) {
    failQuery(
      'E_PHASE10_QUERY_DOMAIN_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      { activeDomainId: domainRecord.domainId, requestedDomainId: domainId }
    );
  }
}

function domainWikiRoot(projectRoot, domainId, options) {
  assertSafeDomainId(domainId);
  return resolveInside(domainStateRootDir(projectRoot, options), domainId, 'wiki');
}

async function readCompiledManifest(projectRoot, domainId, options, timestamp, overrideReason) {
  const manifestPath = resolveInside(
    domainWikiRoot(projectRoot, domainId, options),
    WIKI_QUERY_MANIFEST_FILE
  );
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failQuery('E_PHASE10_QUERY_MANIFEST_REQUIRED', 'Compiled wiki manifest is required');
    }
    throw error;
  }

  if (manifest.active !== true) {
    failQuery('E_PHASE10_QUERY_MANIFEST_INACTIVE', 'Compiled wiki manifest is inactive');
  }
  if (manifest.domainId !== domainId) {
    failQuery(
      'E_PHASE10_QUERY_DOMAIN_MISMATCH',
      `Compiled manifest belongs to ${manifest.domainId}`,
      { manifestDomainId: manifest.domainId, domainId }
    );
  }
  if (!Array.isArray(manifest.pageIds) || manifest.pageIds.length === 0) {
    failQuery('E_PHASE10_QUERY_MANIFEST_EMPTY', 'Compiled manifest pageIds must be non-empty');
  }

  const expiresAt = Date.parse(manifest.expiresAt ?? '');
  const nowMs = Date.parse(timestamp);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(nowMs)) {
    failQuery('E_PHASE10_QUERY_MANIFEST_TIME_INVALID', 'Manifest freshness metadata is invalid');
  }
  if (expiresAt < nowMs) {
    if (overrideReason == null) {
      failQuery('E_PHASE10_QUERY_MANIFEST_STALE', 'Compiled wiki manifest is stale');
    }
    if (typeof overrideReason !== 'string' || overrideReason.trim() === '') {
      failQuery(
        'E_PHASE10_QUERY_FRESHNESS_OVERRIDE_REASON_REQUIRED',
        'Stale query manifests require an explicit freshnessOverrideReason'
      );
    }
    return { ...manifest, freshnessOverrideReason: overrideReason.trim() };
  }

  return manifest;
}

function resolveEstimate(queryClass) {
  const estimate = QUERY_ESTIMATION_TABLE[queryClass];
  if (!estimate) {
    failQuery('E_PHASE10_QUERY_ESTIMATE_MISSING', `No query estimate for ${queryClass}`);
  }
  for (const field of [
    'queryClass',
    'expectedPages',
    'expectedTokens',
    'expectedHops',
    'maxResultRefs',
    'maxCitationRefs'
  ]) {
    if (!Object.hasOwn(estimate, field)) {
      failQuery('E_PHASE10_QUERY_ESTIMATE_INVALID', `Query estimate missing ${field}`);
    }
  }
  return estimate;
}

function positiveInteger(value, fallback) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    failQuery('E_PHASE10_QUERY_BUDGET_EXCEEDED', 'Query budget limits must be positive integers');
  }
  return value;
}

function resolveBudget(budget, estimate) {
  return {
    maxPages: positiveInteger(budget?.maxPages, estimate.expectedPages),
    maxHops: positiveInteger(budget?.maxHops, estimate.expectedHops),
    maxResultRefs: positiveInteger(budget?.maxResultRefs, estimate.maxResultRefs),
    maxCitationRefs: positiveInteger(budget?.maxCitationRefs, estimate.maxCitationRefs)
  };
}

function assertBudget(manifest, budget) {
  if (manifest.pageIds.length > budget.maxPages || budget.maxHops < 1) {
    failQuery('E_PHASE10_QUERY_BUDGET_EXCEEDED', 'Compiled wiki manifest exceeds query budget');
  }
}

function logicalOutputPath(queryId, outputPath) {
  assertSafeQueryId(queryId);
  const expected = `wiki/queries/${queryId}.md`;
  const candidate = outputPath == null ? expected : normalizeSlashes(outputPath);
  if (candidate !== expected) {
    failQuery(
      'E_PHASE10_QUERY_OUTPUT_PATH_FORBIDDEN',
      `Query markdown output must be exactly ${expected}`
    );
  }
  return expected;
}

function assertNoCrossDomain(input) {
  if (
    input.crossDomain === true
    || (Array.isArray(input.domainIds) && input.domainIds.length > 1)
  ) {
    failQuery('E_PHASE10_QUERY_CROSS_DOMAIN_FORBIDDEN', 'Cross-domain query is Wave 10.5 scope');
  }
}

function assertNoForbiddenDecisionUse(input) {
  const requested = input.requestedDecisionUseClassification;
  if (FORBIDDEN_DECISION_USE_CLASSIFICATIONS.has(requested)) {
    failQuery(
      'E_PHASE10_QUERY_DECISION_GRADE_REQUIRES_R2',
      `${requested} requires a reviewed R2 decision-use path outside T10.3.0`
    );
  }
}

function assertPageSourcePath(page) {
  const normalized = normalizeSlashes(page.path);
  const segments = normalized.split('/').filter(Boolean);
  if (
    segments.includes('..')
    || segments.some((segment) => RESERVED_SOURCE_SEGMENTS.has(segment))
    || normalized.startsWith('wiki/queries/')
  ) {
    failQuery(
      'E_PHASE10_QUERY_RESERVED_SOURCE_FORBIDDEN',
      `Query cannot read reserved workflow path: ${page.path}`,
      { pageId: page.pageId }
    );
  }
}

async function readManifestPages(projectRoot, domainId, manifest, options) {
  const validate = await loadValidator(projectRoot, WIKI_PAGE_SCHEMA_FILE);
  const pages = [];
  for (const pageId of manifest.pageIds) {
    assertSafeWikiPageId(pageId);
    const pagePath = resolveInside(domainWikiRoot(projectRoot, domainId, options), `${pageId}.json`);
    let page;
    try {
      page = await readJson(pagePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        failQuery('E_PHASE10_QUERY_PAGE_MISSING', `Compiled wiki page is missing: ${pageId}`);
      }
      throw error;
    }
    try {
      assertValid(validate, page, 'phase10 wiki page');
    } catch (error) {
      failQuery('E_PHASE10_QUERY_PAGE_SCHEMA_INVALID', error.message);
    }
    if (page.domainId !== domainId) {
      failQuery(
        'E_PHASE10_QUERY_DOMAIN_MISMATCH',
        `Wiki page ${page.pageId} belongs to ${page.domainId}`,
        { pageId: page.pageId, domainId }
      );
    }
    assertPageSourcePath(page);
    pages.push(page);
  }
  return pages;
}

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length > 1);
}

function pageSearchText(page) {
  const assertions = (page.assertionGraph ?? [])
    .map((assertion) => `${assertion.text ?? ''} ${assertion.assertionId ?? ''}`)
    .join(' ');
  return `${page.pageId} ${page.title ?? ''} ${page.type ?? ''} ${assertions}`.toLowerCase();
}

function citationRefsFor(page) {
  return [...new Set(
    (page.assertionGraph ?? [])
      .flatMap((assertion) => Array.isArray(assertion.cites) ? assertion.cites : [])
      .filter((cite) => typeof cite === 'string' && cite.startsWith('PROV-'))
  )].sort();
}

function rankPages(pages, queryText, budget) {
  const terms = [...new Set(tokenize(queryText))];
  if (terms.length === 0) {
    failQuery('E_PHASE10_QUERY_TEXT_REQUIRED', 'queryText must include searchable terms');
  }
  const scored = [];
  for (const page of pages) {
    const searchText = pageSearchText(page);
    const matchedTerms = terms.filter((term) => searchText.includes(term));
    if (matchedTerms.length === 0) continue;
    const citationRefs = citationRefsFor(page);
    if (citationRefs.length === 0) {
      failQuery(
        'E_PHASE10_QUERY_TRACE_REQUIRED',
        `Query result ${page.pageId} has no original provenance citation refs`
      );
    }
    scored.push({
      pageId: page.pageId,
      title: page.title,
      score: matchedTerms.length,
      matchedTerms,
      citationRefs
    });
  }
  if (scored.length === 0) {
    failQuery('E_PHASE10_QUERY_TRACE_REQUIRED', 'Query produced no traceable wiki page results');
  }
  if (scored.length > budget.maxResultRefs) {
    failQuery('E_PHASE10_QUERY_BUDGET_EXCEEDED', 'Query resultRefs exceed budget');
  }
  const citationCount = new Set(scored.flatMap((result) => result.citationRefs)).size;
  if (citationCount > budget.maxCitationRefs) {
    failQuery('E_PHASE10_QUERY_BUDGET_EXCEEDED', 'Query citationRefs exceed budget');
  }
  return scored.sort((left, right) => right.score - left.score || left.pageId.localeCompare(right.pageId));
}

function queryRecordPath(projectRoot, domainId, queryId, options) {
  return resolveInside(domainWikiRoot(projectRoot, domainId, options), 'queries', `${queryId}.json`);
}

function queryMarkdownFilePath(projectRoot, domainId, logicalPath, options) {
  return resolveInside(domainStateRootDir(projectRoot, options), domainId, logicalPath);
}

function renderMarkdown({ queryId, queryText, results, issuedAt }) {
  const lines = [
    `# ${queryId}`,
    '',
    `Query: ${queryText}`,
    `Issued: ${issuedAt}`,
    '',
    '## Results',
    ''
  ];
  for (const result of results) {
    lines.push(`- ${result.pageId} (${result.score})`);
    lines.push(`  - citations: ${result.citationRefs.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function validateQueryRecord(projectRoot, queryRecord) {
  const validate = await loadValidator(projectRoot, QUERY_RECORD_SCHEMA_FILE);
  try {
    assertValid(validate, queryRecord, 'phase10 query record');
  } catch (error) {
    failQuery('E_PHASE10_QUERY_RECORD_SCHEMA_INVALID', error.message);
  }
}

export async function runWikiQuery(projectPath, input = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  assertNoCrossDomain(input);
  assertNoForbiddenDecisionUse(input);

  const domainId = input.domainId;
  assertSafeDomainId(domainId);
  const queryId = input.queryId;
  assertSafeQueryId(queryId);
  const timestamp = input.now ?? now();
  const options = { stateRoot: input.stateRoot };
  const outputPath = logicalOutputPath(queryId, input.outputPath);
  const queryClass = input.queryClass ?? 'targeted-read';
  const estimate = resolveEstimate(queryClass);
  const budget = resolveBudget(input.budget, estimate);

  const domainRecord = await readActiveDomainRecord(projectRoot, options);
  assertActiveDomain(domainRecord, domainId);
  const manifest = await readCompiledManifest(
    projectRoot,
    domainId,
    options,
    timestamp,
    input.freshnessOverrideReason
  );
  assertBudget(manifest, budget);
  const pages = await readManifestPages(projectRoot, domainId, manifest, options);
  const results = rankPages(pages, input.queryText, budget);

  const queryRecord = {
    schemaVersion: 'phase10.query-record.v1',
    queryId,
    domainId,
    queryText: input.queryText,
    issuedAt: timestamp,
    resultRefs: results.map((result) => result.pageId),
    decisionUse: {
      classification: 'not-for-decision',
      computedBy: COMPUTED_BY,
      computedAt: timestamp
    }
  };
  await validateQueryRecord(projectRoot, queryRecord);

  const recordPath = queryRecordPath(projectRoot, domainId, queryId, options);
  const markdownPath = queryMarkdownFilePath(projectRoot, domainId, outputPath, options);
  await atomicWriteJson(recordPath, queryRecord);
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(
    markdownPath,
    renderMarkdown({ queryId, queryText: input.queryText, results, issuedAt: timestamp }),
    'utf8'
  );

  return {
    ok: true,
    phase10: true,
    command: 'wiki query',
    domainId,
    queryId,
    queryRecord,
    queryRecordPath: toRepoRelative(projectRoot, recordPath),
    queryMarkdownPath: outputPath,
    queryMarkdownRecordPath: toRepoRelative(projectRoot, markdownPath),
    estimate,
    budget,
    results,
    report: {
      resultRefs: queryRecord.resultRefs,
      citationRefs: [...new Set(results.flatMap((result) => result.citationRefs))].sort(),
      manifestGeneratedAt: manifest.generatedAt,
      manifestExpiresAt: manifest.expiresAt,
      freshnessOverrideReason: manifest.freshnessOverrideReason ?? null
    }
  };
}
