import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  evaluatePhase10MultiDomainGate
} from '../../phase10/multi-domain-gate.js';

const closeouts = Object.freeze({
  wave10_1: {
    status: 'complete-operator-closure-go-recorded',
    commit: 'a'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_2: {
    status: 'closed-operator-go-recorded',
    commit: 'b'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_3: {
    status: 'closed-operator-go-recorded',
    commit: 'c'.repeat(40),
    ciConclusion: 'success'
  },
  wave10_4: {
    status: 'closed-operator-go-recorded',
    commit: 'd'.repeat(40),
    ciConclusion: 'success'
  }
});

export default async function validatePhase10MultiDomainGate() {
  const result = evaluatePhase10MultiDomainGate({
    operation: 'gate-check',
    domainIds: ['KDOM-ci-a', 'KDOM-ci-b'],
    classificationOnly: true,
    closeouts,
    exportPackagingDeferral: {
      id: 'W10.4-DEFERRED-EXPORT-PACKAGING-001',
      status: 'open'
    }
  });

  assert(result.ok, `Valid gate-check failed: ${JSON.stringify(result.issues)}`);
  assert(
    result.decision === 'eligible-for-future-hat-task',
    `Unexpected gate decision: ${result.decision}`
  );
  assert(result.authorizationGranted === false, 'Gate must not grant authorization');
  assert(result.performsOperation === false, 'Gate must not perform the operation');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-multi-domain-gate', validatePhase10MultiDomainGate);
}
