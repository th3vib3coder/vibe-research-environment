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
import {
  listSourceBundles
} from './source-bundles.js';

export const WIKI_COMPILE_SCHEMA_FILE = 'phase10-wiki-page.schema.json';
export const WIKI_COMPILE_POLICY_SCHEMA_FILE = 'phase10-compile-policy.schema.json';
export const WIKI_PROVENANCE_LINK_SCHEMA_FILE = 'phase10-provenance-link.schema.json';

const PAGE_TYPES = new Set(['source', 'concept', 'synthesis', 'hypothesis', 'entity']);
const LAW13_ASSERTION_STATUSES = new Set(['sourced', 'computed', 'claimed', 'supposition']);
const SAFE_PAGE_ID_PATTERN = /^WIKI-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_BUNDLE_ID_PATTERN = /^SB-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_BUNDLE_VERSION_PATTERN = /^v[0-9][A-Za-z0-9._-]*$/u;
const FORBIDDEN_LOCATOR_SEGMENTS = new Set([
  '_inbox',
  'export',
  'exports',
  'presentation',
  'presentations',
  'provenance-links',
  'queries',
  'query',
  'skill-cache'
]);
const DEFERRED_DRAFT_FIELDS = new Set([
  'declaredKind',
  'finalRouting',
  'riskFlags',
  'entityCausalRouting'
]);

export class WikiCompileError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(`${code}: ${message}`);
    this.name = 'WikiCompileError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function failWiki(code, message, extra = {}) {
  throw new WikiCompileError({ code, message, extra });
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

async function readActiveDomainRecord(projectRoot, options = {}) {
  let domainRecord;
  try {
    domainRecord = await readJson(activeDomainRecordPath(projectRoot, options));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      failWiki('E_PHASE10_WIKI_DOMAIN_REQUIRED', 'No active Phase 10 domain exists');
    }
    throw error;
  }

  const validate = await loadValidator(projectRoot, 'phase10-knowledge-domain.schema.json');
  try {
    assertValid(validate, domainRecord, 'phase10 knowledge domain');
  } catch (error) {
    failWiki('E_PHASE10_WIKI_DOMAIN_SCHEMA_INVALID', error.message);
  }

  return domainRecord;
}

function assertActiveDomain(domainRecord, domainId) {
  if (domainRecord.lifecycleStatus === 'archived' || domainRecord.active === false) {
    failWiki(
      'E_PHASE10_WIKI_DOMAIN_ARCHIVED',
      `Domain ${domainRecord.domainId} is not writable`,
      { domainId: domainRecord.domainId }
    );
  }
  if (domainRecord.domainId !== domainId) {
    failWiki(
      'E_PHASE10_WIKI_DOMAIN_MISMATCH',
      `Active domain is ${domainRecord.domainId}, not ${domainId}`,
      {
        activeDomainId: domainRecord.domainId,
        requestedDomainId: domainId
      }
    );
  }
}

async function assertTwoPassPolicy(projectRoot, compilePolicy) {
  if (compilePolicy == null || typeof compilePolicy !== 'object') {
    failWiki('E_PHASE10_WIKI_COMPILE_POLICY_REQUIRED', 'compilePolicy is required');
  }

  const validate = await loadValidator(projectRoot, WIKI_COMPILE_POLICY_SCHEMA_FILE);
  try {
    assertValid(validate, compilePolicy, 'phase10 compile policy');
  } catch (error) {
    failWiki('E_PHASE10_WIKI_COMPILE_POLICY_SCHEMA_INVALID', error.message);
  }

  if (compilePolicy.policy !== 'two-pass') {
    failWiki(
      'E_PHASE10_WIKI_COMPILE_POLICY_FORBIDDEN',
      'T10.2.0 wiki compile scaffold only accepts two-pass policy',
      { policy: compilePolicy.policy }
    );
  }
}

function normalizeBundleRef(ref) {
  if (typeof ref === 'string') {
    const [bundleId, bundleVersion] = ref.split('@');
    return { bundleId, bundleVersion };
  }
  return {
    bundleId: ref?.bundleId,
    bundleVersion: ref?.bundleVersion ?? 'v1'
  };
}

function bundleRefKey(ref) {
  return `${ref.bundleId}@${ref.bundleVersion}`;
}

function assertSafeBundleRef(ref) {
  if (
    !SAFE_BUNDLE_ID_PATTERN.test(ref.bundleId ?? '')
    || !SAFE_BUNDLE_VERSION_PATTERN.test(ref.bundleVersion ?? '')
  ) {
    failWiki(
      'E_PHASE10_WIKI_SOURCE_BUNDLE_REF_INVALID',
      `Invalid source bundle ref: ${JSON.stringify(ref)}`
    );
  }
}

function assertSafePageId(pageId) {
  if (typeof pageId !== 'string' || !SAFE_PAGE_ID_PATTERN.test(pageId)) {
    failWiki('E_PHASE10_WIKI_PAGE_ID_INVALID', `Invalid wiki page id: ${pageId}`);
  }
}

function assertLocatorBoundary(sourceBundle) {
  for (const locator of sourceBundle.sourceLocators ?? []) {
    if (locator?.kind !== 'file' && locator?.kind !== 'obsidian') {
      continue;
    }
    const uri = String(locator.uri ?? '');
    if (path.isAbsolute(uri)) {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_LOCATOR_FORBIDDEN',
        'wiki compile source locators must be repository-relative'
      );
    }
    const parts = uri.split(/[\\/]+/u).filter(Boolean);
    if (
      parts.includes('..')
      || parts.some((part) => FORBIDDEN_LOCATOR_SEGMENTS.has(part))
    ) {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_LOCATOR_FORBIDDEN',
        `wiki compile cannot read reserved workflow source: ${uri}`
      );
    }
  }
}

function collectRequiredBundleRefs(inputRefs, draftPages) {
  const refs = new Map();
  for (const ref of inputRefs ?? []) {
    const normalized = normalizeBundleRef(ref);
    assertSafeBundleRef(normalized);
    refs.set(bundleRefKey(normalized), normalized);
  }
  for (const draftPage of draftPages ?? []) {
    for (const ref of draftPage.sourceBundleRefs ?? draftPage.sourceBundleIds ?? []) {
      const normalized = normalizeBundleRef(ref);
      assertSafeBundleRef(normalized);
      refs.set(bundleRefKey(normalized), normalized);
    }
  }
  return [...refs.values()];
}

async function resolveSourceBundles(projectRoot, domainId, requiredRefs, options) {
  const records = await listSourceBundles(projectRoot, {
    domainId,
    stateRoot: options.stateRoot
  });
  const byKey = new Map(records.map((record) => [
    bundleRefKey({
      bundleId: record.bundleId,
      bundleVersion: record.bundleVersion
    }),
    record
  ]));

  const resolved = new Map();
  for (const ref of requiredRefs) {
    const key = bundleRefKey(ref);
    const sourceBundle = byKey.get(key);
    if (!sourceBundle) {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_BUNDLE_MISSING',
        `Source bundle ref does not resolve: ${key}`,
        { sourceBundleRef: key }
      );
    }
    if (sourceBundle.domainId !== domainId) {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_BUNDLE_DOMAIN_MISMATCH',
        `Source bundle ${key} belongs to ${sourceBundle.domainId}`,
        { sourceBundleRef: key, sourceBundleDomainId: sourceBundle.domainId, domainId }
      );
    }
    if (sourceBundle.status !== 'curated') {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_BUNDLE_FORBIDDEN',
        `Source bundle ${key} is not curated`,
        { sourceBundleRef: key, status: sourceBundle.status }
      );
    }
    assertLocatorBoundary(sourceBundle);
    resolved.set(key, sourceBundle);
  }
  return resolved;
}

async function resolveProvenanceLinks(projectRoot, domainId, provenanceLinks = []) {
  const validate = await loadValidator(projectRoot, WIKI_PROVENANCE_LINK_SCHEMA_FILE);
  const links = new Map();
  for (const link of provenanceLinks) {
    try {
      assertValid(validate, link, 'phase10 provenance link');
    } catch (error) {
      failWiki('E_PHASE10_WIKI_PROVENANCE_LINK_INVALID', error.message);
    }
    if (link.domainId !== domainId) {
      failWiki(
        'E_PHASE10_WIKI_PROVENANCE_LINK_DOMAIN_MISMATCH',
        `Provenance link ${link.linkId} belongs to ${link.domainId}`,
        { provenanceLinkId: link.linkId, domainId }
      );
    }
    links.set(link.linkId, link);
  }
  return links;
}

function assertDraftScope(draftPage) {
  for (const field of DEFERRED_DRAFT_FIELDS) {
    if (Object.hasOwn(draftPage, field)) {
      failWiki(
        'E_PHASE10_WIKI_DEFERRED_FIELD_FORBIDDEN',
        `${field} is T10.2.2 scope, not T10.2.0`
      );
    }
  }
}

function assertDraftType(draftPage) {
  if (!PAGE_TYPES.has(draftPage.type)) {
    failWiki('E_PHASE10_WIKI_PAGE_TYPE_INVALID', `Invalid page type: ${draftPage.type}`);
  }
  if (draftPage.type === 'synthesis') {
    failWiki('E_PHASE10_WIKI_SYNTHESIS_DEFERRED', 'Synthesis compile is T10.2.1 scope');
  }
}

function assertDraftBundles(draftPage, resolvedBundles) {
  const refs = (draftPage.sourceBundleRefs ?? draftPage.sourceBundleIds ?? [])
    .map((ref) => normalizeBundleRef(ref));
  for (const ref of refs) {
    assertSafeBundleRef(ref);
    const key = bundleRefKey(ref);
    if (!resolvedBundles.has(key)) {
      failWiki(
        'E_PHASE10_WIKI_SOURCE_BUNDLE_MISSING',
        `Draft page references unresolved source bundle ${key}`
      );
    }
  }
  if (draftPage.type === 'source' && refs.length !== 1) {
    failWiki(
      'E_PHASE10_WIKI_SOURCE_PAGE_SINGLE_BUNDLE',
      'source wiki pages must compile from exactly one source bundle'
    );
  }
  return refs;
}

function assertHypothesisMetadata(draftPage) {
  if (
    draftPage.type === 'hypothesis'
    && draftPage.nexusStatus !== 'not-established'
  ) {
    failWiki(
      'E_PHASE10_WIKI_HYPOTHESIS_NEXUS_REQUIRED',
      'hypothesis pages require nexusStatus:not-established in T10.2.0'
    );
  }
}

function normalizeAssertionGraph(draftPage, provenanceLinks) {
  if (!Array.isArray(draftPage.assertionGraph) || draftPage.assertionGraph.length === 0) {
    failWiki(
      'E_PHASE10_WIKI_ASSERTION_CITES_REQUIRED',
      'wiki page drafts require assertionGraph entries with cites'
    );
  }

  return draftPage.assertionGraph.map((assertion) => {
    if (!LAW13_ASSERTION_STATUSES.has(assertion?.status)) {
      failWiki(
        'E_PHASE10_WIKI_ASSERTION_STATUS_INVALID',
        `Invalid LAW 13 assertion status: ${assertion?.status}`
      );
    }
    if (!Array.isArray(assertion.cites) || assertion.cites.length === 0) {
      failWiki(
        'E_PHASE10_WIKI_ASSERTION_CITES_REQUIRED',
        'every wiki assertion requires non-empty cites[]'
      );
    }
    for (const cite of assertion.cites) {
      if (typeof cite !== 'string' || !cite.startsWith('PROV-')) {
        failWiki(
          'E_PHASE10_WIKI_CITE_REF_FORBIDDEN',
          `wiki assertion cite must be a PROV-* link id: ${cite}`
        );
      }
      if (!provenanceLinks.has(cite)) {
        failWiki(
          'E_PHASE10_WIKI_PROVENANCE_LINK_MISSING',
          `wiki assertion cite does not resolve to a provenance link: ${cite}`
        );
      }
    }
    return {
      assertionId: assertion.assertionId,
      text: assertion.text,
      status: assertion.status,
      cites: [...assertion.cites]
    };
  });
}

async function validateWikiPage(projectRoot, wikiPage) {
  const validate = await loadValidator(projectRoot, WIKI_COMPILE_SCHEMA_FILE);
  try {
    assertValid(validate, wikiPage, 'phase10 wiki page');
  } catch (error) {
    failWiki('E_PHASE10_WIKI_PAGE_SCHEMA_INVALID', error.message);
  }
}

function wikiRecordPath(projectRoot, domainId, pageId, options = {}) {
  assertSafePageId(pageId);
  return resolveInside(
    domainStateRootDir(projectRoot, options),
    domainId,
    'wiki',
    `${pageId}.json`
  );
}

export async function compileWikiPages(projectPath, {
  domainId,
  compilePolicy,
  sourceBundleRefs = [],
  draftPages = [],
  provenanceLinks = [],
  stateRoot = null,
  timestamp = now()
} = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const options = { stateRoot };
  const domainRecord = await readActiveDomainRecord(projectRoot, options);
  assertActiveDomain(domainRecord, domainId);
  await assertTwoPassPolicy(projectRoot, compilePolicy);

  if (!Array.isArray(draftPages) || draftPages.length === 0) {
    failWiki('E_PHASE10_WIKI_DRAFTS_REQUIRED', 'draftPages must be a non-empty array');
  }

  const requiredRefs = collectRequiredBundleRefs(sourceBundleRefs, draftPages);
  const resolvedBundles = await resolveSourceBundles(projectRoot, domainId, requiredRefs, options);
  const resolvedProvenance = await resolveProvenanceLinks(projectRoot, domainId, provenanceLinks);
  const pages = [];
  const acceptedPageIds = [];

  for (const draftPage of draftPages) {
    assertDraftScope(draftPage);
    assertSafePageId(draftPage.pageId);
    assertDraftType(draftPage);
    assertDraftBundles(draftPage, resolvedBundles);
    assertHypothesisMetadata(draftPage);

    const wikiPage = {
      schemaVersion: 'phase10.wiki-page.v1',
      pageId: draftPage.pageId,
      domainId,
      type: draftPage.type,
      title: draftPage.title,
      path: draftPage.path,
      compilePolicyId: compilePolicy.compilePolicyId,
      lifecycleStatus: draftPage.lifecycleStatus ?? 'draft',
      assertionGraph: normalizeAssertionGraph(draftPage, resolvedProvenance),
      updatedAt: timestamp
    };
    if (draftPage.type === 'hypothesis') {
      wikiPage.nexusStatus = draftPage.nexusStatus;
    }

    await validateWikiPage(projectRoot, wikiPage);
    const recordPath = wikiRecordPath(projectRoot, domainId, draftPage.pageId, options);
    await atomicWriteJson(recordPath, wikiPage);
    acceptedPageIds.push(draftPage.pageId);
    pages.push({
      ...wikiPage,
      wikiPageRecordPath: toRepoRelative(projectRoot, recordPath)
    });
  }

  const consumedSourceBundleRefs = [...resolvedBundles.keys()].sort();
  return {
    ok: true,
    phase10: true,
    command: 'wiki compile',
    domainId,
    compilePolicyId: compilePolicy.compilePolicyId,
    pageCount: pages.length,
    consumedSourceBundleRefs,
    pages,
    report: {
      acceptedPageIds,
      rejectedDrafts: [],
      skippedDrafts: [],
      consumedSourceBundleRefs
    }
  };
}
