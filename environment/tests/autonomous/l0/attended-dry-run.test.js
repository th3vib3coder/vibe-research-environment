import assert from 'node:assert/strict';
import test from 'node:test';

import {
  L0AttendedDryRunError,
  resumeL0AttendedDryRun,
  runL0AttendedDryRun
} from '../../../autonomous/l0/attended-dry-run.js';

function objectiveRecord() {
  return {
    objectiveId: 'OBJ-HGSOC-ENDO-L0',
    title: 'Review ovarian cancer and endometriosis evidence'
  };
}

function baseCandidate(overrides = {}) {
  return {
    id: 'dataset-widen',
    actionType: 'dataset-widening',
    summary: 'Widen to one reviewed public cohort after literature triage',
    priority: 10,
    direction: {
      directionId: 'DIR-HGSOC-ENDO-01',
      summary: 'Widen to one reviewed public cohort after literature triage'
    },
    rationale: 'Next step is high-stakes and must stop for operator review.',
    ...overrides
  };
}

function baseInput(overrides = {}) {
  return {
    projectRoot: '/tmp/vre-tl0-6',
    objectiveRecord: objectiveRecord(),
    autonomyTier: 'L0',
    runtimeMode: 'attended-batch',
    tier: 'worker',
    maxIterations: 1,
    budgetRemaining: {
      maxWallSecondsLeft: 120,
      maxIterationsLeft: 2,
      costCeilingLeft: 1
    },
    haltChecked: true,
    openGateRecords: [
      {
        gateId: 'phase-14-tl0.6-attended-dry-run-hat1-stop',
        status: 'reviewed-accepted-specific-operator-go-received'
      }
    ],
    candidates: [baseCandidate()],
    ...overrides
  };
}

function makeArtifacts() {
  const writes = [];
  return {
    writes,
    writeDryRunArtifact: async (name, artifact) => {
      writes.push({ name, artifact });
      return {
        artifact,
        artifactPath: `/tmp/tl0.6/${name}.json`,
        artifactRelativePath: `.vibe-science-environment/autonomous/l0/dry-run/${name}.json`
      };
    }
  };
}

function errorCode(code) {
  return (error) => error instanceof L0AttendedDryRunError && error.code === code;
}

test('attended dry run selects, gates, persists, cold-restarts, and resumes only after GO', async () => {
  const events = [];
  const artifacts = makeArtifacts();

  const dryRun = await runL0AttendedDryRun(baseInput(), {
    ...artifacts,
    checkDirection: async () => ({
      ok: true,
      verdict: 'allow',
      directionId: 'DIR-HGSOC-ENDO-01',
      summary: 'Widen to one reviewed public cohort after literature triage',
      written: false
    }),
    writeOperatorGateRecord: async (record) => {
      events.push(`gate:${record.actionId}`);
      return {
        gateRecord: record,
        gateRecordPath: '/tmp/tl0.6/operator-gate.json',
        gateRecordRelativePath:
          '.vibe-science-environment/autonomous/l0/operator-gates/dataset-widen.json'
      };
    },
    writeL0HaltSnapshotBeforeAction: async ({ iteration, action }) => {
      events.push(`write-ahead:${iteration}`);
      return {
        snapshot: { iteration, persisted: true },
        snapshotPath: '/tmp/tl0.6/resume-snapshot.json',
        actionResult: await action({ snapshotPath: '/tmp/tl0.6/resume-snapshot.json' })
      };
    }
  });

  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.stopReason, 'high-stakes-operator-gate');
  assert.equal(dryRun.actionExecuted, false);
  assert.equal(dryRun.runtimeOpened, false);
  assert.equal(dryRun.autonomousRuntimeAllowed, false);
  assert.equal(dryRun.selector.proposal.actionId, 'dataset-widen');
  assert.equal(dryRun.selector.proposal.requiredGate, 'TL0.4');
  assert.equal(dryRun.loop.highStakesGate.gateRecord.actionExecuted, false);
  assert.equal(dryRun.loop.highStakesGate.gateRecord.runtimeOpened, false);
  assert.equal(dryRun.loop.highStakesGate.gateRecord.resumeRequiresOperatorGo, true);
  assert.equal(dryRun.reconstruction.resumeRequiresOperatorGo, true);
  assert.equal(dryRun.reconstruction.source, 'persisted-artifacts');
  assert.deepEqual(events, ['gate:dataset-widen']);
  assert.deepEqual(artifacts.writes.map(({ name }) => name), [
    'selector-rationale',
    'operator-gate',
    'dry-run-summary'
  ]);

  const coldRestart = JSON.parse(JSON.stringify(dryRun.reconstruction));
  await assert.rejects(
    () => resumeL0AttendedDryRun({
      reconstruction: coldRestart,
      runtimeMode: 'attended-batch',
      autonomyTier: 'L0',
      operatorGoText: ''
    }, {
      writeL0HaltSnapshotBeforeAction: async () => {
        throw new Error('must not write without GO');
      }
    }),
    errorCode('E_L0_ATTENDED_DRY_RUN_OPERATOR_GO_REQUIRED')
  );

  const resumed = await resumeL0AttendedDryRun({
    reconstruction: coldRestart,
    runtimeMode: 'attended-batch',
    autonomyTier: 'L0',
    operatorGoText: 'GO resume TL0.6 attended dry run',
    budgetRemaining: {
      maxWallSecondsLeft: 60,
      maxIterationsLeft: 1,
      costCeilingLeft: 1
    }
  }, {
    writeL0HaltSnapshotBeforeAction: async ({ iteration, action }) => {
      events.push(`resume-write-ahead:${iteration}`);
      return {
        snapshot: { iteration, resumed: true },
        snapshotPath: '/tmp/tl0.6/resumed-snapshot.json',
        actionResult: await action({ snapshotPath: '/tmp/tl0.6/resumed-snapshot.json' })
      };
    }
  });

  assert.equal(resumed.ok, true);
  assert.equal(resumed.stopReason, 'budget-exhausted');
  assert.equal(resumed.iterationsRun, 1);
  assert.equal(resumed.results[0].actionId, 'dataset-widen');
  assert.equal(resumed.results[0].result.dryRunResumed, true);
  assert.equal(resumed.results[0].result.operatorGoText,
    'GO resume TL0.6 attended dry run');
  assert.deepEqual(events, ['gate:dataset-widen', 'resume-write-ahead:0']);
});

test('no unattended or wrong-mode path writes artifacts', async () => {
  for (const [overrides, code] of [
    [{ autonomyTier: undefined }, 'E_L0_ATTENDED_DRY_RUN_AUTONOMY_TIER_REQUIRED'],
    [{ runtimeMode: 'resume-only' }, 'E_L0_ATTENDED_DRY_RUN_RUNTIME_MODE_FORBIDDEN'],
    [{ runtimeMode: 'unattended-batch' }, 'E_L0_ATTENDED_DRY_RUN_UNATTENDED_FORBIDDEN']
  ]) {
    const artifacts = makeArtifacts();
    await assert.rejects(
      () => runL0AttendedDryRun(baseInput(overrides), artifacts),
      errorCode(code)
    );
    assert.deepEqual(artifacts.writes, []);
  }
});

test('resume keeps guardrails and TL0.2 hard blockers authoritative', async () => {
  const reconstruction = {
    source: 'persisted-artifacts',
    resumeRequiresOperatorGo: true,
    objectiveRecord: objectiveRecord(),
    activePointer: { objectiveId: 'OBJ-HGSOC-ENDO-L0', queueId: 'dry-run', index: 0 },
    queueState: { queueId: 'dry-run', queued: ['claim-edge'] },
    resumeAction: {
      id: 'claim-edge',
      kind: 'write-accepted-claim-edge',
      requiredTier: 'worker'
    }
  };

  await assert.rejects(
    () => resumeL0AttendedDryRun({
      reconstruction,
      runtimeMode: 'attended-batch',
      autonomyTier: 'L0',
      operatorGoText: 'GO resume TL0.6 attended dry run'
    }),
    (error) => error?.code === 'E_L0_LOOP_CLAIM_EDGE_FORBIDDEN'
  );

  const guarded = {
    ...reconstruction,
    resumeAction: {
      id: 'safe-looking-delete',
      kind: 'literature-triage',
      requiredTier: 'worker',
      toolIntent: {
        toolName: 'terminal',
        args: { command: 'rm -rf ./output' }
      }
    }
  };

  const result = await resumeL0AttendedDryRun({
    reconstruction: guarded,
    runtimeMode: 'attended-batch',
    autonomyTier: 'L0',
    operatorGoText: 'GO resume TL0.6 attended dry run'
  }, {
    writeL0HaltSnapshotBeforeAction: async () => {
      throw new Error('guardrail must stop before write-ahead');
    }
  });

  assert.equal(result.stopReason, 'guardrail-controller');
  assert.equal(result.runtimeOpened, false);
  assert.equal(result.guardrailDecision.code, 'E_L0_GUARDRAIL_DESTRUCTIVE_TOOL_INTENT');
});
