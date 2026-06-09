import { rm } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  AgentOrchestrationError,
  getRoleDispatchContract,
  listSupportedAgentRoles,
  prepareRoleDispatch,
} from '../../orchestrator/agent-orchestration.js';

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
  return {
    objectiveId: 'OBJ-P10-CURATOR-VALIDATOR',
    stageId: 'phase10-wiki',
    roleId: 'curator-agent',
    taskId: 'curator-validator-task',
    taskKind: 'phase10-wiki-lint',
    domainId: 'KDOM-P10-CURATOR',
    generatedBySession: 'phase10-curator-role-validator',
    handshakeSubset: { phase10: true },
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

async function cleanup(objectiveId) {
  await rm(path.join(repoRoot, '.vibe-science-environment', 'objectives', objectiveId, 'dispatch'), {
    recursive: true,
    force: true,
  });
}

async function expectCode(fn, code) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof AgentOrchestrationError, `expected AgentOrchestrationError for ${code}`);
    assert(error.code === code, `expected ${code}, got ${error.code}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

async function plan(overrides = {}) {
  const request = buildCuratorRequest(overrides);
  try {
    return await prepareRoleDispatch(repoRoot, request, {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    });
  } finally {
    await cleanup(request.objectiveId);
  }
}

export default async function validatePhase10CuratorRole() {
  const roles = listSupportedAgentRoles();
  assert(roles.at(-1) === 'curator-agent', 'curator-agent must be the eighth runtime role');
  assert(roles.length === 8, `expected 8 roles, got ${roles.length}`);

  const contract = getRoleDispatchContract('curator-agent');
  assert(contract?.canMutateClaimLedger === false, 'curator-agent cannot mutate claim ledger');
  assert(contract.writeScope === 'wiki-page', 'curator-agent writeScope must be wiki-page');
  assert(contract.budgetCategory === 'curation', 'curator-agent budgetCategory must be curation');
  assert(contract.canCaptureSerendipitySeeds === false, 'curator-agent cannot capture serendipity seeds');

  const validPlan = await plan();
  assert(validPlan.envelope.schemaVersion === 'phase9.role-envelope.v1', 'transport envelope must remain Phase 9');
  assert(validPlan.phase10RoleEnvelope.schemaVersion === 'phase10.role-envelope.v1', 'governance envelope must be Phase 10');
  assert(validPlan.phase10RoleEnvelope.canMutateClaimLedger === false, 'governance envelope cannot mutate claim ledger');

  await expectCode(
    () => plan({ phase10RoleEnvelope: { canMutateClaimLedger: true } }),
    'E_CURATOR_CLAIM_LEDGER_FORBIDDEN',
  );
  await expectCode(
    () => plan({ allowedActions: ['surface-seed', 'propose-handoff'] }),
    'E_CURATOR_SERENDIPITY_FORBIDDEN',
  );
  await expectCode(
    () => plan({ transportEnvelopeSchemaVersion: 'phase10.role-envelope.v1' }),
    'E_CURATOR_TRANSPORT_ENVELOPE_FORBIDDEN',
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-curator-role', validatePhase10CuratorRole);
}
