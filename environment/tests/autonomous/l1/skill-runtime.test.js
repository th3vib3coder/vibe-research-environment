import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  Phase14L1SkillRuntimeError,
  reconstructL1SkillRuntimeRecord,
  runL1SkillRuntime
} from '../../../autonomous/l1/skill-runtime.js';

const baseTable = Object.freeze({
  schemaVersion: 'phase13.l1-stage-skill-table.v1',
  stages: [
    {
      stageId: 'problem-framing',
      targets: [
        {
          targetId: 'scientific-brainstorming',
          targetKind: 'host-skill',
          required: true
        }
      ]
    },
    {
      stageId: 'novelty-literature-gap',
      targets: [
        {
          targetId: 'vibe',
          targetKind: 'vibe-science-workflow',
          required: true
        },
        {
          targetId: 'literature-search',
          targetKind: 'skill-family',
          required: false
        }
      ]
    },
    {
      stageId: 'closeout',
      targets: [
        {
          targetId: 'verification-before-completion',
          targetKind: 'host-skill',
          required: true
        }
      ]
    }
  ]
});

function registry(overrides = {}) {
  return {
    hostSkills: ['scientific-brainstorming', 'verification-before-completion'],
    skillFamilies: ['literature-search'],
    vibeScienceWorkflows: ['vibe'],
    codexGlobalInstalls: [],
    ...overrides
  };
}

function writer(records) {
  return async (record) => {
    records.push(record);
    return `memory://${records.length}`;
  };
}

describe('Phase 14 TL1.4 L1 skill runtime consumer', () => {
  it('fails closed before writes when tier or runtime mode is not eligible', async () => {
    const records = [];
    const executor = async () => ({ ok: true });

    await assert.rejects(
      () => runL1SkillRuntime({
        runtimeMode: 'attended-batch',
        stageId: 'closeout',
        table: baseTable,
        registry: registry(),
        executor,
        writeRecord: writer(records)
      }),
      (error) => error instanceof Phase14L1SkillRuntimeError
        && error.code === 'E_PHASE14_L1_RUNTIME_TIER_REQUIRED'
    );

    await assert.rejects(
      () => runL1SkillRuntime({
        autonomyTier: 'L1',
        runtimeMode: 'unattended-batch',
        stageId: 'closeout',
        table: baseTable,
        registry: registry(),
        executor,
        writeRecord: writer(records)
      }),
      (error) => error instanceof Phase14L1SkillRuntimeError
        && error.code === 'E_PHASE14_L1_RUNTIME_UNATTENDED_FORBIDDEN'
    );

    await assert.rejects(
      () => runL1SkillRuntime({
        autonomyTier: 'L1',
        runtimeMode: 'operator-free',
        stageId: 'closeout',
        table: baseTable,
        registry: registry(),
        executor,
        writeRecord: writer(records)
      }),
      (error) => error instanceof Phase14L1SkillRuntimeError
        && error.code === 'E_PHASE14_L1_RUNTIME_MODE_REQUIRED'
    );

    assert.equal(records.length, 0);
  });

  it('uses only the injected executor and writer for available stage targets', async () => {
    const records = [];
    const calls = [];
    const result = await runL1SkillRuntime({
      autonomyTier: 'L1',
      runtimeMode: 'attended-batch',
      stageId: 'closeout',
      table: baseTable,
      registry: registry(),
      invocationInput: { objectiveId: 'OBJ-1', note: 'verify before closure' },
      executor: async (request) => {
        calls.push(request);
        return { status: 'ok', observed: request.targetId };
      },
      writeRecord: writer(records)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].stageId, 'closeout');
    assert.equal(calls[0].targetId, 'verification-before-completion');
    assert.equal(result.recordPath, 'memory://1');
    assert.equal(result.record.runtimeOpened, false);
    assert.equal(result.record.skillInvocationAttempted, true);
    assert.equal(result.record.invocations.length, 1);
    assert.equal(result.record.invocations[0].executorResult.status, 'ok');
    assert.equal(result.record.source.tableSchemaVersion, baseTable.schemaVersion);
    assert.equal(typeof result.record.inputsHash, 'string');
    assert.equal(records.length, 1);
  });

  it('routes missing required skills through reviewed SKILL_UNAVAILABLE degrade', async () => {
    const records = [];
    let executorCalled = false;
    const result = await runL1SkillRuntime({
      autonomyTier: 'L1',
      runtimeMode: 'attended-batch',
      stageId: 'problem-framing',
      table: baseTable,
      registry: registry({ hostSkills: [] }),
      invocationInput: { objectiveId: 'OBJ-missing' },
      executor: async () => {
        executorCalled = true;
        return { status: 'should-not-run' };
      },
      writeRecord: writer(records)
    });

    assert.equal(executorCalled, false);
    assert.equal(result.record.kind, 'skill-unavailable');
    assert.equal(result.record.runtimeOpened, false);
    assert.equal(result.record.skillInvocationAttempted, false);
    assert.equal(result.record.degradeReport.requiredGaps.length, 1);
    assert.equal(result.record.degradeReport.requiredGaps[0].marker, 'SKILL_UNAVAILABLE');
    assert.equal(result.record.degradeReport.requiredGaps[0].targetId, 'scientific-brainstorming');
    assert.equal(records.length, 1);
  });

  it('keeps optional missing skills visible but non-blocking', async () => {
    const records = [];
    const calls = [];
    const result = await runL1SkillRuntime({
      autonomyTier: 'L1',
      runtimeMode: 'attended-batch',
      stageId: 'novelty-literature-gap',
      table: baseTable,
      registry: registry({ skillFamilies: [] }),
      invocationInput: { objectiveId: 'OBJ-gap' },
      executor: async (request) => {
        calls.push(request);
        return { status: 'ok', targetKind: request.targetKind };
      },
      writeRecord: writer(records)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].targetId, 'vibe');
    assert.equal(calls[0].targetKind, 'vibe-science-workflow');
    assert.equal(result.record.kind, 'skill-invocation');
    assert.equal(result.record.degradeReport.blocking, false);
    assert.equal(result.record.degradeReport.optionalGaps.length, 1);
    assert.equal(result.record.degradeReport.optionalGaps[0].targetId, 'literature-search');
  });

  it('does not collapse the three vibe target identities', async () => {
    const records = [];
    const calls = [];
    const result = await runL1SkillRuntime({
      autonomyTier: 'L1',
      runtimeMode: 'attended-batch',
      stageId: 'novelty-literature-gap',
      table: baseTable,
      registry: registry({ hostSkills: ['vibe'], codexGlobalInstalls: ['vibe-science'] }),
      invocationInput: { objectiveId: 'OBJ-vibe' },
      executor: async (request) => {
        calls.push(request);
        return { status: 'ok' };
      },
      writeRecord: writer(records)
    });

    assert.equal(calls.some((call) =>
      call.targetId === 'vibe' && call.targetKind === 'vibe-science-workflow'
    ), true);
    assert.equal(result.record.vibeNamingStates.hostSkillVibe.status, 'available');
    assert.equal(result.record.vibeNamingStates.vibeScienceWorkflow.status, 'available');
    assert.equal(result.record.vibeNamingStates.codexGlobalInstall.status, 'available');
  });

  it('reconstructs invocation records from disk without parent chat', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vre-l1-runtime-'));
    const recordPath = path.join(tmp, 'record.json');

    try {
      const result = await runL1SkillRuntime({
        autonomyTier: 'L1',
        runtimeMode: 'attended-batch',
        stageId: 'closeout',
        table: baseTable,
        registry: registry(),
        invocationInput: { objectiveId: 'OBJ-disk' },
        executor: async () => ({ status: 'ok' }),
        writeRecord: async (record) => {
          await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
          return recordPath;
        }
      });
      const reconstructed = reconstructL1SkillRuntimeRecord(
        JSON.parse(await readFile(result.recordPath, 'utf8'))
      );

      assert.equal(reconstructed.schemaVersion, 'phase14.l1-skill-runtime-record.v1');
      assert.equal(reconstructed.stageId, 'closeout');
      assert.equal(reconstructed.invocations.length, 1);
      assert.equal(reconstructed.runtimeOpened, false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
