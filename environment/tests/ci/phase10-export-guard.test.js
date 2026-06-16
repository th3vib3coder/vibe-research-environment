import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPORT_GUARD_CHECKS,
  validatePhase10ExportAttempt
} from '../../phase10/export-guard.js';

const TIMESTAMP = '2026-06-16T00:00:00.000Z';
const PUBLIC_SHA = 'a'.repeat(64);

function recipe(overrides = {}) {
  return {
    schemaVersion: 'phase10.export-recipe.v1',
    exportRecipeId: 'EXPORT-guard-001',
    domainId: 'KDOM-guard',
    format: 'marp',
    sourcePageIds: ['WIKI-public-001'],
    compilePolicyId: 'CP-guard',
    guardPolicy: {
      requireFreshSources: true,
      requireCitations: true
    },
    createdAt: TIMESTAMP,
    ...overrides
  };
}

function source(overrides = {}) {
  return {
    pageId: 'WIKI-public-001',
    sensitivity: 'public',
    sensitivityCheck: { status: 'checked' },
    licenseCheck: {
      status: 'checked',
      exportAllowed: true,
      licenseId: 'CC-BY-4.0'
    },
    decisionUse: {
      classification: 'informational',
      computedBy: 'phase10-query-decision-use',
      computedAt: TIMESTAMP
    },
    ...overrides
  };
}

function manifest(overrides = {}) {
  return {
    exportManifestId: 'EXPORT-MANIFEST-001',
    sha256: PUBLIC_SHA,
    generatedAt: TIMESTAMP,
    metadataOnly: true,
    ...overrides
  };
}

function validAttempt(overrides = {}) {
  return {
    operation: 'export',
    sharingProfile: 'public-export',
    recipe: recipe(),
    sources: [source()],
    manifest: manifest(),
    remote: { label: 'private-review', visibility: 'private' },
    ...overrides
  };
}

function expectCode(input, code) {
  const result = validatePhase10ExportAttempt(input);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('export guard catalog includes reviewed T10.4.0 checks', () => {
  assert.deepEqual(EXPORT_GUARD_CHECKS, [
    'sharing-profile-public-export-required',
    'direct-public-git-push-denied',
    'license-check-required',
    'sensitivity-check-required',
    'internal-not-public-exportable',
    'sha-only-manifest-required',
    'not-for-decision-export-blocked',
    'render-behavior-forbidden'
  ]);
});

test('export guard accepts a public export with checked public sources and SHA metadata', () => {
  assert.deepEqual(validatePhase10ExportAttempt(validAttempt()), { ok: true, issues: [] });
});

test('public export requires public-export sharing profile', () => {
  for (const sharingProfile of ['local-private', 'private-team']) {
    expectCode(
      validAttempt({ sharingProfile }),
      'E_PHASE10_EXPORT_PUBLIC_PROFILE_REQUIRED'
    );
  }
});

test('direct git push to public-labeled remote is always denied', () => {
  expectCode(
    validAttempt({
      operation: 'git-push',
      sharingProfile: 'public-export',
      remote: { label: 'paper-public', visibility: 'public' }
    }),
    'E_PHASE10_EXPORT_PUBLIC_GIT_PUSH_DENIED'
  );
});

test('export requires license and sensitivity checks', () => {
  expectCode(
    validAttempt({
      sources: [source({ licenseCheck: undefined })]
    }),
    'E_PHASE10_EXPORT_LICENSE_CHECK_REQUIRED'
  );

  expectCode(
    validAttempt({
      sources: [source({ sensitivityCheck: undefined, sensitivity: undefined })]
    }),
    'E_PHASE10_EXPORT_SENSITIVITY_CHECK_REQUIRED'
  );
});

test('internal sensitivity is locally trackable but not public exportable', () => {
  const internalSource = source({ sensitivity: 'internal' });

  assert.deepEqual(
    validatePhase10ExportAttempt(validAttempt({
      operation: 'track-local',
      sharingProfile: 'local-private',
      sources: [internalSource]
    })),
    { ok: true, issues: [] }
  );

  expectCode(
    validAttempt({ sources: [internalSource] }),
    'E_PHASE10_EXPORT_INTERNAL_NOT_PUBLIC'
  );
});

test('export manifest allows SHA metadata only and rejects signature theater', () => {
  assert.deepEqual(validatePhase10ExportAttempt(validAttempt()), { ok: true, issues: [] });

  expectCode(
    validAttempt({
      manifest: manifest({
        signature: 'pretend-signature',
        signedBy: 'local-agent'
      })
    }),
    'E_PHASE10_EXPORT_SIGNATURE_THEATER_FORBIDDEN'
  );
});

test('not-for-decision query-derived sources cannot feed export', () => {
  expectCode(
    validAttempt({
      sources: [
        source({
          decisionUse: {
            classification: 'not-for-decision',
            computedBy: 'phase10-query-decision-use',
            computedAt: TIMESTAMP
          }
        })
      ]
    }),
    'E_PHASE10_EXPORT_NOT_FOR_DECISION_FORBIDDEN'
  );
});

test('recipes still reject render behavior and output paths', () => {
  for (const badRecipe of [
    recipe({ renderCommand: 'marp --pdf slides.md' }),
    recipe({ outputPath: 'wiki/presentations/rendered.marp.md' })
  ]) {
    expectCode(
      validAttempt({ recipe: badRecipe }),
      'E_PHASE10_EXPORT_RENDER_BEHAVIOR_FORBIDDEN'
    );
  }
});
