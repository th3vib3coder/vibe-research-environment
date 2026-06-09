import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AgentOrchestrationError,
  getRoleDispatchContract,
  listSupportedAgentRoles,
  prepareRoleDispatch,
} from '../../orchestrator/agent-orchestration.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function buildLanePolicies() {
  return {
    lanes: {
      execution: {
        enabled: true,
        providerRef: null,
        integrationKind: 'local-subprocess',
        authMode: 'none',
        billingMode: 'local',
        supervisionCapability: 'programmatic',
        apiFallbackAllowed: false,
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'provider-cli',
        authMode: 'token',
        billingMode: 'metered',
        supervisionCapability: 'output-only',
        apiFallbackAllowed: false,
      },
    },
  };
}

function buildCuratorRequest(overrides = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    objectiveId: `OBJ-P10-CURATOR-${stamp}`,
    stageId: 'phase10-wiki',
    roleId: 'curator-agent',
    taskId: `curator-task-${stamp}`,
    taskKind: 'phase10-wiki-lint',
    domainId: 'KDOM-P10-CURATOR',
    generatedBySession: `session-${stamp}`,
    handshakeSubset: { vreAvailable: true, phase10: true },
    handoffCursor: null,
    activeGates: ['PHASE10_LAW13_REQUIRED'],
    stopConditions: { onBudgetExhausted: 'pause' },
    expectedOutputShape: { kind: 'phase10.curator-result.v1' },
    allowedActions: ['run-wiki-lint', 'write-wiki-page', 'propose-handoff'],
    contextSource: 'bounded-wiki-index',
    sessionIsolation: {
      workspaceRoot: repoRoot,
      inheritChatHistory: false,
    },
    ...overrides,
  };
}

async function cleanupObjectiveArtifacts(objectiveId) {
  await rm(path.join(repoRoot, '.vibe-science-environment', 'objectives', objectiveId, 'dispatch'), {
    recursive: true,
    force: true,
  });
}

async function expectAgentError(fn, expectedCode) {
  await assert.rejects(
    fn,
    (error) => error instanceof AgentOrchestrationError && error.code === expectedCode,
  );
}

async function prepareCurator(overrides = {}) {
  const request = buildCuratorRequest(overrides);
  try {
    const result = await prepareRoleDispatch(repoRoot, request, {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    });
    return { request, result };
  } catch (error) {
    await cleanupObjectiveArtifacts(request.objectiveId);
    throw error;
  }
}

test('T10.0.5 exposes curator-agent as the eighth runtime role', () => {
  assert.deepEqual(listSupportedAgentRoles(), [
    'lead-researcher',
    'literature-mode',
    'experiment-agent',
    'results-agent',
    'reviewer-2',
    'serendipity-mode',
    'continuity-agent',
    'curator-agent',
  ]);
});

test('T10.0.5 curator contract is bounded and separate from claim/serendipity authority', () => {
  const contract = getRoleDispatchContract('curator-agent');
  assert.equal(contract.roleId, 'curator-agent');
  assert.equal(contract.dispatchMode, 'queue-task');
  assert.equal(contract.canMutateObjective, false);
  assert.equal(contract.canMutateClaimLedger, false);
  assert.equal(contract.writeScope, 'wiki-page');
  assert.equal(contract.budgetCategory, 'curation');
  assert.deepEqual(contract.allowedTaskKinds, ['phase10-wiki-lint', 'phase10-wiki-compile']);
  assert.equal(contract.canReadFullInbox, false);
  assert.equal(contract.canReadSkillCachePayloads, false);
  assert.equal(contract.canPromoteSupposition, false);
  assert.equal(contract.canCaptureSerendipitySeeds, false);
});

test('T10.0.5 valid curator wiki-lint dispatch keeps Phase 9 transport plus Phase 10 governance envelope', async () => {
  const { request, result } = await prepareCurator();
  try {
    assert.equal(result.roleId, 'curator-agent');
    assert.equal(result.taskKind, 'phase10-wiki-lint');
    assert.equal(result.envelope.schemaVersion, 'phase9.role-envelope.v1');
    assert.equal(result.phase10RoleEnvelope.schemaVersion, 'phase10.role-envelope.v1');
    assert.equal(result.phase10RoleEnvelope.roleId, 'curator-agent');
    assert.equal(result.phase10RoleEnvelope.domainId, 'KDOM-P10-CURATOR');
    assert.equal(result.phase10RoleEnvelope.canMutateClaimLedger, false);
    assert.equal(result.phase10RoleEnvelope.writeScope, 'wiki-page');
    assert.equal(result.phase10RoleEnvelope.budgetCategory, 'curation');
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('T10.0.5 valid curator wiki-compile dispatch is bounded', async () => {
  const { request, result } = await prepareCurator({
    taskKind: 'phase10-wiki-compile',
    allowedActions: ['run-wiki-compile', 'write-wiki-page', 'propose-handoff'],
    phase10RoleEnvelope: {
      expectedOutputShape: { kind: 'phase10.curator-compile-result.v1' },
    },
  });
  try {
    assert.equal(result.taskKind, 'phase10-wiki-compile');
    assert.equal(result.phase10RoleEnvelope.canMutateClaimLedger, false);
    assert.deepEqual(result.phase10RoleEnvelope.expectedOutputShape, {
      kind: 'phase10.curator-compile-result.v1',
    });
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('T10.0.5 curator dispatch fails closed without a Phase 10 domain id', async () => {
  await expectAgentError(
    () => prepareCurator({ domainId: undefined }),
    'E_CURATOR_ROLE_ENVELOPE_INVALID',
  );
});

test('T10.0.5 curator dispatch rejects claim-ledger mutation authority', async () => {
  await expectAgentError(
    () => prepareCurator({ phase10RoleEnvelope: { canMutateClaimLedger: true } }),
    'E_CURATOR_CLAIM_LEDGER_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects claim-ledger write scope', async () => {
  await expectAgentError(
    () => prepareCurator({ phase10RoleEnvelope: { writeScope: 'claim-ledger' } }),
    'E_CURATOR_CLAIM_LEDGER_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects claim-edge writer actions', async () => {
  await expectAgentError(
    () => prepareCurator({ allowedActions: ['create-claim-edge', 'propose-handoff'] }),
    'E_CURATOR_CLAIM_EDGE_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects full inbox reads', async () => {
  await expectAgentError(
    () => prepareCurator({ contextSource: 'full-_inbox' }),
    'E_CURATOR_CONTEXT_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects raw skill-cache payload reads', async () => {
  await expectAgentError(
    () => prepareCurator({ contextSource: 'skill-cache-payload' }),
    'E_CURATOR_CONTEXT_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects supposition promotion', async () => {
  await expectAgentError(
    () => prepareCurator({ allowedActions: ['promote-supposition', 'propose-handoff'] }),
    'E_CURATOR_SUPPOSITION_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects serendipity seed capture', async () => {
  await expectAgentError(
    () => prepareCurator({ allowedActions: ['surface-seed', 'propose-handoff'] }),
    'E_CURATOR_SERENDIPITY_FORBIDDEN',
  );
});

test('T10.0.5 curator dispatch rejects non-curator task kinds', async () => {
  await expectAgentError(
    () => prepareCurator({ taskKind: 'session-digest-review' }),
    'E_TASK_KIND_NOT_ALLOWED',
  );
});

test('T10.0.5 curator dispatch rejects budget categories outside curation', async () => {
  await expectAgentError(
    () => prepareCurator({ phase10RoleEnvelope: { budgetCategory: 'export' } }),
    'E_CURATOR_ROLE_ENVELOPE_INVALID',
  );
});

test('T10.0.5 curator dispatch rejects silent transport envelope shape swaps', async () => {
  await expectAgentError(
    () => prepareCurator({ transportEnvelopeSchemaVersion: 'phase10.role-envelope.v1' }),
    'E_CURATOR_TRANSPORT_ENVELOPE_FORBIDDEN',
  );
});
