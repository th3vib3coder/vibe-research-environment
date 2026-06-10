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
  runWikiQuery
} from '../../phase10/wiki-query.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const DOMAIN_ID = 'KDOM-query-validator';

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function installFixture(projectRoot) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: DOMAIN_ID,
    name: 'Wiki Query Validator Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-query-validator'],
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  });
  const wikiRoot = path.join(
    projectRoot,
    '.vibe-science-environment',
    'phase10',
    'knowledge-domains',
    DOMAIN_ID,
    'wiki'
  );
  await writeJson(path.join(wikiRoot, 'WIKI-validator-query.json'), {
    schemaVersion: 'phase10.wiki-page.v1',
    pageId: 'WIKI-validator-query',
    domainId: DOMAIN_ID,
    type: 'concept',
    title: 'Validator query page',
    path: 'WIKI_VRE/entities/validator-query.md',
    compilePolicyId: 'CP-query-validator',
    compilePolicyRationale: 'default-from-compile-policy',
    lifecycleStatus: 'draft',
    pageRouting: 'publishable',
    assertionGraph: [
      {
        assertionId: 'ASSERT-validator-query',
        text: 'Validator query evidence mentions CXCL13 CD8 ovarian cancer.',
        status: 'sourced',
        declaredKind: 'observed-association',
        riskFlags: [],
        finalRouting: 'allowed',
        cites: ['PROV-validator-query']
      }
    ],
    updatedAt: TIMESTAMP
  });
  await writeJson(path.join(wikiRoot, 'compiled-manifest.json'), {
    schemaVersion: 'phase10.wiki-query-manifest.v1',
    domainId: DOMAIN_ID,
    active: true,
    generatedAt: TIMESTAMP,
    expiresAt: '2026-06-11T00:00:00.000Z',
    pageIds: ['WIKI-validator-query']
  });
}

export default async function validatePhase10WikiQuery() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'phase10-wiki-query-ci-'));
  try {
    await cp(
      path.join(repoRoot, 'environment', 'schemas'),
      path.join(projectRoot, 'environment', 'schemas'),
      { recursive: true }
    );
    await mkdir(path.join(projectRoot, '.vibe-science-environment'), { recursive: true });
    await installFixture(projectRoot);

    const result = await runWikiQuery(projectRoot, {
      domainId: DOMAIN_ID,
      queryId: 'QUERY-validator-query',
      queryText: 'CXCL13 CD8 ovarian cancer',
      queryClass: 'targeted-read',
      now: TIMESTAMP
    });

    if (
      result.queryRecord?.decisionUse?.classification !== 'not-for-decision'
      || result.queryRecord?.resultRefs?.[0] !== 'WIKI-validator-query'
      || !result.queryMarkdownPath.endsWith('wiki/queries/QUERY-validator-query.md')
    ) {
      throw new Error('phase10 wiki query validator produced an invalid query record');
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-wiki-query', validatePhase10WikiQuery);
}
