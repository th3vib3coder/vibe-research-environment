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
  'phase10-domain-name-anti-clash',
  'decision-use-computed-not-declared',
  'report-scope-required-for-report-class',
  'r2-audit-required-for-decision-grade'
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
    queryRecords: [
      {
        queryId: 'QUERY-ci',
        queryClass: 'lookup',
        status: 'complete',
        outputPath: 'wiki/queries/QUERY-ci.md',
        decisionUse: {
          classification: 'informational',
          computedBy: 'phase10-query-decision-use',
          computedAt: '2026-06-10T00:00:00.000Z'
        }
      }
    ],
    domains: [
      { domainId: 'KDOM-ci', objectiveLinks: ['OBJ-ci'] }
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

  const objectLinkShape = minimalValidCorpus();
  objectLinkShape.domains[0].objectiveLinks = [{ objectiveId: 'OBJ-ci' }];
  const objectLinkResult = lintPhase10Corpus(objectLinkShape);
  assert(
    objectLinkResult.ok,
    `LAW 13 lint must accept object-shaped objectiveLinks: ${JSON.stringify(objectLinkResult.issues)}`
  );

  const oneSided = minimalValidCorpus();
  oneSided.objectives[0].domainId = 'KDOM-other';
  const oneSidedResult = lintPhase10Corpus(oneSided);
  assert(
    oneSidedResult.issues.some((issue) => issue.code === 'E_PHASE10_DOMAIN_LINK_BIDIRECTIONAL_INTEGRITY'),
    'LAW 13 lint must fail closed for one-sided objectiveLinks domain bindings'
  );

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

  const declared = minimalValidCorpus();
  declared.queryRecords[0].decisionUse.declaredBy = 'author';
  const declaredResult = lintPhase10Corpus(declared);
  assert(
    declaredResult.issues.some((issue) => issue.code === 'E_PHASE10_DECISION_USE_COMPUTED_NOT_DECLARED'),
    'LAW 13 lint must fail closed for author-declared decisionUse'
  );

  const missingR2 = minimalValidCorpus();
  missingR2.queryRecords[0].queryClass = 'decision-support';
  missingR2.queryRecords[0].decisionUse.classification = 'decision-grade';
  const missingR2Result = lintPhase10Corpus(missingR2);
  assert(
    missingR2Result.issues.some((issue) => issue.code === 'E_PHASE10_R2_AUDIT_REQUIRED_FOR_DECISION_GRADE'),
    'LAW 13 lint must fail closed for decision-grade records without R2'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-law13-lint', validatePhase10Law13Lint);
}
