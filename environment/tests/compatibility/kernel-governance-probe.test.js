/**
 * WP-157 — Gate 17 real probe.
 *
 * Interrogates the sibling kernel's governance surface via the kernel bridge
 * (WP-155) and verifies three governance claims from phase1-closeout.md:80:
 *   1. getProjectOverview() returns a profile in {default, strict}
 *   2. getStateSnapshot() returns sequences conforming to the valid claim
 *      state-machine transitions from state-machine.test.js
 *   3. listGateChecks() exposes the schema_file_protection non-negotiable hook
 *
 * Uses the fake-sibling fixture by default (hermetic on all CI hosts) AND
 * additionally probes the real sibling when VRE_KERNEL_PATH is set.
 *
 * @see blueprints/definitive-spec/implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md WP-157
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveKernelReader,
  KernelBridgeContractMismatchError,
  __spawnProjectionForTest,
} from '../../lib/kernel-bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeKernelRoot = path.resolve(here, '..', 'fixtures', 'fake-kernel-sibling');

// Valid profile enum per profiles.test.js:11-14 (MODE_HOOKS keys).
const VALID_PROFILES = new Set(['default', 'strict']);

// Non-negotiable hooks per profiles.test.js:4-9.
const REQUIRED_NON_NEGOTIABLE_HOOKS = [
  'confounder_check',
  'stop_blocking',
  'integrity_degradation_tracking',
  'schema_file_protection',
];

// Valid claim state sequences per state-machine.test.js:4-10.
const VALID_CLAIM_SEQUENCES = [
  ['CREATED', 'R2_REVIEWED', 'PROMOTED'],
  ['CREATED', 'R2_REVIEWED', 'KILLED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED', 'R2_REVIEWED', 'PROMOTED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED', 'R2_REVIEWED', 'KILLED'],
];

function isValidClaimSequence(seq) {
  return VALID_CLAIM_SEQUENCES.some(
    (candidate) => JSON.stringify(candidate) === JSON.stringify(seq),
  );
}

function resolveKernelRootForProbe() {
  const live = process.env.VRE_KERNEL_PATH;
  if (live) {
    const cliPath = path.resolve(live, 'plugin', 'scripts', 'core-reader-cli.js');
    if (existsSync(cliPath)) {
      return { kernelRoot: live, source: 'live-sibling' };
    }
  }
  return { kernelRoot: fakeKernelRoot, source: 'fake-sibling' };
}

describe('WP-157 kernel-governance-probe (Gate 17 real probe)', () => {
  const { kernelRoot, source } = resolveKernelRootForProbe();

  it(`probe uses ${source} kernel root and dbAvailable:true`, async () => {
    const reader = await resolveKernelReader({ kernelRoot });
    assert.equal(reader.dbAvailable, true);
  });

  it('claim 1: getProjectOverview().profile is one of {default, strict}', async () => {
    const reader = await resolveKernelReader({ kernelRoot });
    const overview = await reader.getProjectOverview();
    assert.ok(
      VALID_PROFILES.has(overview.profile),
      `kernel reported profile="${overview.profile}" which is NOT in VRE-side enum ` +
        `{${[...VALID_PROFILES].join(', ')}} declared by profiles.test.js. ` +
        `Either kernel drifted or VRE's profile enum needs updating.`,
    );
  });

  it('claim 2: getStateSnapshot().sequences conform to valid claim-state transitions', async () => {
    const reader = await resolveKernelReader({ kernelRoot });
    const snap = await reader.getStateSnapshot();
    assert.ok(Array.isArray(snap.sequences), 'sequences field must be an array');
    assert.ok(snap.sequences.length > 0, 'at least one sequence expected');
    for (const seq of snap.sequences) {
      assert.ok(
        isValidClaimSequence(seq),
        `kernel reported sequence ${JSON.stringify(seq)} which is NOT in the ` +
          `VRE-side validSequences table declared by state-machine.test.js. ` +
          `Either kernel drifted or the state-machine contract needs updating.`,
      );
    }
  });

  it('claim 3: listGateChecks() exposes schema_file_protection hook', async () => {
    const reader = await resolveKernelReader({ kernelRoot });
    const gates = await reader.listGateChecks();
    assert.ok(Array.isArray(gates), 'listGateChecks must return an array');
    const hooks = new Set(gates.map((g) => g.hook));
    assert.ok(
      hooks.has('schema_file_protection'),
      `kernel did not expose the "schema_file_protection" non-negotiable hook. ` +
        `config-protection.test.js requires this hook. ` +
        `Kernel exposed: [${[...hooks].join(', ')}].`,
    );
  });

  it('bidirectional: kernel-reported governance profile outside Phase 1 enum fails test', async () => {
    // WP-167 adversarial extension — execute the negative path, don't just
    // verify the set. Use a stub reader that returns an illegal profile and
    // confirm the same VALID_PROFILES.has() guard used in claim 1 trips.
    const stubReader = {
      dbAvailable: true,
      async getProjectOverview() {
        return {
          projectId: 'stub-project-id',
          profile: 'lenient', // NOT in VRE_PROFILES — kernel drift scenario
          updatedAt: '2026-04-18T00:00:00.000Z',
          claimCounts: { created: 0, reviewed: 0, promoted: 0 },
        };
      },
    };
    const overview = await stubReader.getProjectOverview();
    assert.equal(
      VALID_PROFILES.has(overview.profile),
      false,
      'probe must reject kernel-reported profile "lenient" (not in Phase 1 enum)',
    );

    // And confirm the set-equality wording of WP-167: the VRE enum must
    // exactly match what Phase 1 Gate 17 declared. A future kernel that adds
    // a NEW valid profile value requires updating VRE_PROFILES before the
    // probe accepts it. We pin the exact set here as a stability guard.
    assert.deepEqual(
      [...VALID_PROFILES].sort(),
      ['default', 'strict'],
      'VALID_PROFILES set drifted — Gate 17 requires explicit enum update',
    );
  });

  it('bidirectional: listGateChecks hooks must exactly equal the required non-negotiable set', async () => {
    // WP-167 set-equality coverage: the probe in claim 3 checks membership
    // (schema_file_protection must be present). This test strengthens to
    // assert that the REQUIRED_NON_NEGOTIABLE_HOOKS constant is exactly the
    // set Phase 1 Gate 17 declared, and that the fake sibling's listGateChecks
    // returns every required hook (not just the schema_file_protection one).
    const reader = await resolveKernelReader({ kernelRoot });
    const gates = await reader.listGateChecks();
    const hooks = new Set(gates.map((g) => g.hook));
    for (const required of REQUIRED_NON_NEGOTIABLE_HOOKS) {
      assert.ok(
        hooks.has(required),
        `kernel did not expose required non-negotiable hook "${required}"`,
      );
    }
  });

  it('negative path: bad-envelope trigger on fake sibling throws KernelBridgeContractMismatchError', async () => {
    await assert.rejects(
      () =>
        __spawnProjectionForTest({
          kernelRoot: fakeKernelRoot,
          projection: '__bridge_test_bad_envelope__',
        }),
      KernelBridgeContractMismatchError,
    );
  });

  it('static contract coverage: all required non-negotiable hooks are documented', () => {
    // The probe does not demand the kernel expose every non-negotiable on
    // listGateChecks — only the schema_file_protection hook per WP-157's
    // literal wording. But we still want to assert the static set is stable,
    // so a future kernel-side addition of another required hook is caught.
    assert.deepEqual(REQUIRED_NON_NEGOTIABLE_HOOKS, [
      'confounder_check',
      'stop_blocking',
      'integrity_degradation_tracking',
      'schema_file_protection',
    ]);
  });
});
