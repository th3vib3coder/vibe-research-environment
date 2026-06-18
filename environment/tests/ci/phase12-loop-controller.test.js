import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluatePhase12LoopStep
} from '../../phase12/loop-controller.js';
import {
  validLoopInput,
  default as validatePhase12LoopController
} from './phase12-loop-controller.js';

const NOW = '2026-06-18T00:10:00.000Z';

function evaluate(input) {
  return evaluatePhase12LoopStep(input, { now: input.now ?? NOW });
}

test('controller accepts a valid non-author ACCEPT without live run state', () => {
  const result = evaluate(validLoopInput());
  assert.equal(result.ok, true);
  assert.equal(result.finalState, 'ACCEPTED');
  assert.equal(result.terminal, true);
  assert.equal(result.stepCount, 1);
  assert.equal(result.runStateCreated, false);
  assert.equal(result.providerAutomationInvoked, false);
  assert.deepEqual(result.governanceEvents, []);
});

test('controller rejects reviewer self-ACCEPT through artifact semantics', () => {
  const input = validLoopInput();
  input.review.reviewer = 'codex';

  const result = evaluate(input);
  assert.equal(result.ok, false);
  assert.equal(result.finalState, 'SCHEMA_INVALID');
  assert(result.issues.some((issue) => issue.code === 'E_PHASE12_SELF_ACCEPT_FORBIDDEN'));
});

test('controller enforces iteration turn and wall-clock caps', () => {
  assert.equal(
    evaluate(validLoopInput({ iterationsUsed: 3 })).finalState,
    'ITERATION_LIMIT_REACHED'
  );
  assert.equal(evaluate(validLoopInput({ turnsUsed: 8 })).finalState, 'BUDGET_EXHAUSTED');
  assert.equal(
    evaluate(validLoopInput({ now: '2026-06-18T02:00:00.000Z' })).finalState,
    'STALE_CONTEXT'
  );
});

test('controller rejects stale run and explicit operator abort', () => {
  const stale = validLoopInput();
  stale.run.state = 'STALE';

  assert.equal(evaluate(stale).finalState, 'STALE_CONTEXT');
  assert.equal(evaluate(validLoopInput({ abortRequested: true })).finalState, 'ABORTED_BY_OPERATOR');
});

test('controller rejects provider gui multi-step and live writeback requests', () => {
  const provider = validLoopInput();
  provider.run.providerAutomationAllowed = true;
  assert.equal(evaluate(provider).finalState, 'SCHEMA_INVALID');

  const gui = validLoopInput();
  gui.run.guiAutomationAllowed = true;
  assert.equal(evaluate(gui).finalState, 'SCHEMA_INVALID');

  const multiStep = evaluate(validLoopInput({ requestedSteps: 2 }));
  assert.equal(multiStep.finalState, 'SCHEMA_INVALID');
  assert(multiStep.issues.some((issue) => issue.code === 'E_PHASE12_MULTI_STEP_FORBIDDEN'));

  const writeback = evaluate(validLoopInput({ writebackRequested: true }));
  assert.equal(writeback.finalState, 'SCHEMA_INVALID');
  assert(writeback.issues.some((issue) => issue.code === 'E_PHASE12_LIVE_WRITEBACK_FORBIDDEN'));
});

test('controller evidence refs are deterministic and sorted', () => {
  const input = validLoopInput();
  input.evidenceBundle.reviewArtifacts.push({
    path: 'aaa/review-priority.json',
    sha256: 'd'.repeat(64),
    type: 'review'
  });

  const first = evaluate(input);
  const second = evaluate(input);

  assert.deepEqual(first.evidenceRefs, second.evidenceRefs);
  assert.deepEqual(
    first.evidenceRefs.map((ref) => ref.path),
    [
      'aaa/review-priority.json',
      'candidate/candidate.md',
      'reviews/review-001.json',
      'validation/phase12-loop-controller.json'
    ]
  );
});

test('controller module has no filesystem write imports', async () => {
  const source = await readFile('environment/phase12/loop-controller.js', 'utf8');
  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
});

test('phase12 loop controller validator passes the production cases', async () => {
  await validatePhase12LoopController();
});
