import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAW13_BRIDGE_CONTRACT_ID,
  REQUIRED_LAW13_BRIDGE_FIELDS,
  validateLaw13BridgeArtifact
} from '../../phase10/law13-bridge.js';
import { lintPhase10Corpus } from '../../phase10/law13-lint.js';

function validArtifact(overrides = {}) {
  return {
    artifactId: 'RELAY-REVIEW-001',
    transition: 'claimed',
    law13ReviewExtension: {
      contractId: LAW13_BRIDGE_CONTRACT_ID,
      law13StatusChecked: true,
      provenanceRefsChecked: true,
      queryNotProvenanceCheck: true,
      r2PathRequired: true,
      r2PathPresent: true,
      suppositionIsolationChecked: true
    },
    provenanceRefs: [
      { kind: 'raw-source', targetRef: { type: 'raw-document', id: 'RAW-001' } }
    ],
    metadataRefs: [
      { kind: 'phase12-relay-verdict', verdictId: 'VERDICT-001' },
      { kind: 'query-origin', queryId: 'QUERY-001', path: 'wiki/queries/query-001.md' }
    ],
    ...overrides
  };
}

function validResult(overrides = {}) {
  return validateLaw13BridgeArtifact(validArtifact(overrides));
}

function expectCode(artifact, code) {
  const result = validateLaw13BridgeArtifact(artifact);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(result.issues.some((issue) => issue.code === code), true, JSON.stringify(result.issues, null, 2));
}

test('bridge contract id and required field catalog are stable', () => {
  assert.equal(LAW13_BRIDGE_CONTRACT_ID, 'phase12.phase10-law13-review-extension');
  assert.deepEqual(REQUIRED_LAW13_BRIDGE_FIELDS, [
    'law13StatusChecked',
    'provenanceRefsChecked',
    'queryNotProvenanceCheck',
    'r2PathRequired',
    'r2PathPresent',
    'suppositionIsolationChecked'
  ]);
});

test('accepts a claimed artifact with all Phase 12 bridge checks satisfied', () => {
  assert.deepEqual(validResult(), { ok: true, issues: [] });
});

test('missing required extension field fails closed', () => {
  const artifact = validArtifact();
  delete artifact.law13ReviewExtension.provenanceRefsChecked;
  expectCode(artifact, 'E_PHASE10_LAW13_BRIDGE_FIELD_MISSING');
});

test('non-boolean required extension field fails closed', () => {
  const artifact = validArtifact({
    law13ReviewExtension: {
      ...validArtifact().law13ReviewExtension,
      law13StatusChecked: 'yes'
    }
  });
  expectCode(artifact, 'E_PHASE10_LAW13_BRIDGE_FIELD_TYPE');
});

test('relay verdict in provenance refs fails closed', () => {
  expectCode(
    validArtifact({
      provenanceRefs: [
        { kind: 'computed-artifact', targetRef: { type: 'phase12-relay-verdict', id: 'VERDICT-001' } }
      ]
    }),
    'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE'
  );
});

test('claimed transition fails when required R2 path is absent', () => {
  const artifact = validArtifact({
    law13ReviewExtension: {
      ...validArtifact().law13ReviewExtension,
      r2PathPresent: false
    }
  });
  expectCode(artifact, 'E_PHASE10_R2_PATH_REQUIRED');
});

test('non-claimed artifact may record required R2 path absence without pretending to be accepted', () => {
  const artifact = validArtifact({
    transition: 'draft',
    law13ReviewExtension: {
      ...validArtifact().law13ReviewExtension,
      r2PathPresent: false,
      suppositionIsolationChecked: false
    }
  });
  assert.deepEqual(validateLaw13BridgeArtifact(artifact), { ok: true, issues: [] });
});

test('query output used as provenance fails while query metadata is allowed', () => {
  expectCode(
    validArtifact({
      provenanceRefs: [
        { kind: 'computed-artifact', sourcePath: 'wiki/queries/query-001.md', targetRef: { type: 'query-record', id: 'QUERY-001' } }
      ],
      metadataRefs: [{ kind: 'query-origin', queryId: 'QUERY-001', path: 'wiki/queries/query-001.md' }]
    }),
    'E_PHASE10_QUERY_METADATA_NOT_PROVENANCE'
  );

  assert.deepEqual(validResult({
    provenanceRefs: [{ kind: 'raw-source', targetRef: { type: 'raw-document', id: 'RAW-001' } }],
    metadataRefs: [{ kind: 'query-origin', queryId: 'QUERY-001', path: 'wiki/queries/query-001.md' }]
  }), { ok: true, issues: [] });
});

test('claimed transition requires supposition isolation checked true', () => {
  const artifact = validArtifact({
    law13ReviewExtension: {
      ...validArtifact().law13ReviewExtension,
      suppositionIsolationChecked: false
    }
  });
  expectCode(artifact, 'E_PHASE10_SUPPOSITION_ISOLATION_UNCHECKED');
});

test('claimed transition fails when LAW 13 status checks are incomplete', () => {
  const artifact = validArtifact({
    law13ReviewExtension: {
      ...validArtifact().law13ReviewExtension,
      queryNotProvenanceCheck: false
    }
  });
  expectCode(artifact, 'E_PHASE10_LAW13_BRIDGE_CHECK_INCOMPLETE');
});

test('bridge validator remains distinct from T10.0.3 law13 lint catalog', () => {
  const lintResult = lintPhase10Corpus({
    wikiPages: [
      {
        pageId: 'WIKI-source-001',
        type: 'source',
        assertionGraph: [
          { assertionId: 'ASSERT-001', cites: [{ ref: 'PROV-relay-001', role: 'supports' }] }
        ]
      }
    ],
    rawDocuments: [{ rawDocumentId: 'RAW-001', trustTier: 'primary' }],
    provenanceLinks: [
      { linkId: 'PROV-relay-001', kind: 'computed-artifact', targetRef: { type: 'phase12-relay-verdict', id: 'VERDICT-001' } }
    ]
  });

  assert.equal(lintResult.issues.some((issue) => issue.code === 'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE'), true);
  assert.deepEqual(validResult(), { ok: true, issues: [] });
});

test('payload-shaped task registry extension is accepted by the bridge validator', () => {
  const artifact = validArtifact({
    law13ReviewExtension: undefined,
    payload: validArtifact().law13ReviewExtension
  });
  assert.deepEqual(validateLaw13BridgeArtifact(artifact), { ok: true, issues: [] });
});
