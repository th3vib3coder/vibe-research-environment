import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function readFixture(repoRelativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, repoRelativePath), 'utf8'));
}

export async function loadValidator(schemaFile) {
  const schema = JSON.parse(
    await readFile(path.join(repoRoot, 'environment', 'schemas', schemaFile), 'utf8')
  );
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

export async function expectFixtureValidity({ schemaFile, fixturePath, expectedValid }) {
  const validator = await loadValidator(schemaFile);
  const fixture = await readFixture(fixturePath);
  const valid = validator(fixture);
  const details = (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');

  assert.equal(
    valid,
    expectedValid,
    `${schemaFile} expected valid=${expectedValid} for ${fixturePath} but got valid=${valid}: ${details}`
  );
}
