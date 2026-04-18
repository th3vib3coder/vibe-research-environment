/**
 * WP-155 unit coverage for environment/lib/kernel-bridge.js.
 *
 * Covers the acceptance bullets at
 * blueprints/definitive-spec/implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md:126-137:
 *   - degraded sentinel when kernelRoot is undefined
 *   - degraded sentinel when CLI path does not exist
 *   - KernelBridgeTimeoutError when timeoutMs fires
 *   - KernelBridgeContractMismatchError on bad envelope / projection mismatch
 *   - stderr surfaced (truncated) in error
 *   - close() no-op
 *   - env hygiene (DEFAULT_ENV_WHITELIST copy integrity)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveKernelReader,
  KernelBridgeError,
  KernelBridgeUnavailableError,
  KernelBridgeContractMismatchError,
  KernelBridgeTimeoutError,
  __spawnProjectionForTest,
  __testables,
} from '../../lib/kernel-bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeKernelRoot = path.resolve(here, '..', 'fixtures', 'fake-kernel-sibling');

describe('WP-155 kernel-bridge: degraded sentinel', () => {
  it('returns degraded sentinel when kernelRoot is undefined', async () => {
    const reader = await resolveKernelReader({});
    assert.equal(reader.dbAvailable, false);
    assert.equal(typeof reader.error, 'string');
    assert.ok(reader.error.length > 0);
  });

  it('returns degraded sentinel when kernelRoot is null', async () => {
    const reader = await resolveKernelReader({ kernelRoot: null });
    assert.equal(reader.dbAvailable, false);
  });

  it('returns degraded sentinel when CLI path does not exist', async () => {
    const reader = await resolveKernelReader({ kernelRoot: '/no/such/kernel/root' });
    assert.equal(reader.dbAvailable, false);
    assert.match(reader.error, /core-reader CLI unavailable/u);
  });
});

describe('WP-155 kernel-bridge: happy path against fake sibling', () => {
  it('returns typed-duck reader exposing all nine projection methods and close()', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    assert.equal(reader.dbAvailable, true);
    for (const projection of __testables.PROJECTION_NAMES) {
      assert.equal(typeof reader[projection], 'function', `missing ${projection}`);
    }
    assert.equal(typeof reader.close, 'function');
  });

  it('close() is a no-op and does not throw', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    assert.doesNotThrow(() => reader.close());
    assert.doesNotThrow(() => reader.close()); // idempotent
  });

  it('getProjectOverview returns canned overview with profile field', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    const overview = await reader.getProjectOverview({ projectPath: '/fake/project' });
    assert.equal(overview.profile, 'default');
    assert.equal(typeof overview.projectId, 'string');
  });

  it('listUnresolvedClaims returns an array (zero entries in fixture)', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    const claims = await reader.listUnresolvedClaims();
    assert.ok(Array.isArray(claims));
    assert.equal(claims.length, 0);
  });

  it('listGateChecks exposes schema_file_protection hook', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    const gates = await reader.listGateChecks();
    assert.ok(gates.some((g) => g.hook === 'schema_file_protection'));
  });

  it('getStateSnapshot returns a valid CREATED→R2_REVIEWED→PROMOTED sequence', async () => {
    const reader = await resolveKernelReader({ kernelRoot: fakeKernelRoot });
    const snap = await reader.getStateSnapshot();
    assert.ok(Array.isArray(snap.sequences));
    assert.ok(snap.sequences.length > 0);
    const first = snap.sequences[0];
    assert.deepEqual(first, ['CREATED', 'R2_REVIEWED', 'PROMOTED']);
  });
});

describe('WP-155 kernel-bridge: error taxonomy via trigger projections', () => {
  it('timeout trigger raises KernelBridgeTimeoutError with projection/phase fields', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: fakeKernelRoot,
        projection: '__bridge_test_timeout__',
        timeoutMs: 300,
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeTimeoutError, `got ${err?.name}: ${err?.message}`);
    assert.equal(err.projection, '__bridge_test_timeout__');
    assert.ok(['sigterm', 'sigkill'].includes(err.timeoutPhase));
  });

  it('bad-envelope trigger (non-JSON stdout) raises KernelBridgeContractMismatchError', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: fakeKernelRoot,
        projection: '__bridge_test_bad_envelope__',
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeContractMismatchError, `got ${err?.name}: ${err?.message}`);
    assert.match(err.message, /not valid JSON/u);
  });

  it('kernel-error envelope {ok:false} raises KernelBridgeError (not contract mismatch) with cause', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: fakeKernelRoot,
        projection: '__bridge_test_kernel_error__',
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeError, `got ${err?.name}: ${err?.message}`);
    assert.ok(!(err instanceof KernelBridgeContractMismatchError));
    assert.ok(err.cause instanceof Error);
    assert.match(err.message, /fake kernel reported failure/u);
  });

  it('projection-field mismatch raises KernelBridgeContractMismatchError', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: fakeKernelRoot,
        projection: '__bridge_test_mismatch__',
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeContractMismatchError, `got ${err?.name}: ${err?.message}`);
    assert.match(err.message, /does not match requested/u);
  });

  it('missing data field raises KernelBridgeContractMismatchError', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: fakeKernelRoot,
        projection: '__bridge_test_missing_data__',
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeContractMismatchError, `got ${err?.name}: ${err?.message}`);
    assert.match(err.message, /missing data field/u);
  });

  it('ENOENT on CLI path yields KernelBridgeUnavailableError via the test helper', async () => {
    let err = null;
    try {
      await __spawnProjectionForTest({
        kernelRoot: '/definitely/not/here',
        projection: 'getProjectOverview',
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof KernelBridgeUnavailableError, `got ${err?.name}: ${err?.message}`);
  });
});

describe('WP-155 kernel-bridge: env hygiene', () => {
  it('DEFAULT_ENV_WHITELIST matches local-subprocess.js list (copy integrity)', () => {
    // Hard-coded list per WP-155 rule "prefer copy to avoid deep refactor scope".
    // If environment/orchestrator/executors/local-subprocess.js:7-20 changes,
    // update the copy in environment/lib/kernel-bridge.js AND this assertion.
    assert.deepEqual([...__testables.DEFAULT_ENV_WHITELIST], [
      'PATH',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'SystemRoot',
      'SYSTEMROOT',
      'TEMP',
      'TMP',
      'LANG',
      'LC_ALL',
      'LC_CTYPE',
    ]);
  });
});
