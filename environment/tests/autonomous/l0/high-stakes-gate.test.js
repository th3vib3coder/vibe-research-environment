import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateHighStakesGate,
  isHighStakesAction,
  L0HighStakesGateError
} from '../../../autonomous/l0/high-stakes-gate.js';
import {
  runL0BoundedReasoningLoop
} from '../../../autonomous/l0/reasoning-loop.js';

function errorCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

function baseInput(overrides = {}) {
  return {
    runtimeMode: 'attended-batch',
    tier: 'worker',
    maxIterations: 1,
    projectRoot: '/tmp/vre',
    haltChecked: true,
    objectiveRecord: {
      objectiveId: 'OBJ-TL0-4',
      title: 'Bound high-stakes L0 action execution'
    },
    activePointer: {
      objectiveId: 'OBJ-TL0-4',
      queueId: 'Q1',
      index: 0
    },
    queueState: {
      queueId: 'Q1',
      queued: ['candidate']
    },
    budgetRemaining: {
      maxWallSecondsLeft: 30,
      maxIterationsLeft: 2,
      costCeilingLeft: 1
    },
    actions: [],
    ...overrides
  };
}

function gateWriter(events, fail = false) {
  return async (record) => {
    events.push(`gate:${record.actionId}`);
    if (fail) {
      throw Object.assign(new Error('write failed'), { code: 'E_WRITE_FAILED' });
    }
    return {
      gateRecord: record,
      gateRecordPath: `.vibe-science-environment/autonomous/l0/operator-gates/${record.actionId}.json`,
      gateRecordRelativePath:
        `.vibe-science-environment/autonomous/l0/operator-gates/${record.actionId}.json`
    };
  };
}

function writeAhead(events) {
  return async ({ iteration, action }) => {
    events.push(`write-ahead:${iteration}`);
    const actionResult = await action({
      snapshotPath:
        '.vibe-science-environment/autonomous/l0/resume-snapshot.json'
    });
    return {
      snapshot: { iteration },
      snapshotPath:
        '.vibe-science-environment/autonomous/l0/resume-snapshot.json',
      actionResult
    };
  };
}

test('classifies TL0.3 proposals and named high-stakes actions', () => {
  assert.equal(isHighStakesAction({
    id: 'proposal',
    actionType: 'research-next-step',
    requiresOperatorGate: true
  }), true);
  assert.equal(isHighStakesAction({
    id: 'clinical',
    kind: 'clinical-interpretation'
  }), true);
  assert.equal(isHighStakesAction({
    id: 'dataset',
    actionType: 'dataset-widening'
  }), true);
  assert.equal(isHighStakesAction({
    id: 'direction',
    kind: 'new-direction'
  }), true);
  assert.equal(isHighStakesAction({
    id: 'low',
    kind: 'literature-triage'
  }), false);
});

test('writes a durable STOP record and never executes a TL0.3 high-stakes proposal', async () => {
  const events = [];
  const result = await evaluateHighStakesGate({
    action: {
      id: 'proposal-1',
      actionType: 'research-next-step',
      requiresOperatorGate: true,
      summary: 'Promote the selected scientific action.'
    },
    iteration: 0,
    objectiveRecord: baseInput().objectiveRecord,
    priorOperatorGoText: 'GO runtime TL0.3 next-scientific-action selector HAT2'
  }, {
    writeOperatorGateRecord: gateWriter(events)
  });

  assert.equal(result.ok, false);
  assert.equal(result.stopReason, 'high-stakes-operator-gate');
  assert.equal(result.actionExecuted, false);
  assert.equal(result.gateRecord.requestedGate, 'TL0.4');
  assert.equal(result.gateRecord.actionExecuted, false);
  assert.equal(result.gateRecord.resumeRequiresOperatorGo, true);
  assert.equal(result.gateRecord.runtimeOpened, false);
  assert.equal(result.gateRecord.acceptedPriorGo, false);
  assert.equal(result.gateRecord.priorOperatorGoText,
    'GO runtime TL0.3 next-scientific-action selector HAT2');
  assert.deepEqual(events, ['gate:proposal-1']);
  assert.doesNotThrow(() => JSON.stringify(result.gateRecord));
});

test('writer failure fails closed with no allow result', async () => {
  await assert.rejects(
    () => evaluateHighStakesGate({
      action: {
        id: 'clinical-1',
        kind: 'clinical-interpretation',
        summary: 'Interpret clinical implication.'
      },
      objectiveRecord: baseInput().objectiveRecord
    }, {
      writeOperatorGateRecord: gateWriter([], true)
    }),
    errorCode('E_L0_HIGH_STAKES_GATE_RECORD_WRITE_FAILED')
  );
});

test('ambiguous high-stakes metadata fails closed before writing', async () => {
  await assert.rejects(
    () => evaluateHighStakesGate({
      action: {
        kind: 'dataset-widening'
      },
      objectiveRecord: baseInput().objectiveRecord
    }, {
      writeOperatorGateRecord: gateWriter([])
    }),
    errorCode('E_L0_HIGH_STAKES_GATE_ACTION_ID_REQUIRED')
  );
});

test('path-like high-stakes action ids fail closed before writing', async () => {
  const events = [];
  await assert.rejects(
    () => evaluateHighStakesGate({
      action: {
        id: '../escape',
        kind: 'dataset-widening'
      },
      objectiveRecord: baseInput().objectiveRecord
    }, {
      writeOperatorGateRecord: gateWriter(events)
    }),
    errorCode('E_L0_HIGH_STAKES_GATE_ACTION_ID_UNSAFE')
  );
  assert.deepEqual(events, []);
});

test('reasoning loop stops high-stakes actions before callback mutation', async () => {
  const events = [];
  let actionRan = false;

  const result = await runL0BoundedReasoningLoop(baseInput({
    actions: [{
      id: 'dataset-widen',
      kind: 'dataset-widening',
      requiredTier: 'worker',
      run: async () => {
        actionRan = true;
        events.push('action-ran');
        return 'ran';
      }
    }]
  }), {
    writeL0HaltSnapshotBeforeAction: writeAhead(events),
    writeOperatorGateRecord: gateWriter(events)
  });

  assert.equal(actionRan, false);
  assert.equal(result.stopReason, 'high-stakes-operator-gate');
  assert.equal(result.iterationsRun, 0);
  assert.equal(result.highStakesGate.actionExecuted, false);
  assert.equal(result.highStakesGate.gateRecord.actionType, 'dataset-widening');
  assert.deepEqual(events, ['gate:dataset-widen']);
});

test('low-stakes actions continue through the existing TL0.2 write-ahead path', async () => {
  const events = [];
  const result = await runL0BoundedReasoningLoop(baseInput({
    actions: [{
      id: 'triage',
      kind: 'literature-triage',
      requiredTier: 'worker',
      run: async () => {
        events.push('action:triage');
        return 'triaged';
      }
    }]
  }), {
    writeL0HaltSnapshotBeforeAction: writeAhead(events),
    writeOperatorGateRecord: gateWriter(events)
  });

  assert.equal(result.iterationsRun, 1);
  assert.equal(result.results[0].result, 'triaged');
  assert.deepEqual(events, ['write-ahead:0', 'action:triage']);
});

test('existing TL0.2 forbidden action errors remain in force', async () => {
  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{
        id: 'promote',
        kind: 'promote-claim',
        requiredTier: 'worker',
        run: async () => 'forbidden'
      }]
    }), {
      writeOperatorGateRecord: gateWriter([])
    }),
    errorCode('E_L0_LOOP_CLAIM_PROMOTION_FORBIDDEN')
  );

  await assert.rejects(
    () => runL0BoundedReasoningLoop(baseInput({
      actions: [{
        id: 'graphify',
        kind: 'graphify',
        requiredTier: 'worker',
        run: async () => 'forbidden'
      }]
    }), {
      writeOperatorGateRecord: gateWriter([])
    }),
    errorCode('E_L0_LOOP_GRAPHIFY_FORBIDDEN')
  );
});

test('direct gate blocks claim, edge, export, graphify, and direction lifecycle intents', async () => {
  const kinds = [
    ['claim', 'claim-promotion'],
    ['edge', 'accepted-claim-edge'],
    ['export', 'export'],
    ['graphify', 'graphify'],
    ['revive', 'direction-revival']
  ];

  for (const [id, kind] of kinds) {
    const events = [];
    const result = await evaluateHighStakesGate({
      action: { id, kind, summary: `Block ${kind}` },
      objectiveRecord: baseInput().objectiveRecord
    }, {
      writeOperatorGateRecord: gateWriter(events)
    });
    assert.equal(result.ok, false);
    assert.equal(result.gateRecord.actionType, kind);
    assert.equal(result.gateRecord.actionExecuted, false);
    assert.deepEqual(events, [`gate:${id}`]);
  }
});

test('L0HighStakesGateError exposes code and metadata', () => {
  const error = new L0HighStakesGateError('E_EXAMPLE', 'example', {
    actionId: 'a1'
  });
  assert.equal(error.name, 'L0HighStakesGateError');
  assert.equal(error.code, 'E_EXAMPLE');
  assert.deepEqual(error.extra, { actionId: 'a1' });
});
