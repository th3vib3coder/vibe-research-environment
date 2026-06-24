import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  L5CapstoneCycleError,
  L5_CAPSTONE_STAGE_IDS,
  runL5CapstoneCycle
} from '../../orchestrator/l5-capstone.js';

const moduleUrl = new URL('../../orchestrator/l5-capstone.js', import.meta.url);

function operatorGate(stageId) {
  return {
    stageId,
    verdict: 'accepted',
    reviewed: true,
    operator: 'Carmine',
    evidenceRef: `operator-gate:${stageId}`
  };
}

function baseInput(overrides = {}) {
  return {
    autonomyTier: 'L5',
    runtimeMode: 'attended-batch',
    objectiveRecord: {
      objectiveId: 'OBJ-HGSOC-ENDO-L5',
      title: 'Ovarian cancer and endometriosis capstone cycle'
    },
    directionTarget: {
      directionId: 'DIR-HGSOC-ENDO-001',
      summary: 'CXCL13+ CD8 literature and public data review'
    },
    operatorGateResults: {
      'sanctioned-analysis': operatorGate('sanctioned-analysis'),
      claim: operatorGate('claim'),
      writeup: operatorGate('writeup')
    },
    plannerProposal: {
      source: 'reviewed-planner',
      proposalId: 'proposal-literature-gap-001',
      summary: 'Draft a bounded public-evidence cycle'
    },
    provenanceRefs: [
      { kind: 'paper', ref: 'PMID:example' }
    ],
    ...overrides
  };
}

function depsWithCalls(overrides = {}) {
  const calls = [];
  const stageRunners = Object.fromEntries(
    L5_CAPSTONE_STAGE_IDS.map((stageId) => [
      stageId,
      async (context) => {
        calls.push({ kind: 'stage', stageId, context });
        return {
          stageId,
          resultRef: `artifact:${stageId}`,
          proposalOnly: true
        };
      }
    ])
  );

  return {
    calls,
    checkDirectionStatus: async (_target) => {
      calls.push({ kind: 'direction-check' });
      return { verdict: 'allow', written: false };
    },
    stageRunners,
    ...overrides
  };
}

function errorCode(code) {
  return (error) => error instanceof L5CapstoneCycleError
    && error.code === code;
}

test('fails closed before injected dependencies for unsupported tier or mode', async () => {
  for (const [overrides, code] of [
    [{ autonomyTier: 'L4' }, 'E_PHASE14_L5_TIER_REQUIRED'],
    [{ runtimeMode: 'resume-only' }, 'E_PHASE14_L5_MODE_REQUIRED'],
    [{ runtimeMode: 'unattended-batch' }, 'E_PHASE14_L5_UNATTENDED_FORBIDDEN']
  ]) {
    const deps = depsWithCalls();
    await assert.rejects(
      () => runL5CapstoneCycle(baseInput(overrides), deps),
      errorCode(code)
    );
    assert.deepEqual(deps.calls, []);
  }
});

test('happy path returns the exact seven ordered stage ids', async () => {
  const deps = depsWithCalls();
  const result = await runL5CapstoneCycle(baseInput(), deps);

  assert.equal(result.ok, true);
  assert.deepEqual(result.stageIds, [
    'objective',
    'literature-gap',
    'hypothesis',
    'sanctioned-analysis',
    'validation',
    'claim',
    'writeup'
  ]);
  assert.deepEqual(result.stages.map((stage) => stage.stageId), result.stageIds);
  assert.deepEqual(
    deps.calls
      .filter((call) => call.kind === 'stage')
      .map((call) => call.stageId),
    result.stageIds
  );
});

test('missing required stage dependency fails closed', async () => {
  const deps = depsWithCalls();
  delete deps.stageRunners['literature-gap'];

  await assert.rejects(
    () => runL5CapstoneCycle(baseInput(), deps),
    errorCode('E_PHASE14_L5_STAGE_DEPENDENCY_REQUIRED')
  );
});

test('missing high-stakes gate halts before the stage runner is called', async () => {
  const deps = depsWithCalls();
  const input = baseInput({
    operatorGateResults: {
      'sanctioned-analysis': operatorGate('sanctioned-analysis')
    }
  });
  const result = await runL5CapstoneCycle(input, deps);

  assert.equal(result.ok, false);
  assert.equal(result.halt.reason, 'high-stakes-operator-gate-required');
  assert.equal(result.halt.stageId, 'claim');
  assert.equal(result.halt.runtimeOpened, false);
  assert.equal(
    deps.calls.some((call) => call.kind === 'stage' && call.stageId === 'claim'),
    false
  );
});

test('accepted operator gate permits high-stakes placeholder modeling', async () => {
  const deps = depsWithCalls();
  const result = await runL5CapstoneCycle(baseInput(), deps);
  const highStakesStages = result.stages.filter((stage) => stage.highStakes);

  assert.deepEqual(
    highStakesStages.map((stage) => stage.stageId),
    ['sanctioned-analysis', 'claim', 'writeup']
  );
  assert.equal(
    highStakesStages.every((stage) => stage.operatorGate?.verdict === 'accepted'),
    true
  );
  assert.equal(result.claimCreated, false);
  assert.equal(result.claimEdgeWritten, false);
});

test('direction memory block refuses killed or contradicted direction re-entry', async () => {
  const deps = depsWithCalls({
    checkDirectionStatus: async () => {
      deps.calls.push({ kind: 'direction-check' });
      return {
        verdict: 'block',
        blockingDirectionId: 'DIR-HGSOC-ENDO-001',
        blockingState: 'killed',
        doNotRepeatUnless: {
          kind: 'new-evidence',
          detail: 'fresh independent cohort'
        }
      };
    }
  });

  await assert.rejects(
    () => runL5CapstoneCycle(baseInput(), deps),
    errorCode('E_PHASE14_L5_DIRECTION_BLOCKED')
  );
  assert.deepEqual(
    deps.calls.filter((call) => call.kind === 'stage'),
    []
  );
});

test('direction memory allow-with-condition permits re-entry with matched condition', async () => {
  const condition = {
    kind: 'new-evidence',
    detail: 'fresh independent cohort'
  };
  const deps = depsWithCalls({
    checkDirectionStatus: async () => ({
      verdict: 'allow-with-condition',
      doNotRepeatUnless: condition,
      written: false
    })
  });
  const result = await runL5CapstoneCycle(baseInput({
    directionTarget: {
      directionId: 'DIR-HGSOC-ENDO-001',
      summary: 'CXCL13+ CD8 direction',
      satisfies: condition
    }
  }), deps);

  assert.equal(result.ok, true);
  assert.equal(result.directionMemory.verdict, 'allow-with-condition');
  assert.deepEqual(result.directionMemory.doNotRepeatUnless, condition);
});

test('direction memory allow-with-condition fails closed without a matched condition', async () => {
  const required = {
    kind: 'new-evidence',
    detail: 'fresh independent cohort'
  };

  for (const directionTarget of [
    {
      directionId: 'DIR-HGSOC-ENDO-001',
      summary: 'CXCL13+ CD8 direction'
    },
    {
      directionId: 'DIR-HGSOC-ENDO-001',
      summary: 'CXCL13+ CD8 direction',
      satisfies: {
        kind: 'new-evidence',
        detail: 'same cohort reanalysis'
      }
    }
  ]) {
    const deps = depsWithCalls({
      checkDirectionStatus: async () => {
        deps.calls.push({ kind: 'direction-check' });
        return {
          verdict: 'allow-with-condition',
          doNotRepeatUnless: required,
          written: false
        };
      }
    });

    await assert.rejects(
      () => runL5CapstoneCycle(baseInput({ directionTarget }), deps),
      errorCode('E_PHASE14_L5_DIRECTION_CONDITION_UNSATISFIED')
    );
    assert.deepEqual(
      deps.calls.filter((call) => call.kind === 'stage'),
      []
    );
  }
});

test('chat-backed proposal input is refused as authoritative state', async () => {
  const deps = depsWithCalls();

  await assert.rejects(
    () => runL5CapstoneCycle(baseInput({
      plannerProposal: {
        source: 'chat',
        text: 'Promote this result directly.'
      }
    }), deps),
    errorCode('E_PHASE14_L5_CHAT_AUTHORITY_FORBIDDEN')
  );
  assert.deepEqual(deps.calls, []);
});

test('planner output remains proposal-only and cannot become claim or export', async () => {
  const result = await runL5CapstoneCycle(baseInput({
    plannerProposal: {
      source: 'reviewed-planner',
      proposalId: 'proposal-002',
      promoteToClaim: true
    }
  }), depsWithCalls());

  assert.equal(result.proposalOnly, true);
  assert.equal(result.plannerProposal.promoteToClaim, false);
  assert.equal(result.biomedicalClaimAuthority, false);
  assert.equal(result.claimCreated, false);
  assert.equal(result.claimEdgeWritten, false);
  assert.equal(result.exportOpened, false);
  assert.equal(result.graphifyOpened, false);
});

test('review and relay verdict text cannot be scientific provenance', async () => {
  await assert.rejects(
    () => runL5CapstoneCycle(baseInput({
      provenanceRefs: [
        { kind: 'relay-verdict', ref: 'claude-accept.md' }
      ]
    }), depsWithCalls()),
    errorCode('E_PHASE14_L5_REVIEW_METADATA_NOT_PROVENANCE')
  );
});

test('L2 authoritative knowledge writes stay closed', async () => {
  const deps = depsWithCalls({
    writeAuthoritativeKnowledgePage: async () => {
      deps.calls.push({ kind: 'authoritative-write' });
    }
  });

  await assert.rejects(
    () => runL5CapstoneCycle(baseInput({
      authoritativeKnowledgeWrite: true
    }), deps),
    errorCode('E_PHASE14_L5_AUTHORITATIVE_WRITE_FORBIDDEN')
  );
  assert.equal(
    deps.calls.some((call) => call.kind === 'authoritative-write'),
    false
  );
});

test('source has no forbidden direct automation imports or paths', async () => {
  const source = await readFile(moduleUrl, 'utf8');

  assert.doesNotMatch(source, /node:child_process|from ['"]node:fs/u);
  assert.doesNotMatch(source, /provider-gateway|reviewed-api|from .*obdk|obdk\//iu);
  assert.doesNotMatch(source, /graphifyExecution|createClaimEdge/u);
  assert.doesNotMatch(source, /fingerprint\.ts|multi-parser|hermes-agent/iu);
});
