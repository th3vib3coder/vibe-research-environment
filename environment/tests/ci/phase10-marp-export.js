import { access } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  MARP_TEMPLATE_CATALOG,
  buildPhase10MarpPresentation
} from '../../phase10/marp-export.js';

const FORBIDDEN_SIDE_EFFECT_PATHS = [
  'environment/phase10/presentation-staleness.js',
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

export default async function validatePhase10MarpExport() {
  assert(
    Object.keys(MARP_TEMPLATE_CATALOG).length === 7,
    'MARP adapter must expose the seven reviewed local templates'
  );

  const result = await buildPhase10MarpPresentation({
    presentationId: 'PRES-ci-query-001',
    title: 'CI Decision Support Query',
    presentationUse: 'query-decision',
    templateId: 'decision-support-query',
    source: {
      pageId: 'WIKI-ci-query-001',
      sourceType: 'query-record',
      reviewed: true,
      resolved: true,
      contentMarkdown: 'Reviewed CI query result.',
      decisionUse: {
        classification: 'decision-grade',
        computedBy: 'phase10-query-decision-use',
        computedAt: '2026-06-16T00:00:00.000Z'
      },
      epistemicBadge: 'DECISION-GRADE'
    },
    createdAt: '2026-06-16T00:00:00.000Z'
  });

  assert(result.ok, `Valid MARP adapter fixture failed: ${JSON.stringify(result.issues)}`);
  assert(/^[a-f0-9]{64}$/u.test(result.presentation.templateVersion), 'Template version must be actual SHA256');
  assert(result.marpMarkdown.includes('phase10:view-only-not-provenance'), 'MARP output must be view-only');
  assert(result.marpMarkdown.includes('DECISION-GRADE'), 'MARP output must show the epistemic badge');
  assert(!('sharingProfile' in result.presentation), 'MARP metadata must not include sharingProfile');
  assert(!('exportPackage' in result.presentation), 'MARP metadata must not include exportPackage');

  for (const forbiddenPath of FORBIDDEN_SIDE_EFFECT_PATHS) {
    assert(
      !(await pathExists(forbiddenPath)),
      `Forbidden T10.4.1 side-effect path exists: ${forbiddenPath}`
    );
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-marp-export', validatePhase10MarpExport);
}
