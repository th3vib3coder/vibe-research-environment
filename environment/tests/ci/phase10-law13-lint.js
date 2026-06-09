import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  LAW13_CHECKS,
  lintPhase10Corpus
} from '../../phase10/law13-lint.js';

const REQUIRED_CHECKS = [
  'wiki-page-requires-provenance',
  'raw-document-requires-trust-tier',
  'assertion-cites-required',
  'query-not-provenance',
  'synthesis-not-cites-query',
  'synthesis-r2-audit-required',
  'transitive-isolation',
  'edge-reference-resolves',
  'edge-stale-or-superseded-marker-required',
  'domain-link-bidirectional-integrity',
  'phase10-domain-name-anti-clash'
];

function minimalValidCorpus() {
  return {
    wikiPages: [
      {
        pageId: 'WIKI-ci-source',
        type: 'source',
        assertionGraph: [
          {
            assertionId: 'ASSERT-ci-source',
            status: 'sourced',
            cites: [{ ref: 'PROV-ci-raw', role: 'supports' }]
          }
        ]
      },
      {
        pageId: 'WIKI-ci-synthesis',
        type: 'synthesis',
        r2Audit: { status: 'passed' },
        originQueryId: 'QUERY-ci',
        assertionGraph: [
          {
            assertionId: 'ASSERT-ci-synthesis',
            status: 'computed',
            cites: [{ ref: 'PROV-ci-edge', role: 'computes' }]
          }
        ]
      }
    ],
    rawDocuments: [
      { rawDocumentId: 'RAW-ci', trustTier: 'primary' }
    ],
    provenanceLinks: [
      { linkId: 'PROV-ci-raw', kind: 'raw-source', targetRef: { type: 'raw-document', id: 'RAW-ci' } },
      { linkId: 'PROV-ci-edge', kind: 'edge', targetRef: { type: 'edge', id: 'EDGE-ci' }, edgeMarker: 'current' }
    ],
    claimEdges: [
      { edgeId: 'EDGE-ci', lifecycleStatus: 'active' }
    ],
    domains: [
      { domainId: 'KDOM-ci', linkedObjectiveIds: ['OBJ-ci'] }
    ],
    objectives: [
      { objectiveId: 'OBJ-ci', domainId: 'KDOM-ci' }
    ],
    implementationRefs: ['phase10.knowledge-domain.v1']
  };
}

export default async function validatePhase10Law13Lint() {
  assert(
    JSON.stringify(LAW13_CHECKS) === JSON.stringify(REQUIRED_CHECKS),
    'Phase 10 LAW 13 lint check catalog drifted from the reviewed T10.0.3 set'
  );

  const valid = lintPhase10Corpus(minimalValidCorpus());
  assert(valid.ok, `Valid Phase 10 LAW 13 fixture failed: ${JSON.stringify(valid.issues)}`);

  const invalid = minimalValidCorpus();
  invalid.provenanceLinks.push({
    linkId: 'PROV-ci-query',
    kind: 'computed-artifact',
    sourcePath: 'wiki/queries/query-ci.md',
    targetRef: { type: 'query-record', id: 'QUERY-ci' }
  });
  invalid.wikiPages[1].assertionGraph[0].cites = [{ ref: 'PROV-ci-query', role: 'computes' }];
  const invalidResult = lintPhase10Corpus(invalid);
  assert(
    invalidResult.issues.some((issue) => issue.code === 'E_PHASE10_SYNTHESIS_NOT_CITES_QUERY'),
    'LAW 13 lint must fail closed when synthesis cites query output as evidence'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-law13-lint', validatePhase10Law13Lint);
}
