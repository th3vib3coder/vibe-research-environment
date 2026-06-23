import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateL0GuardrailBatch,
  evaluateL0GuardrailIntent
} from '../../../autonomous/l0/guardrail-controller.js';
import {
  runL0BoundedReasoningLoop
} from '../../../autonomous/l0/reasoning-loop.js';

function budget(overrides = {}) {
  return {
    maxWallSecondsLeft: 300,
    maxIterationsLeft: 3,
    costCeilingLeft: null,
    ...overrides
  };
}

function baseLoopInput(action, overrides = {}) {
  return {
    projectRoot: '/tmp/vre-l0-guardrail',
    objectiveRecord: { objectiveId: 'OBJ-TL0-5' },
    activePointer: null,
    queueState: {},
    runtimeMode: 'attended-batch',
    tier: 'worker',
    maxIterations: 1,
    budgetRemaining: budget(),
    haltChecked: true,
    actions: [action],
    ...overrides
  };
}

function makeWriteAhead(events) {
  return async (options) => {
    events.push(`write-ahead:${options.iteration}`);
    return {
      snapshot: { iteration: options.iteration },
      snapshotPath: `/tmp/resume-${options.iteration}.json`,
      actionResult: await options.action()
    };
  };
}

test('destructive terminal command intent fails closed before execution', () => {
  const decision = evaluateL0GuardrailIntent({
    toolName: 'terminal',
    args: { command: 'rm -rf ./research-output' }
  });

  assert.equal(decision.action, 'block');
  assert.equal(decision.code, 'E_L0_GUARDRAIL_DESTRUCTIVE_TOOL_INTENT');
  assert.equal(decision.allowsExecution, false);
  assert.equal(decision.runtimeOpened, false);
  assert.equal(decision.autonomousRuntimeAllowed, false);
});

test('overwrite redirect command intent fails closed before execution', () => {
  const decision = evaluateL0GuardrailIntent({
    toolName: 'terminal',
    args: { command: 'python analyze.py > results.json' }
  });

  assert.equal(decision.action, 'block');
  assert.equal(decision.code, 'E_L0_GUARDRAIL_DESTRUCTIVE_TOOL_INTENT');
  assert.equal(decision.allowsExecution, false);
});

test('read-only terminal command returns explicit allow', () => {
  const decision = evaluateL0GuardrailIntent({
    toolName: 'terminal',
    args: { command: 'pwd && ls -la' }
  });

  assert.equal(decision.action, 'allow');
  assert.equal(decision.code, 'allow');
  assert.equal(decision.allowsExecution, true);
  assert.equal(decision.runtimeOpened, false);
});

test('untrusted named and prefixed tools fail closed by default', () => {
  for (const toolName of ['web_search', 'browser_snapshot', 'mcp_filesystem_read_file']) {
    const decision = evaluateL0GuardrailIntent({ toolName, args: { query: 'CXCL13' } });

    assert.equal(decision.action, 'block');
    assert.equal(decision.code, 'E_L0_GUARDRAIL_UNTRUSTED_TOOL_INTENT');
    assert.equal(decision.allowsExecution, false);
  }
});

test('untrusted tool may pass only with reviewed data-treatment metadata', () => {
  const decision = evaluateL0GuardrailIntent({
    toolName: 'web_search',
    args: { query: 'ovarian cancer endometriosis' },
    reviewedDataTreatment: true
  });

  assert.equal(decision.action, 'allow');
  assert.equal(decision.code, 'allow-reviewed-untrusted-data');
  assert.equal(decision.allowsExecution, true);
});

test('never-parallel pairing fails closed while safe batch is allowed', () => {
  const blocked = evaluateL0GuardrailBatch([
    { toolName: 'read_file', args: { path: 'a.md' } },
    { toolName: 'clarify', args: { question: 'continue?' } }
  ]);

  assert.equal(blocked.action, 'block');
  assert.equal(blocked.code, 'E_L0_GUARDRAIL_NEVER_PARALLEL_TOOL_BATCH');
  assert.equal(blocked.allowsExecution, false);

  const allowed = evaluateL0GuardrailBatch([
    { toolName: 'read_file', args: { path: 'a.md' } },
    { toolName: 'search_files', args: { query: 'CXCL13' } }
  ]);

  assert.equal(allowed.action, 'allow');
  assert.equal(allowed.code, 'allow');
  assert.equal(allowed.allowsExecution, true);
});

test('reasoning loop blocks worker-tier guarded intent before callback mutation', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseLoopInput({
    id: 'delete-output',
    kind: 'worker-analysis',
    requiredTier: 'worker',
    toolIntent: {
      toolName: 'terminal',
      args: { command: 'rm -rf ./output' }
    },
    run: async () => {
      events.push('action-ran');
      return { ok: true };
    }
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.stopReason, 'guardrail-controller');
  assert.equal(result.runtimeOpened, false);
  assert.equal(result.autonomousRuntimeAllowed, false);
  assert.equal(result.guardrailDecision.code, 'E_L0_GUARDRAIL_DESTRUCTIVE_TOOL_INTENT');
  assert.deepEqual(events, []);
});

test('reasoning loop still allows safe worker-tier intent through write-ahead', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseLoopInput({
    id: 'read-context',
    kind: 'worker-analysis',
    requiredTier: 'worker',
    toolIntent: {
      toolName: 'terminal',
      args: { command: 'pwd && ls -la' }
    },
    run: async () => {
      events.push('action-ran');
      return { ok: true };
    }
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.stopReason, 'max-iterations');
  assert.equal(result.runtimeOpened, true);
  assert.deepEqual(events, ['write-ahead:0', 'action-ran']);
});

test('TL0.2 hard blockers and TL0.4 high-stakes gate remain authoritative', async () => {
  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseLoopInput({
      id: 'graphify',
      kind: 'graphify',
      requiredTier: 'worker',
      toolIntent: {
        toolName: 'terminal',
        args: { command: 'pwd' }
      },
      run: async () => null
    })),
    (error) => error.code === 'E_L0_LOOP_GRAPHIFY_FORBIDDEN'
  );

  const result = await runL0BoundedReasoningLoop(baseLoopInput({
    id: 'new-direction',
    kind: 'new-direction',
    requiredTier: 'worker',
    highStakes: true,
    run: async () => {
      throw new Error('must not run');
    }
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead([])
  });

  assert.equal(result.stopReason, 'high-stakes-operator-gate');
  assert.equal(result.runtimeOpened, false);
  assert.equal(result.highStakesGate?.gateRecord?.requestedGate, 'TL0.4');
});
