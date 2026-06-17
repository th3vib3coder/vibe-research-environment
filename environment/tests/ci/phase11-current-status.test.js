import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCurrentStatusModel,
  CURRENT_STATUS_MARKERS,
  CURRENT_STATUS_REASON_CODES,
  renderReadmeCurrentStatusEnglish,
  renderReadmeCurrentStatusItalian,
  renderReadmeSurfaceCountsEnglish,
  renderReadmeSurfaceCountsItalian,
  renderWikiCurrentStatus,
  replaceGeneratedBlock,
  validateCurrentStatusProjection
} from '../../phase11/current-status.js';

const COUNTS = Object.freeze({
  bundleManifests: 11,
  schemas: 70,
  templates: 8,
  ciValidators: 56
});

function makeAuthority(overrides = {}) {
  return {
    schemaVersion: 'phase11.current-status-authority.v1',
    sourceStrategy: 'tracked-vre-snapshot',
    snapshotMatchesCanonicalPrivateWiki: true,
    phase: 11,
    phaseStatus: 'open',
    activeWave: '11.3',
    latestClosedWave: '11.2',
    latestClosedTask: {
      taskId: 'T11.2.5',
      name: 'Wave 11.2 Closeout',
      commit: 'b44602e',
      ciRun: '27674943083',
      ciConclusion: 'success',
      status: 'closed-pushed-ci-green'
    },
    currentTask: {
      taskId: 'T11.3.0',
      name: 'Generated Current Status',
      status: 'hat2-implementation-open'
    },
    carryForward: [
      {
        id: 'FU-EOF-NOISE-CLEANUP',
        status: 'open non-blocking',
        summary: 'Persistent EOF-only tracked diffs remain out of scope.'
      },
      {
        id: 'W10.4-DEFERRED-EXPORT-PACKAGING-001',
        status: 'deferred',
        summary: 'Full export package/profile materialization remains future HAT work.'
      },
      {
        id: 'W10.5-DEFERRED-PERSISTED-MULTI-DOMAIN-EXECUTION-001',
        status: 'deferred',
        summary: 'Persisted multi-domain execution remains future HAT work.'
      },
      {
        id: 'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE',
        status: 'deferred',
        summary: 'Graphify remains a navigation track until real-run need is proven.'
      }
    ],
    authoritySources: [
      'WIKI_VRE/state/decision-gates.json',
      'WIKI_VRE/closures/phase10-full-closeout-2026-06-16.md',
      'phase11-implementation-plan/07-graphify-reconciliation.md'
    ],
    generatedAt: '2026-06-17',
    ...overrides
  };
}

function makeReadme(authority = makeAuthority()) {
  const model = buildCurrentStatusModel(authority, COUNTS);
  let markdown = [
    '# Vibe Research Environment (VRE)',
    '',
    '<!-- VRE:CURRENT-SURFACE-COUNTS:EN:BEGIN -->',
    'old EN counts',
    '<!-- VRE:CURRENT-SURFACE-COUNTS:EN:END -->',
    '',
    '<!-- VRE:CURRENT-STATUS:EN:BEGIN -->',
    'old EN status',
    '<!-- VRE:CURRENT-STATUS:EN:END -->',
    '',
    '<!-- VRE:CURRENT-SURFACE-COUNTS:IT:BEGIN -->',
    'old IT counts',
    '<!-- VRE:CURRENT-SURFACE-COUNTS:IT:END -->',
    '',
    '<!-- VRE:CURRENT-STATUS:IT:BEGIN -->',
    'old IT status',
    '<!-- VRE:CURRENT-STATUS:IT:END -->',
    ''
  ].join('\n');

  markdown = replaceGeneratedBlock(
    markdown,
    CURRENT_STATUS_MARKERS.surfaceCountsEnglish,
    renderReadmeSurfaceCountsEnglish(model)
  );
  markdown = replaceGeneratedBlock(
    markdown,
    CURRENT_STATUS_MARKERS.currentStatusEnglish,
    renderReadmeCurrentStatusEnglish(model)
  );
  markdown = replaceGeneratedBlock(
    markdown,
    CURRENT_STATUS_MARKERS.surfaceCountsItalian,
    renderReadmeSurfaceCountsItalian(model)
  );
  markdown = replaceGeneratedBlock(
    markdown,
    CURRENT_STATUS_MARKERS.currentStatusItalian,
    renderReadmeCurrentStatusItalian(model)
  );
  return markdown;
}

test('valid README and WIKI generated projections pass', () => {
  const authority = makeAuthority();
  const model = buildCurrentStatusModel(authority, COUNTS);
  const result = validateCurrentStatusProjection({
    authority,
    counts: COUNTS,
    readmeMarkdown: makeReadme(authority),
    wikiMarkdown: renderWikiCurrentStatus(model)
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('stale English README status fails closed', () => {
  const result = validateCurrentStatusProjection({
    authority: makeAuthority(),
    counts: COUNTS,
    readmeMarkdown: makeReadme().replace(
      'Phase 11 is open; Wave 11.2 is closed',
      'Wave 5 v2.1 is complete'
    ),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(makeAuthority(), COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.readmeCurrentStatusEnglishMismatch
  ));
});

test('stale Italian README status fails closed', () => {
  const result = validateCurrentStatusProjection({
    authority: makeAuthority(),
    counts: COUNTS,
    readmeMarkdown: makeReadme().replace(
      'Phase 11 e aperta; Wave 11.2 e chiusa',
      'Wave 5 v2.1 e completa'
    ),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(makeAuthority(), COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.readmeCurrentStatusItalianMismatch
  ));
});

test('surface counts come from the supplied live count object', () => {
  const badCounts = { ...COUNTS, schemas: 54 };
  const result = validateCurrentStatusProjection({
    authority: makeAuthority(),
    counts: COUNTS,
    readmeMarkdown: makeReadme().replace('| Schemas | 70 |', '| Schemas | 54 |'),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(makeAuthority(), badCounts))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.readmeSurfaceCountsEnglishMismatch
  ));
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.wikiProjectionMismatch
  ));
});

test('private sibling WIKI is rejected as a CI input strategy', () => {
  const result = validateCurrentStatusProjection({
    authority: makeAuthority({ sourceStrategy: 'sibling-private-wiki' }),
    counts: COUNTS,
    readmeMarkdown: makeReadme(),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(makeAuthority(), COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.privateWikiCiDependency
  ));
});

test('snapshot drift from canonical private WIKI fails closed', () => {
  const result = validateCurrentStatusProjection({
    authority: makeAuthority({ snapshotMatchesCanonicalPrivateWiki: false }),
    counts: COUNTS,
    readmeMarkdown: makeReadme(),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(makeAuthority(), COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.snapshotDrift
  ));
});

test('missing carry-forward item fails closed', () => {
  const authority = makeAuthority({
    carryForward: makeAuthority().carryForward.filter((item) =>
      item.id !== 'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'
    )
  });
  const result = validateCurrentStatusProjection({
    authority,
    counts: COUNTS,
    readmeMarkdown: makeReadme(authority),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(authority, COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.missingCarryForward
      && issue.itemId === 'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'
  ));
});

test('Phase 11 full-closeout overclaim fails closed', () => {
  const authority = makeAuthority({ phaseStatus: 'closed' });
  const result = validateCurrentStatusProjection({
    authority,
    counts: COUNTS,
    readmeMarkdown: makeReadme(authority),
    wikiMarkdown: renderWikiCurrentStatus(buildCurrentStatusModel(authority, COUNTS))
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === CURRENT_STATUS_REASON_CODES.phase11Closed
  ));
});
