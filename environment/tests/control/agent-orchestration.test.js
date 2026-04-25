import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AgentOrchestrationError,
  dispatchRoleAssignment,
  getRoleDispatchContract,
  listSupportedAgentRoles,
  prepareRoleDispatch,
  validateReviewedSpawnRequest,
} from '../../orchestrator/agent-orchestration.js';
import {
  createObjectiveStore,
  deleteObjectiveStore,
  readObjectiveHandoffs,
} from '../../objectives/store.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OBJECTIVE_FIXTURES_DIR = path.join(repoRoot, 'environment', 'tests', 'fixtures', 'phase9', 'objective');

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

function buildRequest(overrides = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    objectiveId: `OBJ-T45-1-${stamp}`,
    stageId: 'analysis',
    roleId: 'experiment-agent',
    taskId: `task-${stamp}`,
    taskKind: 'experiment-flow-register',
    generatedBySession: `session-${stamp}`,
    handshakeSubset: { vreAvailable: true, vibeScienceAvailable: true },
    handoffCursor: null,
    activeGates: ['PROMOTION_REQUIRES_R2_REVIEW'],
    stopConditions: { onBudgetExhausted: 'pause' },
    expectedOutputShape: { kind: 'phase9.handoff.v1' },
    allowedActions: ['run-sanctioned-task', 'write-artifact', 'propose-handoff'],
    sessionIsolation: {
      workspaceRoot: repoRoot,
      inheritChatHistory: false,
    },
    ...overrides,
  };
}

async function cleanupObjectiveArtifacts(objectiveId) {
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
    return;
  }
  const target = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'dispatch',
  );
  await rm(target, { recursive: true, force: true });
}

async function readObjectiveFixture(fileName = 'valid-active.json') {
  return JSON.parse(await readFile(path.join(OBJECTIVE_FIXTURES_DIR, fileName), 'utf8'));
}

async function seedObjectiveStore(objectiveId, overrides = {}) {
  const fixture = await readObjectiveFixture('valid-active.json');
  const objectiveRecord = {
    ...fixture,
    objectiveId,
    artifactsIndex: {
      ...(fixture.artifactsIndex ?? {}),
      ...(overrides.artifactsIndex ?? {}),
    },
    ...overrides,
  };
  await createObjectiveStore(repoRoot, objectiveRecord);
  return objectiveRecord;
}

async function cleanupObjectiveStore(objectiveId) {
  await deleteObjectiveStore(repoRoot, objectiveId).catch(() => {});
}

async function expectAgentError(fn, expectedCode) {
  await assert.rejects(
    fn,
    (error) => error instanceof AgentOrchestrationError && error.code === expectedCode,
  );
}

test('agent orchestration exposes the exact frozen Phase 9 v1 role set', () => {
  assert.deepEqual(listSupportedAgentRoles(), [
    'lead-researcher',
    'literature-mode',
    'experiment-agent',
    'results-agent',
    'reviewer-2',
    'serendipity-mode',
    'continuity-agent',
  ]);
});

test('prepareRoleDispatch builds a reviewed subprocess plan for execution-lane roles', async () => {
  const request = buildRequest();
  try {
    const result = await prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    });

    assert.equal(result.dispatchMode, 'queue-task');
    assert.equal(result.transport, 'reviewed-subprocess');
    assert.equal(result.laneId, 'execution');
    assert.equal(result.binding.integrationKind, 'local-subprocess');
    assert.equal(result.executorClass, 'local-subprocess');
    assert.equal(result.envelope.objectiveId, request.objectiveId);
    assert.equal(result.envelope.sessionIsolation.inheritChatHistory, false);
    assert.equal(result.envelope.dispatchParentPid, process.pid);
    assert.match(result.envelope.sessionIsolation.childSessionId, /^child-/u);
    assert.match(result.envelopePath, /phase9-role-envelope\.json$/u);
    assert.deepEqual(result.spawnRequest.stdio, ['pipe', 'pipe', 'pipe']);
    assert.deepEqual(result.spawnRequest.argv, ['--envelope', result.envelopePath]);

    const persisted = JSON.parse(await readFile(result.envelopePath, 'utf8'));
    assert.equal(persisted.roleId, 'experiment-agent');
    assert.equal(persisted.taskId, request.taskId);
    assert.equal(persisted.sessionIsolation.workspaceRoot, repoRoot);
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch binds reviewer-2 to the review lane through reviewed provider-gateway transport', async () => {
  const request = buildRequest({
    roleId: 'reviewer-2',
    taskKind: 'session-digest-review',
    allowedActions: ['review-artifacts', 'return-r2-verdict'],
  });
  try {
    const result = await prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    });

    assert.equal(result.dispatchMode, 'review-lane');
    assert.equal(result.laneId, 'review');
    assert.equal(result.binding.providerRef, 'openai/codex');
    assert.equal(result.executorClass, 'codex-cli');
    assert.equal(result.taskKind, 'session-digest-review');
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch keeps inline-only role-modes inline and does not fabricate reviewed subprocess state', async () => {
  const request = buildRequest({
    roleId: 'literature-mode',
    taskId: `task-inline-${Date.now()}`,
    taskKind: null,
    allowedActions: undefined,
    requestedDispatchMode: 'inline-only',
    requestedTransport: 'inline-role-mode',
    contextSource: 'objective-artifacts',
  });

  const result = await prepareRoleDispatch(repoRoot, request, {
    lanePolicies: buildLanePolicies(),
    continuityProfile: { runtime: { defaultAllowApiFallback: false } },
  });

  assert.equal(result.dispatchMode, 'inline-only');
  assert.equal(result.transport, 'inline-role-mode');
  assert.equal(result.laneId, null);
  assert.equal(result.canMutateObjective, false);
  assert.equal(result.objectiveId, request.objectiveId);
  assert.deepEqual(result.allowedTaskKinds, []);
  assert.deepEqual(result.allowedActions, [
    'survey-web-inline',
    'register-literature-artifact',
    'propose-handoff',
  ]);
  assert.ok(!('envelope' in result));
  assert.ok(!('spawnRequest' in result));
});

test('prepareRoleDispatch fails when the objective id is missing', async () => {
  const request = buildRequest({ objectiveId: '' });
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_OBJECTIVE_ID_REQUIRED',
  );
});

test('prepareRoleDispatch fails envelope validation before work starts when a required field is missing', async () => {
  const request = buildRequest({ generatedBySession: null });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_INVALID_ENVELOPE',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch fails when reviewed subprocess isolation is missing', async () => {
  const request = buildRequest({ sessionIsolation: null });
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_SESSION_ISOLATION_REQUIRED',
  );
});

test('prepareRoleDispatch fails closed on env leaks before role work starts', async () => {
  const request = buildRequest({
    spawn: {
      env: {
        SESSION_TOKEN: 'secret',
      },
    },
  });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_ENV_LEAK',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch rejects env keys outside the reviewed allowlist', async () => {
  const request = buildRequest({
    spawn: {
      env: {
        FOO: 'bar',
      },
    },
  });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_ENV_ALLOWLIST_VIOLATED',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch fails closed on cwd escape before role work starts', async () => {
  const request = buildRequest({
    spawn: {
      cwd: path.resolve(repoRoot, '..'),
    },
  });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_CWD_ESCAPE',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch rejects reviewed subprocess stdio inheritance with E_FD_LEAK', async () => {
  const request = buildRequest({
    spawn: {
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_FD_LEAK',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch rejects forbidden argv tokens with E_ARGV_LEAK', async () => {
  const request = buildRequest({
    spawn: {
      argv: ['SESSION_SECRET=abc'],
    },
  });
  try {
    await expectAgentError(
      () => prepareRoleDispatch(repoRoot, request, {
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      }),
      'E_ARGV_LEAK',
    );
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('prepareRoleDispatch rejects unsupported roles', async () => {
  const request = buildRequest({ roleId: 'free-agent' });
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_UNSUPPORTED_ROLE',
  );
});

test('prepareRoleDispatch blocks non-lead roles from completing the objective', async () => {
  const request = buildRequest({
    objectiveMutation: {
      setCompletion: true,
    },
  });
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_ROLE_CANNOT_MUTATE_OBJECTIVE',
  );
});

test('prepareRoleDispatch blocks web-required inline role-modes from forbidden Task-style dispatch', async () => {
  const request = buildRequest({
    roleId: 'literature-mode',
    taskKind: null,
    taskId: `task-inline-${Date.now()}`,
    requestedTransport: 'task-tool-background',
  });
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
      'E_WEB_ROLE_REQUIRES_INLINE_OR_REVIEWED_SUBPROCESS',
  );
});

test('dispatchRoleAssignment executes reviewed subprocess dispatch through invokeLaneBinding with the patched envelope and persists the returned handoff', async () => {
  const objectiveId = `OBJ-T452-DISPATCH-${Date.now()}`;
  const artifactPath = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'results',
    'dispatch-bundle.json',
  );
  const request = buildRequest({
    objectiveId,
    roleId: 'results-agent',
    taskKind: 'results-bundle-discover',
    allowedActions: ['package-artifacts', 'write-artifact', 'propose-handoff'],
  });
  const seen = [];

  try {
    await seedObjectiveStore(objectiveId);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, '{"dispatch":true}\n', 'utf8');

    const response = await dispatchRoleAssignment(repoRoot, request, {
      execute: true,
      spawnParentPid: 424242,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      invokeLaneBinding: async (binding, providerExecutors, payload) => {
        seen.push({ binding, providerExecutors, payload });
        return {
          status: 'complete',
          laneId: binding.laneId,
          taskKind: payload.taskKind,
          handoff: {
            toAgentRole: 'lead-researcher',
            artifactPaths: [artifactPath],
            summary: 'Dispatch completed and the bundle is ready for the lead.',
          },
        };
      },
    });

    assert.equal(response.executed, true);
    assert.equal(response.transport, 'reviewed-subprocess');
    assert.equal(response.envelope.dispatchParentPid, 424242);
    assert.equal(response.spawnRequest.env.PHASE9_OBJECTIVE_ID, request.objectiveId);
    assert.equal(response.spawnRequest.env.PHASE9_TASK_ID, request.taskId);
    assert.equal(response.spawnRequest.env.PHASE9_ENVELOPE_PATH, response.envelopePath);
    assert.equal(response.spawnRequest.env.VRE_ROOT, repoRoot);
    assert.deepEqual(response.spawnRequest.argv, ['--envelope', response.envelopePath]);
    assert.equal(response.result.status, 'complete');
    assert.equal(response.handoff.recordSeq, 1);
    assert.equal(response.handoff.summary, 'Dispatch completed and the bundle is ready for the lead.');
    assert.equal(response.leadContinuation.status, 'ready');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].binding.laneId, 'execution');
    assert.equal(seen[0].payload.roleEnvelope.dispatchParentPid, 424242);
    assert.equal(seen[0].payload.roleEnvelopePath, response.envelopePath);
    assert.equal(seen[0].payload.taskKind, 'results-bundle-discover');

    const persisted = JSON.parse(await readFile(response.envelopePath, 'utf8'));
    assert.equal(persisted.dispatchParentPid, 424242);
    assert.equal(persisted.sessionIsolation.workspaceRoot, repoRoot);
    assert.deepEqual(
      await readObjectiveHandoffs(repoRoot, objectiveId),
      [response.handoff],
    );
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

test('dispatchRoleAssignment refuses chat-only reviewed dispatch when durable objective state exists', async () => {
  const request = buildRequest({
    contextSource: 'chat-only',
  });
  await expectAgentError(
    () => dispatchRoleAssignment(repoRoot, request, {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_CHAT_ONLY_DISPATCH_FORBIDDEN',
  );
});

test('dispatchRoleAssignment appends two terminal role outputs as durable handoff records before the lead may continue', async () => {
  const objectiveId = `OBJ-T452-${Date.now()}`;
  const artifactOne = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'results',
    'bundle-001.json',
  );
  const artifactTwo = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'review',
    'digest-001.md',
  );
  const requestOne = buildRequest({
    objectiveId,
    roleId: 'results-agent',
    taskKind: 'results-bundle-discover',
    allowedActions: ['package-artifacts', 'write-artifact', 'propose-handoff'],
  });
  const requestTwo = buildRequest({
    objectiveId,
    roleId: 'reviewer-2',
    taskKind: 'session-digest-review',
    allowedActions: ['review-artifacts', 'return-r2-verdict'],
  });

  try {
    await seedObjectiveStore(objectiveId);
    await mkdir(path.dirname(artifactOne), { recursive: true });
    await mkdir(path.dirname(artifactTwo), { recursive: true });
    await writeFile(artifactOne, '{"ok":true}\n', 'utf8');
    await writeFile(artifactTwo, '# reviewer digest\n', 'utf8');

    const first = await dispatchRoleAssignment(repoRoot, requestOne, {
      execute: true,
      spawnParentPid: 10101,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      invokeLaneBinding: async () => ({
        status: 'complete',
        handoff: {
          toAgentRole: 'lead-researcher',
          artifactPaths: [artifactOne],
          summary: 'Results bundle is ready for the lead.',
        },
      }),
    });

    const second = await dispatchRoleAssignment(repoRoot, requestTwo, {
      execute: true,
      spawnParentPid: 20202,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      invokeLaneBinding: async () => ({
        status: 'complete',
        handoff: {
          toAgentRole: 'lead-researcher',
          artifactPaths: [artifactTwo],
          summary: 'Reviewer-2 digest is ready for the lead.',
        },
      }),
    });

    assert.equal(first.handoff.recordSeq, 1);
    assert.equal(first.handoff.fromAgentRole, 'results-agent');
    assert.equal(first.handoff.toAgentRole, 'lead-researcher');
    assert.equal(first.leadContinuation.status, 'ready');
    assert.equal(first.handoff.writerSession, first.envelope.sessionIsolation.childSessionId);
    assert.match(first.handoffLedgerPath, /handoffs\.jsonl$/u);

    assert.equal(second.handoff.recordSeq, 2);
    assert.equal(second.handoff.fromAgentRole, 'reviewer-2');
    assert.equal(second.handoff.toAgentRole, 'lead-researcher');
    assert.equal(second.leadContinuation.status, 'ready');

    const handoffs = await readObjectiveHandoffs(repoRoot, objectiveId);
    assert.equal(handoffs.length, 2);
    assert.deepEqual(
      handoffs.map((entry) => [entry.recordSeq, entry.fromAgentRole, entry.summary]),
      [
        [1, 'results-agent', 'Results bundle is ready for the lead.'],
        [2, 'reviewer-2', 'Reviewer-2 digest is ready for the lead.'],
      ],
    );
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

test('dispatchRoleAssignment fails closed when a terminal role result omits a handoff payload', async () => {
  const objectiveId = `OBJ-T452-MISSING-${Date.now()}`;
  const request = buildRequest({
    objectiveId,
    roleId: 'results-agent',
    taskKind: 'results-bundle-discover',
    allowedActions: ['package-artifacts', 'write-artifact', 'propose-handoff'],
  });

  try {
    await seedObjectiveStore(objectiveId);
    await expectAgentError(
      () => dispatchRoleAssignment(repoRoot, request, {
        execute: true,
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
        invokeLaneBinding: async () => ({
          status: 'complete',
          outputPaths: [],
        }),
      }),
      'E_ROLE_RESULT_HANDOFF_REQUIRED',
    );
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

test('dispatchRoleAssignment fails closed when a reviewed subprocess returns a nonterminal result without a handoff', async () => {
  const objectiveId = `OBJ-T452-QUEUED-${Date.now()}`;
  const request = buildRequest({
    objectiveId,
    roleId: 'results-agent',
    taskKind: 'results-bundle-discover',
    allowedActions: ['package-artifacts', 'write-artifact', 'propose-handoff'],
  });

  try {
    await seedObjectiveStore(objectiveId);
    await expectAgentError(
      () => dispatchRoleAssignment(repoRoot, request, {
        execute: true,
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
        invokeLaneBinding: async () => ({
          status: 'queued',
          queueRecordId: 'QUEUE-001',
        }),
      }),
      'E_ROLE_RESULT_HANDOFF_REQUIRED',
    );
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

test('dispatchRoleAssignment persists conflict-marked handoffs and blocks lead continuation', async () => {
  const objectiveId = `OBJ-T452-CONFLICT-${Date.now()}`;
  const artifactPath = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'review',
    'conflict-001.md',
  );
  const request = buildRequest({
    objectiveId,
    roleId: 'reviewer-2',
    taskKind: 'session-digest-review',
    allowedActions: ['review-artifacts', 'return-r2-verdict'],
  });

  try {
    await seedObjectiveStore(objectiveId);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, 'conflicting review\n', 'utf8');

    const response = await dispatchRoleAssignment(repoRoot, request, {
      execute: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      invokeLaneBinding: async () => ({
        status: 'complete',
        handoff: {
          toAgentRole: 'lead-researcher',
          artifactPaths: [artifactPath],
          summary: 'Reviewer-2 found a conflict that must block lead continuation.',
          openBlockers: [{
            code: 'E_STATE_CONFLICT',
            message: 'Conflicting role suggestions require review before continuation.',
            openedAt: '2026-04-25T08:00:00Z',
          }],
        },
      }),
    });

    assert.equal(response.handoff.recordSeq, 1);
    assert.equal(response.leadContinuation.status, 'blocked');
    assert.equal(response.leadContinuation.blockerCode, 'E_STATE_CONFLICT');
    assert.equal(response.handoff.openBlockers[0].code, 'E_STATE_CONFLICT');

    const handoffs = await readObjectiveHandoffs(repoRoot, objectiveId);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].openBlockers[0].code, 'E_STATE_CONFLICT');
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

test('dispatchRoleAssignment persists reviewer-2 escalation handoffs and marks lead continuation as review-required', async () => {
  const objectiveId = `OBJ-T452-R2-${Date.now()}`;
  const artifactPath = path.join(
    repoRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'review',
    'r2-request-001.md',
  );
  const request = buildRequest({
    objectiveId,
    roleId: 'reviewer-2',
    taskKind: 'session-digest-review',
    allowedActions: ['review-artifacts', 'return-r2-verdict'],
  });

  try {
    await seedObjectiveStore(objectiveId);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, 'r2 escalation\n', 'utf8');

    const response = await dispatchRoleAssignment(repoRoot, request, {
      execute: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      invokeLaneBinding: async () => ({
        status: 'complete',
        handoff: {
          toAgentRole: 'lead-researcher',
          artifactPaths: [artifactPath],
          summary: 'Reviewer-2 escalation requires review before continuation.',
          openBlockers: [{
            code: 'E_R2_REVIEW_PENDING',
            message: 'Reviewer-2 or the lead must resolve the escalation before continuation.',
            openedAt: '2026-04-25T08:30:00Z',
          }],
        },
      }),
    });

    assert.equal(response.handoff.recordSeq, 1);
    assert.equal(response.leadContinuation.status, 'review-required');
    assert.equal(response.leadContinuation.blockerCode, 'E_R2_REVIEW_PENDING');
    assert.equal(response.leadContinuation.requestedReviewer, 'reviewer-2-or-lead');

    const handoffs = await readObjectiveHandoffs(repoRoot, objectiveId);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].openBlockers[0].code, 'E_R2_REVIEW_PENDING');
  } finally {
    await cleanupObjectiveStore(objectiveId);
  }
});

// Round 81 seq-097 claim-without-pin closure: seq 097 landed the T4.5.1
// dispatcher with 17 direct tests but adversarial enumeration of every
// `fail(...)` call and every exported symbol found ~14 error-code branches
// and 2 exported functions (`getRoleDispatchContract`, `validateReviewedSpawnRequest`)
// with no dedicated test. Under a silent refactor any of those branches
// could flip into its neighbor without a test noticing. The regressions
// below close that gap.

test('Round 81: prepareRoleDispatch fails closed when a required Wave 4.5 VRE surface is missing', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest(), {
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      surfaceExists: async (absolutePath) => {
        if (absolutePath.endsWith('provider-gateway.js')) {
          return false;
        }
        return true;
      },
    }),
    'E_VRE_SURFACE_MISSING',
  );
});

test('Round 81: prepareRoleDispatch rejects an inline-only role that requests a non-inline dispatch mode', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'literature-mode',
      contextSource: 'objective-state',
      taskKind: undefined,
      taskId: undefined,
      requestedDispatchMode: 'queue-task',
    }), {
      skipSurfaceCheck: true,
    }),
    'E_ROLE_INLINE_ONLY',
  );
});

test('Round 81: prepareRoleDispatch rejects an inline-only role that requests provider-gateway transport', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'literature-mode',
      contextSource: 'objective-state',
      taskKind: undefined,
      taskId: undefined,
      requestedTransport: 'provider-gateway',
    }), {
      skipSurfaceCheck: true,
    }),
    'E_ROLE_INLINE_ONLY',
  );
});

test('Round 81: prepareRoleDispatch rejects a queue-task-or-inline-only role that requests an unsupported dispatch mode', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'continuity-agent',
      taskKind: 'memory-sync-refresh',
      requestedDispatchMode: 'review-lane',
    }), {
      skipSurfaceCheck: true,
    }),
    'E_ROLE_DISPATCH_MODE_UNSUPPORTED',
  );
});

test('Round 81: prepareRoleDispatch rejects a queue-task role that requests a mismatching dispatch mode', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'experiment-agent',
      requestedDispatchMode: 'inline-only',
    }), {
      skipSurfaceCheck: true,
    }),
    'E_ROLE_DISPATCH_MODE_UNSUPPORTED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when a queue-task role dispatch omits taskKind', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      taskKind: undefined,
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_TASK_KIND_REQUIRED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when the task kind is not registered in the task registry', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      taskKind: 'definitely-not-a-registered-task',
    }), {
      skipSurfaceCheck: true,
      getTaskEntry: async () => null,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_TASK_KIND_UNSUPPORTED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when the task kind is not allowed for the requested role', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'experiment-agent',
      taskKind: 'writing-export-finalize',
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_TASK_KIND_NOT_ALLOWED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when the registered task lane does not match the role contract', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'experiment-agent',
      taskKind: 'experiment-flow-register',
    }), {
      skipSurfaceCheck: true,
      getTaskEntry: async () => ({
        taskKind: 'experiment-flow-register',
        lane: 'review',
        requiredCapability: 'programmatic',
      }),
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_TASK_KIND_LANE_MISMATCH',
  );
});

test('Round 81: prepareRoleDispatch fails closed when the resolved executor class is outside the role allowlist', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      roleId: 'experiment-agent',
      taskKind: 'experiment-flow-register',
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
      // Inject a binding whose integrationKind resolves to an executor class
      // outside the experiment-agent allowlist so we hit the dedicated guard
      // in agent-orchestration.js rather than the provider-gateway validator
      // that fires first on unknown integration kinds.
      selectLaneBinding: () => ({
        integrationKind: 'mystery-executor',
        providerRef: null,
        laneId: 'execution',
      }),
    }),
    'E_EXECUTOR_CLASS_NOT_ALLOWED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when a queue-task dispatch omits taskId', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      taskId: undefined,
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_TASK_ID_REQUIRED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when sessionIsolation.inheritChatHistory is not explicitly false', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      sessionIsolation: {
        workspaceRoot: repoRoot,
        inheritChatHistory: true,
      },
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_SESSION_ISOLATION_REQUIRED',
  );
});

test('Round 81: prepareRoleDispatch fails closed when an explicit scratchRoot escapes the workspace root', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      sessionIsolation: {
        workspaceRoot: repoRoot,
        inheritChatHistory: false,
        scratchRoot: path.resolve(repoRoot, '..', 'escape-scratch'),
      },
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_WORKSPACE_WRITE_ESCAPE',
  );
});

test('Round 81: continuity-agent with a taskKind routes to the execution lane as a reviewed subprocess plan', async () => {
  const request = buildRequest({
    roleId: 'continuity-agent',
    taskKind: 'memory-sync-refresh',
    allowedActions: ['refresh-memory', 'verify-resume-state', 'propose-handoff'],
  });
  try {
    const result = await prepareRoleDispatch(repoRoot, request, {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    });
    assert.equal(result.dispatchMode, 'queue-task');
    assert.equal(result.laneId, 'execution');
    assert.equal(result.transport, 'reviewed-subprocess');
    assert.equal(result.taskKind, 'memory-sync-refresh');
  } finally {
    await cleanupObjectiveArtifacts(request.objectiveId);
  }
});

test('Round 81: continuity-agent without a taskKind stays inline-only under queue-task-or-inline-only semantics', async () => {
  const request = buildRequest({
    roleId: 'continuity-agent',
    taskKind: undefined,
    taskId: undefined,
    contextSource: 'objective-state',
    allowedActions: ['refresh-memory', 'verify-resume-state', 'propose-handoff'],
  });
  const result = await prepareRoleDispatch(repoRoot, request, {
    skipSurfaceCheck: true,
  });
  assert.equal(result.dispatchMode, 'inline-only');
  assert.equal(result.transport, 'inline-role-mode');
  assert.equal(result.laneId, null);
});

test('Round 81: dispatchRoleAssignment returns an un-executed inline plan even when execute=true is requested for an inline role', async () => {
  const request = buildRequest({
    roleId: 'literature-mode',
    contextSource: 'objective-state',
    taskKind: undefined,
    taskId: undefined,
  });
  const result = await dispatchRoleAssignment(repoRoot, request, {
    skipSurfaceCheck: true,
    execute: true,
  });
  assert.equal(result.executed, false);
  assert.equal(result.result, null);
  assert.equal(result.transport, 'inline-role-mode');
});

test('Round 81: getRoleDispatchContract returns the frozen Phase 9 v1 matrix for known roles and null for unsupported roles', () => {
  const leadContract = getRoleDispatchContract('lead-researcher');
  assert.ok(leadContract, 'lead-researcher must have a frozen role contract');
  assert.equal(leadContract.dispatchMode, 'inline-only');
  assert.equal(leadContract.canMutateObjective, true);
  assert.deepEqual(leadContract.allowedTaskKinds, []);

  const reviewerContract = getRoleDispatchContract('reviewer-2');
  assert.equal(reviewerContract.dispatchMode, 'review-lane');
  assert.equal(reviewerContract.laneId, 'review');
  assert.deepEqual(reviewerContract.allowedTaskKinds, ['session-digest-review']);

  assert.equal(getRoleDispatchContract('not-a-real-role'), null);
});

test('Round 81: validateReviewedSpawnRequest rejects reviewed-session env prefixes and foreign allowlist entries directly', () => {
  const envelope = {
    sessionIsolation: { workspaceRoot: repoRoot },
  };
  const envelopePath = path.resolve(repoRoot, '.vibe-science-environment/tmp/envelope.json');

  assert.throws(
    () => validateReviewedSpawnRequest({
      command: 'reviewed-role-runner',
      argv: ['--envelope', envelopePath],
      cwd: repoRoot,
      env: { CLAUDE_API_KEY: 'leaked' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }, envelope, envelopePath),
    (error) => error instanceof AgentOrchestrationError && error.code === 'E_ENV_LEAK',
  );

  assert.throws(
    () => validateReviewedSpawnRequest({
      command: 'reviewed-role-runner',
      argv: ['--envelope', envelopePath],
      cwd: repoRoot,
      env: { FOREIGN_KEY: 'anything' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }, envelope, envelopePath),
    (error) => error instanceof AgentOrchestrationError && error.code === 'E_ENV_ALLOWLIST_VIOLATED',
  );
});

// Round 82 seq-098 residual claim-without-pin closure: Round 81 pinned 18
// fail-closed paths in `agent-orchestration.js`, but a second adversarial
// enumeration of the exact line numbers where each error-code is raised
// showed 2 more requireString-guarded call sites without dedicated tests —
// line 324 (empty/missing `sessionIsolation.workspaceRoot` via
// `requireString` -> `E_SESSION_ISOLATION_REQUIRED`, RED-first verified)
// and line 344 (non-string `sessionIsolation.scratchRoot` when the field is
// explicitly provided via `requireString` -> `E_SESSION_ISOLATION_REQUIRED`).
// The existing `E_SESSION_ISOLATION_REQUIRED` tests fire the line-308
// isolation-null and line-316 inheritChatHistory variants, so these two
// call sites were silently unpinned. A third candidate — the line-518
// `requireString` for an empty/missing roleId — was investigated and
// consciously NOT added here, because an empty-string roleId lands on the
// line-521 matrix-miss guard with the same `E_UNSUPPORTED_ROLE` code, so
// the line-518 requireString is defensively redundant rather than a
// distinct branch with observable behavior.

test('Round 82: prepareRoleDispatch fails closed with E_SESSION_ISOLATION_REQUIRED when sessionIsolation.workspaceRoot is missing', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      sessionIsolation: {
        inheritChatHistory: false,
        // workspaceRoot intentionally omitted — must fail closed at the
        // requireString guard before any cwd resolution attempt.
      },
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_SESSION_ISOLATION_REQUIRED',
  );
});

test('Round 82: prepareRoleDispatch fails closed with E_SESSION_ISOLATION_REQUIRED when sessionIsolation.scratchRoot is explicitly non-string', async () => {
  await expectAgentError(
    () => prepareRoleDispatch(repoRoot, buildRequest({
      sessionIsolation: {
        workspaceRoot: repoRoot,
        inheritChatHistory: false,
        // scratchRoot explicitly set to a non-string must fail closed at the
        // requireString guard rather than fall through to resolvePathInsideProject.
        scratchRoot: 42,
      },
    }), {
      skipSurfaceCheck: true,
      lanePolicies: buildLanePolicies(),
      continuityProfile: { runtime: { defaultAllowApiFallback: false } },
    }),
    'E_SESSION_ISOLATION_REQUIRED',
  );
});
