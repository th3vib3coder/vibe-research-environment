import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  isDirectRun,
  repoRoot,
  runValidator
} from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  compileWikiPages
} from '../../phase10/wiki-compile.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const DOMAIN_ID = 'KDOM-wiki-validator';

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function copySchemaFixture(targetRoot) {
  await cp(
    path.join(repoRoot, 'environment', 'schemas'),
    path.join(targetRoot, 'environment', 'schemas'),
    { recursive: true }
  );
}

async function installFixture(projectRoot) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: DOMAIN_ID,
    name: 'Wiki Compile Validator Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-wiki-validator'],
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
      'SB-wiki-validator',
      'v1.json'
    ),
    {
      schemaVersion: 'phase10.source-bundle.v1',
      bundleId: 'SB-wiki-validator',
      bundleVersion: 'v1',
      domainId: DOMAIN_ID,
      title: 'Curated validator source bundle',
      sourceType: 'pdf',
      trustTier: 'primary',
      license: 'open',
      allowTrackPayload: false,
      scopeOfUse: ['evidence'],
      rawDocumentRefs: [
        {
          rawDocumentId: 'RAW-wiki-validator',
          contentHash: 'sha256:wiki-validator'
        }
      ],
      sourceLocators: [
        {
          kind: 'file',
          uri: 'raw/papers/RAW-wiki-validator/source.pdf'
        }
      ],
      collectedAt: TIMESTAMP,
      status: 'curated'
    }
  );
}

export default async function validatePhase10WikiCompile() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-wiki-compile-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await installFixture(projectRoot);
    const result = await compileWikiPages(projectRoot, {
      domainId: DOMAIN_ID,
      compilePolicy: {
        schemaVersion: 'phase10.compile-policy.v1',
        compilePolicyId: 'CP-wiki-validator',
        policy: 'two-pass',
        rationale: 'Validator fixture for deterministic wiki compile scaffold.',
        requiredReviewer: 'claude-code',
        createdAt: TIMESTAMP
      },
      sourceBundleRefs: [
        {
          bundleId: 'SB-wiki-validator',
          bundleVersion: 'v1'
        }
      ],
      provenanceLinks: [
        {
          schemaVersion: 'phase10.provenance-link.v1',
          linkId: 'PROV-wiki-validator',
          domainId: DOMAIN_ID,
          kind: 'raw-source',
          sourceRef: {
            type: 'source-bundle',
            id: 'SB-wiki-validator@v1'
          },
          targetRef: {
            type: 'wiki-page',
            id: 'WIKI-validator'
          },
          createdAt: TIMESTAMP
        }
      ],
      draftPages: [
        {
          pageId: 'WIKI-validator',
          type: 'source',
          title: 'Validator wiki page',
          path: 'WIKI_VRE/entities/validator-wiki-page.md',
          sourceBundleRefs: [
            {
              bundleId: 'SB-wiki-validator',
              bundleVersion: 'v1'
            }
          ],
          assertionGraph: [
            {
              assertionId: 'ASSERT-wiki-validator',
              text: 'Validator assertion has a provenance cite.',
              status: 'sourced',
              declaredKind: 'extractive-fact',
              cites: ['PROV-wiki-validator']
            }
          ]
        }
      ],
      timestamp: TIMESTAMP
    });

    if (result.pageCount !== 1 || result.pages[0]?.pageId !== 'WIKI-validator') {
      throw new Error('phase10 wiki compile validator did not produce one page');
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-wiki-compile', validatePhase10WikiCompile);
}
