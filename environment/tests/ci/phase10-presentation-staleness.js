import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  validatePhase10PresentationStaleness
} from '../../phase10/presentation-staleness.js';

const sha = (char) => char.repeat(64);

export default async function validatePhase10PresentationStalenessValidator() {
  const result = validatePhase10PresentationStaleness({
    schemaVersion: 'phase10.presentation.v1',
    presentationId: 'PRES-ci-stale-001',
    domainId: 'KDOM-ci-stale-001',
    title: 'CI Presentation Freshness',
    presentationUse: 'query-decision',
    sourcePageId: 'WIKI-ci-stale-001',
    sourcePageIds: ['WIKI-ci-stale-001'],
    exportRecipeId: 'EXPORT-ci-stale-001',
    templateId: 'MARP-ci-stale-001',
    templateVersion: sha('d'),
    sourcePageSha: sha('a'),
    provenanceManifestSha: sha('b'),
    edgeManifestSha: sha('c'),
    renderedContentSha: sha('e'),
    decisionUseAtRender: 'decision-grade',
    epistemicBadge: 'DECISION-GRADE',
    epistemicBadgeRequired: true,
    renderedAt: '2026-06-16T00:00:00.000Z',
    renderedBy: 'phase10-marp-export',
    presentationStatus: 'active',
    stalenessPolicy: { maxSourceAgeDays: 30 },
    createdAt: '2026-06-16T00:00:00.000Z'
  }, {
    sourcePageSha: sha('a'),
    provenanceManifestSha: sha('b'),
    edgeManifestSha: sha('c'),
    templateVersion: sha('d'),
    renderedContentSha: sha('e')
  });

  assert(result.ok, `Valid presentation staleness fixture failed: ${JSON.stringify(result.issues)}`);
  assert(result.exportAllowed === false, 'Presentation staleness checks must not approve export');
  assert(result.localReviewOnly === true, 'Presentation staleness checks remain local-review-only');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-presentation-staleness', validatePhase10PresentationStalenessValidator);
}
