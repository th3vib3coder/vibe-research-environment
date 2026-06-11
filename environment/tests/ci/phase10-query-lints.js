import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  lintPhase10QueryArtifacts
} from '../../phase10/query-lints.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';

export default async function validatePhase10QueryLints() {
  const result = lintPhase10QueryArtifacts({
    now: TIMESTAMP,
    queryRecords: [
      {
        queryId: 'QUERY-ci-query-lints',
        queryClass: 'lookup',
        status: 'complete',
        outputPath: 'wiki/queries/QUERY-ci-query-lints.md',
        outputBanner: {
          decisionUseClassification: 'informational',
          provenanceWarning: 'query-output-is-metadata-not-law13-provenance'
        },
        resultRefs: ['WIKI-ci-source'],
        decisionUse: {
          classification: 'informational',
          computedBy: 'phase10-query-decision-use',
          computedAt: TIMESTAMP
        }
      }
    ],
    queryOutputs: [
      {
        queryId: 'QUERY-ci-query-lints',
        path: 'wiki/queries/QUERY-ci-query-lints.md',
        markdown: [
          '# QUERY-ci-query-lints',
          '',
          '> query-output-is-metadata-not-law13-provenance',
          '> decision-use: informational',
          '',
          '## Results',
          '- WIKI-ci-source'
        ].join('\n')
      }
    ],
    evidenceRefs: [
      { refId: 'WIKI-ci-source', lifecycleStatus: 'active' }
    ]
  });

  assert(result.ok, `Valid query-lints fixture failed: ${JSON.stringify(result.issues)}`);
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-query-lints', validatePhase10QueryLints);
}
