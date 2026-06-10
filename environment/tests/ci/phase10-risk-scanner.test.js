import assert from 'node:assert/strict';
import test from 'node:test';

import {
  scanAssertionRisk
} from '../../phase10/risk-scanner.js';

test('risk scanner detects causal, mechanism, and hedge signals deterministically', () => {
  assert.deepEqual(
    scanAssertionRisk({
      text: 'IL6 drives inflammatory signalling through a JAK pathway mechanism.'
    }),
    ['causal-or-mechanistic-language']
  );

  assert.deepEqual(
    scanAssertionRisk({
      text: 'The marker pattern may underlie resistance and suggests that a review is needed.'
    }),
    ['hedge-causality']
  );

  assert.deepEqual(
    scanAssertionRisk({
      text: 'IL6 may underlie a pathway that causes inflammatory resistance.'
    }),
    ['causal-or-mechanistic-language', 'hedge-causality']
  );
});

test('negative risk scan is empty only for unsupported-signal absence', () => {
  assert.deepEqual(
    scanAssertionRisk({
      text: 'The source reports a measured expression value for IL6.'
    }),
    []
  );
});
