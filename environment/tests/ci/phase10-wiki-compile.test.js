import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  compileWikiPages
} from '../../phase10/wiki-compile.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const DOMAIN_ID = 'KDOM-wiki';
const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: DOMAIN_ID,
  name: 'Wiki Compile Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-wiki'],
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});
const TWO_PASS_POLICY = Object.freeze({
  schemaVersion: 'phase10.compile-policy.v1',
  compilePolicyId: 'CP-two-pass',
  policy: 'two-pass',
  rationale: 'Deterministic wiki compile scaffold test.',
  requiredReviewer: 'claude-code',
  createdAt: TIMESTAMP
});
const PROVENANCE_LINK = Object.freeze({
  schemaVersion: 'phase10.provenance-link.v1',
  linkId: 'PROV-wiki-001',
  domainId: DOMAIN_ID,
  kind: 'raw-source',
  sourceRef: {
    type: 'source-bundle',
    id: 'SB-wiki-001@v1'
  },
  targetRef: {
    type: 'wiki-page',
    id: 'WIKI-source'
  },
  createdAt: TIMESTAMP
});

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
    ...ACTIVE_DOMAIN,
    ...overrides
  });
}

async function installBundle(projectRoot, overrides = {}) {
  const bundle = {
    schemaVersion: 'phase10.source-bundle.v1',
    bundleId: 'SB-wiki-001',
    bundleVersion: 'v1',
    domainId: DOMAIN_ID,
    title: 'Curated wiki source bundle',
    sourceType: 'pdf',
    trustTier: 'primary',
    license: 'open',
    allowTrackPayload: false,
    scopeOfUse: ['evidence'],
    rawDocumentRefs: [
      {
        rawDocumentId: 'RAW-wiki-001',
        contentHash: 'sha256:wiki-raw-001'
      }
    ],
    sourceLocators: [
      {
        kind: 'file',
        uri: 'raw/papers/RAW-wiki-001/source.pdf'
      }
    ],
    collectedAt: TIMESTAMP,
    status: 'curated',
    ...overrides
  };
  const recordPath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'phase10',
    'knowledge-domains',
    DOMAIN_ID,
    'source-bundles',
    bundle.bundleId,
    `${bundle.bundleVersion}.json`
  );
  await writeJson(recordPath, bundle);
  return bundle;
}

function sourceDraft(overrides = {}) {
  return {
    pageId: 'WIKI-source',
    type: 'source',
    title: 'Source page',
    path: 'WIKI_VRE/entities/source-page.md',
    sourceBundleRefs: [
      {
        bundleId: 'SB-wiki-001',
        bundleVersion: 'v1'
      }
    ],
    assertionGraph: [
      {
        assertionId: 'ASSERT-wiki-001',
        text: 'A sourced assertion cites a provenance link.',
        status: 'sourced',
        cites: ['PROV-wiki-001']
      }
    ],
    ...overrides
  };
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function compileBasic(projectRoot, overrides = {}) {
  return compileWikiPages(projectRoot, {
    domainId: DOMAIN_ID,
    compilePolicy: TWO_PASS_POLICY,
    sourceBundleRefs: [
      {
        bundleId: 'SB-wiki-001',
        bundleVersion: 'v1'
      }
    ],
    provenanceLinks: [PROVENANCE_LINK],
    draftPages: [sourceDraft()],
    timestamp: TIMESTAMP,
    ...overrides
  });
}

test('wiki compile rejects when no active domain exists', async () => {
  await withProject('phase10-wiki-compile-missing-domain-', async (projectRoot) => {
    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_DOMAIN_REQUIRED'
    );
  });
});

test('wiki compile rejects inactive, archived, and mismatched active domains', async () => {
  await withProject('phase10-wiki-compile-domain-guard-', async (projectRoot) => {
    await installDomain(projectRoot, {
      lifecycleStatus: 'archived',
      active: false
    });

    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_DOMAIN_ARCHIVED'
    );

    await installDomain(projectRoot, {
      domainId: 'KDOM-other'
    });

    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_DOMAIN_MISMATCH'
    );
  });
});

test('wiki compile accepts only two-pass policy in T10.2.0', async () => {
  await withProject('phase10-wiki-compile-policy-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    await expectCode(
      () => compileBasic(projectRoot, { compilePolicy: null }),
      'E_PHASE10_WIKI_COMPILE_POLICY_REQUIRED'
    );
    await expectCode(
      () => compileBasic(projectRoot, {
        compilePolicy: {
          ...TWO_PASS_POLICY,
          policy: 'three-pass-r2-audited'
        }
      }),
      'E_PHASE10_WIKI_COMPILE_POLICY_FORBIDDEN'
    );
    await expectCode(
      () => compileBasic(projectRoot, { draftPages: [sourceDraft({ type: 'synthesis' })] }),
      'E_PHASE10_WIKI_SYNTHESIS_DEFERRED'
    );
  });
});

test('wiki compile resolves only curated source bundles in the active domain', async () => {
  await withProject('phase10-wiki-compile-bundles-', async (projectRoot) => {
    await installDomain(projectRoot);

    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_SOURCE_BUNDLE_MISSING'
    );

    await installBundle(projectRoot, { status: 'rejected' });
    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_SOURCE_BUNDLE_FORBIDDEN'
    );

    await installBundle(projectRoot, {
      status: 'curated',
      domainId: 'KDOM-other'
    });
    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_SOURCE_BUNDLE_DOMAIN_MISMATCH'
    );
  });
});

test('wiki compile rejects reserved workflow source locators', async () => {
  await withProject('phase10-wiki-compile-reserved-locator-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot, {
      sourceLocators: [
        {
          kind: 'file',
          uri: '_inbox/candidate.json'
        }
      ]
    });

    await expectCode(
      () => compileBasic(projectRoot),
      'E_PHASE10_WIKI_SOURCE_LOCATOR_FORBIDDEN'
    );
  });
});

test('wiki compile rejects non-provenance and unresolved assertion cites', async () => {
  await withProject('phase10-wiki-compile-cites-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            assertionGraph: [{ ...sourceDraft().assertionGraph[0], cites: [] }]
          })
        ]
      }),
      'E_PHASE10_WIKI_ASSERTION_CITES_REQUIRED'
    );
    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            assertionGraph: [{ ...sourceDraft().assertionGraph[0], cites: ['QUERY-001'] }]
          })
        ]
      }),
      'E_PHASE10_WIKI_CITE_REF_FORBIDDEN'
    );
    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            assertionGraph: [{ ...sourceDraft().assertionGraph[0], cites: ['PROV-missing'] }]
          })
        ]
      }),
      'E_PHASE10_WIKI_PROVENANCE_LINK_MISSING'
    );
  });
});

test('wiki compile enforces source and hypothesis page metadata', async () => {
  await withProject('phase10-wiki-compile-page-metadata-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);
    await installBundle(projectRoot, { bundleId: 'SB-wiki-002' });

    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            sourceBundleRefs: [
              { bundleId: 'SB-wiki-001', bundleVersion: 'v1' },
              { bundleId: 'SB-wiki-002', bundleVersion: 'v1' }
            ]
          })
        ]
      }),
      'E_PHASE10_WIKI_SOURCE_PAGE_SINGLE_BUNDLE'
    );

    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [sourceDraft({ type: 'hypothesis' })]
      }),
      'E_PHASE10_WIKI_HYPOTHESIS_NEXUS_REQUIRED'
    );
  });
});

test('wiki compile rejects fields deferred to T10.2.2', async () => {
  await withProject('phase10-wiki-compile-deferred-fields-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    for (const field of ['declaredKind', 'finalRouting', 'riskFlags', 'entityCausalRouting']) {
      await expectCode(
        () => compileBasic(projectRoot, {
          draftPages: [sourceDraft({ [field]: field === 'riskFlags' ? ['causal'] : 'causal' })]
        }),
        'E_PHASE10_WIKI_DEFERRED_FIELD_FORBIDDEN'
      );
    }
  });
});

test('wiki compile writes schema-valid pages without forbidden side effects', async () => {
  await withProject('phase10-wiki-compile-green-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    const result = await compileBasic(projectRoot);

    assert.equal(result.ok, true);
    assert.equal(result.pageCount, 1);
    assert.deepEqual(result.consumedSourceBundleRefs, ['SB-wiki-001@v1']);
    assert.deepEqual(result.report.acceptedPageIds, ['WIKI-source']);
    assert.deepEqual(result.report.rejectedDrafts, []);

    const pagePath = path.join(projectRoot, result.pages[0].wikiPageRecordPath);
    const page = await readJson(pagePath);
    assert.equal(page.schemaVersion, 'phase10.wiki-page.v1');
    assert.equal(page.type, 'source');
    assert.equal(page.assertionGraph[0].status, 'sourced');
    assert.deepEqual(page.assertionGraph[0].cites, ['PROV-wiki-001']);

    for (const forbidden of [
      '_inbox',
      'skill-cache',
      'queries',
      'exports',
      'presentations',
      'provenance-links',
      'claim-ledger.md',
      'claims/edges.jsonl'
    ]) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created by wiki compile`
      );
    }
  });
});
