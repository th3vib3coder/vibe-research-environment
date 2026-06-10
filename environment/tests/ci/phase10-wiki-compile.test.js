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

async function installSecondBundle(projectRoot, overrides = {}) {
  return installBundle(projectRoot, {
    bundleId: 'SB-wiki-002',
    title: 'Second curated wiki source bundle',
    sourceType: 'webpage',
    rawDocumentRefs: [
      {
        rawDocumentId: 'RAW-wiki-002',
        contentHash: 'sha256:wiki-raw-002'
      }
    ],
    sourceLocators: [
      {
        kind: 'file',
        uri: 'raw/papers/RAW-wiki-002/source.html'
      }
    ],
    ...overrides
  });
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
        declaredKind: 'extractive-fact',
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

test('wiki compile keeps three-pass policy restricted to audited synthesis', async () => {
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
      'E_PHASE10_WIKI_SYNTHESIS_R2_POLICY_REQUIRED'
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

test('wiki compile rejects author-declared computed routing fields', async () => {
  await withProject('phase10-wiki-compile-computed-fields-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    for (const field of ['riskFlags', 'finalRouting']) {
      await expectCode(
        () => compileBasic(projectRoot, {
          draftPages: [
            sourceDraft({
              assertionGraph: [
                {
                  ...sourceDraft().assertionGraph[0],
                  [field]: field === 'riskFlags' ? ['causal'] : 'rejected'
                }
              ]
            })
          ]
        }),
        'E_PHASE10_WIKI_ASSERTION_COMPUTED_FIELD_FORBIDDEN'
      );
    }
  });
});

test('wiki compile persists assertion routing fields', async () => {
  await withProject('phase10-wiki-compile-routing-fields-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    const result = await compileBasic(projectRoot);
    const page = await readJson(path.join(projectRoot, result.pages[0].wikiPageRecordPath));

    assert.equal(page.pageRouting, 'publishable');
    assert.equal(page.compilePolicyRationale, 'default-from-compile-policy');
    assert.equal(page.assertionGraph[0].declaredKind, 'extractive-fact');
    assert.deepEqual(page.assertionGraph[0].riskFlags, []);
    assert.equal(page.assertionGraph[0].finalRouting, 'allowed');
  });
});

test('wiki compile auto-upgrades triggered synthesis policy with accepted R2', async () => {
  await withProject('phase10-wiki-compile-policy-upgrade-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    const result = await compileBasic(projectRoot, {
      draftPages: [
        sourceDraft({
          pageId: 'WIKI-synthesis',
          type: 'synthesis',
          title: 'Triggered synthesis page',
          path: 'WIKI_VRE/entities/triggered-synthesis.md',
          assertionGraph: [
            {
              assertionId: 'ASSERT-wiki-contradiction',
              text: 'The synthesis records a contradiction across sources.',
              status: 'claimed',
              declaredKind: 'contradiction',
              cites: ['PROV-wiki-001']
            }
          ],
          r2Audit: {
            status: 'passed',
            verdict: 'ACCEPT',
            reviewer: 'claude-code',
            reviewedAt: TIMESTAMP,
            law13ReviewExtension: {
              law13StatusChecked: true,
              provenanceRefsChecked: true,
              queryNotProvenanceCheck: true,
              r2PathRequired: true,
              r2PathPresent: true,
              suppositionIsolationChecked: true
            }
          }
        })
      ]
    });

    assert.equal(result.pages[0].r2Audit.status, 'passed');
    assert.equal(
      result.pages[0].compilePolicyRationale,
      'auto-upgraded-because-contradiction-signal'
    );
  });
});

test('wiki compile fails closed for non-synthesis heuristic triggers', async () => {
  await withProject('phase10-wiki-compile-policy-review-required-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);
    await installSecondBundle(projectRoot);

    await expectCode(
      () => compileBasic(projectRoot, {
        sourceBundleRefs: [
          { bundleId: 'SB-wiki-001', bundleVersion: 'v1' },
          { bundleId: 'SB-wiki-002', bundleVersion: 'v1' }
        ],
        draftPages: [
          sourceDraft({
            pageId: 'WIKI-concept-policy',
            type: 'concept',
            title: 'Concept with source mix',
            path: 'WIKI_VRE/entities/concept-policy.md',
            sourceBundleRefs: [
              { bundleId: 'SB-wiki-001', bundleVersion: 'v1' },
              { bundleId: 'SB-wiki-002', bundleVersion: 'v1' }
            ]
          })
        ]
      }),
      'E_PHASE10_COMPILE_POLICY_REVIEW_REQUIRED'
    );

    const rejectedPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'phase10',
      'knowledge-domains',
      DOMAIN_ID,
      'wiki',
      'WIKI-concept-policy.json'
    );
    assert.equal(await pathExists(rejectedPath), false);
  });
});

test('wiki compile routes concept risk metadata without creating synthesis', async () => {
  await withProject('phase10-wiki-compile-concept-routing-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    const result = await compileBasic(projectRoot, {
      draftPages: [
        sourceDraft({
          pageId: 'WIKI-concept',
          type: 'concept',
          title: 'Concept page',
          path: 'WIKI_VRE/entities/concept-page.md',
          assertionGraph: [
            {
              ...sourceDraft().assertionGraph[0],
              assertionId: 'ASSERT-wiki-concept',
              text: 'IL6 drives inflammatory signalling in resistant cells.',
              declaredKind: 'observed-association'
            }
          ]
        })
      ]
    });

    assert.equal(result.pageCount, 1);
    assert.equal(result.pages[0].type, 'concept');
    assert.equal(result.pages[0].pageRouting, 'requires-synthesis');
    assert.equal(result.pages[0].assertionGraph[0].finalRouting, 'auto-upgraded-to-synthesis');

    const wikiDir = path.join(
      projectRoot,
      '.vibe-science-environment',
      'phase10',
      'knowledge-domains',
      DOMAIN_ID,
      'wiki'
    );
    assert.equal(await pathExists(path.join(wikiDir, 'WIKI-r2-synthesis.json')), false);
  });
});

test('wiki compile rejects source and entity risk categorization errors', async () => {
  await withProject('phase10-wiki-compile-risk-reject-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            assertionGraph: [
              {
                ...sourceDraft().assertionGraph[0],
                text: 'IL6 causes resistance through a pathway mechanism.'
              }
            ]
          })
        ]
      }),
      'E_PHASE10_ASSERTION_RISK_CATEGORIZATION'
    );

    await expectCode(
      () => compileBasic(projectRoot, {
        draftPages: [
          sourceDraft({
            type: 'entity',
            assertionGraph: [
              {
                ...sourceDraft().assertionGraph[0],
                text: 'The entity page lists a short description.',
                declaredKind: 'causal-claim'
              }
            ]
          })
        ]
      }),
      'E_PHASE10_ASSERTION_KIND_FOR_PAGE_TYPE'
    );
  });
});

test('wiki compile routes hedge and supposition to hypothesis review', async () => {
  await withProject('phase10-wiki-compile-hypothesis-routing-', async (projectRoot) => {
    await installDomain(projectRoot);
    await installBundle(projectRoot);

    const hedge = await compileBasic(projectRoot, {
      draftPages: [
        sourceDraft({
          pageId: 'WIKI-hedge',
          type: 'concept',
          title: 'Hedge concept',
          path: 'WIKI_VRE/entities/hedge-concept.md',
          assertionGraph: [
            {
              ...sourceDraft().assertionGraph[0],
              text: 'This marker pattern may underlie resistant relapse.',
              declaredKind: 'observed-association'
            }
          ]
        })
      ]
    });
    assert.equal(hedge.pages[0].pageRouting, 'hypothesis-review');

    const supposition = await compileBasic(projectRoot, {
      draftPages: [
        sourceDraft({
          pageId: 'WIKI-supposition',
          type: 'concept',
          title: 'Supposition concept',
          path: 'WIKI_VRE/entities/supposition-concept.md',
          assertionGraph: [
            {
              ...sourceDraft().assertionGraph[0],
              status: 'supposition',
              text: 'This marker is a future idea to test.',
              declaredKind: 'observed-association'
            }
          ]
        })
      ]
    });
    assert.equal(supposition.pages[0].pageRouting, 'hypothesis-review');
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
    assert.equal(page.compilePolicyRationale, 'default-from-compile-policy');
    assert.equal(page.pageRouting, 'publishable');
    assert.equal(page.assertionGraph[0].status, 'sourced');
    assert.equal(page.assertionGraph[0].declaredKind, 'extractive-fact');
    assert.deepEqual(page.assertionGraph[0].riskFlags, []);
    assert.equal(page.assertionGraph[0].finalRouting, 'allowed');
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
