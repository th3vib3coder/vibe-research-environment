import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const PHASE10_CONTRACTS = Object.freeze([
  ['phase10.knowledge-domain.v1', 'phase10-knowledge-domain.schema.json'],
  ['phase10.source-bundle.v1', 'phase10-source-bundle.schema.json'],
  ['phase10.raw-document.v1', 'phase10-raw-document.schema.json'],
  ['phase10.provenance-link.v1', 'phase10-provenance-link.schema.json'],
  ['phase10.wiki-page.v1', 'phase10-wiki-page.schema.json'],
  ['phase10.computed-artifact.v1', 'phase10-computed-artifact.schema.json'],
  ['phase10.inbox-entry.v1', 'phase10-inbox-entry.schema.json'],
  ['phase10.query-record.v1', 'phase10-query-record.schema.json'],
  ['phase10.presentation.v1', 'phase10-presentation.schema.json'],
  ['phase10.export-recipe.v1', 'phase10-export-recipe.schema.json'],
  ['phase10.marp-template.v1', 'phase10-marp-template.schema.json'],
  ['phase10.compile-policy.v1', 'phase10-compile-policy.schema.json'],
  ['phase10.role-envelope.v1', 'phase10-role-envelope.schema.json']
]);

export const FORBIDDEN_PHASE10_SCHEMA_FILES = Object.freeze([
  'phase10-domain.schema.json',
  'phase10-claim-edge.schema.json',
  'phase10-serendipity-finding.schema.json',
  'phase10-steering-event.schema.json'
]);

export const ISO_TIME = '2026-06-09T00:00:00.000Z';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function readSchema(schemaFile) {
  return JSON.parse(await readFile(path.join(repoRoot, 'environment', 'schemas', schemaFile), 'utf8'));
}

export async function assertSchemaAbsent(schemaFile) {
  await assert.rejects(
    access(path.join(repoRoot, 'environment', 'schemas', schemaFile)),
    /ENOENT/u
  );
}

export async function loadPhase10Validator(schemaFile) {
  const schema = await readSchema(schemaFile);
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export async function expectValid(schemaFile, value) {
  const validator = await loadPhase10Validator(schemaFile);
  const valid = validator(value);
  assert.equal(valid, true, validationDetails(validator));
}

export async function expectInvalid(schemaFile, value, expectedPattern = /must|required|additional|allowed|const/u) {
  const validator = await loadPhase10Validator(schemaFile);
  const valid = validator(value);
  const details = validationDetails(validator);
  assert.equal(valid, false, `${schemaFile} unexpectedly accepted fixture`);
  assert.match(details, expectedPattern);
}
