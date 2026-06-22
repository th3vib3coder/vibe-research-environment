import assert from 'node:assert/strict';
import test from 'node:test';

import {
  L0ReasoningLoopError,
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

function baseInput(overrides = {}) {
  return {
    projectRoot: '/tmp/vre-l0-loop',
    objectiveRecord: { objectiveId: 'OBJ-L0-LOOP' },
    activePointer: null,
    queueState: {},
    runtimeMode: 'attended-batch',
    tier: 'worker',
    maxIterations: 2,
    budgetRemaining: budget(),
    haltChecked: true,
    actions: [
      {
        id: 'analyze-literature',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => ({ ok: true, value: 'done' })
      }
    ],
    ...overrides
  };
}

function errorCode(code) {
  return (error) => error instanceof L0ReasoningLoopError && error.code === code;
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

test('runs one attended-batch iteration through the injected action', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseInput({
    actions: [
      {
        id: 'worker-ok',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action:worker-ok');
          return { ok: true };
        }
      }
    ]
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.runtimeMode, 'attended-batch');
  assert.equal(result.iterationsRun, 1);
  assert.equal(result.stopReason, 'action-queue-empty');
  assert.equal(result.runtimeOpened, true);
  assert.deepEqual(events, ['write-ahead:0', 'action:worker-ok']);
});

test('rejects unsupported runtime modes before action execution', async () => {
  for (const runtimeMode of ['interactive', 'resume-only']) {
    await assert.rejects(
      () => runL0BoundedReasoningLoop(baseInput({ runtimeMode })),
      errorCode('E_L0_LOOP_RUNTIME_MODE_FORBIDDEN')
    );
  }

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({ runtimeMode: 'unattended-batch' })),
    errorCode('E_L0_LOOP_UNATTENDED_FORBIDDEN')
  );

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({ runtimeMode: undefined })),
    errorCode('E_L0_LOOP_RUNTIME_MODE_FORBIDDEN')
  );
});

test('max-iterations zero stops before action execution', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseInput({
    maxIterations: 0,
    actions: [
      {
        id: 'must-not-run',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action');
        }
      }
    ]
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.iterationsRun, 0);
  assert.equal(result.stopReason, 'max-iterations');
  assert.deepEqual(events, []);
});

test('max-iterations one stops after exactly one iteration', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseInput({
    maxIterations: 1,
    actions: [
      {
        id: 'first',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action:first');
          return 'first';
        }
      },
      {
        id: 'second',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action:second');
          return 'second';
        }
      }
    ]
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.iterationsRun, 1);
  assert.equal(result.stopReason, 'max-iterations');
  assert.deepEqual(events, ['write-ahead:0', 'action:first']);
});

test('budget exhaustion stops before or after a bounded iteration', async () => {
  const beforeEvents = [];
  const before = await runL0BoundedReasoningLoop(baseInput({
    budgetRemaining: budget({ maxIterationsLeft: 0 })
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(beforeEvents)
  });

  assert.equal(before.iterationsRun, 0);
  assert.equal(before.stopReason, 'budget-exhausted');
  assert.deepEqual(beforeEvents, []);

  const afterEvents = [];
  const after = await runL0BoundedReasoningLoop(baseInput({
    maxIterations: 3,
    budgetRemaining: budget({ maxIterationsLeft: 1 }),
    actions: [
      {
        id: 'first',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => 'first'
      },
      {
        id: 'second',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => 'second'
      }
    ]
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(afterEvents)
  });

  assert.equal(after.iterationsRun, 1);
  assert.equal(after.stopReason, 'budget-exhausted');
  assert.deepEqual(afterEvents, ['write-ahead:0']);
});

test('chat tier cannot execute worker-only actions', async () => {
  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({ tier: 'chat' })),
    errorCode('E_L0_LOOP_TIER_FORBIDDEN')
  );
});

test('worker tier cannot promote claims or write accepted claim edges', async () => {
  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{ id: 'promote', kind: 'promote-claim', run: async () => null }]
    })),
    errorCode('E_L0_LOOP_CLAIM_PROMOTION_FORBIDDEN')
  );

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{
        id: 'accepted-edge',
        kind: 'write-accepted-claim-edge',
        run: async () => null
      }]
    })),
    errorCode('E_L0_LOOP_CLAIM_EDGE_FORBIDDEN')
  );
});

test('worker tier cannot request export or Graphify', async () => {
  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{ id: 'export', kind: 'export', run: async () => null }]
    })),
    errorCode('E_L0_LOOP_EXPORT_FORBIDDEN')
  );

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{ id: 'graphify', kind: 'graphify', run: async () => null }]
    })),
    errorCode('E_L0_LOOP_GRAPHIFY_FORBIDDEN')
  );
});

test('each iteration writes the TL0.1 halt snapshot before action execution', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseInput({
    maxIterations: 2,
    actions: [
      {
        id: 'first',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action:first');
          return 'first';
        }
      },
      {
        id: 'second',
        kind: 'worker-analysis',
        requiredTier: 'worker',
        run: async () => {
          events.push('action:second');
          return 'second';
        }
      }
    ]
  }), {
    writeL0HaltSnapshotBeforeAction: makeWriteAhead(events)
  });

  assert.equal(result.iterationsRun, 2);
  assert.equal(result.stopReason, 'max-iterations');
  assert.deepEqual(events, [
    'write-ahead:0',
    'action:first',
    'write-ahead:1',
    'action:second'
  ]);
});

test('write-ahead failure prevents the action from running', async () => {
  let actionRan = false;

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [
        {
          id: 'must-not-run',
          kind: 'worker-analysis',
          requiredTier: 'worker',
          run: async () => {
            actionRan = true;
          }
        }
      ]
    }), {
      writeL0HaltSnapshotBeforeAction: async () => {
        throw new Error('write-ahead failed');
      }
    }),
    /write-ahead failed/u
  );

  assert.equal(actionRan, false);
});
