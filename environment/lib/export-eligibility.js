import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const CLAIM_ID_PATTERN = /^C-[0-9]{3}$/u;
const SCHEMA_VALIDATION_RELATIVE_PATH = path.join(
  '.vibe-science-environment',
  'governance',
  'schema-validation',
);

export const EXPORT_ELIGIBILITY_REASON_CODES = Object.freeze({
  notPromoted: 'not_promoted',
  zeroCitations: 'zero_citations',
  unverifiedCitations: 'unverified_citations',
  needsFreshSchemaValidation: 'needs_fresh_schema_validation',
  reviewDebtSignal: 'review_debt_signal',
  missingGovernanceProfileMetadata: 'missing_governance_profile_metadata',
});

export const PROFILE_SAFETY_MODES = Object.freeze({
  full: 'full',
  degradedCompatibility: 'degraded_compatibility',
});

const BLOCKING_REASONS = new Set([
  EXPORT_ELIGIBILITY_REASON_CODES.notPromoted,
  EXPORT_ELIGIBILITY_REASON_CODES.zeroCitations,
  EXPORT_ELIGIBILITY_REASON_CODES.unverifiedCitations,
  EXPORT_ELIGIBILITY_REASON_CODES.needsFreshSchemaValidation,
]);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const schemaValidationSchema = JSON.parse(
  await readFile(
    new URL('../schemas/schema-validation-record.schema.json', import.meta.url),
    'utf8',
  ),
);
const validateSchemaValidationRecord = ajv.compile(schemaValidationSchema);

export class ExportEligibilityError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ExportEligibilityValidationError extends ExportEligibilityError {}

export async function exportEligibility(claimId, reader, options = {}) {
  ensureClaimId(claimId);
  ensureReader(reader);

  const claimHeads = await resolveProjection(
    options.claimHeads,
    reader,
    'listClaimHeads',
  );
  const unresolvedClaims = await resolveProjection(
    options.unresolvedClaims,
    reader,
    'listUnresolvedClaims',
  );
  const citationChecks = await resolveProjection(
    options.citationChecks,
    reader,
    'listCitationChecks',
    { claimId },
  );

  const head = claimHeads.find((entry) => entry?.claimId === claimId) ?? null;
  const governanceProfileAtCreation = normalizeGovernanceProfile(
    options.governanceProfileAtCreation
      ?? head?.governanceProfileAtCreation
      ?? head?.claimMetadata?.governanceProfileAtCreation
      ?? null,
  );

  const schemaValidation = await resolveSchemaValidationRecord(
    options.projectPath ?? '.',
    claimId,
    options,
  );

  const reasons = [];
  if (head?.currentStatus !== 'PROMOTED') {
    reasons.push(EXPORT_ELIGIBILITY_REASON_CODES.notPromoted);
  }

  if (citationChecks.length === 0) {
    reasons.push(EXPORT_ELIGIBILITY_REASON_CODES.zeroCitations);
  } else if (
    citationChecks.some((citation) => citation?.verificationStatus !== 'VERIFIED')
  ) {
    reasons.push(EXPORT_ELIGIBILITY_REASON_CODES.unverifiedCitations);
  }

  if (unresolvedClaims.some((entry) => entry?.claimId === claimId)) {
    reasons.push(EXPORT_ELIGIBILITY_REASON_CODES.reviewDebtSignal);
  }

  if (governanceProfileAtCreation === 'unknown') {
    reasons.push(
      EXPORT_ELIGIBILITY_REASON_CODES.missingGovernanceProfileMetadata,
    );
  }

  if (
    governanceProfileAtCreation !== 'strict'
    && !schemaValidation.hasFreshSchemaValidation
  ) {
    reasons.push(EXPORT_ELIGIBILITY_REASON_CODES.needsFreshSchemaValidation);
  }

  return {
    claimId,
    eligible: !reasons.some((reason) => BLOCKING_REASONS.has(reason)),
    reasons,
    statusAtExport: head?.currentStatus ?? null,
    confidenceAtExport: normalizeConfidence(head?.confidence ?? null),
    governanceProfileAtCreation,
    hasFreshSchemaValidation: schemaValidation.hasFreshSchemaValidation,
    profileSafetyMode:
      governanceProfileAtCreation === 'unknown'
        ? PROFILE_SAFETY_MODES.degradedCompatibility
        : PROFILE_SAFETY_MODES.full,
    citations: cloneValue(citationChecks),
    schemaValidationRecord: cloneValue(schemaValidation.record),
  };
}

export async function readSchemaValidationRecord(projectPath, claimId, options = {}) {
  ensureClaimId(claimId);
  const projectRoot = resolveProjectPath(projectPath);

  if (options.schemaValidationRecord !== undefined) {
    return validateProvidedSchemaValidationRecord(
      options.schemaValidationRecord,
      claimId,
    );
  }

  if (typeof options.schemaValidationLookup === 'function') {
    return validateProvidedSchemaValidationRecord(
      await options.schemaValidationLookup(claimId),
      claimId,
    );
  }

  const recordPath = path.join(
    projectRoot,
    options.schemaValidationRelativePath ?? SCHEMA_VALIDATION_RELATIVE_PATH,
    `${claimId}.json`,
  );

  let rawRecord;
  try {
    rawRecord = await readFile(recordPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  let parsedRecord;
  try {
    parsedRecord = JSON.parse(rawRecord);
  } catch (error) {
    throw new ExportEligibilityValidationError(
      `Schema-validation artifact for ${claimId} contains invalid JSON.`,
      { cause: error },
    );
  }

  return validateProvidedSchemaValidationRecord(parsedRecord, claimId);
}

function ensureReader(reader) {
  if (reader == null || typeof reader !== 'object') {
    throw new ExportEligibilityValidationError('reader must be an object.');
  }

  for (const methodName of [
    'listClaimHeads',
    'listUnresolvedClaims',
    'listCitationChecks',
  ]) {
    if (typeof reader[methodName] !== 'function') {
      throw new ExportEligibilityValidationError(
        `reader.${methodName} must be a function.`,
      );
    }
  }
}

async function resolveProjection(provided, reader, methodName, callOptions = undefined) {
  if (provided !== undefined) {
    if (!Array.isArray(provided)) {
      throw new ExportEligibilityValidationError(
        `${methodName} override must be an array when provided.`,
      );
    }

    return cloneValue(provided);
  }

  const result = await reader[methodName](callOptions);
  if (!Array.isArray(result)) {
    return [];
  }

  return cloneValue(result);
}

async function resolveSchemaValidationRecord(projectPath, claimId, options) {
  const record = await readSchemaValidationRecord(projectPath, claimId, options);
  const requiredValidatedAfter = normalizeRequiredValidationAfter(
    options.requiredValidatedAfter ?? null,
  );

  if (record == null || record.ok !== true) {
    return {
      record,
      hasFreshSchemaValidation: false,
    };
  }

  if (requiredValidatedAfter == null) {
    return {
      record,
      hasFreshSchemaValidation: true,
    };
  }

  return {
    record,
    hasFreshSchemaValidation:
      Date.parse(record.validatedAt) >= Date.parse(requiredValidatedAfter),
  };
}

function validateProvidedSchemaValidationRecord(record, claimId) {
  if (record == null) {
    return null;
  }

  if (typeof record !== 'object' || Array.isArray(record)) {
    throw new ExportEligibilityValidationError(
      `Schema-validation artifact for ${claimId} must be an object.`,
    );
  }

  const valid = validateSchemaValidationRecord(record);
  if (!valid) {
    const details = (validateSchemaValidationRecord.errors ?? [])
      .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
      .join('; ');
    throw new ExportEligibilityValidationError(
      `Schema-validation artifact for ${claimId} failed validation: ${details}`,
    );
  }

  if (record.claimId !== claimId) {
    throw new ExportEligibilityValidationError(
      `Schema-validation artifact claimId mismatch for ${claimId}.`,
    );
  }

  return cloneValue(record);
}

function normalizeGovernanceProfile(value) {
  if (value === 'strict' || value === 'default') {
    return value;
  }

  return 'unknown';
}

function normalizeRequiredValidationAfter(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ExportEligibilityValidationError(
      'requiredValidatedAfter must be a valid ISO date-time when provided.',
    );
  }

  return value;
}

function normalizeConfidence(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function ensureClaimId(claimId) {
  if (typeof claimId !== 'string' || !CLAIM_ID_PATTERN.test(claimId)) {
    throw new ExportEligibilityValidationError(
      'claimId must be a string matching C-XXX.',
    );
  }
}

function resolveProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new ExportEligibilityValidationError(
      'projectPath must be a non-empty string.',
    );
  }

  return path.resolve(projectPath);
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
