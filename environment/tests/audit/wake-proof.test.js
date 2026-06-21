import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  WAKE_PROOF_SCHEMA_VERSION,
  WAKE_PROOF_SIGNATURE_ALGORITHM,
  WakeProofError,
  createWakeProofPayload,
  signWakeProofPayload,
  writeWakeProof
} from '../../audit/wake-proof.js';

const TEST_KEY = 'unit-test-wake-proof-secret';

function validInput(overrides = {}) {
  return {
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
    ...overrides
  };
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-wake-proof-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function expectWakeProofCode(fn, code) {
  await assert.rejects(
    fn,
    (error) => error instanceof WakeProofError && error.code === code
  );
}

function unsignedPayload(overrides = {}) {
  return {
    schemaVersion: WAKE_PROOF_SCHEMA_VERSION,
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
    signatureAlgorithm: WAKE_PROOF_SIGNATURE_ALGORITHM,
    ...overrides
  };
}

test('writeWakeProof writes a signed immutable proof inside the bundle', async () => {
  await withTempDir(async (dir) => {
    const result = await writeWakeProof(dir, validInput(), {
      key: TEST_KEY,
      timestampSegment: '20260621T070010Z'
    });

    assert.equal(result.proof.schemaVersion, WAKE_PROOF_SCHEMA_VERSION);
    assert.equal(result.proof.signatureAlgorithm, WAKE_PROOF_SIGNATURE_ALGORITHM);
    assert.match(result.proof.signature, /^[a-f0-9]{64}$/u);
    assert.ok(result.filePath.startsWith(await realpath(dir) + path.sep));
    assert.equal(path.basename(result.filePath), 'wake-proof-20260621T070010Z.json');

    const stored = JSON.parse(await readFile(result.filePath, 'utf8'));
    assert.deepEqual(stored, result.proof);
    assert.doesNotMatch(JSON.stringify(stored), /unit-test-wake-proof-secret/u);
  });
});

test('signWakeProofPayload is stable across object key order', () => {
  const a = unsignedPayload({
    leaseState: {
      status: 'acquired',
      ownerWakeId: 'WAKE-W6-4-001',
      expiresAt: '2026-06-21T07:05:00.000Z'
    }
  });
  const b = {
    wakeReason: 'heartbeat',
    leaseState: {
      expiresAt: '2026-06-21T07:05:00.000Z',
      ownerWakeId: 'WAKE-W6-4-001',
      status: 'acquired'
    },
    actual: '2026-06-21T07:00:10.000Z',
    scheduled: '2026-06-21T07:00:00.000Z',
    wakeId: 'WAKE-W6-4-001',
    objectiveId: 'OBJ-W6-4-WAKE',
    signatureAlgorithm: WAKE_PROOF_SIGNATURE_ALGORITHM,
    schemaVersion: WAKE_PROOF_SCHEMA_VERSION
  };

  assert.equal(
    signWakeProofPayload(a, TEST_KEY),
    signWakeProofPayload(b, TEST_KEY)
  );
});

test('signature changes when covered wake content changes', () => {
  const signature = signWakeProofPayload(unsignedPayload(), TEST_KEY);
  const tampered = signWakeProofPayload(
    unsignedPayload({ wakeId: 'WAKE-W6-4-TAMPERED' }),
    TEST_KEY
  );

  assert.notEqual(tampered, signature);
});

test('missing VRE_WAKE_PROOF_KEY fails closed without writing an unsigned file', async () => {
  await withTempDir(async (dir) => {
    await withEnv({ VRE_WAKE_PROOF_KEY: null }, async () => {
      await expectWakeProofCode(
        () => writeWakeProof(dir, validInput(), {
          timestampSegment: '20260621T070010Z'
        }),
        'E_WAKE_PROOF_KEY_MISSING'
      );
    });

    assert.deepEqual(await readdir(dir), []);
  });
});

test('writeWakeProof can take the signing key from VRE_WAKE_PROOF_KEY', async () => {
  await withTempDir(async (dir) => {
    await withEnv({ VRE_WAKE_PROOF_KEY: TEST_KEY }, async () => {
      const result = await writeWakeProof(dir, validInput(), {
        timestampSegment: '20260621T070010Z'
      });

      assert.match(result.proof.signature, /^[a-f0-9]{64}$/u);
    });
  });
});

test('writeWakeProof refuses to overwrite an existing proof', async () => {
  await withTempDir(async (dir) => {
    await writeWakeProof(dir, validInput(), {
      key: TEST_KEY,
      timestampSegment: 'fixed'
    });

    await expectWakeProofCode(
      () => writeWakeProof(dir, validInput({ wakeId: 'WAKE-W6-4-002' }), {
        key: TEST_KEY,
        timestampSegment: 'fixed'
      }),
      'E_WAKE_PROOF_EXISTS'
    );
  });
});

test('writeWakeProof rejects path traversal in timestamp or identifier inputs', async () => {
  await withTempDir(async (dir) => {
    await expectWakeProofCode(
      () => writeWakeProof(dir, validInput(), {
        key: TEST_KEY,
        timestampSegment: '../outside'
      }),
      'E_WAKE_PROOF_PATH_UNSAFE'
    );

    await expectWakeProofCode(
      () => writeWakeProof(dir, validInput({ objectiveId: '../OBJ-W6-4' }), {
        key: TEST_KEY,
        timestampSegment: 'safe'
      }),
      'E_WAKE_PROOF_PATH_UNSAFE'
    );
  });
});

test('createWakeProofPayload validates required fields and timestamp order', () => {
  assert.throws(
    () => createWakeProofPayload(validInput({ wakeId: '' })),
    (error) => error instanceof WakeProofError
      && error.code === 'E_WAKE_PROOF_FIELD_MISSING'
  );

  assert.throws(
    () => createWakeProofPayload(validInput({
      actual: '2026-06-21T06:59:59.000Z'
    })),
    (error) => error instanceof WakeProofError
      && error.code === 'E_WAKE_PROOF_TEMPORAL_INVALID'
  );
});

test('createWakeProofPayload rejects unknown wake reasons', () => {
  assert.throws(
    () => createWakeProofPayload(validInput({ wakeReason: 'gui-clipboard' })),
    (error) => error instanceof WakeProofError
      && error.code === 'E_WAKE_PROOF_WAKE_REASON_INVALID'
  );
});
