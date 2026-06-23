import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  Phase14L4SwarmCompositionError,
  composeL4SwarmTurn,
  reconstructL4SwarmTurn
} from '../../../autonomous/l4/swarm-composition.js';

const repoRoot = process.cwd();
const modulePath = path.join(
  repoRoot,
  'environment/autonomous/l4/swarm-composition.js'
);

function objectiveRecord() {
  return {
    objectiveId: 'OBJ-HGSOC-ENDO-L4',
    title: 'Adversarial relay for ovarian cancer/endometriosis research'
  };
}

function baseInput(overrides = {}) {
  return {
    autonomyTier: 'L4',
    runtimeMode: 'attended-batch',
    objectiveRecord: objectiveRecord(),
    turnId: 'swarm-turn-001',
    relayRequest: {
      requestId: 'relay-review-tl4-001',
      artifactPath: 'relay/turns/codex-review-request.md'
    },
    coldChildRequest: {
      role: 'reviewer-2',
      handoffPath: 'relay/turns/codex-review-request.md'
    },
    reviewerSet: ['claude-code'],
    ...overrides
  };
}

function depsWithRecorder() {
  const calls = [];
  return {
    calls,
    dispatchRelayTurn: async (request) => {
      calls.push({ kind: 'relay', request });
      return {
        relayTurnId: 'relay-turn-001',
        relayArtifactPath: request.artifactPath,
        runtimeOpened: false
      };
    },
    dispatchColdChild: async (request) => {
      calls.push({ kind: 'cold-child', request });
      return {
        childRunId: 'cold-child-001',
        role: request.role,
        runtimeOpened: false
      };
    },
    writeSwarmArtifact: async (name, artifact) => {
      calls.push({ kind: 'write', name, artifact });
      return {
        artifactPath: `/tmp/tl4/${name}.json`,
        artifactRelativePath: `.vibe-science-environment/autonomous/l4/${name}.json`
      };
    }
  };
}

function errorCode(code) {
  return (error) => error instanceof Phase14L4SwarmCompositionError
    && error.code === code;
}

describe('Phase 14 TL4.1 swarm-relay composition', () => {
  it('fails closed before writes when tier or runtime mode is not eligible', async () => {
    for (const [overrides, code] of [
      [{ autonomyTier: 'L3' }, 'E_PHASE14_L4_SWARM_TIER_REQUIRED'],
      [{ runtimeMode: 'resume-only' }, 'E_PHASE14_L4_SWARM_MODE_REQUIRED'],
      [{ runtimeMode: 'unattended-batch' }, 'E_PHASE14_L4_SWARM_UNATTENDED_FORBIDDEN']
    ]) {
      const deps = depsWithRecorder();
      await assert.rejects(
        () => composeL4SwarmTurn(baseInput(overrides), deps),
        errorCode(code)
      );
      assert.deepEqual(deps.calls, []);
    }
  });

  it('requires injected relay cold-child dispatch and artifact writer', async () => {
    await assert.rejects(
      () => composeL4SwarmTurn(baseInput(), {
        dispatchColdChild: async () => ({}),
        writeSwarmArtifact: async () => ({})
      }),
      errorCode('E_PHASE14_L4_SWARM_RELAY_DISPATCH_REQUIRED')
    );
    await assert.rejects(
      () => composeL4SwarmTurn(baseInput(), {
        dispatchRelayTurn: async () => ({}),
        writeSwarmArtifact: async () => ({})
      }),
      errorCode('E_PHASE14_L4_SWARM_COLD_CHILD_REQUIRED')
    );
    await assert.rejects(
      () => composeL4SwarmTurn(baseInput(), {
        dispatchRelayTurn: async () => ({}),
        dispatchColdChild: async () => ({})
      }),
      errorCode('E_PHASE14_L4_SWARM_WRITER_REQUIRED')
    );
  });

  it('composes existing relay and cold-child surfaces through injected functions only', async () => {
    const deps = depsWithRecorder();
    const result = await composeL4SwarmTurn(baseInput(), deps);

    assert.equal(result.ok, true);
    assert.equal(result.record.schemaVersion, 'phase14.tl4.1-swarm-turn.v1');
    assert.equal(result.record.runtimeOpened, false);
    assert.equal(result.record.autonomousRuntimeAllowed, false);
    assert.equal(result.record.unattendedRuntimeOpened, false);
    assert.equal(result.record.providerAutomationInvoked, false);
    assert.equal(result.record.obdkUsed, false);
    assert.equal(result.record.realDataRead, false);
    assert.equal(result.record.reviewedApiUsed, false);
    assert.equal(result.record.claimExportOpened, false);
    assert.equal(result.record.graphifyOpened, false);
    assert.equal(result.record.directSpawnUsed, false);
    assert.equal(result.record.newRelayPrimitiveCreated, false);
    assert.equal(result.record.relayResult.relayTurnId, 'relay-turn-001');
    assert.equal(result.record.coldChildResult.childRunId, 'cold-child-001');
    assert.equal(result.handoffPointerPath, '/tmp/tl4/handoff-pointer.json');

    assert.deepEqual(deps.calls.map((call) => call.kind), [
      'relay',
      'cold-child',
      'write',
      'write'
    ]);
    assert.deepEqual(deps.calls.filter((call) => call.kind === 'write')
      .map((call) => call.name), ['swarm-turn', 'handoff-pointer']);
    assert.equal(
      deps.calls.find((call) => call.name === 'handoff-pointer')
        .artifact.swarmTurnPath,
      '/tmp/tl4/swarm-turn.json'
    );
  });

  it('reconstructs a swarm turn from persisted artifacts without parent chat', async () => {
    const deps = depsWithRecorder();
    const result = await composeL4SwarmTurn(baseInput(), deps);
    const coldRecord = JSON.parse(JSON.stringify(result.record));
    const reconstructed = reconstructL4SwarmTurn(coldRecord);

    assert.equal(reconstructed.schemaVersion, 'phase14.tl4.1-swarm-turn.v1');
    assert.equal(reconstructed.source, 'persisted-swarm-turn');
    assert.equal(reconstructed.objectiveRecord.objectiveId, 'OBJ-HGSOC-ENDO-L4');
    assert.equal(reconstructed.relayResult.relayTurnId, 'relay-turn-001');
    assert.equal(reconstructed.coldChildResult.childRunId, 'cold-child-001');
  });

  it('is safe by import and contains no direct spawn provider or OBDK path', async () => {
    const before = globalThis.__tl4ImportSideEffectCount ?? 0;
    await import('../../../autonomous/l4/swarm-composition.js');
    assert.equal(globalThis.__tl4ImportSideEffectCount ?? 0, before);

    const source = await readFile(modulePath, 'utf8');
    assert.equal(source.includes('node:child_process'), false);
    assert.equal(source.includes('provider-gateway'), false);
    assert.equal(source.includes('codex-cli'), false);
    assert.equal(source.includes('claude-cli'), false);
    assert.equal(source.includes('OBDK'), false);
    assert.equal(source.includes('realDataRead: true'), false);
    assert.equal(source.includes('graphifyOpened: true'), false);
    assert.equal(source.includes('claimExportOpened: true'), false);
  });
});
