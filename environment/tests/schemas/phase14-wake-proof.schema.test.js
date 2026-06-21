import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'environment',
  'schemas',
  'phase14-wake-proof.schema.json'
);

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
    $data: true
  });
  addFormats(ajv, { keywords: true });
  return ajv.compile(schema);
}

function validProof(overrides = {}) {
  return {
    schemaVersion: 'phase14.wake-proof.v1',
    objectiveId: 'OBJ-W6-4-WAKE',
    wakeId: 'WAKE-W6-4-001',
    scheduled: '2026-06-21T07:00:00.000Z',
    actual: '2026-06-21T07:00:10.000Z',
    wakeReason: 'heartbeat',
    leaseState: {
      status: 'acquired',
      ownerWakeId: 'WAKE-W6-4-001',
      expiresAt: '2026-06-21T07:05:00.000Z'
    },
    signatureAlgorithm: 'HMAC-SHA256',
    signature: 'a'.repeat(64),
    ...overrides
  };
}

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

test('phase14-wake-proof.schema accepts a signed wake proof', async () => {
  const validator = await loadValidator();
  const proof = validProof();

  assert.equal(validator(proof), true, validationDetails(validator));
});

test('phase14-wake-proof.schema rejects missing required fields', async () => {
  const validator = await loadValidator();
  const proof = validProof();
  delete proof.signature;

  assert.equal(validator(proof), false);
  assert.match(validationDetails(validator), /required/u);
});

test('phase14-wake-proof.schema rejects unknown wakeReason values', async () => {
  const validator = await loadValidator();
  const proof = validProof({ wakeReason: 'gui-clipboard' });

  assert.equal(validator(proof), false);
  assert.match(validationDetails(validator), /allowed values|enum/u);
});

test('phase14-wake-proof.schema rejects actual before scheduled', async () => {
  const validator = await loadValidator();
  const proof = validProof({ actual: '2026-06-21T06:59:59.000Z' });

  assert.equal(validator(proof), false);
  assert.match(validationDetails(validator), /formatMinimum|should be >=|must be >=/u);
});

test('phase14-wake-proof.schema rejects unsigned or malformed signatures', async () => {
  const validator = await loadValidator();

  assert.equal(validator(validProof({ signature: '' })), false);
  assert.match(validationDetails(validator), /pattern/u);

  assert.equal(validator(validProof({ signature: 'g'.repeat(64) })), false);
  assert.match(validationDetails(validator), /pattern/u);
});

test('phase14-wake-proof.schema rejects unreviewed extra fields', async () => {
  const validator = await loadValidator();
  const proof = validProof({ unreviewedRuntimeClaim: true });

  assert.equal(validator(proof), false);
  assert.match(validationDetails(validator), /additional properties/u);
});
