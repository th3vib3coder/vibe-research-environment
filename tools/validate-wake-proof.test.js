import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  WAKE_PROOF_ENV_KEY,
  WAKE_PROOF_SIGNATURE_ALGORITHM,
  WAKE_PROOF_SCHEMA_VERSION,
  signWakeProofPayload,
  writeWakeProof
} from '../environment/audit/wake-proof.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'tools', 'validate-wake-proof.mjs');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');
const TEST_KEY = 'unit-test-wake-proof-validator-secret';
const NPM_BIN = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';

function validInput(overrides = {}) {
  return {
    objectiveId: 'OBJ-W6-5-WAKE',
    wakeId: 'WAKE-W6-5-001',
    scheduled: '2026-06-21T08:00:00.000Z',
    actual: '2026-06-21T08:00:05.000Z',
    wakeReason: 'heartbeat',
    leaseState: {
      status: 'acquired',
      ownerWakeId: 'WAKE-W6-5-001',
      expiresAt: '2026-06-21T08:05:00.000Z'
    },
    ...overrides
  };
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-validate-wake-proof-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readPackageJson() {
  return JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
}

async function makeProof(dir) {
  const result = await writeWakeProof(dir, validInput(), {
    key: TEST_KEY,
    timestampSegment: '20260621T080005Z'
  });
  return result.filePath;
}

async function writeProof(dir, proof, name = 'wake-proof-custom.json') {
  const filePath = path.join(dir, name);
  await writeFile(filePath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  return filePath;
}

async function loadProof(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function runValidator(filePath, options = {}) {
  const env = { ...process.env };
  if (options.key === null) {
    delete env[WAKE_PROOF_ENV_KEY];
  } else {
    env[WAKE_PROOF_ENV_KEY] = options.key ?? TEST_KEY;
  }

  try {
    const result = await execFileAsync(process.execPath, [VALIDATOR_PATH, filePath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
      maxBuffer: 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error)
    };
  }
}

async function runPackageScript(filePath) {
  const npmArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'run', 'validate:wake-proof', '--', filePath]
    : ['run', 'validate:wake-proof', '--', filePath];
  try {
    const result = await execFileAsync(NPM_BIN, npmArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, [WAKE_PROOF_ENV_KEY]: TEST_KEY },
      maxBuffer: 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error)
    };
  }
}

function signedProof(overrides = {}) {
  const proof = {
    schemaVersion: WAKE_PROOF_SCHEMA_VERSION,
    objectiveId: 'OBJ-W6-5-WAKE',
    wakeId: 'WAKE-W6-5-001',
    scheduled: '2026-06-21T08:00:00.000Z',
    actual: '2026-06-21T08:00:05.000Z',
    wakeReason: 'heartbeat',
    leaseState: {
      status: 'acquired',
      ownerWakeId: 'WAKE-W6-5-001',
      expiresAt: '2026-06-21T08:05:00.000Z'
    },
    signatureAlgorithm: WAKE_PROOF_SIGNATURE_ALGORITHM,
    ...overrides
  };
  return {
    ...proof,
    signature: signWakeProofPayload(proof, TEST_KEY)
  };
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test('package scripts expose validate:wake-proof and leave npm test discoverable', async () => {
  const packageJson = await readPackageJson();

  assert.equal(
    packageJson.scripts['validate:wake-proof'],
    'node tools/validate-wake-proof.mjs'
  );
  assert.equal(packageJson.scripts.test, 'node --test');
});

test('validator accepts a proof emitted by the accepted wake-proof helper', async () => {
  await withTempDir(async (dir) => {
    const filePath = await makeProof(dir);
    const result = await runValidator(filePath);

    assert.equal(result.code, 0, combinedOutput(result));
    assert.match(result.stdout, /wake-proof valid/u);
  });
});

test('package script invokes the reviewed validator CLI', async () => {
  await withTempDir(async (dir) => {
    const filePath = await makeProof(dir);
    const result = await runPackageScript(filePath);

    assert.equal(result.code, 0, combinedOutput(result));
    assert.match(result.stdout, /wake-proof valid/u);
  });
});

test('missing VRE_WAKE_PROOF_KEY fails closed without leaking prior key text', async () => {
  await withTempDir(async (dir) => {
    const filePath = await makeProof(dir);
    const result = await runValidator(filePath, { key: null });

    assert.notEqual(result.code, 0);
    assert.match(combinedOutput(result), /E_WAKE_PROOF_KEY_MISSING/u);
    assert.doesNotMatch(combinedOutput(result), /unit-test-wake-proof-validator-secret/u);
  });
});

test('tampered covered field and malformed signature fail closed', async () => {
  await withTempDir(async (dir) => {
    const originalPath = await makeProof(dir);
    const original = await loadProof(originalPath);
    const tamperedPath = await writeProof(dir, {
      ...original,
      wakeReason: 'manual'
    }, 'wake-proof-tampered.json');
    const badSignaturePath = await writeProof(dir, {
      ...original,
      signature: 'b'.repeat(64)
    }, 'wake-proof-bad-signature.json');

    const tampered = await runValidator(tamperedPath);
    const badSignature = await runValidator(badSignaturePath);

    assert.notEqual(tampered.code, 0);
    assert.match(combinedOutput(tampered), /E_WAKE_PROOF_INVALID/u);
    assert.notEqual(badSignature.code, 0);
    assert.match(combinedOutput(badSignature), /E_WAKE_PROOF_INVALID/u);
  });
});

test('schema-invalid and unsigned proofs fail before false signature acceptance', async () => {
  await withTempDir(async (dir) => {
    const extraFieldPath = await writeProof(dir, signedProof({ unreviewedRuntimeClaim: true }));
    const temporalPath = await writeProof(dir, signedProof({
      actual: '2026-06-21T07:59:59.000Z'
    }), 'wake-proof-temporal.json');
    const unsigned = signedProof();
    delete unsigned.signature;
    const unsignedPath = await writeProof(dir, unsigned, 'wake-proof-unsigned.json');

    for (const filePath of [extraFieldPath, temporalPath, unsignedPath]) {
      const result = await runValidator(filePath);
      assert.notEqual(result.code, 0, filePath);
      assert.match(combinedOutput(result), /E_WAKE_PROOF_INVALID/u);
    }
  });
});

test('validator source stays offline and uses reviewed helpers', async () => {
  const source = await readFile(VALIDATOR_PATH, 'utf8');

  assert.match(source, /from '..\/environment\/audit\/wake-proof\.js'/u);
  assert.match(source, /canonicalizeForWakeProof/u);
  assert.match(source, /signWakeProofPayload/u);
  assert.match(source, /timingSafeEqual/u);
  assert.doesNotMatch(source, /fetch\s*\(/u);
  assert.doesNotMatch(source, /node:http|node:https|node:net|clipboard|claude|provider/u);
});
