import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validatePhase10PresentationStaleness
} from '../../phase10/presentation-staleness.js';

const TIMESTAMP = '2026-06-16T00:00:00.000Z';
const SOURCE_SHA = 'a'.repeat(64);
const PROVENANCE_SHA = 'b'.repeat(64);
const EDGE_SHA = 'c'.repeat(64);
const TEMPLATE_SHA = 'd'.repeat(64);
const CONTENT_SHA = 'e'.repeat(64);

function presentation(overrides = {}) {
  return {
    schemaVersion: 'phase10.presentation.v1',
    presentationId: 'PRES-stale-001',
    domainId: 'KDOM-stale-001',
    title: 'Staleness Fixture',
    presentationUse: 'query-decision',
    sourcePageId: 'WIKI-stale-001',
    sourcePageIds: ['WIKI-stale-001'],
    exportRecipeId: 'EXPORT-stale-001',
    templateId: 'MARP-stale-001',
    templateVersion: TEMPLATE_SHA,
    sourcePageSha: SOURCE_SHA,
    provenanceManifestSha: PROVENANCE_SHA,
    edgeManifestSha: EDGE_SHA,
    renderedContentSha: CONTENT_SHA,
    decisionUseAtRender: 'decision-grade',
    epistemicBadge: 'DECISION-GRADE',
    epistemicBadgeRequired: true,
    renderedAt: TIMESTAMP,
    renderedBy: 'phase10-marp-export',
    presentationStatus: 'active',
    stalenessPolicy: { maxSourceAgeDays: 30 },
    createdAt: TIMESTAMP,
    ...overrides
  };
}

function current(overrides = {}) {
  return {
    sourcePageSha: SOURCE_SHA,
    provenanceManifestSha: PROVENANCE_SHA,
    edgeManifestSha: EDGE_SHA,
    templateVersion: TEMPLATE_SHA,
    renderedContentSha: CONTENT_SHA,
    ...overrides
  };
}

function expectIssue(result, code) {
  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('fresh presentation dependency manifest passes read-only staleness check', () => {
  const result = validatePhase10PresentationStaleness(presentation(), current());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.freshnessStatus, 'fresh');
  assert.equal(result.exportAllowed, false);
  assert.equal(result.localReviewOnly, true);
});

test('missing presentation manifest rejects fail-closed', () => {
  expectIssue(
    validatePhase10PresentationStaleness(null, current()),
    'E_PHASE10_PRESENTATION_MANIFEST_MISSING'
  );
});

test('missing dependency SHAs reject fail-closed', () => {
  for (const field of ['sourcePageSha', 'provenanceManifestSha', 'edgeManifestSha', 'templateVersion']) {
    const fixture = presentation();
    delete fixture[field];
    expectIssue(
      validatePhase10PresentationStaleness(fixture, current()),
      'E_PHASE10_PRESENTATION_DEPENDENCY_MISSING'
    );
  }
});

test('source, provenance, edge, and template SHA drift rejects', () => {
  const cases = [
    ['sourcePageSha', '0'.repeat(64), 'E_PHASE10_PRESENTATION_SOURCE_SHA_STALE'],
    ['provenanceManifestSha', '1'.repeat(64), 'E_PHASE10_PRESENTATION_PROVENANCE_SHA_STALE'],
    ['edgeManifestSha', '2'.repeat(64), 'E_PHASE10_PRESENTATION_EDGE_SHA_STALE'],
    ['templateVersion', '3'.repeat(64), 'E_PHASE10_PRESENTATION_TEMPLATE_SHA_STALE']
  ];

  for (const [field, value, code] of cases) {
    expectIssue(
      validatePhase10PresentationStaleness(presentation(), current({ [field]: value })),
      code
    );
  }
});

test('archived presentation content rewrite rejects', () => {
  expectIssue(
    validatePhase10PresentationStaleness(
      presentation({ presentationStatus: 'archived' }),
      current({ renderedContentSha: '4'.repeat(64) })
    ),
    'E_PHASE10_ARCHIVED_PRESENTATION_REWRITE'
  );
});

test('freshness override requires reason and stays local-review-only', () => {
  expectIssue(
    validatePhase10PresentationStaleness(
      presentation({
        freshnessOverride: { requested: true, affectsDecisionUse: true }
      }),
      current({ sourcePageSha: '5'.repeat(64) })
    ),
    'E_PHASE10_PRESENTATION_OVERRIDE_REASON_REQUIRED'
  );

  expectIssue(
    validatePhase10PresentationStaleness(
      presentation({
        freshnessOverride: {
          requested: true,
          reason: 'Slides are used only for local stale-source review.',
          affectsDecisionUse: true,
          localReviewOnly: false
        }
      }),
      current({ sourcePageSha: '6'.repeat(64) })
    ),
    'E_PHASE10_PRESENTATION_OVERRIDE_EXPORT_FORBIDDEN'
  );

  const overridden = validatePhase10PresentationStaleness(
    presentation({
      freshnessOverride: {
        requested: true,
        reason: 'Slides are used only for local stale-source review.',
        affectsDecisionUse: true,
        localReviewOnly: true
      }
    }),
    current({ sourcePageSha: '7'.repeat(64) })
  );
  assert.equal(overridden.ok, true, JSON.stringify(overridden, null, 2));
  assert.equal(overridden.freshnessStatus, 'overridden-stale');
  assert.equal(overridden.exportAllowed, false);
  assert.equal(overridden.localReviewOnly, true);
  assert.equal(overridden.warnings.length > 0, true);
});

test('not-for-decision material cannot pass as decision presentation', () => {
  expectIssue(
    validatePhase10PresentationStaleness(
      presentation({ decisionUseAtRender: 'not-for-decision' }),
      current()
    ),
    'E_PHASE10_PRESENTATION_NOT_FOR_DECISION'
  );
});
