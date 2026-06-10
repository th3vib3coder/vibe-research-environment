import { assert, isDirectRun, runValidator } from './_helpers.js';

import {
  materializeAssertionGraph
} from '../../phase10/assertion-graph.js';

export default async function validatePhase10AssertionGraph() {
  const concept = materializeAssertionGraph({
    pageType: 'concept',
    assertions: [
      {
        assertionId: 'ASSERT-ci-graph',
        text: 'IL6 drives inflammatory signalling.',
        status: 'sourced',
        declaredKind: 'observed-association',
        cites: ['PROV-ci-graph']
      }
    ]
  });
  assert(
    concept.pageRouting === 'requires-synthesis',
    'Concept causal risk must route to synthesis metadata'
  );
  assert(
    concept.createdSynthesisPages.length === 0,
    'Assertion routing must not create synthesis pages as a side effect'
  );

  let rejected = false;
  try {
    materializeAssertionGraph({
      pageType: 'entity',
      assertions: [
        {
          assertionId: 'ASSERT-ci-entity',
          text: 'IL6 causes resistance.',
          status: 'sourced',
          declaredKind: 'extractive-fact',
          cites: ['PROV-ci-entity']
        }
      ]
    });
  } catch (error) {
    rejected = error?.code === 'E_PHASE10_ASSERTION_RISK_CATEGORIZATION';
  }
  assert(rejected, 'Entity causal risk must reject as a categorization error');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-assertion-graph', validatePhase10AssertionGraph);
}
