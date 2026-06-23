import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  ADVERSARIAL_VERDICT_PROVENANCE_CLASS,
  ADVERSARIAL_VERDICT_PROVENANCE_USE,
  Phase14AdversarialVerdictError,
  assertConfidenceUnchanged,
  assertNoScientificEvidenceAttachment,
  buildAdversarialVerdictMetadata,
  validateAdversarialVerdictMetadata
} from '../../../autonomous/l4/adversarial-verdict.js';

const repoRoot = process.cwd();
const modulePath = path.join(
  repoRoot,
  'environment/autonomous/l4/adversarial-verdict.js'
);

function errorCode(code) {
  return (error) => error instanceof Phase14AdversarialVerdictError
    && error.code === code;
}

describe('Phase 14 TL4.3 adversarial-verdict provenance boundary', () => {
  it('builds review-survival metadata without LAW13 or scientific authority', () => {
    const metadata = buildAdversarialVerdictMetadata({
      reviewId: 'REVIEW-TL4-3-001',
      reviewer: 'claude-code',
      verdict: 'ACCEPT'
    });

    assert.equal(metadata.provenanceClass, ADVERSARIAL_VERDICT_PROVENANCE_CLASS);
    assert.equal(metadata.provenanceUse, ADVERSARIAL_VERDICT_PROVENANCE_USE);
    assert.equal(metadata.law13Provenance, false);
    assert.equal(metadata.scientificEvidence, false);
    assert.equal(metadata.confidenceDelta, 0);
    assert.equal(metadata.runtimeOpened, false);
    assert.equal(validateAdversarialVerdictMetadata(metadata).ok, true);
  });

  it('rejects any attempt to promote the verdict to LAW13 provenance', () => {
    assert.throws(
      () => validateAdversarialVerdictMetadata({
        ...buildAdversarialVerdictMetadata({
          reviewId: 'REVIEW-TL4-3-002',
          reviewer: 'claude-code',
          verdict: 'ACCEPT'
        }),
        law13Provenance: true
      }),
      errorCode('E_PHASE14_ADVERSARIAL_VERDICT_LAW13_FORBIDDEN')
    );
  });

  it('rejects scientific-evidence authority and evidence-edge attachment', () => {
    assert.throws(
      () => validateAdversarialVerdictMetadata({
        ...buildAdversarialVerdictMetadata({
          reviewId: 'REVIEW-TL4-3-003',
          reviewer: 'claude-code',
          verdict: 'REDIRECT'
        }),
        scientificEvidence: true
      }),
      errorCode('E_PHASE14_ADVERSARIAL_VERDICT_SCIENCE_FORBIDDEN')
    );

    assert.throws(
      () => assertNoScientificEvidenceAttachment({
        schemaVersion: 'phase9.claim-edge.v1',
        edgeId: 'EDGE-TL4-3-001',
        fromId: 'CLAIM-HGSOC-ENDO-001',
        toId: 'CLAIM-HGSOC-ENDO-002',
        relation: 'supports',
        createdAt: '2026-06-23T00:00:00.000Z',
        metadata: buildAdversarialVerdictMetadata({
          reviewId: 'REVIEW-TL4-3-004',
          reviewer: 'claude-code',
          verdict: 'ACCEPT'
        })
      }),
      errorCode('E_PHASE14_ADVERSARIAL_VERDICT_EDGE_FORBIDDEN')
    );
  });

  it('rejects confidence mutation and proves metadata changes cannot alter confidence', () => {
    assert.throws(
      () => validateAdversarialVerdictMetadata({
        ...buildAdversarialVerdictMetadata({
          reviewId: 'REVIEW-TL4-3-005',
          reviewer: 'claude-code',
          verdict: 'ACCEPT'
        }),
        confidenceDelta: 0.1
      }),
      errorCode('E_PHASE14_ADVERSARIAL_VERDICT_CONFIDENCE_FORBIDDEN')
    );

    const before = {
      claimId: 'CLAIM-HGSOC-ENDO-001',
      confidence: 0.42,
      metadata: buildAdversarialVerdictMetadata({
        reviewId: 'REVIEW-TL4-3-006',
        reviewer: 'claude-code',
        verdict: 'REDIRECT'
      })
    };
    const after = {
      claimId: 'CLAIM-HGSOC-ENDO-001',
      confidence: 0.42
    };

    assert.equal(assertConfidenceUnchanged(before, after).ok, true);

    assert.throws(
      () => assertConfidenceUnchanged(before, { ...after, confidence: 0.43 }),
      errorCode('E_PHASE14_ADVERSARIAL_VERDICT_CONFIDENCE_FORBIDDEN')
    );
  });

  it('is safe by import and contains no runtime/provider/claim/export path', async () => {
    const before = globalThis.__tl43ImportSideEffectCount ?? 0;
    await import('../../../autonomous/l4/adversarial-verdict.js');
    assert.equal(globalThis.__tl43ImportSideEffectCount ?? 0, before);

    const source = await readFile(modulePath, 'utf8');
    assert.equal(source.includes('node:'), false);
    assert.equal(source.includes('child_process'), false);
    assert.equal(source.includes('provider-gateway'), false);
    assert.equal(source.includes('OBDK'), false);
    assert.equal(source.includes('realDataRead: true'), false);
    assert.equal(source.includes('reviewedApiUsed: true'), false);
    assert.equal(source.includes('claimExportOpened: true'), false);
    assert.equal(source.includes('graphifyOpened: true'), false);
    assert.equal(source.includes('unattendedRuntimeOpened: true'), false);
    assert.equal(source.includes('bin/vre'), false);
  });
});
