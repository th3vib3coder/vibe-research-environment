import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  L0ActionSelectorError,
  selectNextScientificAction
} from '../../../autonomous/l0/action-selector.js';

function objective(overrides = {}) {
  return {
    objectiveId: 'OBJ-HGSOC-ENDO-L0',
    title: 'Review ovarian cancer and endometriosis evidence',
    ...overrides
  };
}

function gates() {
  return [
    {
      gateId: 'phase-14-tl0.3-next-scientific-action-selector-hat1-stop',
      status: 'in-progress'
    }
  ];
}

function candidate(overrides = {}) {
  return {
    id: 'review-literature',
    actionType: 'literature-review',
    summary: 'Review curated public literature bundle',
    priority: 10,
    direction: {
      directionId: 'DIR-LIT-01',
      summary: 'Review curated public literature bundle'
    },
    rationale: 'Need one bounded next step before data expansion.',
    ...overrides
  };
}

function allowedChecker(events = []) {
  return async (_projectRoot, options) => {
    events.push(options);
    return {
      ok: true,
      verdict: 'allow',
      directionId: options.directionId,
      summary: options.summary,
      written: false
    };
  };
}

function blockingChecker(record = {}) {
  return async (_projectRoot, options) => ({
    ok: true,
    verdict: 'block',
    directionId: options.directionId,
    summary: options.summary,
    blockingDirectionId: record.directionId ?? 'DIR-KILLED',
    blockingSummary: record.summary ?? options.summary,
    blockingState: record.state ?? 'killed',
    doNotRepeatUnless: record.doNotRepeatUnless ?? {
      kind: 'new-evidence',
      detail: 'fresh replicated cohort'
    },
    evidenceRefs: record.evidenceRefs ?? ['evidence:direction-kill']
  });
}

function allowWithConditionChecker(condition) {
  return async (_projectRoot, options) => ({
    ok: true,
    verdict: 'allow-with-condition',
    directionId: options.directionId,
    summary: options.summary,
    blockingDirectionId: 'DIR-CONDITIONALLY-REVIVED',
    blockingSummary: options.summary,
    blockingState: 'contradicted',
    doNotRepeatUnless: condition,
    evidenceRefs: ['evidence:condition-satisfied']
  });
}

function validInput(overrides = {}) {
  return {
    projectRoot: '/tmp/vre-tl0-3',
    objectiveRecord: objective(),
    openGateRecords: gates(),
    candidates: [candidate()],
    instinctWeights: {},
    ...overrides
  };
}

function errorCode(code) {
  return (error) => error instanceof L0ActionSelectorError && error.code === code;
}

test('fails closed when durable objective, gates, or direction checker are missing', async () => {
  await assert.rejects(
    () => selectNextScientificAction(validInput({ objectiveRecord: null }), {
      checkDirection: allowedChecker()
    }),
    errorCode('E_L0_SELECTOR_OBJECTIVE_MISSING')
  );

  await assert.rejects(
    () => selectNextScientificAction(validInput({ openGateRecords: null }), {
      checkDirection: allowedChecker()
    }),
    errorCode('E_L0_SELECTOR_OPEN_GATES_MISSING')
  );

  await assert.rejects(
    () => selectNextScientificAction(validInput({
      projectRoot: null,
      directionProjection: null
    })),
    errorCode('E_L0_SELECTOR_DIRECTION_READER_MISSING')
  );
});

test('valid allowed candidates produce exactly one proposal and one rationale artifact', async () => {
  const checks = [];
  const result = await selectNextScientificAction(validInput(), {
    checkDirection: allowedChecker(checks)
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposalOnly, true);
  assert.equal(result.actionExecuted, false);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposal.actionId, 'review-literature');
  assert.equal(result.proposal.requiresOperatorGate, false);
  assert.equal(result.rationaleArtifact.selectedAction.actionId, 'review-literature');
  assert.equal(result.rationaleArtifact.objective.objectiveId, 'OBJ-HGSOC-ENDO-L0');
  assert.deepEqual(checks.map((entry) => entry.directionId), ['DIR-LIT-01']);
  assert.doesNotThrow(() => JSON.stringify(result.rationaleArtifact));
});

test('candidate ordering is deterministic and independent of input order', async () => {
  const first = candidate({
    id: 'b-action',
    actionType: 'analysis',
    summary: 'B action',
    priority: 10,
    direction: { directionId: 'DIR-B', summary: 'B action' }
  });
  const second = candidate({
    id: 'a-action',
    actionType: 'analysis',
    summary: 'A action',
    priority: 10,
    direction: { directionId: 'DIR-A', summary: 'A action' }
  });

  const resultOne = await selectNextScientificAction(validInput({
    candidates: [first, second]
  }), { checkDirection: allowedChecker() });
  const resultTwo = await selectNextScientificAction(validInput({
    candidates: [second, first]
  }), { checkDirection: allowedChecker() });

  assert.equal(resultOne.proposal.actionId, 'a-action');
  assert.equal(resultTwo.proposal.actionId, 'a-action');
});

test('killed matching direction blocks the proposal and exposes the condition', async () => {
  const result = await selectNextScientificAction(validInput(), {
    checkDirection: blockingChecker({
      directionId: 'DIR-LIT-01',
      state: 'killed',
      doNotRepeatUnless: {
        kind: 'new-evidence',
        detail: 'fresh replicated cohort'
      },
      evidenceRefs: ['evidence:killed-direction']
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.proposal, null);
  assert.equal(result.blocked.blockingDirectionId, 'DIR-LIT-01');
  assert.equal(result.blocked.blockingState, 'killed');
  assert.deepEqual(result.blocked.doNotRepeatUnless, {
    kind: 'new-evidence',
    detail: 'fresh replicated cohort'
  });
});

test('contradicted matching direction blocks with evidence refs', async () => {
  const result = await selectNextScientificAction(validInput(), {
    checkDirection: blockingChecker({
      directionId: 'DIR-CONTRA',
      state: 'contradicted',
      evidenceRefs: ['r2:negative-replication']
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.blocked.blockingState, 'contradicted');
  assert.deepEqual(result.blocked.evidenceRefs, ['r2:negative-replication']);
});

test('satisfied doNotRepeatUnless returns allow-with-condition, not silent allow', async () => {
  const condition = {
    kind: 'new-evidence',
    detail: 'fresh replicated cohort'
  };
  const result = await selectNextScientificAction(validInput({
    candidates: [
      candidate({
        direction: {
          directionId: 'DIR-CONDITIONALLY-REVIVED',
          summary: 'Review curated public literature bundle',
          satisfies: condition
        }
      })
    ]
  }), {
    checkDirection: allowWithConditionChecker(condition)
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.directionVerdict, 'allow-with-condition');
  assert.deepEqual(result.proposal.doNotRepeatUnless, condition);
  assert.equal(result.rationaleArtifact.directionCheck.verdict, 'allow-with-condition');
});

test('LAW 12 INSTINCT can rank allowed candidates but never override a block', async () => {
  const lower = candidate({
    id: 'method-check',
    actionType: 'method-review',
    summary: 'Check method appendix',
    priority: 2,
    direction: { directionId: 'DIR-METHOD', summary: 'Check method appendix' }
  });
  const boosted = candidate({
    id: 'biomarker-leap',
    actionType: 'dataset-widening',
    summary: 'Widen to a speculative biomarker dataset',
    priority: 1,
    direction: { directionId: 'DIR-BLOCKED', summary: 'Widen to a speculative biomarker dataset' }
  });

  const allowed = await selectNextScientificAction(validInput({
    candidates: [lower, boosted],
    instinctWeights: {
      'biomarker-leap': 20
    }
  }), {
    checkDirection: allowedChecker()
  });
  assert.equal(allowed.proposal.actionId, 'biomarker-leap');

  const blocked = await selectNextScientificAction(validInput({
    candidates: [lower, boosted],
    instinctWeights: {
      'biomarker-leap': 20
    }
  }), {
    checkDirection: async (_projectRoot, options) => {
      if (options.directionId === 'DIR-BLOCKED') {
        return blockingChecker({ directionId: 'DIR-BLOCKED' })(_projectRoot, options);
      }
      return allowedChecker()(_projectRoot, options);
    }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blocked.blockingDirectionId, 'DIR-BLOCKED');
});

test('injected artifact writer runs before return and failure fails closed', async () => {
  const writes = [];
  const result = await selectNextScientificAction(validInput(), {
    checkDirection: allowedChecker(),
    writeRationaleArtifact: async (artifact) => {
      writes.push(artifact.selectedAction.actionId);
      return { artifactPath: '/tmp/rationale.json' };
    }
  });

  assert.deepEqual(writes, ['review-literature']);
  assert.equal(result.rationaleArtifactPath, '/tmp/rationale.json');

  await assert.rejects(
    () => selectNextScientificAction(validInput(), {
      checkDirection: allowedChecker(),
      writeRationaleArtifact: async () => {
        throw new Error('disk denied');
      }
    }),
    errorCode('E_L0_SELECTOR_ARTIFACT_WRITE_FAILED')
  );
});

test('high-stakes actions are proposal-only and require the future TL0.4 gate', async () => {
  const result = await selectNextScientificAction(validInput({
    candidates: [
      candidate({
        id: 'high-stakes',
        highStakes: true,
        actionType: 'clinical-interpretation',
        summary: 'Draft clinical interpretation for supervisor review'
      })
    ]
  }), {
    checkDirection: allowedChecker()
  });

  assert.equal(result.proposal.proposalOnly, true);
  assert.equal(result.proposal.requiresOperatorGate, true);
  assert.equal(result.proposal.requiredGate, 'TL0.4');
  assert.equal(result.actionExecuted, false);
});

test('direction projection can be used without reading a live direction store', async () => {
  const result = await selectNextScientificAction(validInput({
    projectRoot: null,
    directionProjection: {
      'DIR-LIT-01': {
        directionId: 'DIR-LIT-01',
        state: 'tried',
        summary: 'Review curated public literature bundle'
      }
    }
  }));

  assert.equal(result.ok, true);
  assert.equal(result.proposal.actionId, 'review-literature');
});

test('source has no forbidden runtime imports or lifecycle writers', async () => {
  const source = await readFile(
    new URL('../../../autonomous/l0/action-selector.js', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(source, /recordDirection|createClaimEdge|promoteClaim/u);
  assert.doesNotMatch(source, /from 'node:fs|from "node:fs|child_process|provider|obdk/u);
  assert.doesNotMatch(source, /environment\/claims|edges\.jsonl|graphifyExecution/u);
});
