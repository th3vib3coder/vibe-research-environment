import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  computeQueryDecisionUse
} from '../../phase10/query-decision-use.js';

export default async function validatePhase10QueryDecisionUse() {
  const lookup = computeQueryDecisionUse({
    queryClass: 'lookup',
    status: 'complete',
    computedAt: '2026-06-10T00:00:00.000Z'
  });
  assert(
    lookup.classification === 'informational',
    'lookup queries must be informational when complete'
  );

  const noR2 = computeQueryDecisionUse({
    queryClass: 'decision-support',
    status: 'complete',
    computedAt: '2026-06-10T00:00:00.000Z'
  });
  assert(
    noR2.classification === 'not-for-decision',
    'decision-support without accepted R2 must not become decision-grade'
  );

  const withR2 = computeQueryDecisionUse({
    queryClass: 'decision-support',
    status: 'complete',
    r2Audit: { status: 'passed', verdict: 'ACCEPT' },
    computedAt: '2026-06-10T00:00:00.000Z'
  });
  assert(
    withR2.classification === 'decision-grade',
    'decision-support with accepted R2 must become decision-grade'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-query-decision-use', validatePhase10QueryDecisionUse);
}
