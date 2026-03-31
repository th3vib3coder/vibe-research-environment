import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SCHEMA_ROOT = new URL('../../schemas/', import.meta.url);
const VALIDATOR_CACHE = new Map();

export const ISO_DATE = '2026-03-31T07:00:00Z';
export const ISO_DATE_LATER = '2026-03-31T08:15:00Z';
export const ATTEMPT_ID = 'ATT-2026-03-31-001';
export const CLAIM_ID = 'C-001';
export const EXPERIMENT_ID = 'EXP-001';
export const LITERATURE_ID = 'LIT-001';

async function loadValidator(schemaFile) {
  if (VALIDATOR_CACHE.has(schemaFile)) {
    return VALIDATOR_CACHE.get(schemaFile);
  }

  const schemaUrl = new URL(schemaFile, SCHEMA_ROOT);
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);

  const validator = ajv.compile(schema);
  VALIDATOR_CACHE.set(schemaFile, validator);
  return validator;
}

function formatErrors(errors) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

async function assertFixture(schemaFile, fixture, expectedValid) {
  const validator = await loadValidator(schemaFile);
  const valid = validator(fixture);
  const details = formatErrors(validator.errors);

  assert.equal(
    valid,
    expectedValid,
    `${schemaFile} expected valid=${expectedValid} but got valid=${valid}: ${details}`
  );
}

export function defineSchemaFixtureTests({
  schemaFile,
  suiteName,
  validFixture,
  invalidFixture,
  degradedFixture
}) {
  describe(suiteName, () => {
    it('accepts a valid fixture', async () => {
      await assertFixture(schemaFile, validFixture, true);
    });

    it('rejects an invalid fixture', async () => {
      await assertFixture(schemaFile, invalidFixture, false);
    });

    it('accepts a degraded or partial fixture where allowed', async () => {
      await assertFixture(schemaFile, degradedFixture, true);
    });
  });
}
