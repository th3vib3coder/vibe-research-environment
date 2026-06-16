export const EXPORT_GUARD_CHECKS = Object.freeze([
  'sharing-profile-public-export-required',
  'direct-public-git-push-denied',
  'license-check-required',
  'sensitivity-check-required',
  'internal-not-public-exportable',
  'sha-only-manifest-required',
  'not-for-decision-export-blocked',
  'render-behavior-forbidden'
]);

const PUBLIC_EXPORT_PROFILE = 'public-export';
const PUBLIC_SENSITIVITY = 'public';
const INTERNAL_SENSITIVITY = 'internal';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SIGNATURE_FIELDS = Object.freeze([
  'signature',
  'signatureAlgorithm',
  'signedBy',
  'cryptographicSignature'
]);
const RENDER_BEHAVIOR_FIELDS = Object.freeze([
  'renderCommand',
  'outputPath',
  'outputDir',
  'renderedOutputPath',
  'behaviorPaths'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sharingProfileFor(attempt) {
  return attempt?.sharingProfile ?? attempt?.domain?.sharingProfile;
}

function remoteIsPublic(remote) {
  return remote?.publicLabeled === true
    || remote?.visibility === 'public'
    || remote?.label === 'public';
}

function hasCheckedLicense(source) {
  return source?.licenseCheck?.status === 'checked'
    && source?.licenseCheck?.exportAllowed !== false;
}

function hasCheckedSensitivity(source) {
  return source?.sensitivityCheck?.status === 'checked'
    && typeof source?.sensitivity === 'string'
    && source.sensitivity.length > 0;
}

function decisionUseClassification(source) {
  if (typeof source?.decisionUse === 'string') return source.decisionUse;
  return source?.decisionUse?.classification;
}

function hasSignatureTheater(manifest) {
  return SIGNATURE_FIELDS.some((field) => manifest?.[field] != null);
}

function hasShaMetadata(manifest) {
  return typeof manifest?.sha256 === 'string'
    && SHA256_PATTERN.test(manifest.sha256)
    && manifest?.metadataOnly === true;
}

function hasRenderBehavior(recipe) {
  return RENDER_BEHAVIOR_FIELDS.some((field) => recipe?.[field] != null);
}

export function validatePhase10ExportAttempt(attempt = {}) {
  const issues = [];
  const operation = attempt.operation ?? 'export';
  const isPublicExportOperation = operation === 'export';
  const sources = asArray(attempt.sources);

  function issue(code, check, message, extra = {}) {
    issues.push({ code, check, message, ...extra });
  }

  if (hasRenderBehavior(attempt.recipe)) {
    issue(
      'E_PHASE10_EXPORT_RENDER_BEHAVIOR_FORBIDDEN',
      'render-behavior-forbidden',
      'Export recipes must not carry render commands or output paths.',
      { exportRecipeId: attempt.recipe?.exportRecipeId }
    );
  }

  if (operation === 'git-push' && remoteIsPublic(attempt.remote)) {
    issue(
      'E_PHASE10_EXPORT_PUBLIC_GIT_PUSH_DENIED',
      'direct-public-git-push-denied',
      'Direct git push to public-labeled remotes is denied; public sharing must use the export path.',
      { remote: attempt.remote?.label ?? attempt.remote?.name }
    );
  }

  if (isPublicExportOperation && sharingProfileFor(attempt) !== PUBLIC_EXPORT_PROFILE) {
    issue(
      'E_PHASE10_EXPORT_PUBLIC_PROFILE_REQUIRED',
      'sharing-profile-public-export-required',
      'Public export requires sharingProfile public-export.',
      { sharingProfile: sharingProfileFor(attempt) }
    );
  }

  for (const source of sources) {
    if (isPublicExportOperation && !hasCheckedLicense(source)) {
      issue(
        'E_PHASE10_EXPORT_LICENSE_CHECK_REQUIRED',
        'license-check-required',
        'Export sources require an explicit passing license check.',
        { pageId: source?.pageId ?? source?.id }
      );
    }

    if (!hasCheckedSensitivity(source)) {
      issue(
        'E_PHASE10_EXPORT_SENSITIVITY_CHECK_REQUIRED',
        'sensitivity-check-required',
        'Export guard inputs require an explicit sensitivity check.',
        { pageId: source?.pageId ?? source?.id }
      );
      continue;
    }

    if (isPublicExportOperation && source.sensitivity === INTERNAL_SENSITIVITY) {
      issue(
        'E_PHASE10_EXPORT_INTERNAL_NOT_PUBLIC',
        'internal-not-public-exportable',
        'Internal artifacts may be tracked locally but must not be public-exported.',
        { pageId: source?.pageId ?? source?.id }
      );
    }

    if (isPublicExportOperation && source.sensitivity !== PUBLIC_SENSITIVITY) {
      issue(
        'E_PHASE10_EXPORT_SENSITIVITY_CHECK_REQUIRED',
        'sensitivity-check-required',
        'Public export requires public sensitivity.',
        { pageId: source?.pageId ?? source?.id, sensitivity: source.sensitivity }
      );
    }

    if (decisionUseClassification(source) === 'not-for-decision') {
      issue(
        'E_PHASE10_EXPORT_NOT_FOR_DECISION_FORBIDDEN',
        'not-for-decision-export-blocked',
        'Not-for-decision query-derived sources cannot feed export.',
        { pageId: source?.pageId ?? source?.id }
      );
    }
  }

  if (hasSignatureTheater(attempt.manifest)) {
    issue(
      'E_PHASE10_EXPORT_SIGNATURE_THEATER_FORBIDDEN',
      'sha-only-manifest-required',
      'Export manifests must use SHA metadata only; no signature theater is allowed.',
      { exportManifestId: attempt.manifest?.exportManifestId }
    );
  } else if (isPublicExportOperation && !hasShaMetadata(attempt.manifest)) {
    issue(
      'E_PHASE10_EXPORT_SHA_METADATA_REQUIRED',
      'sha-only-manifest-required',
      'Export manifests require SHA256 metadata.',
      { exportManifestId: attempt.manifest?.exportManifestId }
    );
  }

  return { ok: issues.length === 0, issues };
}
