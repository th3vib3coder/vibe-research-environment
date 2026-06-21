#!/usr/bin/env node

import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  WAKE_PROOF_ENV_KEY,
  canonicalizeForWakeProof,
  signWakeProofPayload
} from '../environment/audit/wake-proof.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'environment',
  'schemas',
  'phase14-wake-proof.schema.json'
);

class WakeProofValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'WakeProofValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new WakeProofValidationError(code, message);
}

function requireKey() {
  const key = process.env[WAKE_PROOF_ENV_KEY];
  if (typeof key !== 'string' || key.trim() === '') {
    fail('E_WAKE_PROOF_KEY_MISSING', `${WAKE_PROOF_ENV_KEY} is required.`);
  }
  return key;
}

async function loadSchemaValidator() {
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

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

function parseProof(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    fail('E_WAKE_PROOF_INVALID', 'wake proof JSON is malformed.');
  }
}

function timingSafeSignatureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function validateWakeProofFile(filePath, options = {}) {
  const inputPath = typeof filePath === 'string' ? filePath.trim() : '';
  if (!inputPath) {
    fail('E_WAKE_PROOF_INVALID', 'wake proof path is required.');
  }

  const key = options.key ?? requireKey();
  let raw;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch {
    fail('E_WAKE_PROOF_INVALID', 'wake proof file cannot be read.');
  }

  const proof = parseProof(raw);
  const validator = await loadSchemaValidator();
  if (!validator(proof)) {
    fail('E_WAKE_PROOF_INVALID', validationDetails(validator));
  }

  const { signature, ...unsignedProof } = proof;
  canonicalizeForWakeProof(unsignedProof);
  const expected = signWakeProofPayload(unsignedProof, key);
  if (!timingSafeSignatureEqual(signature, expected)) {
    fail('E_WAKE_PROOF_INVALID', 'wake proof signature mismatch.');
  }

  return proof;
}

function isDirectRun() {
  return process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    const filePath = process.argv[2];
    await validateWakeProofFile(filePath);
    process.stdout.write('wake-proof valid\n');
  } catch (error) {
    const code = error instanceof WakeProofValidationError
      ? error.code
      : 'E_WAKE_PROOF_INVALID';
    const message = error instanceof WakeProofValidationError
      ? error.message
      : `${code}: wake proof validation failed.`;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
