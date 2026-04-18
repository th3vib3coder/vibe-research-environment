/**
 * WP-158 — Degraded-mode honesty regression test.
 *
 * Proves that introducing the kernel bridge (WP-155) does NOT regress the
 * Phase 5.5 WP-122 degraded-mode-honesty invariant: when the bridge returns
 * the degraded sentinel OR throws, middleware.runWithMiddleware (which calls
 * the internal deriveSignals) must continue to label
 * signals.provenance.sourceMode === 'degraded' (for sentinel) or 'mixed'
 * (for throw) and must NOT silently slot a zero count that looks
 * kernel-backed.
 *
 * @see blueprints/definitive-spec/implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md WP-158
 * @see environment/control/middleware.js:126-193 (deriveSignals + resolveSignalSourceMode)
 * @see environment/tests/control/session-snapshot-provenance.test.js (Phase 5.5 baseline)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runWithMiddleware } from '../../control/middleware.js';
import { getSessionSnapshot } from '../../control/session-snapshot.js';
import { resolveKernelReader } from '../../lib/kernel-bridge.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

describe('WP-158 middleware + kernel-bridge degraded-mode regression', () => {
  it('absent sibling → bridge degraded sentinel → signals labeled degraded and unresolvedClaims=0', async () => {
    const projectRoot = await createFixtureProject('vre-phase6-wp158-absent-');
    try {
      // Build the bridge sentinel exactly as WP-155 produces it when
      // kernelRoot is undefined. This is the shape a future bin/vre
      // (WP-166) will pass to middleware when VRE_KERNEL_PATH is unset.
      const reader = await resolveKernelReader({});
      assert.equal(reader.dbAvailable, false, 'precondition: bridge returned sentinel');

      await runWithMiddleware({
        projectPath: projectRoot,
        commandName: '/flow-status',
        reader,
        commandFn: async () => ({ summary: 'status' }),
      });

      const snapshot = await getSessionSnapshot(projectRoot);
      const signals = snapshot.signals;
      assert.equal(signals.unresolvedClaims, 0);
      assert.equal(
        signals.provenance.sourceMode,
        'degraded',
        `zero-claim fallback must be labeled 'degraded', got '${signals.provenance.sourceMode}'`,
      );
      assert.equal(signals.provenance.lastKernelContactAt, null);
      assert.equal(typeof signals.provenance.degradedReason, 'string');
      assert.ok(signals.provenance.degradedReason.length > 0);
    } finally {
      await cleanupFixtureProject(projectRoot);
    }
  });

  it('bridge listUnresolvedClaims throws → signals labeled mixed with error message as reason', async () => {
    const projectRoot = await createFixtureProject('vre-phase6-wp158-throw-');
    try {
      // Stub a reader that mimics the bridge surface but whose projection
      // call rejects — e.g. a transient spawn failure or timeout the bridge
      // wraps and re-throws. Middleware.deriveSignals:147-150 catches this
      // and transitions to provenance = 'mixed'.
      const reader = {
        dbAvailable: true,
        async listUnresolvedClaims() {
          throw new Error('bridge simulated spawn failure for WP-158');
        },
      };

      await runWithMiddleware({
        projectPath: projectRoot,
        commandName: '/flow-status',
        reader,
        commandFn: async () => ({ summary: 'status' }),
      });

      const snapshot = await getSessionSnapshot(projectRoot);
      const signals = snapshot.signals;
      assert.equal(signals.unresolvedClaims, 0, 'zero count must still be surfaced');
      assert.equal(
        signals.provenance.sourceMode,
        'mixed',
        `throw path must label sourceMode='mixed', got '${signals.provenance.sourceMode}'`,
      );
      assert.equal(
        signals.provenance.degradedReason,
        'bridge simulated spawn failure for WP-158',
      );
    } finally {
      await cleanupFixtureProject(projectRoot);
    }
  });

  it('fallback-zero is distinguishable from verified-zero via provenance.sourceMode', async () => {
    // Two runs: one with sentinel (fallback zero), one with a live reader
    // that returns zero claims. Both surface unresolvedClaims=0; the ONLY
    // honest way a consumer can tell them apart is via sourceMode. If this
    // test fails, the degraded-mode-honesty invariant is broken.
    const fallbackRoot = await createFixtureProject('vre-phase6-wp158-fallback-');
    const kernelRoot = await createFixtureProject('vre-phase6-wp158-kernel-');
    try {
      await runWithMiddleware({
        projectPath: fallbackRoot,
        commandName: '/flow-status',
        reader: { dbAvailable: false, error: 'simulated degraded' },
        commandFn: async () => ({}),
      });
      await runWithMiddleware({
        projectPath: kernelRoot,
        commandName: '/flow-status',
        reader: {
          dbAvailable: true,
          async listUnresolvedClaims() {
            return [];
          },
        },
        commandFn: async () => ({}),
      });

      const fallbackSignals = (await getSessionSnapshot(fallbackRoot)).signals;
      const kernelSignals = (await getSessionSnapshot(kernelRoot)).signals;

      assert.equal(fallbackSignals.unresolvedClaims, 0);
      assert.equal(kernelSignals.unresolvedClaims, 0);

      // The invariant: same zero, different provenance label.
      assert.equal(fallbackSignals.provenance.sourceMode, 'degraded');
      assert.equal(kernelSignals.provenance.sourceMode, 'kernel-backed');
      assert.notEqual(
        fallbackSignals.provenance.sourceMode,
        kernelSignals.provenance.sourceMode,
        'zero-from-fallback MUST be distinguishable from zero-from-kernel',
      );
    } finally {
      await cleanupFixtureProject(fallbackRoot);
      await cleanupFixtureProject(kernelRoot);
    }
  });

  it('regression guard: bridge-sentinel reader never surfaces sourceMode="kernel-backed"', async () => {
    // This is the specific anti-regression assertion: if a future refactor
    // accidentally labels a degraded-sentinel reader as kernel-backed, this
    // test fails. It runs the exact WP-155 sentinel shape through the real
    // middleware — no stubs on middleware internals.
    const projectRoot = await createFixtureProject('vre-phase6-wp158-antilbl-');
    try {
      const sentinel = await resolveKernelReader({ kernelRoot: undefined });
      await runWithMiddleware({
        projectPath: projectRoot,
        commandName: '/flow-status',
        reader: sentinel,
        commandFn: async () => ({}),
      });
      const snapshot = await getSessionSnapshot(projectRoot);
      assert.notEqual(
        snapshot.signals.provenance.sourceMode,
        'kernel-backed',
        'degraded-sentinel reader MUST NOT be labeled kernel-backed',
      );
    } finally {
      await cleanupFixtureProject(projectRoot);
    }
  });
});
