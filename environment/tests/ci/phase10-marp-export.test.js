import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  MARP_TEMPLATE_CATALOG,
  REQUIRED_R2_VERDICT_SECTIONS,
  buildPhase10MarpPresentation,
  validatePhase10MarpPresentationRequest
} from '../../phase10/marp-export.js';

const TIMESTAMP = '2026-06-16T00:00:00.000Z';
const HEX_64 = /^[a-f0-9]{64}$/u;

function decisionUse(classification = 'decision-grade') {
  return {
    classification,
    computedBy: 'phase10-query-decision-use',
    computedAt: TIMESTAMP
  };
}

function source(overrides = {}) {
  return {
    pageId: 'WIKI-query-001',
    sourceType: 'query-record',
    reviewed: true,
    resolved: true,
    contentMarkdown: 'Reviewed query result with cited assertions.',
    decisionUse: decisionUse(),
    epistemicBadge: 'DECISION-GRADE',
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    presentationId: 'PRES-query-001',
    title: 'Decision Support Query',
    presentationUse: 'query-decision',
    templateId: 'decision-support-query',
    source: source(),
    createdAt: TIMESTAMP,
    ...overrides
  };
}

function r2Sections(overrides = {}) {
  return {
    verdictSummary: 'Accept with narrow scope.',
    rejectedStatements: 'Rejected unsupported causal wording.',
    uncertaintyAcknowledgment: 'Residual uncertainty remains.',
    missingEvidence: 'Independent cohort missing.',
    contradictionEdgesChecked: 'Contradiction edge set reviewed.',
    recommendedNextAction: 'Run follow-up query.',
    ...overrides
  };
}

async function expectIssue(input, code) {
  const result = await validatePhase10MarpPresentationRequest(input);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

async function pathMissing(repoRelativePath) {
  try {
    await access(path.resolve(repoRelativePath));
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

test('MARP adapter catalog exposes the reviewed local template set', () => {
  assert.deepEqual(Object.keys(MARP_TEMPLATE_CATALOG).sort(), [
    'contradiction-audit-query',
    'decision-support-query',
    'hypothesis-discussion',
    'morning-digest',
    'r2-verdict',
    'synthesis-conference',
    'synthesis-preprint'
  ]);
});

test('valid reviewed decision-grade query builds in-memory MARP with actual template SHA', async () => {
  const result = await buildPhase10MarpPresentation(request());

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.match(result.presentation.templateVersion, HEX_64);
  assert.equal(result.presentation.viewOnly, true);
  assert.equal(result.presentation.allowedUse, 'local-view-only');
  assert.equal(result.presentation.provenanceArtifact, false);
  assert.equal('sharingProfile' in result.presentation, false);
  assert.equal('exportPackage' in result.presentation, false);
  assert.match(result.marpMarkdown, /phase10:view-only-not-provenance/u);
  assert.match(result.marpMarkdown, /DECISION-GRADE/u);
  assert.match(result.marpMarkdown, /WIKI-query-001/u);
});

test('unreviewed or unresolved compiled input is rejected', async () => {
  await expectIssue(
    request({ source: source({ reviewed: false }) }),
    'E_PHASE10_MARP_SOURCE_UNREVIEWED'
  );

  await expectIssue(
    request({ source: source({ resolved: false }) }),
    'E_PHASE10_MARP_SOURCE_UNRESOLVED'
  );
});

test('not-for-decision and informational sources are fail-closed for presentation', async () => {
  await expectIssue(
    request({
      source: source({
        decisionUse: decisionUse('not-for-decision'),
        epistemicBadge: 'NOT-FOR-DECISION'
      })
    }),
    'E_PHASE10_MARP_NOT_FOR_DECISION'
  );

  await expectIssue(
    request({
      source: source({
        decisionUse: decisionUse('informational'),
        epistemicBadge: 'INFORMATIONAL'
      })
    }),
    'E_PHASE10_MARP_INFORMATIONAL_REQUIRES_OVERRIDE'
  );

  const informational = await validatePhase10MarpPresentationRequest(request({
    overrideReason: 'Operator requested local context slide for review only.',
    source: source({
      decisionUse: decisionUse('informational'),
      epistemicBadge: 'INFORMATIONAL'
    })
  }));
  assert.equal(informational.ok, true, JSON.stringify(informational.issues, null, 2));
});

test('missing epistemic badge is rejected', async () => {
  await expectIssue(
    request({ source: source({ epistemicBadge: '' }) }),
    'E_PHASE10_MARP_BADGE_REQUIRED'
  );
});

test('R2 verdict presentations require all six adversarial sections', async () => {
  const complete = await buildPhase10MarpPresentation(request({
    title: 'R2 Verdict',
    presentationUse: 'r2-verdict',
    templateId: 'r2-verdict',
    source: source({ sourceType: 'r2-verdict', epistemicBadge: 'R2-REVIEWED' }),
    r2Verdict: { sections: r2Sections() }
  }));
  assert.equal(complete.ok, true, JSON.stringify(complete.issues, null, 2));
  for (const section of REQUIRED_R2_VERDICT_SECTIONS) {
    assert.match(complete.marpMarkdown, new RegExp(section, 'u'));
  }

  const missing = r2Sections({ missingEvidence: '' });
  await expectIssue(
    request({
      presentationUse: 'r2-verdict',
      templateId: 'r2-verdict',
      source: source({ sourceType: 'r2-verdict', epistemicBadge: 'R2-REVIEWED' }),
      r2Verdict: { sections: missing }
    }),
    'E_PHASE10_MARP_R2_SECTION_MISSING'
  );
});

test('hypothesis presentations stay local-only and need explicit inclusion reason', async () => {
  const localOnly = await buildPhase10MarpPresentation(request({
    title: 'Hypothesis Discussion',
    presentationUse: 'hypothesis-discussion',
    templateId: 'hypothesis-discussion',
    overrideReason: 'Local hypothesis review, not publication material.',
    source: source({
      sourceType: 'hypothesis',
      decisionUse: decisionUse('informational'),
      epistemicBadge: 'HYPOTHESIS - NOT ESTABLISHED'
    })
  }));
  assert.equal(localOnly.ok, true, JSON.stringify(localOnly.issues, null, 2));
  assert.equal(localOnly.presentation.allowedUse, 'local-view-only');
  assert.equal(localOnly.presentation.provenanceArtifact, false);
  assert.equal('publicExport' in localOnly.presentation, false);

  await expectIssue(
    request({
      presentationUse: 'hypothesis-discussion',
      templateId: 'hypothesis-discussion',
      includeHypothesisPresentations: true,
      includeHypothesisReason: ' ',
      source: source({
        decisionUse: decisionUse('informational'),
        epistemicBadge: 'HYPOTHESIS - NOT ESTABLISHED'
      })
    }),
    'E_PHASE10_MARP_HYPOTHESIS_REASON_REQUIRED'
  );

  await expectIssue(
    request({
      presentationUse: 'hypothesis-discussion',
      templateId: 'hypothesis-discussion',
      exportRequested: true,
      source: source({
        decisionUse: decisionUse('informational'),
        epistemicBadge: 'HYPOTHESIS - NOT ESTABLISHED'
      })
    }),
    'E_PHASE10_MARP_EXPORT_FORBIDDEN'
  );
});

test('template-version mismatch rejects against actual template-file SHA', async () => {
  await expectIssue(
    request({ templateVersion: '0'.repeat(64) }),
    'E_PHASE10_MARP_TEMPLATE_VERSION_MISMATCH'
  );
});

test('MARP presentation paths cannot be used as LAW 13 provenance', async () => {
  await expectIssue(
    request({ provenanceRefs: ['wiki/presentations/query.marp.md'] }),
    'E_PHASE10_PRESENTATION_NOT_PROVENANCE'
  );
});

test('adapter rejects writer, renderer, public sharing, and export package fields', async () => {
  for (const badInput of [
    request({ outputPath: 'wiki/presentations/query.marp.md' }),
    request({ renderCommand: 'marp --pdf query.marp.md' }),
    request({ sharingProfile: 'public-export' }),
    request({ exportPackage: { path: 'dist/query.zip' } })
  ]) {
    await expectIssue(badInput, 'E_PHASE10_MARP_SIDE_EFFECT_FORBIDDEN');
  }

  assert.equal(await pathMissing('environment/tests/cli/domain-export.test.js'), true);
});
