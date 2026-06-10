import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  QUERY_ESTIMATION_TABLE,
  runWikiQuery
} from '../../phase10/wiki-query.js';
import {
  lintPhase10Corpus
} from '../../phase10/law13-lint.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const EXPIRES_AT = '2026-06-11T00:00:00.000Z';
const DOMAIN_ID = 'KDOM-query';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function withProject(testName, fn) {
  const projectRoot = await createCliFixtureProject(testName);
  try {
    return await fn(projectRoot);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
}

async function installDomain(projectRoot, overrides = {}) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: DOMAIN_ID,
    name: 'Wiki Query Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-query'],
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides
  });
}

function wikiRoot(projectRoot) {
  return path.join(
    projectRoot,
    '.vibe-science-environment',
    'phase10',
    'knowledge-domains',
    DOMAIN_ID,
    'wiki'
  );
}

function wikiPage(overrides = {}) {
  return {
    schemaVersion: 'phase10.wiki-page.v1',
    pageId: 'WIKI-cxcl13-cd8',
    domainId: DOMAIN_ID,
    type: 'concept',
    title: 'CXCL13 positive CD8 ovarian cancer evidence',
    path: 'WIKI_VRE/entities/cxcl13-cd8.md',
    compilePolicyId: 'CP-query',
    compilePolicyRationale: 'default-from-compile-policy',
    lifecycleStatus: 'draft',
    pageRouting: 'publishable',
    assertionGraph: [
      {
        assertionId: 'ASSERT-cxcl13-cd8',
        text: 'CXCL13 positive CD8 cells are observed in ovarian cancer studies.',
        status: 'sourced',
        declaredKind: 'observed-association',
        riskFlags: [],
        finalRouting: 'allowed',
        cites: ['PROV-cxcl13-cd8']
      }
    ],
    updatedAt: TIMESTAMP,
    ...overrides
  };
}

async function installCompiledWiki(projectRoot, options = {}) {
  await installDomain(projectRoot, options.domainOverrides ?? {});
  const root = wikiRoot(projectRoot);
  const pages = options.pages ?? [wikiPage()];
  for (const page of pages) {
    await writeJson(path.join(root, `${page.pageId}.json`), page);
  }
  if (options.skipManifest) {
    return;
  }
  await writeJson(path.join(root, 'compiled-manifest.json'), {
    schemaVersion: 'phase10.wiki-query-manifest.v1',
    domainId: DOMAIN_ID,
    active: options.active ?? true,
    generatedAt: options.generatedAt ?? TIMESTAMP,
    expiresAt: options.expiresAt ?? EXPIRES_AT,
    pageIds: pages.map((page) => page.pageId)
  });
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function queryBasic(projectRoot, overrides = {}) {
  return runWikiQuery(projectRoot, {
    domainId: DOMAIN_ID,
    queryId: 'QUERY-cxcl13-cd8',
    queryText: 'CXCL13 CD8 ovarian cancer',
    queryClass: 'targeted-read',
    now: TIMESTAMP,
    ...overrides
  });
}

test('wiki query exposes pinned codebase estimation lookup fields', () => {
  const estimate = QUERY_ESTIMATION_TABLE['targeted-read'];
  for (const field of [
    'queryClass',
    'expectedPages',
    'expectedTokens',
    'expectedHops',
    'maxResultRefs',
    'maxCitationRefs'
  ]) {
    assert.ok(Object.hasOwn(estimate, field), `missing ${field}`);
  }
});

test('wiki query rejects missing, inactive, and stale compiled manifest', async () => {
  await withProject('phase10-wiki-query-manifest-', async (projectRoot) => {
    await installCompiledWiki(projectRoot, { skipManifest: true });
    await expectCode(
      () => queryBasic(projectRoot),
      'E_PHASE10_QUERY_MANIFEST_REQUIRED'
    );

    await installCompiledWiki(projectRoot, { active: false });
    await expectCode(
      () => queryBasic(projectRoot),
      'E_PHASE10_QUERY_MANIFEST_INACTIVE'
    );

    await installCompiledWiki(projectRoot, { expiresAt: '2026-06-09T00:00:00.000Z' });
    await expectCode(
      () => queryBasic(projectRoot),
      'E_PHASE10_QUERY_MANIFEST_STALE'
    );

    await expectCode(
      () => queryBasic(projectRoot, { freshnessOverrideReason: '' }),
      'E_PHASE10_QUERY_FRESHNESS_OVERRIDE_REASON_REQUIRED'
    );
  });
});

test('wiki query rejects cross-domain, unsafe query ids, and output escapes', async () => {
  await withProject('phase10-wiki-query-boundary-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    await expectCode(
      () => queryBasic(projectRoot, { domainId: 'KDOM-other' }),
      'E_PHASE10_QUERY_DOMAIN_MISMATCH'
    );
    await expectCode(
      () => queryBasic(projectRoot, { queryId: 'QUERY-../escape' }),
      'E_PHASE10_QUERY_ID_INVALID'
    );
    await expectCode(
      () => queryBasic(projectRoot, { outputPath: 'wiki/../queries/QUERY-cxcl13-cd8.md' }),
      'E_PHASE10_QUERY_OUTPUT_PATH_FORBIDDEN'
    );
  });
});

test('wiki query fails closed on budget, empty trace, and reserved page paths', async () => {
  await withProject('phase10-wiki-query-budget-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    await expectCode(
      () => queryBasic(projectRoot, { budget: { maxResultRefs: 0 } }),
      'E_PHASE10_QUERY_BUDGET_EXCEEDED'
    );
    await expectCode(
      () => queryBasic(projectRoot, { queryText: 'unmatched term' }),
      'E_PHASE10_QUERY_TRACE_REQUIRED'
    );

    await installCompiledWiki(projectRoot, {
      pages: [wikiPage({ path: 'WIKI_VRE/_inbox/candidate.md' })]
    });
    await expectCode(
      () => queryBasic(projectRoot),
      'E_PHASE10_QUERY_RESERVED_SOURCE_FORBIDDEN'
    );
  });
});

test('wiki query writes schema-valid records with computed not-for-decision floor', async () => {
  await withProject('phase10-wiki-query-green-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    const result = await queryBasic(projectRoot, {
      decisionUse: {
        classification: 'decision-grade',
        computedBy: 'caller',
        computedAt: TIMESTAMP
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.queryRecord.schemaVersion, 'phase10.query-record.v1');
    assert.equal(result.queryRecord.queryId, 'QUERY-cxcl13-cd8');
    assert.deepEqual(result.queryRecord.resultRefs, ['WIKI-cxcl13-cd8']);
    assert.equal(result.queryRecord.decisionUse.classification, 'not-for-decision');
    assert.equal(result.queryRecord.decisionUse.computedBy, 'phase10-wiki-query');
    assert.match(result.queryRecord.decisionUse.computedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.deepEqual(result.results[0].citationRefs, ['PROV-cxcl13-cd8']);
    assert.equal(result.estimate.queryClass, 'targeted-read');
    assert.equal(result.queryMarkdownPath.endsWith('wiki/queries/QUERY-cxcl13-cd8.md'), true);

    const record = await readJson(path.join(projectRoot, result.queryRecordPath));
    assert.equal(record.decisionUse.classification, 'not-for-decision');
    assert.equal(await pathExists(path.join(wikiRoot(projectRoot), 'provenance-links')), false);
  });
});

test('wiki query never emits decision-grade or audit-grade without R2', async () => {
  await withProject('phase10-wiki-query-hb8-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    for (const classification of ['decision-grade', 'audit-grade']) {
      await expectCode(
        () => queryBasic(projectRoot, { requestedDecisionUseClassification: classification }),
        'E_PHASE10_QUERY_DECISION_GRADE_REQUIRES_R2'
      );
    }
  });
});

test('wiki query output remains metadata and still fails LAW 13 provenance lint', async () => {
  await withProject('phase10-wiki-query-lint-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    const result = await queryBasic(projectRoot);
    const linted = lintPhase10Corpus({
      wikiPages: [
        wikiPage({
          type: 'synthesis',
          r2Audit: { status: 'passed' },
          assertionGraph: [
            {
              ...wikiPage().assertionGraph[0],
              cites: ['PROV-query-output']
            }
          ]
        })
      ],
      provenanceLinks: [
        {
          linkId: 'PROV-query-output',
          sourcePath: result.queryMarkdownPath,
          targetRef: { type: 'query-record', id: result.queryRecord.queryId }
        }
      ]
    });

    const codes = linted.issues.map((issue) => issue.code);
    assert.ok(codes.includes('E_PHASE10_QUERY_NOT_PROVENANCE'));
    assert.ok(codes.includes('E_PHASE10_SYNTHESIS_NOT_CITES_QUERY'));
  });
});

test('wiki query creates no forbidden workflow writers', async () => {
  await withProject('phase10-wiki-query-no-side-effects-', async (projectRoot) => {
    await installCompiledWiki(projectRoot);
    await queryBasic(projectRoot);

    for (const forbidden of [
      '_inbox',
      'raw',
      'skill-cache',
      'exports',
      'presentations',
      'provenance-links',
      'claim-ledger.md',
      'claims/edges.jsonl'
    ]) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created by wiki query`
      );
    }
  });
});
