import assert from 'node:assert/strict';
import test from 'node:test';

import * as agentOrchestration from '../../orchestrator/agent-orchestration.js';

function normalizeReviewer2Verdict(plan, persistedHandoff, result) {
  const normalizer = agentOrchestration.INTERNALS?.normalizeReviewer2Verdict;
  assert.equal(typeof normalizer, 'function');
  return normalizer(plan, persistedHandoff, result);
}

function buildPlan(overrides = {}) {
  return {
    roleId: 'reviewer-2',
    taskId: 'task-r2-normalizer',
    ...overrides
  };
}

function buildPersistedHandoff(overrides = {}) {
  return {
    handoffId: 'H-R2-NORMALIZER',
    summary: 'Persisted reviewer handoff summary.',
    artifactPaths: ['.vibe-science-environment/objectives/OBJ-R2/review/r2.md'],
    ...overrides
  };
}

test('normalizeReviewer2Verdict extracts contradictedClaimId and confidence from raw verdict', () => {
  const normalized = normalizeReviewer2Verdict(
    buildPlan(),
    buildPersistedHandoff(),
    {
      r2Verdict: {
        verdict: 'reject',
        claimId: ' C-NEW ',
        contradictedClaimId: ' C-OLD ',
        summary: ' Contradiction found in the promoted claim. ',
        confidence: 0.87
      }
    }
  );

  assert.equal(normalized.verdict, 'REJECT');
  assert.equal(normalized.claimId, 'C-NEW');
  assert.equal(normalized.contradictedClaimId, 'C-OLD');
  assert.equal(normalized.confidence, 0.87);
});

test('normalizeReviewer2Verdict normalizes missing contradictedClaimId and confidence to null', () => {
  const normalized = normalizeReviewer2Verdict(
    buildPlan(),
    buildPersistedHandoff(),
    {
      r2Verdict: {
        verdict: 'ACCEPT',
        summary: 'Evidence is sufficient.'
      }
    }
  );

  assert.equal(normalized.claimId, null);
  assert.equal(normalized.contradictedClaimId, null);
  assert.equal(normalized.confidence, null);
});
