import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AssertionGraphError,
  materializeAssertionGraph
} from '../../phase10/assertion-graph.js';

const BASE_ASSERTION = Object.freeze({
  assertionId: 'ASSERT-graph-001',
  text: 'The source reports a measured expression value for IL6.',
  status: 'sourced',
  declaredKind: 'extractive-fact',
  cites: ['PROV-graph-001']
});

function assertion(overrides = {}) {
  return {
    ...BASE_ASSERTION,
    ...overrides
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof AssertionGraphError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test('assertion graph materializes publishable source assertions', () => {
  const result = materializeAssertionGraph({
    pageType: 'source',
    assertions: [assertion()]
  });

  assert.equal(result.pageRouting, 'publishable');
  assert.deepEqual(result.assertionGraph, [
    {
      assertionId: 'ASSERT-graph-001',
      text: 'The source reports a measured expression value for IL6.',
      status: 'sourced',
      declaredKind: 'extractive-fact',
      riskFlags: [],
      finalRouting: 'allowed',
      cites: ['PROV-graph-001']
    }
  ]);
});

test('concept causal risk routes to synthesis metadata without creating synthesis', () => {
  const result = materializeAssertionGraph({
    pageType: 'concept',
    assertions: [
      assertion({
        assertionId: 'ASSERT-graph-002',
        text: 'IL6 drives inflammatory signalling in resistant cells.',
        declaredKind: 'observed-association'
      })
    ]
  });

  assert.equal(result.pageRouting, 'requires-synthesis');
  assert.equal(result.createdSynthesisPages.length, 0);
  assert.equal(result.assertionGraph[0].finalRouting, 'auto-upgraded-to-synthesis');
  assert.deepEqual(result.assertionGraph[0].riskFlags, ['causal-or-mechanistic-language']);
});

test('source and entity positive risk flags reject as categorization errors', () => {
  for (const pageType of ['source', 'entity']) {
    expectCode(
      () => materializeAssertionGraph({
        pageType,
        assertions: [
          assertion({
            text: 'IL6 causes resistance through a pathway mechanism.',
            declaredKind: 'extractive-fact'
          })
        ]
      }),
      'E_PHASE10_ASSERTION_RISK_CATEGORIZATION'
    );
  }
});

test('negative risk scan cannot clear unsupported declared kind', () => {
  expectCode(
    () => materializeAssertionGraph({
      pageType: 'entity',
      assertions: [
        assertion({
          text: 'The entity page lists a short description.',
          declaredKind: 'causal-claim'
        })
      ]
    }),
    'E_PHASE10_ASSERTION_KIND_FOR_PAGE_TYPE'
  );
});

test('hedge causality and supposition route to hypothesis review', () => {
  const hedge = materializeAssertionGraph({
    pageType: 'concept',
    assertions: [
      assertion({
        text: 'This marker pattern may underlie resistant relapse.',
        declaredKind: 'observed-association'
      })
    ]
  });
  assert.equal(hedge.pageRouting, 'hypothesis-review');
  assert.equal(hedge.assertionGraph[0].finalRouting, 'routed-to-hypothesis-review');

  const supposition = materializeAssertionGraph({
    pageType: 'concept',
    assertions: [
      assertion({
        status: 'supposition',
        text: 'This marker is a future idea to test.',
        declaredKind: 'observed-association'
      })
    ]
  });
  assert.equal(supposition.pageRouting, 'hypothesis-review');
});

test('hypothesis risk flags remain advisory and isolated', () => {
  const result = materializeAssertionGraph({
    pageType: 'hypothesis',
    assertions: [
      assertion({
        status: 'supposition',
        text: 'IL6 may underlie an unestablished resistance mechanism.',
        declaredKind: 'mechanism'
      })
    ]
  });

  assert.equal(result.pageRouting, 'publishable');
  assert.deepEqual(result.assertionGraph[0].riskFlags, [
    'causal-or-mechanistic-language',
    'hedge-causality'
  ]);
  assert.equal(result.assertionGraph[0].finalRouting, 'allowed');
});

test('assertion edge references must resolve', () => {
  expectCode(
    () => materializeAssertionGraph({
      pageType: 'synthesis',
      assertions: [assertion({ edgeRefs: ['EDGE-missing'] })],
      claimEdges: [{ edgeId: 'EDGE-present' }]
    }),
    'E_PHASE10_ASSERTION_EDGE_REFERENCE_MISSING'
  );

  const result = materializeAssertionGraph({
    pageType: 'synthesis',
    assertions: [assertion({ edgeRefs: ['EDGE-present'] })],
    claimEdges: [{ edgeId: 'EDGE-present' }]
  });
  assert.deepEqual(result.assertionGraph[0].edgeRefs, ['EDGE-present']);
});
