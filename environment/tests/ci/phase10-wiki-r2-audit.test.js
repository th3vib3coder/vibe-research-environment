import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  lintPhase10Corpus
} from '../../phase10/law13-lint.js';
import {
  compileWikiPages
} from '../../phase10/wiki-compile.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const DOMAIN_ID = 'KDOM-r2-audit';
const SOURCE_REF = { bundleId: 'SB-r2-audit', bundleVersion: 'v1' };
const THREE_PASS_POLICY = Object.freeze({
  schemaVersion: 'phase10.compile-policy.v1',
  compilePolicyId: 'CP-r2-audit',
  policy: 'three-pass-r2-audited',
  rationale: 'R2 audited synthesis publication test.',
  requiredReviewer: 'claude-code',
  createdAt: TIMESTAMP
});
const TWO_PASS_POLICY = Object.freeze({
  ...THREE_PASS_POLICY,
  compilePolicyId: 'CP-r2-two-pass',
  policy: 'two-pass'
});

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

async function installDomain(projectRoot) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: DOMAIN_ID,
    name: 'R2 Audited Synthesis Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-r2-audit'],
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  });
}

async function installBundle(projectRoot) {
  await writeJson(
    path.join(
      projectRoot,
      '.vibe-science-environment',
      'phase10',
      'knowledge-domains',
      DOMAIN_ID,
      'source-bundles',
      SOURCE_REF.bundleId,
      `${SOURCE_REF.bundleVersion}.json`
    ),
    {
      schemaVersion: 'phase10.source-bundle.v1',
      bundleId: SOURCE_REF.bundleId,
      bundleVersion: SOURCE_REF.bundleVersion,
      domainId: DOMAIN_ID,
      title: 'R2 audited source bundle',
      sourceType: 'pdf',
      trustTier: 'primary',
      license: 'open',
      allowTrackPayload: false,
      scopeOfUse: ['evidence'],
      rawDocumentRefs: [
        {
          rawDocumentId: 'RAW-r2-audit',
          contentHash: 'sha256:r2-audit'
        }
      ],
      sourceLocators: [
        {
          kind: 'file',
          uri: 'raw/r2/source.pdf'
        }
      ],
      collectedAt: TIMESTAMP,
      status: 'curated'
    }
  );
}

function bridgeFields(overrides = {}) {
  return {
    law13StatusChecked: true,
    provenanceRefsChecked: true,
    queryNotProvenanceCheck: true,
    r2PathRequired: true,
    r2PathPresent: true,
    suppositionIsolationChecked: true,
    ...overrides
  };
}

function r2Audit(overrides = {}) {
  const base = {
    status: 'passed',
    verdict: 'ACCEPT',
    reviewer: 'claude-code',
    reviewedAt: TIMESTAMP,
    law13ReviewExtension: bridgeFields()
  };
  return {
    ...base,
    ...overrides,
    law13ReviewExtension: {
      ...base.law13ReviewExtension,
      ...(overrides.law13ReviewExtension ?? {})
    }
  };
}

function provenanceLink(overrides = {}) {
  return {
    schemaVersion: 'phase10.provenance-link.v1',
    linkId: 'PROV-r2-audit',
    domainId: DOMAIN_ID,
    kind: 'raw-source',
    sourceRef: {
      type: 'source-bundle',
      id: 'SB-r2-audit@v1'
    },
    targetRef: {
      type: 'wiki-page',
      id: 'WIKI-r2-synthesis'
    },
    createdAt: TIMESTAMP,
    ...overrides
  };
}

function synthesisDraft(overrides = {}) {
  return {
    pageId: 'WIKI-r2-synthesis',
    type: 'synthesis',
    title: 'R2 audited synthesis',
    path: 'WIKI_VRE/entities/r2-audited-synthesis.md',
    sourceBundleRefs: [SOURCE_REF],
    assertionGraph: [
      {
        assertionId: 'ASSERT-r2-audit',
        text: 'A synthesis assertion cites original provenance.',
        status: 'claimed',
        cites: ['PROV-r2-audit']
      }
    ],
    r2Audit: r2Audit(),
    ...overrides
  };
}

function sourceDraft(overrides = {}) {
  return {
    ...synthesisDraft({
      pageId: 'WIKI-r2-source',
      type: 'source',
      title: 'R2 source page',
      path: 'WIKI_VRE/entities/r2-source.md',
      r2Audit: undefined,
      ...overrides
    })
  };
}

async function installProject(projectRoot) {
  await installDomain(projectRoot);
  await installBundle(projectRoot);
}

async function compileR2(projectRoot, overrides = {}) {
  return compileWikiPages(projectRoot, {
    domainId: DOMAIN_ID,
    compilePolicy: THREE_PASS_POLICY,
    sourceBundleRefs: [SOURCE_REF],
    provenanceLinks: [provenanceLink()],
    draftPages: [synthesisDraft()],
    timestamp: TIMESTAMP,
    ...overrides
  });
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('R2 audited synthesis compiles and remains LAW 13 lint-clean', async () => {
  await withProject('phase10-r2-audit-green-', async (projectRoot) => {
    await installProject(projectRoot);

    const result = await compileR2(projectRoot);

    assert.equal(result.ok, true);
    assert.equal(result.pageCount, 1);
    assert.equal(result.pages[0].type, 'synthesis');
    assert.equal(result.pages[0].r2Audit.status, 'passed');
    assert.equal(result.pages[0].r2Audit.verdict, 'ACCEPT');

    const page = await readJson(path.join(projectRoot, result.pages[0].wikiPageRecordPath));
    assert.equal(page.type, 'synthesis');
    assert.equal(page.r2Audit.law13ReviewExtension.queryNotProvenanceCheck, true);

    const lint = lintPhase10Corpus({
      wikiPages: [page],
      provenanceLinks: [provenanceLink()]
    });
    assert.deepEqual(lint, { ok: true, issues: [] });
  });
});

test('R2 audited synthesis rejects two-pass or missing R2 metadata', async () => {
  await withProject('phase10-r2-audit-required-', async (projectRoot) => {
    await installProject(projectRoot);

    await expectCode(
      () => compileR2(projectRoot, { compilePolicy: TWO_PASS_POLICY }),
      'E_PHASE10_WIKI_SYNTHESIS_R2_POLICY_REQUIRED'
    );
    await expectCode(
      () => compileR2(projectRoot, { draftPages: [synthesisDraft({ r2Audit: undefined })] }),
      'E_PHASE10_WIKI_R2_AUDIT_REQUIRED'
    );
  });
});

test('R2 audited synthesis rejects incomplete or failed bridge metadata', async () => {
  await withProject('phase10-r2-audit-bridge-', async (projectRoot) => {
    await installProject(projectRoot);

    const missingField = r2Audit();
    delete missingField.law13ReviewExtension.provenanceRefsChecked;
    await expectCode(
      () => compileR2(projectRoot, { draftPages: [synthesisDraft({ r2Audit: missingField })] }),
      'E_PHASE10_LAW13_BRIDGE_FIELD_MISSING'
    );

    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            r2Audit: r2Audit({
              law13ReviewExtension: { r2PathPresent: false }
            })
          })
        ]
      }),
      'E_PHASE10_R2_PATH_REQUIRED'
    );
  });
});

test('R2 audited synthesis rejects relay verdicts and query records as provenance', async () => {
  await withProject('phase10-r2-audit-provenance-', async (projectRoot) => {
    await installProject(projectRoot);

    await expectCode(
      () => compileR2(projectRoot, {
        provenanceLinks: [
          provenanceLink({ targetRef: { type: 'phase12-relay-verdict', id: 'RV-001' } })
        ]
      }),
      'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE'
    );
    await expectCode(
      () => compileR2(projectRoot, {
        provenanceLinks: [
          provenanceLink({ targetRef: { type: 'query-record', id: 'QUERY-001' } })
        ]
      }),
      'E_PHASE10_QUERY_METADATA_NOT_PROVENANCE'
    );
  });
});

test('R2 audited synthesis rejects non-accepted verdicts and unsafe repair metadata', async () => {
  await withProject('phase10-r2-audit-repair-', async (projectRoot) => {
    await installProject(projectRoot);

    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            r2Audit: r2Audit({ status: 'rejected', verdict: 'REDIRECT' })
          })
        ]
      }),
      'E_PHASE10_WIKI_R2_REJECTED_STATEMENTS_REQUIRED'
    );
    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            r2Audit: r2Audit({
              status: 'rejected',
              verdict: 'REDIRECT',
              rejectedStatementIds: ['ASSERT-r2-audit']
            })
          })
        ]
      }),
      'E_PHASE10_WIKI_R2_ACCEPT_REQUIRED'
    );
    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            r2Audit: r2Audit({
              repairAttempts: [
                {
                  rejectionEventId: 'R2-EVENT-001',
                  rejectedStatementIds: ['ASSERT-r2-audit']
                },
                {
                  rejectionEventId: 'R2-EVENT-001',
                  rejectedStatementIds: ['ASSERT-r2-audit']
                }
              ]
            })
          })
        ]
      }),
      'E_PHASE10_WIKI_R2_REPAIR_ATTEMPT_LIMIT'
    );
    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            r2Audit: r2Audit({
              repairAttempts: [
                {
                  rejectionEventId: 'R2-EVENT-002',
                  rejectedStatementIds: ['ASSERT-r2-audit'],
                  addedSources: ['SB-new']
                }
              ]
            })
          })
        ]
      }),
      'E_PHASE10_WIKI_R2_REPAIR_FORBIDDEN'
    );
  });
});

test('R2 audited synthesis still rejects orphan assertions after repair metadata', async () => {
  await withProject('phase10-r2-audit-orphan-', async (projectRoot) => {
    await installProject(projectRoot);

    await expectCode(
      () => compileR2(projectRoot, {
        draftPages: [
          synthesisDraft({
            assertionGraph: [
              {
                assertionId: 'ASSERT-r2-audit',
                text: 'A repaired assertion still needs cites.',
                status: 'claimed',
                cites: []
              }
            ],
            r2Audit: r2Audit({
              repairAttempts: [
                {
                  rejectionEventId: 'R2-EVENT-003',
                  rejectedStatementIds: ['ASSERT-r2-audit']
                }
              ]
            })
          })
        ]
      }),
      'E_PHASE10_WIKI_ASSERTION_CITES_REQUIRED'
    );
  });
});

test('three-pass R2 policy is not silently applied to non-synthesis pages', async () => {
  await withProject('phase10-r2-audit-no-downgrade-', async (projectRoot) => {
    await installProject(projectRoot);

    await expectCode(
      () => compileR2(projectRoot, { draftPages: [sourceDraft()] }),
      'E_PHASE10_WIKI_COMPILE_POLICY_FORBIDDEN'
    );
  });
});
