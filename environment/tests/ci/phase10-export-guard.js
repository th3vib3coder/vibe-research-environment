import { access } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  validatePhase10ExportAttempt
} from '../../phase10/export-guard.js';

const FORBIDDEN_SIDE_EFFECT_PATHS = [
  'environment/tests/cli/domain-export.test.js'
];

async function pathExists(repoRelativePath) {
  try {
    await access(path.join(repoRoot, repoRelativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export default async function validatePhase10ExportGuard() {
  const result = validatePhase10ExportAttempt({
    operation: 'export',
    sharingProfile: 'public-export',
    recipe: {
      schemaVersion: 'phase10.export-recipe.v1',
      exportRecipeId: 'EXPORT-ci-guard',
      domainId: 'KDOM-ci-guard',
      format: 'marp',
      sourcePageIds: ['WIKI-ci-public'],
      compilePolicyId: 'CP-ci-guard',
      guardPolicy: {
        requireFreshSources: true,
        requireCitations: true
      },
      createdAt: '2026-06-16T00:00:00.000Z'
    },
    sources: [
      {
        pageId: 'WIKI-ci-public',
        sensitivity: 'public',
        sensitivityCheck: { status: 'checked' },
        licenseCheck: {
          status: 'checked',
          exportAllowed: true,
          licenseId: 'CC-BY-4.0'
        },
        decisionUse: {
          classification: 'informational',
          computedBy: 'phase10-query-decision-use',
          computedAt: '2026-06-16T00:00:00.000Z'
        }
      }
    ],
    manifest: {
      exportManifestId: 'EXPORT-MANIFEST-ci',
      sha256: 'b'.repeat(64),
      generatedAt: '2026-06-16T00:00:00.000Z',
      metadataOnly: true
    }
  });

  assert(result.ok, `Valid export guard fixture failed: ${JSON.stringify(result.issues)}`);

  for (const forbiddenPath of FORBIDDEN_SIDE_EFFECT_PATHS) {
    assert(
      !(await pathExists(forbiddenPath)),
      `Forbidden T10.4.0 side-effect path exists: ${forbiddenPath}`
    );
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-export-guard', validatePhase10ExportGuard);
}
