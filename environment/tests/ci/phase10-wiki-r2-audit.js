import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  isDirectRun,
  runValidator
} from './_helpers.js';
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
const DOMAIN_ID = 'KDOM-r2-validator';
const SOURCE_REF = { bundleId: 'SB-r2-validator', bundleVersion: 'v1' };

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function installFixture(projectRoot) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: DOMAIN_ID,
    name: 'R2 Validator Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-r2-validator'],
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  });
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
      title: 'R2 validator source bundle',
      sourceType: 'pdf',
      trustTier: 'primary',
      license: 'open',
      allowTrackPayload: false,
      scopeOfUse: ['evidence'],
      rawDocumentRefs: [
        {
          rawDocumentId: 'RAW-r2-validator',
          contentHash: 'sha256:r2-validator'
        }
      ],
      sourceLocators: [
        {
          kind: 'file',
          uri: 'raw/r2-validator/source.pdf'
        }
      ],
      collectedAt: TIMESTAMP,
      status: 'curated'
    }
  );
}

function provenanceLink() {
  return {
    schemaVersion: 'phase10.provenance-link.v1',
    linkId: 'PROV-r2-validator',
    domainId: DOMAIN_ID,
    kind: 'raw-source',
    sourceRef: {
      type: 'source-bundle',
      id: 'SB-r2-validator@v1'
    },
    targetRef: {
      type: 'wiki-page',
      id: 'WIKI-r2-validator'
    },
    createdAt: TIMESTAMP
  };
}

export default async function validatePhase10WikiR2Audit() {
  const projectRoot = await createCliFixtureProject('phase10-wiki-r2-audit-ci-');
  try {
    await installFixture(projectRoot);
    const result = await compileWikiPages(projectRoot, {
      domainId: DOMAIN_ID,
      compilePolicy: {
        schemaVersion: 'phase10.compile-policy.v1',
        compilePolicyId: 'CP-r2-validator',
        policy: 'three-pass-r2-audited',
        rationale: 'Validator fixture for R2 audited synthesis compile.',
        requiredReviewer: 'claude-code',
        createdAt: TIMESTAMP
      },
      sourceBundleRefs: [SOURCE_REF],
      provenanceLinks: [provenanceLink()],
      draftPages: [
        {
          pageId: 'WIKI-r2-validator',
          type: 'synthesis',
          title: 'R2 validator synthesis',
          path: 'WIKI_VRE/entities/r2-validator-synthesis.md',
          sourceBundleRefs: [SOURCE_REF],
          assertionGraph: [
            {
              assertionId: 'ASSERT-r2-validator',
              text: 'Validator synthesis cites original provenance.',
              status: 'claimed',
              declaredKind: 'cross-source-comparison',
              cites: ['PROV-r2-validator']
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
        }
      ],
      timestamp: TIMESTAMP
    });

    if (result.pageCount !== 1 || result.pages[0]?.type !== 'synthesis') {
      throw new Error('phase10 R2 audit validator did not produce one synthesis page');
    }
    const page = await readJson(path.join(projectRoot, result.pages[0].wikiPageRecordPath));
    const lint = lintPhase10Corpus({
      wikiPages: [page],
      provenanceLinks: [provenanceLink()]
    });
    if (!lint.ok) {
      throw new Error(`phase10 R2 audit validator failed LAW 13 lint: ${JSON.stringify(lint.issues)}`);
    }
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-wiki-r2-audit', validatePhase10WikiR2Audit);
}
