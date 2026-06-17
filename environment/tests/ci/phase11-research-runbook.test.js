import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESEARCH_RUNBOOK_REASON_CODES,
  makeResearchRunbookAuthority,
  renderResearchRunbook,
  validateResearchRunbook
} from '../../phase11/research-runbook.js';
import {
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';
import authoritySnapshot from '../fixtures/phase11/research-runbook-authority.json' with {
  type: 'json'
};

function makeAuthority(overrides = {}) {
  return makeResearchRunbookAuthority({
    execution: makeFirstResearchPacketExecutionFixture(),
    snapshot: {
      ...authoritySnapshot,
      ...overrides
    }
  });
}

function expectIssue({ markdown, snapshotOverrides = {} }, code) {
  const authority = makeAuthority(snapshotOverrides);
  const result = validateResearchRunbook({
    markdown: markdown ?? renderResearchRunbook(authority),
    authority
  });

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid research runbook projection passes', () => {
  const authority = makeAuthority();
  const result = validateResearchRunbook({
    markdown: renderResearchRunbook(authority),
    authority
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.decision, 'research-runbook-handoff-ready');
  assert.equal(result.claimPromotionAllowed, false);
  assert.equal(result.realDataReadAllowedInCi, false);
});

test('wrong total-cell value fails closed', () => {
  const authority = makeAuthority();
  expectIssue({
    markdown: renderResearchRunbook(authority).replace('34,733', '34,734')
  }, RESEARCH_RUNBOOK_REASON_CODES.totalCellsMismatch);
});

test('wrong per-file SHA-256 value fails closed', () => {
  const authority = makeAuthority();
  const firstHash = authority.selectedH5adFiles[0].sha256;
  expectIssue({
    markdown: renderResearchRunbook(authority).replace(firstHash, '0'.repeat(64))
  }, RESEARCH_RUNBOOK_REASON_CODES.fileHashMismatch);
});

test('tracked authority snapshot must match the execution fixture total cells', () => {
  expectIssue({
    snapshotOverrides: { totalCells: 34734 }
  }, RESEARCH_RUNBOOK_REASON_CODES.snapshotTotalCellsMismatch);
});

test('validator rejects sibling-private WIKI as a CI authority source', () => {
  expectIssue({
    snapshotOverrides: { sourceStrategy: 'sibling-private-wiki' }
  }, RESEARCH_RUNBOOK_REASON_CODES.privateWikiCiDependency);
});

test('runbook cannot claim CD8 quantitative results or Phase 12 readiness', () => {
  const authority = makeAuthority();
  expectIssue({
    markdown: `${renderResearchRunbook(authority)}\nclaim-ready: true\nCD8 fraction: 0.20\n`
  }, RESEARCH_RUNBOOK_REASON_CODES.claimOverreach);
});

test('medical/operator authority boundary is mandatory', () => {
  const authority = makeAuthority();
  expectIssue({
    markdown: renderResearchRunbook(authority).replace(
      'Elisa and Goette supervise scientific and medical interpretation.',
      ''
    )
  }, RESEARCH_RUNBOOK_REASON_CODES.medicalBoundaryMissing);
});

test('Graphify and scratch analysis cannot become authority for this handoff', () => {
  const authority = makeAuthority();
  expectIssue({
    markdown: `${renderResearchRunbook(authority)}\nanalysis/scripts/hgsoc_cd8_subset.py\nGraphify authority\n`
  }, RESEARCH_RUNBOOK_REASON_CODES.scopeLeak);
});
