import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  exportEligibility,
  ExportEligibilityValidationError,
  EXPORT_ELIGIBILITY_REASON_CODES,
  PROFILE_SAFETY_MODES,
} from '../../lib/export-eligibility.js';

const CLAIM_ID = 'C-001';
const ISO_DATE = '2026-04-02T12:00:00Z';

test('export eligibility allows a promoted strict-mode claim with verified citations', async () => {
  const result = await exportEligibility(CLAIM_ID, createReader({
    heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.91, governanceProfileAtCreation: 'strict' }],
    citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
  }));

  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.profileSafetyMode, PROFILE_SAFETY_MODES.full);
  assert.equal(result.hasFreshSchemaValidation, false);
});

test('export eligibility blocks non-promoted lifecycle states and keeps review debt diagnostic', async () => {
  for (const currentStatus of ['CREATED', 'KILLED', 'DISPUTED']) {
    const result = await exportEligibility(CLAIM_ID, createReader({
      heads: [{ claimId: CLAIM_ID, currentStatus, confidence: 0.5, governanceProfileAtCreation: 'strict' }],
      unresolvedClaims: [{ claimId: CLAIM_ID }],
      citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
    }));

    assert.equal(result.eligible, false);
    assert(result.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.notPromoted));
    assert(result.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.reviewDebtSignal));
  }
});

test('export eligibility blocks zero and unverified citations', async () => {
  const zeroCitations = await exportEligibility(CLAIM_ID, createReader({
    heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.9, governanceProfileAtCreation: 'strict' }],
  }));
  assert.equal(zeroCitations.eligible, false);
  assert.deepEqual(zeroCitations.reasons, [EXPORT_ELIGIBILITY_REASON_CODES.zeroCitations]);

  const unverified = await exportEligibility(CLAIM_ID, createReader({
    heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.9, governanceProfileAtCreation: 'strict' }],
    citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'PENDING' }],
  }));
  assert.equal(unverified.eligible, false);
  assert.deepEqual(unverified.reasons, [EXPORT_ELIGIBILITY_REASON_CODES.unverifiedCitations]);
});

test('export eligibility requires fresh schema validation for non-strict claims', async () => {
  const projectPath = await createTempProject();

  try {
    const blocked = await exportEligibility(CLAIM_ID, createReader({
      heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.9, governanceProfileAtCreation: 'default' }],
      citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
    }), { projectPath });

    assert.equal(blocked.eligible, false);
    assert(blocked.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.needsFreshSchemaValidation));

    await writeSchemaValidationArtifact(projectPath, {
      claimId: CLAIM_ID,
      validatedAt: ISO_DATE,
      validatorVersion: 'v1',
      ok: true,
      compatibilityMode: 'full',
      notes: null,
    });

    const allowed = await exportEligibility(CLAIM_ID, createReader({
      heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.9, governanceProfileAtCreation: 'default' }],
      citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
    }), { projectPath, requiredValidatedAfter: '2026-04-02T11:00:00Z' });

    assert.equal(allowed.eligible, true);
    assert.equal(allowed.hasFreshSchemaValidation, true);
    assert.deepEqual(allowed.reasons, []);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export eligibility degrades honestly when governance profile metadata is unavailable', async () => {
  const projectPath = await createTempProject();

  try {
    await writeSchemaValidationArtifact(projectPath, {
      claimId: CLAIM_ID,
      validatedAt: ISO_DATE,
      validatorVersion: 'v1',
      ok: true,
      compatibilityMode: 'degraded_compatibility',
      notes: 'Profile metadata unavailable.',
    });

    const result = await exportEligibility(CLAIM_ID, createReader({
      heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.88 }],
      citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
    }), { projectPath });

    assert.equal(result.eligible, true);
    assert.equal(result.profileSafetyMode, PROFILE_SAFETY_MODES.degradedCompatibility);
    assert(result.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.missingGovernanceProfileMetadata));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export eligibility fails closed on invalid schema-validation artifacts', async () => {
  const projectPath = await createTempProject();

  try {
    await writeSchemaValidationArtifact(projectPath, {
      claimId: 'CLAIM-001',
      validatedAt: ISO_DATE,
      validatorVersion: 'v1',
      ok: true,
    });

    await assert.rejects(
      () => exportEligibility(CLAIM_ID, createReader({
        heads: [{ claimId: CLAIM_ID, currentStatus: 'PROMOTED', confidence: 0.9, governanceProfileAtCreation: 'default' }],
        citations: [{ claimId: CLAIM_ID, citationId: 'CIT-001', verificationStatus: 'VERIFIED' }],
      }), { projectPath }),
      ExportEligibilityValidationError,
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

function createReader({
  heads = [],
  unresolvedClaims = [],
  citations = [],
} = {}) {
  return {
    async listClaimHeads() {
      return heads;
    },
    async listUnresolvedClaims() {
      return unresolvedClaims;
    },
    async listCitationChecks(options = {}) {
      if (options.claimId == null) {
        return citations;
      }

      return citations.filter((citation) => citation.claimId === options.claimId);
    },
  };
}

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-export-eligibility-test-'));
}

async function writeSchemaValidationArtifact(projectPath, payload) {
  const targetDir = path.join(
    projectPath,
    '.vibe-science-environment',
    'governance',
    'schema-validation',
  );
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, `${CLAIM_ID}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}
