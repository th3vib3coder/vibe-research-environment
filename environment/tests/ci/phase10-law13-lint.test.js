import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAW13_CHECKS,
  lintPhase10Corpus
} from '../../phase10/law13-lint.js';

function validCorpus(overrides = {}) {
  const corpus = {
    wikiPages: [
      {
        pageId: 'WIKI-source-001',
        type: 'source',
        path: 'wiki/source/source-001.md',
        domainId: 'KDOM-main',
        assertionGraph: [
          {
            assertionId: 'ASSERT-001',
            status: 'sourced',
            cites: [{ ref: 'PROV-raw-001', role: 'supports' }]
          }
        ]
      },
      {
        pageId: 'WIKI-synthesis-001',
        type: 'synthesis',
        path: 'wiki/syntheses/topic.md',
        domainId: 'KDOM-main',
        r2Audit: { status: 'passed', reviewer: 'reviewer-2', reviewedAt: '2026-06-09T10:00:00.000Z' },
        assertionGraph: [
          {
            assertionId: 'ASSERT-002',
            status: 'computed',
            cites: [{ ref: 'PROV-edge-001', role: 'computes' }]
          }
        ],
        originQueryId: 'QUERY-001'
      },
      {
        pageId: 'WIKI-hypothesis-001',
        type: 'hypothesis',
        path: 'wiki/hypotheses/hypothesis-001.md',
        domainId: 'KDOM-main',
        nexusStatus: 'not-established',
        assertionGraph: [
          {
            assertionId: 'ASSERT-HYP-001',
            status: 'supposition',
            cites: [{ ref: 'PROV-raw-001', role: 'inspires' }]
          }
        ]
      }
    ],
    rawDocuments: [
      {
        rawDocumentId: 'RAW-001',
        trustTier: 'primary',
        sourceLocator: { kind: 'doi', uri: '10.0000/example' }
      }
    ],
    provenanceLinks: [
      {
        linkId: 'PROV-raw-001',
        kind: 'raw-source',
        targetRef: { type: 'raw-document', id: 'RAW-001' }
      },
      {
        linkId: 'PROV-edge-001',
        kind: 'edge',
        targetRef: { type: 'edge', id: 'EDGE-001' },
        edgeMarker: 'current'
      }
    ],
    queryRecords: [
      {
        queryId: 'QUERY-001',
        path: 'wiki/queries/query-001.md',
        decisionUse: { classification: 'context-only' }
      }
    ],
    claimEdges: [
      { edgeId: 'EDGE-001', relation: 'supports', lifecycleStatus: 'active' }
    ],
    domains: [
      { domainId: 'KDOM-main', linkedObjectiveIds: ['OBJ-001'] }
    ],
    objectives: [
      { objectiveId: 'OBJ-001', domainId: 'KDOM-main' }
    ],
    implementationRefs: [
      'phase10.knowledge-domain.v1'
    ],
    relayVerdicts: [
      { verdictId: 'RELAY-001', metadataOnly: true }
    ],
    ...overrides
  };

  return corpus;
}

function expectCode(corpus, code) {
  const result = lintPhase10Corpus(corpus);
  assert.equal(result.ok, false, `expected lint to fail with ${code}`);
  assert.equal(result.issues.some((issue) => issue.code === code), true, JSON.stringify(result.issues, null, 2));
}

test('phase10 LAW 13 check catalog includes the reviewed lint foundation set', () => {
  assert.deepEqual(LAW13_CHECKS, [
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
  ]);
});

test('phase10 LAW 13 accepts a fully grounded corpus', () => {
  assert.deepEqual(lintPhase10Corpus(validCorpus()), { ok: true, issues: [] });
});

test('wiki page with uncited assertion fails', () => {
  const corpus = validCorpus();
  corpus.wikiPages[0].assertionGraph[0].cites = [];
  expectCode(corpus, 'E_PHASE10_ASSERTION_CITES_REQUIRED');
});

test('page-level provenance does not satisfy assertion-level citations', () => {
  const corpus = validCorpus();
  corpus.wikiPages[0].provenance = ['PROV-raw-001'];
  delete corpus.wikiPages[0].assertionGraph[0].cites;
  expectCode(corpus, 'E_PHASE10_WIKI_PAGE_REQUIRES_PROVENANCE');
});

test('raw document without trust tier fails', () => {
  const corpus = validCorpus();
  delete corpus.rawDocuments[0].trustTier;
  expectCode(corpus, 'E_PHASE10_RAW_DOCUMENT_REQUIRES_TRUST_TIER');
});

test('query result cited as authoritative provenance fails', () => {
  const corpus = validCorpus();
  corpus.provenanceLinks.push({
    linkId: 'PROV-query-001',
    kind: 'computed-artifact',
    sourcePath: 'wiki/queries/query-001.md',
    targetRef: { type: 'query-record', id: 'QUERY-001' }
  });
  corpus.wikiPages[0].assertionGraph[0].cites = [{ ref: 'PROV-query-001', role: 'supports' }];
  expectCode(corpus, 'E_PHASE10_QUERY_NOT_PROVENANCE');
});

test('synthesis cannot cite a query output as source evidence', () => {
  const corpus = validCorpus();
  corpus.provenanceLinks.push({
    linkId: 'PROV-query-001',
    kind: 'computed-artifact',
    sourcePath: 'wiki/queries/query-001.md',
    targetRef: { type: 'query-record', id: 'QUERY-001' }
  });
  corpus.wikiPages[1].assertionGraph[0].cites = [{ ref: 'PROV-query-001', role: 'computes' }];
  expectCode(corpus, 'E_PHASE10_SYNTHESIS_NOT_CITES_QUERY');
});

test('synthesis without R2 audit fails', () => {
  const corpus = validCorpus();
  delete corpus.wikiPages[1].r2Audit;
  expectCode(corpus, 'E_PHASE10_SYNTHESIS_R2_AUDIT_REQUIRED');
});

test('authoritative page citing hypothesis fails transitive isolation', () => {
  const corpus = validCorpus();
  corpus.provenanceLinks.push({
    linkId: 'PROV-hypothesis-001',
    kind: 'computed-artifact',
    targetRef: { type: 'wiki-page', id: 'WIKI-hypothesis-001' }
  });
  corpus.wikiPages[0].assertionGraph[0].cites = [{ ref: 'PROV-hypothesis-001', role: 'supports' }];
  expectCode(corpus, 'E_PHASE10_TRANSITIVE_ISOLATION');
});

test('missing EDGE reference fails', () => {
  const corpus = validCorpus();
  corpus.provenanceLinks[1].targetRef.id = 'EDGE-missing';
  expectCode(corpus, 'E_PHASE10_EDGE_REFERENCE_RESOLVES');
});

test('stale edge reference without marker fails', () => {
  const corpus = validCorpus();
  corpus.claimEdges[0].lifecycleStatus = 'superseded';
  delete corpus.provenanceLinks[1].edgeMarker;
  expectCode(corpus, 'E_PHASE10_EDGE_STALE_MARKER_REQUIRED');
});

test('one-sided domain link fails', () => {
  const corpus = validCorpus();
  corpus.objectives[0].domainId = 'KDOM-other';
  expectCode(corpus, 'E_PHASE10_DOMAIN_LINK_BIDIRECTIONAL_INTEGRITY');
});

test('implementation-facing phase10.domain.v1 reference fails', () => {
  const corpus = validCorpus({ implementationRefs: ['phase10.domain.v1'] });
  expectCode(corpus, 'E_PHASE10_DOMAIN_NAME_ANTI_CLASH');
});

test('Phase 12 relay verdict cannot be used as provenance', () => {
  const corpus = validCorpus();
  corpus.provenanceLinks.push({
    linkId: 'PROV-relay-001',
    kind: 'computed-artifact',
    targetRef: { type: 'phase12-relay-verdict', id: 'RELAY-001' }
  });
  corpus.wikiPages[0].assertionGraph[0].cites = [{ ref: 'PROV-relay-001', role: 'supports' }];
  expectCode(corpus, 'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE');
});

test('query origin metadata is allowed when not used as evidence', () => {
  const corpus = validCorpus();
  corpus.wikiPages[1].originQueryId = 'QUERY-001';
  assert.deepEqual(lintPhase10Corpus(corpus), { ok: true, issues: [] });
});
