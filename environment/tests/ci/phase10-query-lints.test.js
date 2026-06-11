import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QUERY_LINT_CHECKS,
  lintPhase10QueryArtifacts
} from '../../phase10/query-lints.js';

const TIMESTAMP = '2026-06-10T00:00:00.000Z';
const QUERY_ID = 'QUERY-lint-001';

function record(overrides = {}) {
  return {
    queryId: QUERY_ID,
    queryClass: 'lookup',
    status: 'complete',
    outputPath: `wiki/queries/${QUERY_ID}.md`,
    outputBanner: {
      decisionUseClassification: 'informational',
      provenanceWarning: 'query-output-is-metadata-not-law13-provenance'
    },
    resultRefs: ['WIKI-source-001'],
    decisionUse: {
      classification: 'informational',
      computedBy: 'phase10-query-decision-use',
      computedAt: TIMESTAMP
    },
    ...overrides
  };
}

function output(overrides = {}) {
  return {
    queryId: QUERY_ID,
    path: `wiki/queries/${QUERY_ID}.md`,
    markdown: [
      `# ${QUERY_ID}`,
      '',
      '> query-output-is-metadata-not-law13-provenance',
      '> decision-use: informational',
      '',
      '## Results',
      '- WIKI-source-001'
    ].join('\n'),
    ...overrides
  };
}

function staleManifest(overrides = {}) {
  return {
    domainId: 'KDOM-query',
    generatedAt: '2026-06-09T00:00:00.000Z',
    expiresAt: '2026-06-09T12:00:00.000Z',
    ...overrides
  };
}

function validInput(overrides = {}) {
  return {
    now: TIMESTAMP,
    queryRecords: [record()],
    queryOutputs: [output()],
    manifests: [],
    promotions: [],
    evidenceRefs: [
      { refId: 'WIKI-source-001', lifecycleStatus: 'active' }
    ],
    ...overrides
  };
}

function expectCode(input, code) {
  const result = lintPhase10QueryArtifacts(input);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('query lint catalog includes the reviewed T10.3.2 checks', () => {
  assert.deepEqual(QUERY_LINT_CHECKS, [
    'query-output-metadata-warning-required',
    'query-output-status-banner-required',
    'contradiction-audit-full-enumeration-required',
    'stale-query-manifest-caveat-required',
    'query-promotion-reresolution-required',
    'stale-refuted-evidence-marker-required'
  ]);
});

test('query lint accepts a bounded metadata-only query artifact', () => {
  assert.deepEqual(lintPhase10QueryArtifacts(validInput()), { ok: true, issues: [] });
});

test('audit-grade contradiction output requires full enumeration', () => {
  expectCode(
    validInput({
      queryRecords: [
        record({
          queryClass: 'contradiction-audit',
          decisionUse: {
            classification: 'audit-grade',
            computedBy: 'phase10-query-decision-use',
            computedAt: TIMESTAMP
          }
        })
      ]
    }),
    'E_PHASE10_CONTRADICTION_ENUMERATION_REQUIRED'
  );

  assert.deepEqual(
    lintPhase10QueryArtifacts(validInput({
      queryRecords: [
        record({
          queryClass: 'contradiction-audit',
          qualityGates: { fullContradictionEnumeration: true },
          decisionUse: {
            classification: 'audit-grade',
            computedBy: 'phase10-query-decision-use',
            computedAt: TIMESTAMP
          }
        })
      ]
    })),
    { ok: true, issues: [] }
  );
});

test('incomplete and failed query outputs require a visible status banner', () => {
  for (const status of ['incomplete', 'failed']) {
    expectCode(
      validInput({
        queryRecords: [
          record({
            status,
            outputBanner: {
              decisionUseClassification: 'not-for-decision',
              provenanceWarning: 'query-output-is-metadata-not-law13-provenance'
            },
            decisionUse: {
              classification: 'not-for-decision',
              computedBy: 'phase10-query-decision-use',
              computedAt: TIMESTAMP
            }
          })
        ],
        queryOutputs: [
          output({
            markdown: [
              `# ${QUERY_ID}`,
              '',
              '> query-output-is-metadata-not-law13-provenance'
            ].join('\n')
          })
        ]
      }),
      'E_PHASE10_QUERY_STATUS_BANNER_REQUIRED'
    );
  }
});

test('query markdown requires a visible metadata-not-provenance warning', () => {
  expectCode(
    validInput({
      queryOutputs: [output({ markdown: `# ${QUERY_ID}\n\n## Results\n- WIKI-source-001` })]
    }),
    'E_PHASE10_QUERY_OUTPUT_WARNING_REQUIRED'
  );
});

test('stale manifest requires override and visible freshness caveat', () => {
  expectCode(
    validInput({ manifests: [staleManifest()] }),
    'E_PHASE10_QUERY_MANIFEST_FRESHNESS_CAVEAT_REQUIRED'
  );

  expectCode(
    validInput({
      manifests: [
        staleManifest({
          freshnessOverrideReason: 'operator accepted stale manifest for audit replay'
        })
      ],
      queryOutputs: [output()]
    }),
    'E_PHASE10_QUERY_MANIFEST_FRESHNESS_CAVEAT_REQUIRED'
  );

  assert.deepEqual(
    lintPhase10QueryArtifacts(validInput({
      manifests: [
        staleManifest({
          freshnessOverrideReason: 'operator accepted stale manifest for audit replay',
          freshnessCaveatVisible: true
        })
      ],
      queryOutputs: [
        output({
          markdown: `${output().markdown}\n> stale manifest override: operator accepted stale manifest for audit replay`
        })
      ]
    })),
    { ok: true, issues: [] }
  );
});

test('query promotion metadata requires original source re-resolution and R2', () => {
  expectCode(
    validInput({
      promotions: [
        {
          promotionId: 'QPROM-001',
          queryId: QUERY_ID,
          reResolvedOriginalSources: false
        }
      ]
    }),
    'E_PHASE10_QUERY_PROMOTION_RERESOLUTION_REQUIRED'
  );

  assert.deepEqual(
    lintPhase10QueryArtifacts(validInput({
      promotions: [
        {
          promotionId: 'QPROM-001',
          queryId: QUERY_ID,
          reResolvedOriginalSources: true,
          r2Audit: { status: 'passed', verdict: 'ACCEPT' }
        }
      ]
    })),
    { ok: true, issues: [] }
  );
});

test('stale, retracted, superseded, and refuted evidence require accepted marker', () => {
  for (const evidenceRef of [
    { refId: 'WIKI-source-001', lifecycleStatus: 'stale' },
    { refId: 'WIKI-source-001', lifecycleStatus: 'retracted' },
    { refId: 'WIKI-source-001', lifecycleStatus: 'superseded' },
    { refId: 'WIKI-source-001', qualityGates: { refutedCheck: 'failed' } }
  ]) {
    expectCode(
      validInput({ evidenceRefs: [evidenceRef] }),
      'E_PHASE10_QUERY_STALE_REFUTED_EVIDENCE_MARKER_REQUIRED'
    );
  }

  assert.deepEqual(
    lintPhase10QueryArtifacts(validInput({
      evidenceRefs: [
        {
          refId: 'WIKI-source-001',
          lifecycleStatus: 'superseded',
          acceptedMarker: 'accepted-superseded'
        }
      ]
    })),
    { ok: true, issues: [] }
  );
});
