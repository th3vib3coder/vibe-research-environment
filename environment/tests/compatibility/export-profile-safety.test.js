import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { exportEligibility } from '../../lib/export-eligibility.js';

const CLAIM_ID = 'C-301';
const VERIFIED_CITATION = [{
  claimId: CLAIM_ID,
  citationId: 'CIT-301',
  verificationStatus: 'VERIFIED',
}];

test('strict-mode claims remain export-eligible without schema-validation artifacts', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'vre-export-compat-strict-'));

  try {
    const result = await exportEligibility(CLAIM_ID, createReader({
      heads: [{
        claimId: CLAIM_ID,
        currentStatus: 'PROMOTED',
        confidence: 0.92,
        governanceProfileAtCreation: 'strict',
      }],
      citations: VERIFIED_CITATION,
    }), {
      projectPath,
      requiredValidatedAfter: '2026-04-03T10:00:00Z',
    });

    assert.equal(result.eligible, true);
    assert.equal(result.governanceProfileAtCreation, 'strict');
    assert.equal(result.hasFreshSchemaValidation, false);
    assert.deepEqual(result.reasons, []);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('default-mode claims require a fresh schema-validation artifact before export', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'vre-export-compat-default-'));

  try {
    const reader = createReader({
      heads: [{
        claimId: CLAIM_ID,
        currentStatus: 'PROMOTED',
        confidence: 0.81,
        governanceProfileAtCreation: 'default',
      }],
      citations: VERIFIED_CITATION,
    });

    const blocked = await exportEligibility(CLAIM_ID, reader, {
      projectPath,
      requiredValidatedAfter: '2026-04-03T10:00:00Z',
    });

    assert.equal(blocked.eligible, false);
    assert.equal(blocked.governanceProfileAtCreation, 'default');
    assert.equal(blocked.hasFreshSchemaValidation, false);
    assert.match(blocked.reasons.join(','), /needs_fresh_schema_validation/u);

    await writeSchemaValidationArtifact(projectPath, {
      claimId: CLAIM_ID,
      validatedAt: '2026-04-03T10:05:00Z',
      validatorVersion: 'v1',
      ok: true,
      compatibilityMode: 'full',
      notes: null,
    });

    const allowed = await exportEligibility(CLAIM_ID, reader, {
      projectPath,
      requiredValidatedAfter: '2026-04-03T10:00:00Z',
    });

    assert.equal(allowed.eligible, true);
    assert.equal(allowed.hasFreshSchemaValidation, true);
    assert.deepEqual(allowed.reasons, []);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

function createReader({ heads = [], citations = [] } = {}) {
  return {
    async listClaimHeads() {
      return heads;
    },
    async listUnresolvedClaims() {
      return [];
    },
    async listCitationChecks(options = {}) {
      if (typeof options.claimId !== 'string') {
        return citations;
      }

      return citations.filter((entry) => entry.claimId === options.claimId);
    },
  };
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
    path.join(targetDir, `${payload.claimId}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}
